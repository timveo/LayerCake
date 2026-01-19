import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RisksService } from '../../risks/risks.service';
import { DeliverablesService } from '../../deliverables/deliverables.service';
import { DecisionsService } from '../../decisions/decisions.service';
import { Impact, Probability } from '@prisma/client';

/**
 * Parsed intake document data
 */
interface ParsedIntake {
  projectDescription: string;
  codeSource: 'none' | 'ai_generated' | 'my_code' | 'inherited';
  codeSourceTool?: string;
  teachingLevel: 'NOVICE' | 'INTERMEDIATE' | 'EXPERT';
  successCriteria: string[];
  constraints: string[];
  deploymentMode: 'LOCAL_ONLY' | 'OPTIONAL' | 'REQUIRED' | 'UNDETERMINED';
  projectType: 'traditional' | 'ai_ml' | 'hybrid' | 'enhancement';
}

/**
 * Workflow recommendation based on project classification
 */
interface WorkflowRecommendation {
  description: string;
  rationale: string;
  agents: string[];
  includesDesign: boolean;
  includesFrontend: boolean;
  includesBackend: boolean;
  includesML: boolean;
}

/**
 * Risk identified from intake analysis
 */
interface IdentifiedRisk {
  description: string;
  probability: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  mitigation?: string;
}

/**
 * G1 presentation data structure
 * Contains all information needed to present G1 gate for user approval
 */
export interface G1PresentationData {
  projectId: string;
  projectName: string;

  // Classification
  projectType: 'traditional' | 'ai_ml' | 'hybrid' | 'enhancement';
  codeSource: 'none' | 'ai_generated' | 'my_code' | 'inherited';
  codeSourceTool?: string;

  // Workflow
  recommendedWorkflow: string;
  workflowRationale: string;
  estimatedAgents: string[];

  // Risks
  identifiedRisks: IdentifiedRisk[];

  // Assumptions
  keyAssumptions: string[];

  // Deployment
  deploymentMode: 'LOCAL_ONLY' | 'OPTIONAL' | 'REQUIRED' | 'UNDETERMINED';

  // Success criteria
  successCriteria: string[];
  constraints: string[];

  // Teaching level
  teachingLevel: 'NOVICE' | 'INTERMEDIATE' | 'EXPERT';
}

@Injectable()
export class G1PresentationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly risksService: RisksService,
    private readonly deliverablesService: DeliverablesService,
    private readonly decisionsService: DecisionsService,
  ) {}

  /**
   * Analyze intake document and prepare G1 presentation data
   */
  async prepareG1Presentation(projectId: string): Promise<G1PresentationData> {
    // 1. Get project and intake document
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documents: {
          where: { title: 'Project Intake' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const intakeContent = project?.documents[0]?.content || '';

    // 2. Parse intake document for key information
    const parsed = this.parseIntakeDocument(intakeContent);

    // 3. Determine recommended workflow based on classification
    const workflow = this.determineWorkflow(parsed);

    // 4. Identify risks based on intake answers
    const risks = this.identifyRisks(parsed);

    // 5. Extract key assumptions
    const assumptions = this.extractAssumptions(parsed);

    return {
      projectId,
      projectName: project?.name || 'Unnamed Project',
      projectType: parsed.projectType,
      codeSource: parsed.codeSource,
      codeSourceTool: parsed.codeSourceTool,
      recommendedWorkflow: workflow.description,
      workflowRationale: workflow.rationale,
      estimatedAgents: workflow.agents,
      identifiedRisks: risks,
      keyAssumptions: assumptions,
      deploymentMode: parsed.deploymentMode,
      successCriteria: parsed.successCriteria,
      constraints: parsed.constraints,
      teachingLevel: parsed.teachingLevel,
    };
  }

  /**
   * Record G1 deliverables, risks, and decisions in the database
   */
  async recordG1Artifacts(
    projectId: string,
    data: G1PresentationData,
    userId: string,
  ): Promise<void> {
    // 1. Record risks using RisksService
    for (const risk of data.identifiedRisks) {
      await this.risksService.createRisk({
        projectId,
        description: risk.description,
        impact: this.mapImpact(risk.impact),
        probability: this.mapProbability(risk.probability),
        mitigation: risk.mitigation,
        owner: 'ORCHESTRATOR',
      });
    }

    // 2. Record G1 deliverable (Project Intake document)
    const existingDeliverables = await this.deliverablesService.getDeliverables(projectId);
    const hasIntakeDeliverable = existingDeliverables.some((d) => d.name === 'PROJECT_INTAKE.md');

    if (!hasIntakeDeliverable) {
      const deliverable = await this.deliverablesService.createDeliverable({
        projectId,
        name: 'PROJECT_INTAKE.md',
        path: 'docs/PROJECT_INTAKE.md',
        owner: 'PRODUCT_MANAGER_ONBOARDING',
        version: '1.0.0',
      });

      // Mark as complete since intake doc exists
      await this.deliverablesService.markComplete(deliverable.id);
    }

    // 3. Record classification decision using DecisionsService
    await this.decisionsService.create(
      {
        projectId,
        gate: 'G1_PENDING',
        agent: 'ORCHESTRATOR',
        decisionType: 'classification',
        description: `Project classified as ${data.projectType}`,
        rationale: `Based on intake analysis: code source is "${data.codeSource}", deployment mode is "${data.deploymentMode}", teaching level is "${data.teachingLevel}"`,
        alternativesConsidered: 'traditional, ai_ml, hybrid, enhancement',
        outcome: data.projectType,
      },
      userId,
    );

    // 4. Record workflow decision
    await this.decisionsService.create(
      {
        projectId,
        gate: 'G1_PENDING',
        agent: 'ORCHESTRATOR',
        decisionType: 'workflow',
        description: `Recommended workflow: ${data.recommendedWorkflow}`,
        rationale: data.workflowRationale,
        alternativesConsidered: 'Full workflow, Minimal workflow, Assessment-first workflow',
        outcome: `${data.estimatedAgents.length} agents involved`,
      },
      userId,
    );
  }

  /**
   * Format G1 presentation as markdown for user display
   * This is a gate process summary document with metrics, status, and clear next steps
   */
  formatG1Presentation(data: G1PresentationData): string {
    const totalAgents = this.countAgents(data);
    const estimatedGates = this.estimateGates(data);
    const risks = data.identifiedRisks || [];
    const assumptions = data.keyAssumptions || [];
    const createdDate = new Date().toISOString().split('T')[0];

    return `# G1: Project Scope Approval

## Gate Overview

| Field | Value |
|-------|-------|
| **Gate ID** | G1 |
| **Gate Name** | Project Scope Approval |
| **Status** | 🟡 Pending Approval |
| **Project** | ${data.projectName} |
| **Date** | ${createdDate} |

---

## Project Classification

| Attribute | Classification |
|-----------|----------------|
| **Project Type** | ${this.formatProjectType(data.projectType)} |
| **Code Source** | ${this.formatCodeSource(data.codeSource, data.codeSourceTool)} |
| **Experience Level** | ${this.formatTeachingLevel(data.teachingLevel)} |
| **Deployment Mode** | ${this.formatDeploymentMode(data.deploymentMode)} |

---

## Scope Metrics

| Metric | Value |
|--------|-------|
| **Total Agents** | ${totalAgents} specialized agents |
| **Total Gates** | ${estimatedGates} approval checkpoints |
| **Workflow** | ${this.getWorkflowPath(data)} |
| **Risks Identified** | ${risks.length} |
| **Assumptions** | ${assumptions.length} |

---

## Workflow Plan

**Recommended Workflow:** ${data.recommendedWorkflow}

**Rationale:** ${data.workflowRationale}

### Agents by Phase

${this.buildAgentWorkflow(data)}

---

## Identified Risks

${
  risks.length > 0
    ? risks
        .map(
          (r, i) => `${i + 1}. **${r.description}**
   - Probability: ${r.probability.toUpperCase()}
   - Impact: ${r.impact.toUpperCase()}
   ${r.mitigation ? `- Mitigation: ${r.mitigation}` : ''}`,
        )
        .join('\n\n')
    : '_No specific risks identified_'
}

---

## Key Assumptions

${
  assumptions.length > 0
    ? assumptions.map((a, i) => `${i + 1}. ${a}`).join('\n')
    : '_No assumptions - all requirements explicitly stated_'
}

---

## Success Criteria

${
  data.successCriteria && data.successCriteria.length > 0
    ? data.successCriteria.map((c) => `- ${c}`).join('\n')
    : '_As specified in Project Intake document_'
}

---

## Constraints

${
  data.constraints && data.constraints.length > 0
    ? data.constraints.map((c) => `- ${c}`).join('\n')
    : '_None specified_'
}

---

## Gate Approval Checklist

Before approving, confirm:

- [ ] Project description accurately captures your vision
- [ ] Project classification (${this.formatProjectType(data.projectType)}) is correct
- [ ] ${totalAgents} agents and ${estimatedGates} gates is acceptable scope
- [ ] Identified risks are acknowledged
- [ ] Deployment mode (${this.formatDeploymentMode(data.deploymentMode)}) is correct

---

## What Happens After Approval

1. **Immediate:** Project enters Planning Phase
2. **Next Agent:** Product Manager creates detailed PRD
3. **Next Gate:** G2 - PRD Approval
4. **Deliverable:** Product Requirements Document with user stories

---

## How to Approve

Type **"approve"** in the chat to confirm the project scope and proceed to the planning phase.`;
  }

  /**
   * Format teaching level for display
   */
  private formatTeachingLevel(level: string): string {
    switch (level) {
      case 'NOVICE':
        return 'Beginner (detailed explanations)';
      case 'INTERMEDIATE':
        return 'Intermediate (balanced guidance)';
      case 'EXPERT':
        return 'Expert (concise updates)';
      default:
        return level;
    }
  }

  /**
   * Count total agents that will work on this project
   */
  private countAgents(data: G1PresentationData): number {
    let count = 4; // Base: PM, Architect, Frontend, Backend

    if (data.projectType !== 'enhancement') {
      count += 1; // UX/UI Designer
    }

    if (data.projectType === 'ai_ml' || data.projectType === 'hybrid') {
      count += 2; // ML Engineer, Prompt Engineer
    }

    count += 2; // QA, Security

    if (data.deploymentMode !== 'LOCAL_ONLY') {
      count += 1; // DevOps
    }

    return count;
  }

  /**
   * Estimate number of gates based on project type
   */
  private estimateGates(data: G1PresentationData): number {
    if (data.deploymentMode === 'LOCAL_ONLY') {
      return 7; // G1-G7 (skip G8, G9)
    }
    return 9; // Full G1-G9
  }

  /**
   * Get workflow path description
   */
  private getWorkflowPath(data: G1PresentationData): string {
    if (data.projectType === 'enhancement') {
      return 'Enhancement (streamlined)';
    }
    if (data.projectType === 'ai_ml') {
      return 'AI/ML (full + ML specialists)';
    }
    if (data.projectType === 'hybrid') {
      return 'Hybrid (full + ML specialists)';
    }
    return 'Standard (full workflow)';
  }

  /**
   * Format deployment mode for display
   */
  private formatDeploymentMode(mode: string): string {
    switch (mode) {
      case 'LOCAL_ONLY':
        return 'Local development only';
      case 'OPTIONAL':
        return 'Cloud deployment optional';
      case 'REQUIRED':
        return 'Cloud deployment required';
      default:
        return 'To be determined';
    }
  }

  /**
   * Build the agent workflow description based on project data
   */
  private buildAgentWorkflow(data: G1PresentationData): string {
    const phases = {
      plan: [] as string[],
      dev: [] as string[],
      ship: [] as string[],
    };

    // Assign agents to phases based on project type
    phases.plan.push('Product Manager → PRD & User Stories');
    phases.plan.push('Architect → System Design & API Contracts');

    if (data.projectType !== 'enhancement') {
      phases.plan.push('UX/UI Designer → Design System & Wireframes');
    }

    phases.dev.push('Frontend Developer → UI Implementation');
    phases.dev.push('Backend Developer → API & Database');

    if (data.projectType === 'ai_ml' || data.projectType === 'hybrid') {
      phases.dev.push('ML Engineer → Model Integration');
      phases.dev.push('Prompt Engineer → AI Interactions');
    }

    phases.ship.push('QA Engineer → Testing & Quality');
    phases.ship.push('Security Engineer → Security Review');

    if (data.deploymentMode !== 'LOCAL_ONLY') {
      phases.ship.push('DevOps Engineer → Deployment & Infrastructure');
    }

    let workflow = '';

    workflow += '**Plan Phase** (G1-G4)\n';
    phases.plan.forEach((agent) => {
      workflow += `- ${agent}\n`;
    });

    workflow += '\n**Dev Phase** (G5)\n';
    phases.dev.forEach((agent) => {
      workflow += `- ${agent}\n`;
    });

    workflow += '\n**Ship Phase** (G6-G9)\n';
    phases.ship.forEach((agent) => {
      workflow += `- ${agent}\n`;
    });

    return workflow;
  }

  /**
   * Parse intake document content to extract structured data
   */
  private parseIntakeDocument(content: string): ParsedIntake {
    const lines = content.toLowerCase();

    // Parse code source from Q2
    let codeSource: ParsedIntake['codeSource'] = 'none';
    let codeSourceTool: string | undefined;

    if (
      lines.includes('ai_generated') ||
      lines.includes('ai-generated') ||
      lines.includes('lovable') ||
      lines.includes('v0') ||
      lines.includes('bolt') ||
      lines.includes('cursor') ||
      lines.includes('replit')
    ) {
      codeSource = 'ai_generated';
      // Try to extract tool name
      if (lines.includes('lovable')) codeSourceTool = 'Lovable';
      else if (lines.includes('v0')) codeSourceTool = 'V0';
      else if (lines.includes('bolt')) codeSourceTool = 'Bolt';
      else if (lines.includes('cursor')) codeSourceTool = 'Cursor';
      else if (lines.includes('replit')) codeSourceTool = 'Replit';
    } else if (
      lines.includes('my_code') ||
      lines.includes('my code') ||
      lines.includes('i built')
    ) {
      codeSource = 'my_code';
    } else if (
      lines.includes('inherited') ||
      lines.includes('legacy') ||
      lines.includes('took over')
    ) {
      codeSource = 'inherited';
    } else if (
      lines.includes('no existing') ||
      lines.includes('starting fresh') ||
      lines.includes('new project') ||
      lines.includes('none')
    ) {
      codeSource = 'none';
    }

    // Parse teaching level from Q3
    let teachingLevel: ParsedIntake['teachingLevel'] = 'INTERMEDIATE';
    if (
      lines.includes('novice') ||
      lines.includes('not technical') ||
      lines.includes('no coding') ||
      lines.includes('beginner')
    ) {
      teachingLevel = 'NOVICE';
    } else if (
      lines.includes('expert') ||
      lines.includes('senior') ||
      lines.includes('architect') ||
      lines.includes('10+ years')
    ) {
      teachingLevel = 'EXPERT';
    }

    // Parse deployment mode from Q5
    let deploymentMode: ParsedIntake['deploymentMode'] = 'UNDETERMINED';
    if (
      lines.includes('local_only') ||
      lines.includes('local only') ||
      lines.includes('just for learning') ||
      lines.includes('practice project')
    ) {
      deploymentMode = 'LOCAL_ONLY';
    } else if (
      lines.includes('required') ||
      lines.includes('production') ||
      lines.includes('launch') ||
      lines.includes('customers') ||
      lines.includes('users')
    ) {
      deploymentMode = 'REQUIRED';
    } else if (
      lines.includes('optional') ||
      lines.includes('demo') ||
      lines.includes('portfolio') ||
      lines.includes('side project')
    ) {
      deploymentMode = 'OPTIONAL';
    }

    // Determine project type based on content
    let projectType: ParsedIntake['projectType'] = 'traditional';
    if (lines.includes('ml') || lines.includes('machine learning') || lines.includes('ai model')) {
      projectType = 'ai_ml';
    } else if (
      (lines.includes('ai') || lines.includes('llm')) &&
      (lines.includes('web') || lines.includes('app'))
    ) {
      projectType = 'hybrid';
    } else if (
      lines.includes('enhancement') ||
      lines.includes('fix') ||
      lines.includes('improve') ||
      codeSource === 'inherited' ||
      codeSource === 'ai_generated'
    ) {
      projectType = 'enhancement';
    }

    // Extract success criteria (Q4)
    const successCriteria = this.extractListFromSection(content, [
      'success criteria',
      'definition of done',
      'done look',
      'Q4',
    ]);

    // Extract constraints (Q5)
    const constraints = this.extractListFromSection(content, [
      'constraints',
      'timeline',
      'budget',
      'Q5',
    ]);

    // Extract project description (Q1)
    const projectDescription = this.extractSectionContent(content, [
      'what are you building',
      'project description',
      'Q1',
    ]);

    return {
      projectDescription,
      codeSource,
      codeSourceTool,
      teachingLevel,
      successCriteria,
      constraints,
      deploymentMode,
      projectType,
    };
  }

  /**
   * Determine recommended workflow based on parsed intake
   */
  private determineWorkflow(parsed: ParsedIntake): WorkflowRecommendation {
    const baseAgents = ['Orchestrator', 'Product Manager'];

    switch (parsed.projectType) {
      case 'traditional':
        return {
          description: 'Full-stack web application workflow',
          rationale:
            'This is a standard web application project. We will follow the complete G1-G9 workflow with architecture, design, development, testing, security review, and deployment phases.',
          agents: [
            ...baseAgents,
            'Architect',
            'UX/UI Designer',
            'Frontend Developer',
            'Backend Developer',
            'QA Engineer',
            'Security Engineer',
            'DevOps Engineer',
          ],
          includesDesign: true,
          includesFrontend: true,
          includesBackend: true,
          includesML: false,
        };

      case 'ai_ml':
        return {
          description: 'AI/ML-focused workflow',
          rationale:
            'This project involves machine learning or AI models. We will include data engineering, ML engineering, and model evaluation agents, with appropriate MLOps for deployment.',
          agents: [
            ...baseAgents,
            'Architect',
            'Data Engineer',
            'ML Engineer',
            'Prompt Engineer',
            'Model Evaluator',
            'QA Engineer',
            'Security Engineer',
            'AIOps Engineer',
          ],
          includesDesign: false,
          includesFrontend: false,
          includesBackend: true,
          includesML: true,
        };

      case 'hybrid':
        return {
          description: 'Hybrid web + AI workflow',
          rationale:
            'This project combines a web application with AI/ML capabilities. We will use the full agent set to handle both the application and AI components.',
          agents: [
            ...baseAgents,
            'Architect',
            'UX/UI Designer',
            'Frontend Developer',
            'Backend Developer',
            'ML Engineer',
            'Prompt Engineer',
            'QA Engineer',
            'Security Engineer',
            'DevOps Engineer',
          ],
          includesDesign: true,
          includesFrontend: true,
          includesBackend: true,
          includesML: true,
        };

      case 'enhancement':
        return {
          description: 'Enhancement workflow (existing codebase)',
          rationale:
            'This project involves enhancing existing code. We will start with a code assessment, then proceed with targeted improvements while maintaining compatibility with the existing architecture.',
          agents: [
            ...baseAgents,
            'Code Assessor',
            'Architect',
            parsed.codeSource === 'ai_generated' ? 'Frontend Developer' : 'Backend Developer',
            'QA Engineer',
            'Security Engineer',
          ],
          includesDesign: parsed.codeSource === 'ai_generated',
          includesFrontend: parsed.codeSource === 'ai_generated',
          includesBackend: true,
          includesML: false,
        };

      default:
        return {
          description: 'Standard development workflow',
          rationale: 'Default workflow for general projects.',
          agents: [...baseAgents, 'Architect', 'Developer', 'QA Engineer'],
          includesDesign: false,
          includesFrontend: true,
          includesBackend: true,
          includesML: false,
        };
    }
  }

  /**
   * Identify risks based on intake answers
   */
  private identifyRisks(parsed: ParsedIntake): IdentifiedRisk[] {
    const risks: IdentifiedRisk[] = [];

    // Risk: AI-generated code may have quality issues
    if (parsed.codeSource === 'ai_generated') {
      risks.push({
        description: 'AI-generated code may have inconsistent patterns or hidden issues',
        probability: 'medium',
        impact: 'medium',
        mitigation: 'Conduct thorough code assessment before enhancement',
      });
    }

    // Risk: Inherited code may have technical debt
    if (parsed.codeSource === 'inherited') {
      risks.push({
        description: 'Inherited codebase may have undocumented technical debt',
        probability: 'high',
        impact: 'medium',
        mitigation: 'Comprehensive code review and documentation phase',
      });
    }

    // Risk: Novice user may need more guidance
    if (parsed.teachingLevel === 'NOVICE') {
      risks.push({
        description: 'User may need additional explanation for technical decisions',
        probability: 'high',
        impact: 'low',
        mitigation: 'Provide detailed explanations at each gate approval',
      });
    }

    // Risk: Production deployment without experience
    if (parsed.deploymentMode === 'REQUIRED' && parsed.teachingLevel === 'NOVICE') {
      risks.push({
        description: 'Production deployment planned but user has limited technical background',
        probability: 'medium',
        impact: 'high',
        mitigation: 'Extra guidance during G8-G9 deployment phases',
      });
    }

    // Risk: Tight constraints
    if (
      parsed.constraints.some(
        (c) => c.toLowerCase().includes('asap') || c.toLowerCase().includes('urgent'),
      )
    ) {
      risks.push({
        description: 'Tight timeline constraints may impact quality',
        probability: 'medium',
        impact: 'medium',
        mitigation: 'Prioritize P0 features, defer P1/P2 to future iterations',
      });
    }

    // Risk: ML projects are complex
    if (parsed.projectType === 'ai_ml' || parsed.projectType === 'hybrid') {
      risks.push({
        description: 'AI/ML projects have inherent uncertainty in model performance',
        probability: 'medium',
        impact: 'medium',
        mitigation: 'Build evaluation criteria early, plan for iteration',
      });
    }

    // Always add a baseline risk
    if (risks.length === 0) {
      risks.push({
        description: 'Standard project risks: scope creep, changing requirements',
        probability: 'low',
        impact: 'medium',
        mitigation: 'Use approval gates to manage scope changes',
      });
    }

    return risks;
  }

  /**
   * Extract key assumptions from parsed intake
   */
  private extractAssumptions(parsed: ParsedIntake): string[] {
    const assumptions: string[] = [];

    // Code source assumptions
    if (parsed.codeSource === 'none') {
      assumptions.push('Starting from scratch with no existing codebase');
    } else if (parsed.codeSource === 'ai_generated') {
      assumptions.push(
        `Existing code from ${parsed.codeSourceTool || 'AI tool'} will serve as foundation`,
      );
    } else if (parsed.codeSource === 'inherited') {
      assumptions.push('Existing codebase is available and accessible for review');
    }

    // Teaching level assumptions
    assumptions.push(`Communication will be tailored to ${parsed.teachingLevel} technical level`);

    // Deployment assumptions
    switch (parsed.deploymentMode) {
      case 'LOCAL_ONLY':
        assumptions.push('Project will run locally only; G9 production deployment will be skipped');
        break;
      case 'REQUIRED':
        assumptions.push('Full production deployment is expected at project completion');
        break;
      case 'OPTIONAL':
        assumptions.push('Deployment decision will be made at G8 based on project state');
        break;
      default:
        assumptions.push('Deployment requirements will be clarified during development');
    }

    // Project type assumptions
    if (parsed.projectType === 'ai_ml') {
      assumptions.push('ML model training infrastructure is available or will be provisioned');
    }

    // Success criteria assumption
    if (parsed.successCriteria.length > 0) {
      assumptions.push('Success will be measured against the stated criteria');
    }

    return assumptions;
  }

  /**
   * Helper: Extract content from a section of the document
   */
  private extractSectionContent(content: string, sectionMarkers: string[]): string {
    const lines = content.split('\n');
    let inSection = false;
    const sectionContent: string[] = [];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (sectionMarkers.some((marker) => lowerLine.includes(marker))) {
        inSection = true;
        continue;
      }
      if (inSection) {
        if (line.startsWith('#') || line.startsWith('---')) {
          break;
        }
        if (line.trim()) {
          sectionContent.push(line.trim());
        }
      }
    }

    return sectionContent.join(' ').substring(0, 500) || 'Not specified';
  }

  /**
   * Helper: Extract list items from a section
   */
  private extractListFromSection(content: string, sectionMarkers: string[]): string[] {
    const lines = content.split('\n');
    let inSection = false;
    const items: string[] = [];

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (sectionMarkers.some((marker) => lowerLine.includes(marker))) {
        inSection = true;
        continue;
      }
      if (inSection) {
        if (line.startsWith('#') || line.startsWith('---')) {
          break;
        }
        // Extract list items (-, *, or numbered)
        const match = line.match(/^[\s]*[-*\d.]+[\s]+(.+)/);
        if (match) {
          items.push(match[1].trim());
        } else if (line.trim() && !line.includes(':')) {
          // Also capture non-list content if it looks like a criteria
          items.push(line.trim());
        }
      }
    }

    return items.slice(0, 10); // Limit to 10 items
  }

  /**
   * Helper: Map string impact to Prisma enum
   */
  private mapImpact(impact: string): Impact {
    switch (impact) {
      case 'high':
        return Impact.high;
      case 'medium':
        return Impact.medium;
      case 'low':
        return Impact.low;
      default:
        return Impact.medium;
    }
  }

  /**
   * Helper: Map string probability to Prisma enum
   */
  private mapProbability(probability: string): Probability {
    switch (probability) {
      case 'high':
        return Probability.high;
      case 'medium':
        return Probability.medium;
      case 'low':
        return Probability.low;
      default:
        return Probability.medium;
    }
  }

  /**
   * Helper: Format project type for display
   */
  private formatProjectType(type: string): string {
    switch (type) {
      case 'traditional':
        return 'Traditional Web Application';
      case 'ai_ml':
        return 'AI/ML Project';
      case 'hybrid':
        return 'Hybrid (Web + AI)';
      case 'enhancement':
        return 'Enhancement (Existing Codebase)';
      default:
        return type;
    }
  }

  /**
   * Helper: Format code source for display
   */
  private formatCodeSource(source: string, tool?: string): string {
    switch (source) {
      case 'none':
        return 'New Project (No Existing Code)';
      case 'ai_generated':
        return tool ? `AI-Generated (${tool})` : 'AI-Generated Code';
      case 'my_code':
        return 'User-Built Code';
      case 'inherited':
        return 'Inherited/Legacy Code';
      default:
        return source;
    }
  }

  /**
   * Helper: Get deployment mode description
   */
  private getDeploymentDescription(mode: string): string {
    switch (mode) {
      case 'LOCAL_ONLY':
        return `**Mode:** Local Only

This project is for learning or local use. The G9 production deployment gate will be **skipped**.

The project will be complete after G8 (staging verification) or earlier if deployment is not needed.`;

      case 'REQUIRED':
        return `**Mode:** Production Required

This project requires full production deployment. All gates G1-G9 will be executed.

At G9, the application will be deployed to production with:
- CI/CD pipeline
- Monitoring and alerting
- Production-ready infrastructure`;

      case 'OPTIONAL':
        return `**Mode:** Optional

Deployment decision will be made at G8 (Pre-Deployment) based on project state.

At G8, you'll be asked: "Your project is ready. Would you like to deploy it to production?"`;

      default:
        return `**Mode:** Undetermined

Deployment requirements were not specified. We will ask at G8 whether production deployment is needed.`;
    }
  }
}
