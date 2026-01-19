import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectType, Phase } from '@prisma/client';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extract a project name from description (first 5-6 words, cleaned up)
   */
  private extractProjectName(description: string): string {
    const words = description.split(' ').slice(0, 6);
    const name = words
      .join(' ')
      .replace(/[^\w\s-]/g, '')
      .trim();
    // Capitalize first letter of each word
    return (
      name
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ') || `Project ${Date.now()}`
    );
  }

  /**
   * Infer project type from description keywords
   */
  private inferProjectType(description: string): ProjectType {
    const lowerDesc = description.toLowerCase();
    if (
      lowerDesc.includes('ai') ||
      lowerDesc.includes('ml') ||
      lowerDesc.includes('machine learning') ||
      lowerDesc.includes('chatbot') ||
      lowerDesc.includes('gpt') ||
      lowerDesc.includes('llm') ||
      lowerDesc.includes('neural') ||
      lowerDesc.includes('model')
    ) {
      return ProjectType.ai_ml;
    }
    if (
      lowerDesc.includes('enhance') ||
      lowerDesc.includes('existing') ||
      lowerDesc.includes('add feature') ||
      lowerDesc.includes('improve') ||
      lowerDesc.includes('upgrade') ||
      lowerDesc.includes('refactor')
    ) {
      return ProjectType.enhancement;
    }
    return ProjectType.traditional;
  }

  async create(createProjectDto: CreateProjectDto, userId: string) {
    // Get user to check plan tier
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { planTier: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check project limits based on plan tier
    const projectCount = await this.prisma.project.count({
      where: { ownerId: userId },
    });

    const limits = {
      FREE: 100,
      PRO: 100,
      TEAM: Infinity,
      ENTERPRISE: Infinity,
    };

    const projectLimit = limits[user.planTier] || limits.FREE;

    if (projectCount >= projectLimit) {
      throw new BadRequestException(
        `Project limit reached. Your ${user.planTier} plan allows ${projectLimit} project(s). Upgrade to create more projects.`,
      );
    }

    // Auto-generate name and type if not provided
    const name = createProjectDto.name || this.extractProjectName(createProjectDto.description);
    const type = createProjectDto.type || this.inferProjectType(createProjectDto.description);

    // Create project with initial state
    const project = await this.prisma.project.create({
      data: {
        name,
        type,
        repository: createProjectDto.repository,
        ownerId: userId,
        state: {
          create: {
            currentPhase: Phase.pre_startup,
            currentGate: 'G0_PENDING',
            percentComplete: 0,
          },
        },
      },
      include: {
        state: true,
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return project;
  }

  async findAll(userId: string, organizationId?: string) {
    const where: any = {
      OR: [{ ownerId: userId }, ...(organizationId ? [{ organizationId }] : [])],
    };

    const projects = await this.prisma.project.findMany({
      where,
      include: {
        state: true,
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return projects;
  }

  async findOne(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        state: true,
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        _count: {
          select: {
            tasks: true,
            documents: true,
            specifications: true,
            gates: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if user has access to this project
    if (project.ownerId !== userId && !project.organizationId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    return project;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if user has permission to update
    if (project.ownerId !== userId) {
      throw new ForbiddenException('You do not have permission to update this project');
    }

    const updatedProject = await this.prisma.project.update({
      where: { id },
      data: updateProjectDto,
      include: {
        state: true,
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return updatedProject;
  }

  async delete(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if user has permission to delete
    if (project.ownerId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this project');
    }

    // Delete project (cascade will delete all related data)
    await this.prisma.project.delete({
      where: { id },
    });

    return { message: 'Project deleted successfully' };
  }

  async getStats(id: string, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this project');
    }

    // Get various counts
    const [
      taskCount,
      completedTaskCount,
      documentCount,
      specCount,
      artifactCount,
      gateCount,
      approvedGateCount,
    ] = await Promise.all([
      this.prisma.task.count({ where: { projectId: id } }),
      this.prisma.task.count({ where: { projectId: id, status: 'complete' } }),
      this.prisma.document.count({ where: { projectId: id } }),
      this.prisma.specification.count({ where: { projectId: id } }),
      this.prisma.proofArtifact.count({ where: { projectId: id } }),
      this.prisma.gate.count({ where: { projectId: id } }),
      this.prisma.gate.count({ where: { projectId: id, status: 'APPROVED' } }),
    ]);

    // Get project state
    const state = await this.prisma.projectState.findUnique({
      where: { projectId: id },
    });

    return {
      tasks: {
        total: taskCount,
        completed: completedTaskCount,
        completion: taskCount > 0 ? (completedTaskCount / taskCount) * 100 : 0,
      },
      documents: documentCount,
      specifications: specCount,
      artifacts: artifactCount,
      gates: {
        total: gateCount,
        approved: approvedGateCount,
        completion: gateCount > 0 ? (approvedGateCount / gateCount) * 100 : 0,
      },
      state: state || {
        currentPhase: Phase.pre_startup,
        currentGate: 'G0_PENDING',
        percentComplete: 0,
      },
    };
  }

  async updateState(
    id: string,
    userId: string,
    phase: Phase,
    gate: string,
    agent?: string,
    percentComplete?: number,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You do not have permission to update this project');
    }

    const state = await this.prisma.projectState.upsert({
      where: { projectId: id },
      update: {
        currentPhase: phase,
        currentGate: gate,
        currentAgent: agent,
        percentComplete: percentComplete ?? 0,
      },
      create: {
        projectId: id,
        currentPhase: phase,
        currentGate: gate,
        currentAgent: agent,
        percentComplete: percentComplete ?? 0,
      },
    });

    return state;
  }
}
