import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AIProviderService } from '../agents/services/ai-provider.service';

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
  // Cache for teaching moments to avoid repeated AI calls
  private teachingMomentsCache = new Map<
    string,
    { moments: Array<{ title: string; description: string }>; timestamp: number }
  >();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private prisma: PrismaService,
    private aiProvider: AIProviderService,
  ) {}

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
      const isGateInProgress =
        gateRecord?.status === 'IN_REVIEW' || gateRecord?.status === 'PENDING';

      if (isGateApproved) {
        status = 'completed';
      } else if (gateNum === currentGateNumber || isGateInProgress) {
        // Gate is current if it matches currentGateNumber OR if it has an active status
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
      // Priority: 1) explicit gateId, 2) title match, 3) type match (only if no title match exists)

      // Map document titles to specific gates - this takes priority over type
      const docTitleToGate: Record<string, number> = {
        'project intake': 1,
        'g1 summary': 1,
        'product requirements document': 2,
        prd: 2,
        'system architecture': 3,
        architecture: 3,
        'design system': 4,
        wireframes: 4,
      };

      // Type-based mapping only used as fallback when title doesn't match any known document
      // Note: REQUIREMENTS type is ambiguous (both Project Intake and PRD use it)
      // So we don't include REQUIREMENTS in this fallback - rely on title matching instead
      const docTypeToGate: Record<string, number> = {
        // 'REQUIREMENTS' intentionally omitted - use title matching for these
        PRD: 2, // PRD type (if ever used)
        ARCHITECTURE: 3, // Architecture belongs to G3
        DESIGN: 4, // Design belongs to G4
        CODE: 5, // Code belongs to G5
        TEST: 6, // Test belongs to G6
        SECURITY: 7, // Security belongs to G7
        DEPLOYMENT: 8, // Deployment belongs to G8
      };

      const gateDocuments = documents
        .filter((d) => {
          // First check if document has explicit gateId
          if (d.gateId === gateRecord?.id) return true;

          // Check by title (case-insensitive) - this is the primary matching method
          const titleLower = d.title.toLowerCase();
          const gateByTitle = docTitleToGate[titleLower];

          // If title matches a known document, use that gate assignment
          if (gateByTitle !== undefined) {
            return gateByTitle === gateNum;
          }

          // Fallback to type matching only for documents without a known title
          // This prevents PRD (type REQUIREMENTS) from appearing in G1
          if (!d.gateId && docTypeToGate[d.documentType] === gateNum) return true;

          return false;
        })
        .map((d) => ({
          id: d.id,
          name: d.title,
          path: d.filePath || '',
          type: d.documentType,
        }));

      // Extract project-specific summary and teaching moments for each gate using AI
      let projectSummary: string | undefined;
      let keyDecisions: Array<{ title: string; description: string }> | undefined;

      // Get the primary document for this gate
      const gateDocumentMap: Record<number, string> = {
        1: 'Project Intake',
        2: 'Product Requirements Document',
        3: 'System Architecture',
        4: 'Design System',
        5: 'Implementation Summary',
        6: 'Test Report',
        7: 'Security Audit',
        8: 'Deployment Plan',
        9: 'Launch Report',
      };

      const primaryDocTitle = gateDocumentMap[gateNum];
      if (primaryDocTitle) {
        const doc = await this.prisma.document.findFirst({
          where: {
            projectId,
            OR: [
              { title: primaryDocTitle },
              { title: { contains: primaryDocTitle.split(' ')[0] } },
            ],
          },
        });

        if (doc?.content) {
          const extracted = await this.extractTeachingMomentsWithAI(
            projectId,
            gateNum,
            doc.title,
            doc.content,
            metadata.name,
          );
          projectSummary = extracted.summary;
          keyDecisions = extracted.teachingMoments;
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
   * Extract teaching moments and summary using AI
   * This replaces the regex-based extraction with intelligent AI analysis
   */
  private async extractTeachingMomentsWithAI(
    projectId: string,
    gateNum: number,
    docTitle: string,
    docContent: string,
    gateName: string,
  ): Promise<{ summary: string; teachingMoments: Array<{ title: string; description: string }> }> {
    // Check cache first
    const cacheKey = `${projectId}-${gateNum}-${docTitle}`;
    const cached = this.teachingMomentsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      // Return cached result with a generic summary
      return {
        summary: this.getDefaultSummary(gateNum, gateName),
        teachingMoments: cached.moments,
      };
    }

    // Truncate content if too long to avoid token limits
    const maxContentLength = 8000;
    const truncatedContent =
      docContent.length > maxContentLength
        ? docContent.substring(0, maxContentLength) + '\n\n[Content truncated...]'
        : docContent;

    const prompt = `Analyze this ${docTitle} document and extract key teaching moments and a summary.

Document content:
${truncatedContent}

Respond with valid JSON only (no markdown, no code blocks):
{
  "summary": "A 1-2 sentence summary of what was accomplished in this phase (max 200 chars)",
  "teachingMoments": [
    {
      "title": "Short title (3-6 words)",
      "description": "Brief explanation of why this matters (1 sentence)"
    }
  ]
}

Guidelines:
- Extract 2-5 teaching moments that represent key decisions or accomplishments
- Focus on what the USER accomplished, not generic descriptions
- Be specific: mention actual technologies, user counts, feature names when present
- The summary should capture the essence of what this gate achieved
- Teaching moments should help users understand progress and learn from decisions`;

    try {
      const response = await this.aiProvider.executePrompt(
        'You are a helpful assistant that extracts key information from software development documents. Always respond with valid JSON only, no markdown formatting.',
        prompt,
        'claude-sonnet-4-20250514',
        1000,
      );

      // Parse the AI response
      const responseText = response.content;

      // Try to extract JSON from the response
      let parsed: {
        summary: string;
        teachingMoments: Array<{ title: string; description: string }>;
      };

      try {
        // First try direct parse
        parsed = JSON.parse(responseText);
      } catch {
        // Try to find JSON in the response (in case there's extra text)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No valid JSON found in response');
        }
      }

      // Validate the parsed response
      if (!parsed.summary || !Array.isArray(parsed.teachingMoments)) {
        throw new Error('Invalid response structure');
      }

      // Cache the teaching moments
      this.teachingMomentsCache.set(cacheKey, {
        moments: parsed.teachingMoments,
        timestamp: Date.now(),
      });

      return {
        summary: parsed.summary.substring(0, 300),
        teachingMoments: parsed.teachingMoments.slice(0, 5).map((tm) => ({
          title: tm.title?.substring(0, 50) || 'Key Decision',
          description: tm.description?.substring(0, 200) || 'Important milestone achieved',
        })),
      };
    } catch (error) {
      console.error(`Failed to extract teaching moments with AI for gate ${gateNum}:`, error);

      // Fallback to default values based on gate
      return {
        summary: this.getDefaultSummary(gateNum, gateName),
        teachingMoments: this.getDefaultTeachingMoments(gateNum),
      };
    }
  }

  /**
   * Get default summary for a gate when AI extraction fails
   */
  private getDefaultSummary(gateNum: number, gateName: string): string {
    const summaries: Record<number, string> = {
      1: 'Project scope and requirements captured through intake questionnaire.',
      2: 'Product requirements documented with user stories and acceptance criteria.',
      3: 'System architecture designed with technology stack decisions.',
      4: 'UX/UI design completed with wireframes and design system.',
      5: 'Core features implemented according to specifications.',
      6: 'Quality assurance testing completed with coverage metrics.',
      7: 'Security review completed with vulnerability assessment.',
      8: 'Pre-deployment review completed. Ready for production.',
      9: 'Product successfully deployed and running in production.',
    };
    return summaries[gateNum] || `${gateName} completed.`;
  }

  /**
   * Get default teaching moments for a gate when AI extraction fails
   */
  private getDefaultTeachingMoments(
    gateNum: number,
  ): Array<{ title: string; description: string }> {
    const defaults: Record<number, Array<{ title: string; description: string }>> = {
      1: [
        {
          title: 'Scope defined',
          description: 'Project boundaries and success criteria established',
        },
        {
          title: 'Constraints identified',
          description: 'Technical and business constraints documented',
        },
      ],
      2: [
        {
          title: 'User stories created',
          description: 'Requirements expressed as user-centric stories',
        },
        { title: 'Features prioritized', description: 'MVP scope defined with clear priorities' },
      ],
      3: [
        {
          title: 'Tech stack selected',
          description: 'Technology choices aligned with project needs',
        },
        {
          title: 'Architecture documented',
          description: 'System design with clear component boundaries',
        },
      ],
      4: [
        { title: 'Design system created', description: 'Consistent visual language established' },
        { title: 'User flows mapped', description: 'Key user journeys designed and validated' },
      ],
      5: [
        {
          title: 'Features implemented',
          description: 'Core functionality built per specifications',
        },
        { title: 'Code quality maintained', description: 'Implementation follows best practices' },
      ],
      6: [
        { title: 'Tests passing', description: 'Comprehensive test coverage achieved' },
        { title: 'Quality metrics met', description: 'Performance and accessibility validated' },
      ],
      7: [
        { title: 'Security reviewed', description: 'Vulnerabilities assessed and addressed' },
        {
          title: 'Best practices applied',
          description: 'Security standards implemented throughout',
        },
      ],
      8: [
        { title: 'Deployment ready', description: 'Infrastructure and processes validated' },
        { title: 'Rollback plan defined', description: 'Risk mitigation strategies in place' },
      ],
      9: [
        { title: 'Successfully launched', description: 'Product live and serving users' },
        { title: 'Monitoring active', description: 'Health metrics being tracked' },
      ],
    };
    return (
      defaults[gateNum] || [
        { title: 'Milestone achieved', description: 'Gate requirements completed' },
      ]
    );
  }
}
