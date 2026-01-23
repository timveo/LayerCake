import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { GateStateMachineService } from './services/gate-state-machine.service';
import { CreateGateDto } from './dto/create-gate.dto';
import { UpdateGateDto } from './dto/update-gate.dto';
import { ApproveGateDto } from './dto/approve-gate.dto';

@Injectable()
export class GatesService {
  private readonly logger = new Logger(GatesService.name);

  constructor(
    private prisma: PrismaService,
    private stateMachine: GateStateMachineService,
  ) {}

  async create(createGateDto: CreateGateDto, userId: string) {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: createGateDto.projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only create gates for your own projects');
    }

    const gate = await this.prisma.gate.create({
      data: {
        ...createGateDto,
        status: 'PENDING',
      },
      include: {
        project: true,
        proofArtifacts: true,
      },
    });

    this.logger.log({
      message: 'Gate created',
      gateId: gate.id,
      gateType: gate.gateType,
      projectId: gate.projectId,
      userId,
    });

    return gate;
  }

  async findAll(projectId: string, userId: string) {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only view gates for your own projects');
    }

    return await this.prisma.gate.findMany({
      where: { projectId },
      include: {
        proofArtifacts: {
          select: {
            id: true,
            filePath: true,
            proofType: true,
            passFail: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string, userId: string) {
    const gate = await this.prisma.gate.findUnique({
      where: { id },
      include: {
        project: true,
        proofArtifacts: true,
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!gate) {
      throw new NotFoundException('Gate not found');
    }

    if (gate.project.ownerId !== userId) {
      throw new ForbiddenException('You can only view gates for your own projects');
    }

    return gate;
  }

  async update(id: string, updateGateDto: UpdateGateDto, userId: string) {
    const gate = await this.prisma.gate.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!gate) {
      throw new NotFoundException('Gate not found');
    }

    if (gate.project.ownerId !== userId) {
      throw new ForbiddenException('You can only update gates for your own projects');
    }

    return await this.prisma.gate.update({
      where: { id },
      data: updateGateDto,
      include: {
        project: true,
        proofArtifacts: true,
      },
    });
  }

  /**
   * Approve or reject a gate.
   * Delegates to GateStateMachineService to avoid duplicate updates.
   */
  async approve(id: string, approveGateDto: ApproveGateDto, userId: string) {
    const gate = await this.prisma.gate.findUnique({
      where: { id },
      include: {
        project: true,
        proofArtifacts: true,
      },
    });

    if (!gate) {
      throw new NotFoundException('Gate not found');
    }

    if (gate.project.ownerId !== userId) {
      throw new ForbiddenException('You can only approve gates for your own projects');
    }

    this.logger.log({
      message: 'Gate approval requested',
      gateId: id,
      gateType: gate.gateType,
      projectId: gate.projectId,
      userId,
      approved: approveGateDto.approved,
    });

    // Check if proof artifacts are required and present
    if (gate.requiresProof) {
      const approvedArtifacts = gate.proofArtifacts.filter(
        (artifact) => artifact.passFail === 'pass',
      );

      if (approvedArtifacts.length === 0) {
        this.logger.warn({
          message: 'Gate approval denied - missing proof artifacts',
          gateId: id,
          gateType: gate.gateType,
          projectId: gate.projectId,
          userId,
        });
        throw new BadRequestException('Cannot approve gate: No approved proof artifacts found');
      }
    }

    // Delegate entirely to state machine to avoid duplicate gate updates
    if (approveGateDto.approved) {
      await this.stateMachine.approveGate(
        gate.projectId,
        gate.gateType,
        userId,
        'approved',
        approveGateDto.reviewNotes,
      );

      this.logger.log({
        message: 'Gate approved successfully',
        gateId: id,
        gateType: gate.gateType,
        projectId: gate.projectId,
        userId,
        reviewNotes: approveGateDto.reviewNotes,
        proofArtifactCount: gate.proofArtifacts?.length,
      });
    } else {
      await this.stateMachine.rejectGate(
        gate.projectId,
        gate.gateType,
        userId,
        approveGateDto.rejectionReason || 'Rejected by user',
      );

      this.logger.warn({
        message: 'Gate rejected',
        gateId: id,
        gateType: gate.gateType,
        projectId: gate.projectId,
        userId,
        reason: approveGateDto.rejectionReason || 'Rejected by user',
      });
    }

    // Return the updated gate
    return this.findOne(id, userId);
  }

  async delete(id: string, userId: string) {
    const gate = await this.prisma.gate.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!gate) {
      throw new NotFoundException('Gate not found');
    }

    if (gate.project.ownerId !== userId) {
      throw new ForbiddenException('You can only delete gates for your own projects');
    }

    await this.prisma.gate.delete({
      where: { id },
    });

    this.logger.log({
      message: 'Gate deleted',
      gateId: id,
      gateType: gate.gateType,
      projectId: gate.projectId,
      userId,
    });

    return { message: 'Gate deleted successfully' };
  }

  async getGateStats(projectId: string, userId: string) {
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

    const [total, pending, inReview, approved, rejected, blocked] = await Promise.all([
      this.prisma.gate.count({ where: { projectId } }),
      this.prisma.gate.count({ where: { projectId, status: 'PENDING' } }),
      this.prisma.gate.count({ where: { projectId, status: 'IN_REVIEW' } }),
      this.prisma.gate.count({ where: { projectId, status: 'APPROVED' } }),
      this.prisma.gate.count({ where: { projectId, status: 'REJECTED' } }),
      this.prisma.gate.count({ where: { projectId, status: 'BLOCKED' } }),
    ]);

    return {
      total,
      pending,
      inReview,
      approved,
      rejected,
      blocked,
      completionRate: total > 0 ? Math.round((approved / total) * 100) : 0,
    };
  }

  async getCurrentGate(projectId: string, userId: string) {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { state: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('You can only view gates for your own projects');
    }

    const currentGateType = project.state?.currentGate;

    if (!currentGateType) {
      return null;
    }

    return await this.prisma.gate.findFirst({
      where: {
        projectId,
        gateType: currentGateType,
      },
      include: {
        proofArtifacts: true,
        approvedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }
}
