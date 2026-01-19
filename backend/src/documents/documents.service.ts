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
   * Parses structured agent response and creates documents in database
   * Optimized: Uses createMany + findMany for bulk operations (2 queries instead of N queries)
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

    // Bulk insert all documents in a single query
    const documentData = documents.map((doc) => ({
      projectId,
      agentId,
      documentType: doc.type as any, // Type assertion for DocumentType enum
      title: doc.title,
      content: doc.content,
      version: 1,
      createdById: userId,
    }));

    await this.prisma.document.createMany({
      data: documentData,
    });

    // Fetch created documents with relations (single query with OR conditions)
    const createdDocuments = await this.prisma.document.findMany({
      where: {
        projectId,
        agentId,
        createdById: userId,
        documentType: { in: documents.map((d) => d.type as any) },
      },
      include: {
        project: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: documents.length,
    });

    return createdDocuments;
  }

  /**
   * Parse agent output based on agent type
   */
  private parseAgentOutputForDocuments(
    agentType: string,
    output: string,
  ): Array<{ type: string; title: string; content: string }> {
    const documents: Array<{ type: string; title: string; content: string }> = [];

    switch (agentType) {
      case 'PRODUCT_MANAGER':
        // Extract PRD document
        documents.push({
          type: 'REQUIREMENTS',
          title: 'Product Requirements Document (PRD)',
          content:
            this.extractSection(output, ['# PRD', '# Product Requirements', '## PRD']) || output,
        });

        // Extract user stories if present
        const userStories = this.extractSection(output, [
          '# User Stories',
          '## User Stories',
          '### User Stories',
        ]);
        if (userStories) {
          documents.push({
            type: 'USER_STORY',
            title: 'User Stories',
            content: userStories,
          });
        }
        break;

      case 'ARCHITECT':
        // Extract architecture document
        documents.push({
          type: 'ARCHITECTURE',
          title: 'System Architecture',
          content:
            this.extractSection(output, [
              '# Architecture',
              '# System Architecture',
              '## Architecture',
            ]) || output,
        });

        // Extract API spec section (reference, actual spec in Specification table)
        const apiSection = this.extractSection(output, [
          '# API Specification',
          '## API Design',
          '### OpenAPI',
        ]);
        if (apiSection) {
          documents.push({
            type: 'API_SPEC',
            title: 'API Specification Overview',
            content: apiSection,
          });
        }

        // Extract database schema section (reference, actual schema in Specification table)
        const dbSection = this.extractSection(output, [
          '# Database Schema',
          '## Data Model',
          '### Prisma',
        ]);
        if (dbSection) {
          documents.push({
            type: 'DATABASE_SCHEMA',
            title: 'Database Schema Overview',
            content: dbSection,
          });
        }
        break;

      case 'QA_ENGINEER':
        // Extract test plan
        documents.push({
          type: 'TEST_PLAN',
          title: 'Test Plan and Coverage Report',
          content:
            this.extractSection(output, ['# Test Plan', '# Testing', '## Test Coverage']) || output,
        });
        break;

      case 'DEVOPS_ENGINEER':
      case 'AIOPS_ENGINEER':
        // Extract deployment guide
        documents.push({
          type: 'DEPLOYMENT_GUIDE',
          title: 'Deployment Guide',
          content:
            this.extractSection(output, ['# Deployment', '# Deploy', '## Deployment Guide']) ||
            output,
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
          content: output,
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
          content: output,
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
