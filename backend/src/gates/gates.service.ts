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
import {
  GATE_REQUIRED_PROOFS,
  COVERAGE_THRESHOLD_PERCENT,
  getGateConfig,
  GateDeliverable,
} from './gate-config';
import { ProofArtifact, ProofType } from '@prisma/client';
import { FileSystemService } from '../code-generation/filesystem.service';

@Injectable()
export class GatesService {
  private readonly logger = new Logger(GatesService.name);

  constructor(
    private prisma: PrismaService,
    private stateMachine: GateStateMachineService,
    private filesystem: FileSystemService,
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
   * Validate that all required proof artifacts are present and passing for a gate.
   * Returns validation result with list of missing proof types if any.
   */
  validateProofArtifacts(
    gateType: string,
    proofArtifacts: ProofArtifact[],
  ): { valid: boolean; missing: ProofType[] } {
    const requiredTypes = GATE_REQUIRED_PROOFS[gateType] || [];

    // If no specific requirements, just check that at least one artifact passes
    if (requiredTypes.length === 0) {
      const hasAnyPassing = proofArtifacts.some((a) => a.passFail === 'pass');
      return { valid: hasAnyPassing, missing: [] };
    }

    // Get all passing artifact types
    const passedArtifacts = proofArtifacts.filter((a) => a.passFail === 'pass');
    const passedTypes = new Set(passedArtifacts.map((a) => a.proofType));

    // Find which required types are missing
    const missing = requiredTypes.filter((type) => !passedTypes.has(type));

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Parse coverage percentage from a coverage report artifact.
   * Looks for patterns like "Coverage: 85%" or "85% coverage" or just "85.5%"
   */
  parseCoveragePercentage(contentSummary: string | null): number | null {
    if (!contentSummary) return null;

    // Try to find coverage percentage in various formats
    const patterns = [
      /coverage[:\s]+(\d+(?:\.\d+)?)\s*%/i, // "Coverage: 85%" or "coverage 85%"
      /(\d+(?:\.\d+)?)\s*%\s*coverage/i, // "85% coverage"
      /total[:\s]+(\d+(?:\.\d+)?)\s*%/i, // "Total: 85%"
      /lines[:\s]+(\d+(?:\.\d+)?)\s*%/i, // "Lines: 85%"
      /statements[:\s]+(\d+(?:\.\d+)?)\s*%/i, // "Statements: 85%"
      /"coverage"[:\s]*(\d+(?:\.\d+)?)/i, // JSON format: "coverage": 85
      /(\d+(?:\.\d+)?)\s*%/, // Fallback: any percentage
    ];

    for (const pattern of patterns) {
      const match = contentSummary.match(pattern);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    return null;
  }

  /**
   * Validate coverage threshold for G6 (Testing gate).
   * Returns validation result with actual coverage if found.
   */
  validateCoverageThreshold(proofArtifacts: ProofArtifact[]): {
    valid: boolean;
    coverage: number | null;
    threshold: number;
  } {
    const coverageArtifact = proofArtifacts.find(
      (a) => a.proofType === 'coverage_report' && a.passFail === 'pass',
    );

    if (!coverageArtifact) {
      return { valid: false, coverage: null, threshold: COVERAGE_THRESHOLD_PERCENT };
    }

    const coverage = this.parseCoveragePercentage(coverageArtifact.contentSummary);

    // If we can't parse coverage, we'll allow it (artifact was already marked as pass)
    if (coverage === null) {
      return { valid: true, coverage: null, threshold: COVERAGE_THRESHOLD_PERCENT };
    }

    return {
      valid: coverage >= COVERAGE_THRESHOLD_PERCENT,
      coverage,
      threshold: COVERAGE_THRESHOLD_PERCENT,
    };
  }

  /**
   * Validate that expected deliverable files/directories exist in the workspace.
   * This is a failsafe to ensure agents actually created the required artifacts.
   */
  async validateDeliverables(
    projectId: string,
    gateType: string,
    projectType: string | null,
  ): Promise<{ valid: boolean; missing: string[]; warnings: string[] }> {
    const config = getGateConfig(projectType, gateType);
    if (!config || config.deliverables.length === 0) {
      return { valid: true, missing: [], warnings: [] };
    }

    const missing: string[] = [];
    const warnings: string[] = [];

    for (const deliverable of config.deliverables) {
      if (!deliverable.path) continue;

      // Check if the deliverable path exists
      const exists = await this.filesystem.fileExists(projectId, deliverable.path);

      if (!exists) {
        // Check if it's a directory pattern (ends with /)
        if (deliverable.path.endsWith('/')) {
          // For directories, check if any files exist within
          try {
            const structure = await this.filesystem.getDirectoryTree(
              projectId,
              deliverable.path.slice(0, -1),
            );
            if (!structure || structure.children?.length === 0) {
              missing.push(`${deliverable.name} (${deliverable.path})`);
            }
          } catch {
            missing.push(`${deliverable.name} (${deliverable.path})`);
          }
        } else {
          missing.push(`${deliverable.name} (${deliverable.path})`);
        }
      }
    }

    // Log warnings for missing deliverables
    if (missing.length > 0) {
      this.logger.warn({
        message: 'Gate has missing deliverables',
        gateType,
        projectId,
        missing,
      });
      warnings.push(`Missing deliverables: ${missing.join(', ')}`);
    }

    // Enforce strict deliverable checking - missing deliverables block gate approval
    return {
      valid: missing.length === 0,
      missing,
      warnings,
    };
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

    // Check if proof artifacts are required and validate completeness
    if (gate.requiresProof) {
      // G6 STRICT MODE: Check for any failed test proofs first - block approval with clear message
      if (gate.gateType === 'G6_PENDING') {
        const failedProofs = gate.proofArtifacts.filter((a) => a.passFail === 'fail');
        if (failedProofs.length > 0) {
          const failedTypes = failedProofs.map((p) => p.proofType).join(', ');
          const failedDetails = failedProofs
            .map((p) => `${p.proofType}: ${p.contentSummary || 'Failed'}`)
            .join('; ');

          this.logger.error({
            message: 'G6 Gate approval BLOCKED - tests are failing',
            gateId: id,
            gateType: gate.gateType,
            projectId: gate.projectId,
            userId,
            failedProofTypes: failedTypes,
            failedDetails,
          });

          throw new BadRequestException(
            `Cannot approve G6 Testing Gate: Tests are failing. Failed proof types: ${failedTypes}. ` +
              `Fix all test failures before approval. Check tasks created for developers.`,
          );
        }
      }

      const { valid, missing } = this.validateProofArtifacts(gate.gateType, gate.proofArtifacts);

      if (!valid) {
        if (missing.length > 0) {
          this.logger.warn({
            message: 'Gate approval denied - missing required proof artifacts',
            gateId: id,
            gateType: gate.gateType,
            projectId: gate.projectId,
            userId,
            missingProofTypes: missing,
          });
          throw new BadRequestException(
            `Cannot approve gate: Missing required proof artifacts: ${missing.join(', ')}`,
          );
        } else {
          this.logger.warn({
            message: 'Gate approval denied - no approved proof artifacts',
            gateId: id,
            gateType: gate.gateType,
            projectId: gate.projectId,
            userId,
          });
          throw new BadRequestException('Cannot approve gate: No approved proof artifacts found');
        }
      }

      // Additional validation for G6 (Testing gate): check coverage threshold
      if (gate.gateType === 'G6_PENDING') {
        const coverageValidation = this.validateCoverageThreshold(gate.proofArtifacts);
        if (!coverageValidation.valid && coverageValidation.coverage !== null) {
          this.logger.warn({
            message: 'Gate approval denied - coverage below threshold',
            gateId: id,
            gateType: gate.gateType,
            projectId: gate.projectId,
            userId,
            coverage: coverageValidation.coverage,
            threshold: coverageValidation.threshold,
          });
          throw new BadRequestException(
            `Cannot approve gate: Code coverage ${coverageValidation.coverage}% is below the required ${coverageValidation.threshold}% threshold`,
          );
        }
      }
    }

    // Validate deliverables exist in the workspace (failsafe check)
    const deliverableValidation = await this.validateDeliverables(
      gate.projectId,
      gate.gateType,
      gate.project.type,
    );

    // Block approval if required deliverables are missing
    if (!deliverableValidation.valid && approveGateDto.approved) {
      this.logger.error({
        message: 'Gate approval blocked - missing required deliverables',
        gateId: id,
        gateType: gate.gateType,
        projectId: gate.projectId,
        missing: deliverableValidation.missing,
      });

      throw new BadRequestException(
        `Cannot approve gate: missing required deliverables - ${deliverableValidation.missing.join(', ')}`,
      );
    }

    // Log warnings about non-critical deliverables
    if (deliverableValidation.warnings.length > 0) {
      this.logger.warn({
        message: 'Gate approval proceeding with warnings',
        gateId: id,
        gateType: gate.gateType,
        projectId: gate.projectId,
        warnings: deliverableValidation.warnings,
      });
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
