import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

// Gate metadata - static information about each gate (used as fallback)
// Project-specific content will override description and deliverables
// Gate metadata based on Multi-Agent-Product-Creator framework
// G1-G9 are the approval gates, no G0 in the framework
const GATE_METADATA: Record<
  number,
  {
    name: string;
    narrative: string;
    description: string;
    deliverables: string[];
    celebration: string;
    phase: 'plan' | 'dev' | 'ship';
  }
> = {
  1: {
    name: 'Scope Approved',
    narrative: 'Every great product starts with a clear "why"',
    description: 'Project scope approved through intake questionnaire.',
    deliverables: ['Project Intake document', 'Success criteria defined', 'Constraints identified'],
    celebration: '🎯 Scope Approved!',
    phase: 'plan',
  },
  2: {
    name: 'PRD Approved',
    narrative: 'From ideas to actionable specifications',
    description: 'Product requirements fully documented. Every feature has a purpose.',
    deliverables: ['PRD document', 'User stories', 'Success metrics', 'Feature prioritization'],
    celebration: '📋 PRD Complete!',
    phase: 'plan',
  },
  3: {
    name: 'Architecture Approved',
    narrative: 'The skeleton that supports everything',
    description: 'System architecture and tech stack approved.',
    deliverables: ['System design doc', 'Tech stack decision', 'Database schema', 'API contracts'],
    celebration: '🏗️ Architecture Approved!',
    phase: 'plan',
  },
  4: {
    name: 'Design Approved',
    narrative: 'Where user experience meets visual craft',
    description: 'UX/UI design completed and approved.',
    deliverables: ['Wireframes', 'Design system', 'User flows', 'Prototype'],
    celebration: '🎨 Design Approved!',
    phase: 'plan',
  },
  5: {
    name: 'Feature Acceptance',
    narrative: 'Ideas become reality, one function at a time',
    description: 'Development complete. All features implemented.',
    deliverables: [
      'Core features',
      'All user stories',
      'Spec compliance',
      'Technical debt documented',
    ],
    celebration: '⚡ Development Complete!',
    phase: 'dev',
  },
  6: {
    name: 'Quality Sign-off',
    narrative: 'Confidence through comprehensive testing',
    description: 'QA testing passed. Quality metrics met.',
    deliverables: [
      'Test results summary',
      'Coverage metrics',
      'Performance tests',
      'Accessibility audit',
    ],
    celebration: '🧪 QA Passed!',
    phase: 'dev',
  },
  7: {
    name: 'Security Acceptance',
    narrative: 'Building trust through security',
    description: 'Security review complete. No critical vulnerabilities.',
    deliverables: [
      'Security scan results',
      'Vulnerability summary',
      'Threat model',
      'Remediation plan',
    ],
    celebration: '🔒 Security Approved!',
    phase: 'ship',
  },
  8: {
    name: 'Go/No-Go',
    narrative: 'The runway is clear',
    description: 'Pre-deployment review complete. Ready for production.',
    deliverables: [
      'Pre-deployment report',
      'Deployment guide',
      'Rollback plan',
      'Lighthouse audits',
    ],
    celebration: '🚀 Ready to Launch!',
    phase: 'ship',
  },
  9: {
    name: 'Production Acceptance',
    narrative: 'Your creation meets the world',
    description: 'Product deployed and stable in production.',
    deliverables: ['Smoke tests passed', 'Production metrics healthy', 'User acceptance'],
    celebration: '🎉 You Shipped!',
    phase: 'ship',
  },
};

export interface GateJourneyData {
  gateNumber: number;
  gateType: string;
  status: 'completed' | 'current' | 'upcoming';
  metadata: {
    name: string;
    narrative: string;
    description: string;
    deliverables: string[];
    celebration: string;
    phase: 'plan' | 'dev' | 'ship';
  };
  // Project-specific summary that overrides generic metadata
  projectSummary?: string;
  keyDecisions?: Array<{
    title: string;
    description: string;
  }>;
  tasks: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  decisions: Array<{
    id: number;
    choice: string;
    reason: string;
    agent: string;
  }>;
  documents: Array<{
    id: string;
    name: string;
    path: string;
    type: string;
  }>;
  approvedAt?: string;
  approvedBy?: {
    id: string;
    name: string;
  };
}

export interface JourneyData {
  projectId: string;
  projectName: string;
  currentGate: number;
  currentPhase: 'plan' | 'dev' | 'ship';
  progressPercentage: number;
  totalGates: number;
  completedGates: number;
  gates: GateJourneyData[];
}

@Injectable()
export class JourneyService {
  constructor(private prisma: PrismaService) {}

  async getJourney(projectId: string, userId: string): Promise<JourneyData> {
    // Verify project ownership and get project details
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        state: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only view journey for your own projects');
    }

    // Get all gates for the project
    const gates = await this.prisma.gate.findMany({
      where: { projectId },
      include: {
        proofArtifacts: true,
        approvedBy: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get all tasks for the project
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        status: true,
        phase: true,
      },
    });

    // Get all decisions for the project
    const decisions = await this.prisma.decision.findMany({
      where: { projectId },
      select: {
        id: true,
        gate: true,
        agent: true,
        description: true,
        rationale: true,
      },
    });

    // Get all documents for the project
    const documents = await this.prisma.document.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        filePath: true,
        documentType: true,
        gateId: true,
      },
    });

    // Determine current gate from project state
    const currentGateType = project.state?.currentGate || 'G1_PENDING';
    const currentGateNumber = this.parseGateNumber(currentGateType);

    // Build gate journey data (G1-G9, no G0 in the framework)
    const gatesData: GateJourneyData[] = [];

    for (let gateNum = 1; gateNum <= 9; gateNum++) {
      const gateKey = `G${gateNum}`;
      const metadata = GATE_METADATA[gateNum];

      // Find the actual gate record if it exists
      const gateRecord = gates.find(
        (g) =>
          g.gateType.startsWith(gateKey) ||
          g.gateType === `${gateKey}_COMPLETE` ||
          g.gateType === `${gateKey}_PENDING`,
      );

      // Determine gate status based on approval, not just gate number
      // A gate is only "completed" if it has been approved (has approvedAt timestamp)
      let status: 'completed' | 'current' | 'upcoming';
      const isGateApproved = gateRecord?.approvedAt != null;

      if (isGateApproved) {
        status = 'completed';
      } else if (gateNum === currentGateNumber) {
        status = 'current';
      } else if (gateNum < currentGateNumber) {
        // Gate is before current but not approved - shouldn't normally happen
        // but treat as current to draw attention
        status = 'current';
      } else {
        status = 'upcoming';
      }

      // Filter tasks for this gate (by phase mapping)
      const phaseMapping: Record<number, string[]> = {
        1: ['intake', 'scope', 'discovery', 'vision'],
        2: ['prd', 'requirements', 'planning'],
        3: ['architecture', 'design', 'tech stack'],
        4: ['ux', 'ui', 'wireframe', 'prototype'],
        5: ['development', 'implementation', 'coding', 'features'],
        6: ['testing', 'qa', 'quality', 'coverage'],
        7: ['security', 'vulnerability', 'audit'],
        8: ['deployment', 'devops', 'infra', 'pre-deploy'],
        9: ['production', 'launch', 'release', 'smoke'],
      };
      const relevantPhases = phaseMapping[gateNum] || [];
      const gateTasks = tasks
        .filter((t) => relevantPhases.some((p) => t.phase.toLowerCase().includes(p)))
        .slice(0, 5)
        .map((t) => ({
          id: t.id,
          name: t.name,
          status: t.status,
        }));

      // Filter decisions for this gate
      const gateDecisions = decisions
        .filter((d) => d.gate === gateKey || d.gate === `G${gateNum}`)
        .map((d) => ({
          id: d.id,
          choice: d.description,
          reason: d.rationale || '',
          agent: d.agent,
        }));

      // Filter documents for this gate
      // For G0, also include the Project Intake document
      const gateDocuments = documents
        .filter((d) => d.gateId === gateRecord?.id)
        .map((d) => ({
          id: d.id,
          name: d.title,
          path: d.filePath || '',
          type: d.documentType,
        }));

      // For G0, include the intake document even if not linked to gate
      if (gateNum === 0) {
        const intakeDoc = documents.find((d) => d.title === 'Project Intake');
        if (intakeDoc && !gateDocuments.some((d) => d.id === intakeDoc.id)) {
          gateDocuments.push({
            id: intakeDoc.id,
            name: intakeDoc.title,
            path: intakeDoc.filePath || '',
            type: intakeDoc.documentType,
          });
        }
      }

      // Extract project-specific summary for G0 from intake document
      let projectSummary: string | undefined;
      let keyDecisions: Array<{ title: string; description: string }> | undefined;

      if (gateNum === 0) {
        // Get the intake document content
        const intakeDoc = await this.prisma.document.findFirst({
          where: {
            projectId,
            title: 'Project Intake',
          },
        });

        if (intakeDoc?.content) {
          // Extract key information from intake document
          projectSummary = this.extractProjectSummaryFromIntake(intakeDoc.content, project.name);
          keyDecisions = this.extractKeyDecisionsFromIntake(intakeDoc.content);
        }
      }

      gatesData.push({
        gateNumber: gateNum,
        gateType: gateRecord?.gateType || `${gateKey}_PENDING`,
        status,
        metadata,
        projectSummary,
        keyDecisions,
        tasks: gateTasks,
        decisions: gateDecisions,
        documents: gateDocuments,
        approvedAt: gateRecord?.approvedAt?.toISOString(),
        approvedBy: gateRecord?.approvedBy
          ? {
              id: gateRecord.approvedBy.id,
              name: gateRecord.approvedBy.name || 'Unknown',
            }
          : undefined,
      });
    }

    // Calculate current phase based on gate number
    // G1-G4 = Plan, G5-G6 = Dev, G7-G9 = Ship
    let currentPhase: 'plan' | 'dev' | 'ship';
    if (currentGateNumber <= 4) {
      currentPhase = 'plan';
    } else if (currentGateNumber <= 6) {
      currentPhase = 'dev';
    } else {
      currentPhase = 'ship';
    }

    // Count actually approved gates (G1-G9 = 9 total gates)
    const completedGates = gatesData.filter((g) => g.status === 'completed').length;

    return {
      projectId,
      projectName: project.name,
      currentGate: currentGateNumber,
      currentPhase,
      progressPercentage: Math.round((completedGates / 9) * 100),
      totalGates: 9,
      completedGates,
      gates: gatesData,
    };
  }

  private parseGateNumber(gateType: string): number {
    const match = gateType.match(/G(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Extract a project-specific summary from the intake document
   */
  private extractProjectSummaryFromIntake(content: string, projectName: string): string {
    // Try to extract the project description section
    const descMatch = content.match(/## Project Description\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (descMatch) {
      const description = descMatch[1].trim().substring(0, 300);
      return description + (description.length >= 300 ? '...' : '');
    }

    // Try to extract success criteria
    const successMatch = content.match(/### Success Criteria\s*\n([\s\S]*?)(?=\n###|$)/i);
    if (successMatch) {
      const success = successMatch[1].trim().substring(0, 300);
      return `Building ${projectName}: ${success}${success.length >= 300 ? '...' : ''}`;
    }

    // Fallback to project name
    return `Captured requirements for ${projectName} through onboarding.`;
  }

  /**
   * Extract key decisions from the intake document
   */
  private extractKeyDecisionsFromIntake(
    content: string,
  ): Array<{ title: string; description: string }> {
    const decisions: Array<{ title: string; description: string }> = [];

    // Extract Existing Code status
    const codeMatch = content.match(/### Existing Code[\s\S]*?\*\*Status:\*\*\s*([^\n]+)/i);
    if (codeMatch) {
      const status = codeMatch[1].trim();
      decisions.push({
        title: status === 'none' ? 'Starting fresh' : `Code status: ${status}`,
        description:
          status === 'none'
            ? 'Building from scratch with no existing codebase'
            : `Working with ${status} code`,
      });
    }

    // Extract Technical Background
    const techMatch = content.match(/### Technical Background[\s\S]*?\*\*Level:\*\*\s*([^\n]+)/i);
    if (techMatch) {
      const level = techMatch[1].trim();
      decisions.push({
        title: `Teaching level: ${level}`,
        description:
          level === 'NOVICE'
            ? 'Explanations will be beginner-friendly'
            : level === 'EXPERT'
              ? 'Technical discussions can be advanced'
              : 'Balanced explanations with some technical terms',
      });
    }

    // Extract Deployment mode
    const deployMatch = content.match(/### Deployment[\s\S]*?\*\*Mode:\*\*\s*([^\n]+)/i);
    if (deployMatch) {
      const mode = deployMatch[1].trim();
      decisions.push({
        title: `Deployment: ${mode.replace('_', ' ').toLowerCase()}`,
        description:
          mode === 'LOCAL_ONLY'
            ? 'Project will run locally without cloud deployment'
            : mode === 'REQUIRED'
              ? 'Cloud deployment is required for this project'
              : 'Cloud deployment is optional',
      });
    }

    // Extract Project Type from assessment
    const typeMatch = content.match(/### Project Type\s*\n([^\n]+)/i);
    if (typeMatch) {
      const projectType = typeMatch[1].trim();
      decisions.push({
        title: `Project type: ${projectType}`,
        description: `Workflow optimized for ${projectType} projects`,
      });
    }

    return decisions;
  }
}
