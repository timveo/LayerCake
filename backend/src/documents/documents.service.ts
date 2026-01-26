import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentGitService } from './services/document-git.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private documentGit: DocumentGitService,
  ) {}

  /**
   * Clean agent output by removing internal reasoning and tool calls
   * This ensures only user-facing content is saved to documents
   */
  private cleanAgentOutput(output: string): string {
    return (
      output
        // Remove <thinking> tags and their content
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
        // Remove MCP/tool call XML tags with attributes (e.g., <invoke name="...">, <parameter name="...">)
        .replace(/<invoke[^>]*>[\s\S]*?<\/invoke>/gi, '')
        .replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/gi, '')
        // Remove standalone tool tags on their own lines (catches incomplete tags)
        .replace(/^.*<invoke[^>]*>.*$/gm, '')
        .replace(/^.*<parameter[^>]*>.*$/gm, '')
        // Remove simple tool call tags (e.g., <get_documents>, <get_context_for_story>)
        .replace(/<[a-z_]+>[\s\S]*?<\/[a-z_]+>/gi, '')
        // Remove any standalone opening/closing tool tags
        .replace(/<\/?[a-z_]+>/gi, '')
        // Remove lines that look like preamble before the actual document content
        .replace(/^(I'll|Let me|Now let me|Based on)[^\n]*$/gm, '')
        // Clean up excessive whitespace left behind
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }

  async create(createDocumentDto: CreateDocumentDto, userId: string) {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: createDocumentDto.projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only create documents for your own projects');
    }

    const document = await this.prisma.document.create({
      data: {
        ...createDocumentDto,
        version: createDocumentDto.version || 1,
        createdById: userId,
      },
      include: {
        project: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Save document to git-backed filesystem
    try {
      await this.documentGit.saveDocument(
        createDocumentDto.projectId,
        document.id,
        document.title,
        document.content,
        {
          autoCommit: true,
          commitMessage: `Add ${document.title}`,
          author: {
            name: document.createdBy?.name || 'FuzzyLlama User',
            email: document.createdBy?.email || 'user@fuzzyllama.dev',
          },
        },
      );
    } catch (error) {
      this.logger.warn(`Failed to save document to git: ${error.message}`);
    }

    return document;
  }

  async findAll(projectId: string, userId: string, documentType?: string) {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only view documents for your own projects');
    }

    const where: any = { projectId };

    if (documentType) {
      where.documentType = documentType;
    }

    return await this.prisma.document.findMany({
      where,
      include: {
        project: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        project: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.project.ownerId !== userId) {
      throw new ForbiddenException('You can only view documents for your own projects');
    }

    return document;
  }

  async update(id: string, updateDocumentDto: UpdateDocumentDto, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.project.ownerId !== userId) {
      throw new ForbiddenException('You can only update documents for your own projects');
    }

    // If content is being updated, increment version
    const updateData: any = { ...updateDocumentDto };
    const contentChanged =
      updateDocumentDto.content && updateDocumentDto.content !== document.content;
    if (contentChanged) {
      updateData.version = document.version + 1;
    }

    const updatedDocument = await this.prisma.document.update({
      where: { id },
      data: updateData,
      include: {
        project: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Update document in git-backed filesystem if content changed
    if (contentChanged) {
      try {
        await this.documentGit.saveDocument(
          document.projectId,
          id,
          updatedDocument.title,
          updatedDocument.content,
          {
            autoCommit: true,
            commitMessage: `Update ${updatedDocument.title} (v${updatedDocument.version})`,
            author: {
              name: updatedDocument.createdBy?.name || 'FuzzyLlama User',
              email: updatedDocument.createdBy?.email || 'user@fuzzyllama.dev',
            },
          },
        );
      } catch (error) {
        this.logger.warn(`Failed to update document in git: ${error.message}`);
      }
    }

    return updatedDocument;
  }

  async delete(id: string, userId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.project.ownerId !== userId) {
      throw new ForbiddenException('You can only delete documents for your own projects');
    }

    await this.prisma.document.delete({
      where: { id },
    });

    return { message: 'Document deleted successfully' };
  }

  async getDocumentsByType(projectId: string, documentType: string, userId: string) {
    return this.findAll(projectId, userId, documentType);
  }

  async getDocumentsByAgent(agentId: string, userId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { project: true },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    if (agent.project.ownerId !== userId) {
      throw new ForbiddenException('You can only view documents for your own projects');
    }

    return await this.prisma.document.findMany({
      where: { agentId },
      include: {
        project: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentStats(projectId: string, userId: string) {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only view stats for your own projects');
    }

    const [
      total,
      requirements,
      architecture,
      apiSpec,
      databaseSchema,
      userStory,
      testPlan,
      deploymentGuide,
      code,
      other,
    ] = await Promise.all([
      this.prisma.document.count({ where: { projectId } }),
      this.prisma.document.count({
        where: { projectId, documentType: 'REQUIREMENTS' },
      }),
      this.prisma.document.count({
        where: { projectId, documentType: 'ARCHITECTURE' },
      }),
      this.prisma.document.count({
        where: { projectId, documentType: 'API_SPEC' },
      }),
      this.prisma.document.count({
        where: { projectId, documentType: 'DATABASE_SCHEMA' },
      }),
      this.prisma.document.count({
        where: { projectId, documentType: 'USER_STORY' },
      }),
      this.prisma.document.count({
        where: { projectId, documentType: 'TEST_PLAN' },
      }),
      this.prisma.document.count({
        where: { projectId, documentType: 'DEPLOYMENT_GUIDE' },
      }),
      this.prisma.document.count({
        where: { projectId, documentType: 'CODE' },
      }),
      this.prisma.document.count({
        where: { projectId, documentType: 'OTHER' },
      }),
    ]);

    return {
      total,
      byType: {
        requirements,
        architecture,
        apiSpec,
        databaseSchema,
        userStory,
        testPlan,
        deploymentGuide,
        code,
        other,
      },
    };
  }

  /**
   * Generate documents from agent output
   * Parses structured agent response and creates or updates documents in database
   * Uses findFirst + update/create pattern to prevent duplicate documents
   */
  async generateFromAgentOutput(
    projectId: string,
    agentId: string,
    agentType: string,
    agentOutput: string,
    userId: string,
  ): Promise<any[]> {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only generate documents for your own projects');
    }

    // Parse agent output for document sections
    const documents = this.parseAgentOutputForDocuments(agentType, agentOutput);

    // Skip if no documents to create
    if (documents.length === 0) {
      return [];
    }

    // Use findFirst + update/create pattern to prevent duplicates
    const upsertedDocuments: any[] = [];

    for (const doc of documents) {
      // Check if document already exists
      const existingDoc = await this.prisma.document.findFirst({
        where: {
          projectId,
          documentType: doc.type as any,
          title: doc.title,
        },
      });

      let result;
      if (existingDoc) {
        // Update existing document
        result = await this.prisma.document.update({
          where: { id: existingDoc.id },
          data: {
            content: doc.content,
            agentId, // Update to latest agent that modified it
            version: existingDoc.version + 1,
            updatedAt: new Date(),
          },
          include: {
            project: true,
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });
        this.logger.log(`Updated existing document: ${doc.title} (v${result.version})`);
      } else {
        // Create new document
        result = await this.prisma.document.create({
          data: {
            projectId,
            agentId,
            documentType: doc.type as any,
            title: doc.title,
            content: doc.content,
            version: 1,
            createdById: userId,
          },
          include: {
            project: true,
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
        });
        this.logger.log(`Created new document: ${doc.title}`);
      }
      upsertedDocuments.push(result);
    }

    return upsertedDocuments;
  }

  /**
   * Parse agent output based on agent type
   */
  private parseAgentOutputForDocuments(
    agentType: string,
    output: string,
  ): Array<{ type: string; title: string; content: string }> {
    const documents: Array<{ type: string; title: string; content: string }> = [];

    // Clean the output first - remove thinking tags, tool calls, etc.
    const cleanedOutput = this.cleanAgentOutput(output);

    switch (agentType) {
      case 'PRODUCT_MANAGER':
        // Extract PRD document - User Stories should be included IN the PRD, not as separate doc
        // The PRD document includes all sections: Executive Summary, User Stories, Features, etc.
        documents.push({
          type: 'REQUIREMENTS',
          title: 'Product Requirements Document',
          content: cleanedOutput,
        });
        // NOTE: User Stories are NOT extracted as a separate document
        // They are a section within the PRD as per standard PRD format
        break;

      case 'ARCHITECT':
        // Create single Architecture document with all specs included
        // API specs and database schema are sections within the Architecture doc, not separate documents
        documents.push({
          type: 'ARCHITECTURE',
          title: 'System Architecture',
          content: cleanedOutput,
        });
        break;

      case 'QA_ENGINEER':
        // Extract test plan - use full output since QA creates code blocks with test files
        // The extractSection method doesn't handle content inside markdown code blocks well
        // For QA_ENGINEER, the full output contains the test plan + test file code blocks
        documents.push({
          type: 'TEST_PLAN',
          title: 'Test Plan and Coverage Report',
          content: cleanedOutput,
        });
        break;

      case 'DEVOPS_ENGINEER':
      case 'AIOPS_ENGINEER':
        // Extract deployment guide
        documents.push({
          type: 'DEPLOYMENT_GUIDE',
          title: 'Deployment Guide',
          content:
            this.extractSection(cleanedOutput, [
              '# Deployment',
              '# Deploy',
              '## Deployment Guide',
            ]) || cleanedOutput,
        });
        break;

      case 'UX_UI_DESIGNER':
        // Extract design document with HTML prototypes
        // The designer creates 3 design options as viewable HTML
        documents.push({
          type: 'DESIGN',
          title: 'UX/UI Design System',
          content: cleanedOutput,
        });
        break;

      case 'FRONTEND_DEVELOPER':
      case 'BACKEND_DEVELOPER':
      case 'ML_ENGINEER':
      case 'DATA_ENGINEER':
      case 'PROMPT_ENGINEER':
        // Extract implementation notes/code documentation
        documents.push({
          type: 'CODE',
          title: `${agentType} Implementation`,
          content: cleanedOutput,
        });
        break;

      case 'PRODUCT_MANAGER_ONBOARDING':
        // Onboarding documents are handled by workflow-coordinator.service.ts
        // in handleOnboardingComplete() - don't duplicate document creation here
        break;

      default:
        // Generic document for other agents
        documents.push({
          type: 'OTHER',
          title: `${agentType} Output`,
          content: cleanedOutput,
        });
    }

    return documents;
  }

  /**
   * Extract a section from markdown content using headings
   */
  private extractSection(content: string, headings: string[]): string | null {
    for (const heading of headings) {
      const regex = new RegExp(`${heading}[\\s\\S]*?(?=(\\n#[^#]|$))`, 'i');
      const match = content.match(regex);
      if (match) {
        return match[0].trim();
      }
    }
    return null;
  }

  // ============================================================
  // DESIGN CONCEPTS
  // ============================================================

  /**
   * Get all design concepts for a project
   */
  async getDesignConcepts(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only view design concepts for your own projects');
    }

    return this.prisma.designConcept.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get the selected design concept for a project
   */
  async getSelectedDesignConcept(projectId: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only view design concepts for your own projects');
    }

    return this.prisma.designConcept.findFirst({
      where: { projectId, isSelected: true },
    });
  }

  /**
   * Select a design concept (mark it as chosen, unselect others)
   */
  async selectDesignConcept(conceptId: string, userId: string) {
    const concept = await this.prisma.designConcept.findUnique({
      where: { id: conceptId },
      include: { project: true },
    });

    if (!concept) {
      throw new NotFoundException('Design concept not found');
    }

    if (concept.project.ownerId !== userId) {
      throw new ForbiddenException('You can only select design concepts for your own projects');
    }

    // Unselect all other concepts for this project
    await this.prisma.designConcept.updateMany({
      where: { projectId: concept.projectId },
      data: { isSelected: false },
    });

    // Select this concept
    return this.prisma.designConcept.update({
      where: { id: conceptId },
      data: { isSelected: true },
    });
  }

  /**
   * Create design concepts from agent output
   * Parses structured JSON output from UX/UI Designer agent
   */
  async createDesignConceptsFromAgent(
    projectId: string,
    agentId: string,
    concepts: Array<{
      name: string;
      description?: string;
      html: string;
      style?: string;
      colorScheme?: string;
    }>,
  ) {
    // Delete existing concepts for this project (fresh set from agent)
    await this.prisma.designConcept.deleteMany({
      where: { projectId },
    });

    // Create new concepts
    const created = await Promise.all(
      concepts.map((concept, index) =>
        this.prisma.designConcept.create({
          data: {
            projectId,
            agentId,
            name: concept.name,
            description: concept.description,
            html: concept.html,
            style: concept.style,
            colorScheme: concept.colorScheme,
            isSelected: index === 0, // Select first by default
          },
        }),
      ),
    );

    this.logger.log(`Created ${created.length} design concepts for project ${projectId}`);
    return created;
  }

  /**
   * Extract structured handoff data from agent output
   * Looks for JSON handoff format in agent response
   */
  extractHandoffData(agentOutput: string): {
    deliverables: string[];
    nextAgent: string[];
    nextAction: string;
    artifacts?: string[];
  } | null {
    // Try to find JSON handoff block
    const jsonMatch = agentOutput.match(/```json\s*\n(\{[\s\S]*?\})\s*\n```/);
    if (jsonMatch) {
      try {
        const handoffData = JSON.parse(jsonMatch[1]);
        return handoffData;
      } catch (e) {
        // JSON parsing failed, continue to fallback
      }
    }

    // Fallback: Extract sections manually
    const deliverables: string[] = [];
    const deliverablesMatch = agentOutput.match(/##?\s*Deliverables\s*[\s\S]*?(?=\n##?|\n\n|$)/i);
    if (deliverablesMatch) {
      const lines = deliverablesMatch[0].split('\n');
      for (const line of lines) {
        const match = line.match(/^[\s-]*[•\-\*]\s*(.+)$/);
        if (match) {
          deliverables.push(match[1].trim());
        }
      }
    }

    const nextActionMatch = agentOutput.match(
      /##?\s*Next\s*(?:Action|Step)s?\s*[\s:]*(.+?)(?=\n##?|\n\n|$)/is,
    );
    const nextAction = nextActionMatch ? nextActionMatch[1].trim() : '';

    return deliverables.length > 0 || nextAction
      ? { deliverables, nextAgent: [], nextAction, artifacts: [] }
      : null;
  }
}
