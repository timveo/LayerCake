import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { getGateConfig, getDeliverablesForGate } from '../gate-config';

// Transaction client type for passing to helper methods
type TransactionClient = Prisma.TransactionClient;

// Gate progression order (G1-G9, no G0)
const GATE_PROGRESSION = [
  'G1_PENDING',
  'G1_COMPLETE',
  'G2_PENDING',
  'G2_COMPLETE',
  'G3_PENDING',
  'G3_COMPLETE',
  'G4_PENDING',
  'G4_COMPLETE',
  'G5_PENDING',
  'G5_COMPLETE',
  'G6_PENDING',
  'G6_COMPLETE',
  'G7_PENDING',
  'G7_COMPLETE',
  'G8_PENDING',
  'G8_COMPLETE',
  'G9_PENDING',
  'G9_COMPLETE',
  'PROJECT_COMPLETE',
];

// Gate approval keywords
const VALID_APPROVAL_KEYWORDS = ['approved', 'yes', 'approve', 'accept'];
const INVALID_APPROVAL_KEYWORDS = ['ok', 'sure', 'fine', 'alright'];

@Injectable()
export class GateStateMachineService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize gates for a new project
   */
  async initializeProjectGates(projectId: string, projectType?: string): Promise<void> {
    const type = projectType || 'traditional';

    // Get G1_PENDING config from centralized gate config
    const config = getGateConfig(type, 'G1_PENDING');

    // Create G1_PENDING gate (scope/intake approval)
    // G1 is the first gate - no G0 in the Multi-Agent-Product-Creator framework
    await this.prisma.gate.create({
      data: {
        projectId,
        gateType: 'G1_PENDING',
        status: 'PENDING',
        description:
          config?.description || 'Project scope approval - intake questionnaire complete',
        passingCriteria:
          config?.passingCriteria ||
          'User has approved project scope, vision, goals, and constraints',
        requiresProof: config?.requiresProof ?? false,
      },
    });

    // Create initial deliverables for G1_PENDING
    const deliverables = getDeliverablesForGate(type, 'G1_PENDING');
    if (deliverables.length > 0) {
      await this.prisma.deliverable.createMany({
        data: deliverables.map((d) => ({
          projectId,
          name: d.name,
          path: d.path,
          owner: d.owner,
          status: 'not_started',
        })),
      });

      console.log(
        `[GateStateMachine] Initialized project with ${deliverables.length} deliverables for G1_PENDING`,
      );
    }
  }

  /**
   * Get current active gate for a project
   * Returns the highest numbered gate that has work in progress or is pending review
   */
  async getCurrentGate(projectId: string): Promise<any> {
    const gates = await this.prisma.gate.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    if (gates.length === 0) return null;

    // Prioritize gates that are IN_REVIEW (work is done, awaiting approval)
    const inReviewGate = gates.filter((g) => g.status === 'IN_REVIEW').pop();
    if (inReviewGate) return inReviewGate;

    // Then look for PENDING gates (work in progress)
    const pendingGate = gates.filter((g) => g.status === 'PENDING').pop();
    if (pendingGate) return pendingGate;

    // If all gates are approved, return the last one
    return gates[gates.length - 1];
  }

  /**
   * Check if a gate can be transitioned
   */
  async canTransitionGate(
    projectId: string,
    gateType: string,
    userId: string,
  ): Promise<{ canTransition: boolean; reason?: string }> {
    // Get project to verify ownership
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { owner: true },
    });

    if (!project) {
      return { canTransition: false, reason: 'Project not found' };
    }

    if (project.ownerId !== userId) {
      return { canTransition: false, reason: 'Only project owner can approve gates' };
    }

    // Get current gate
    const gate = await this.prisma.gate.findFirst({
      where: { projectId, gateType },
    });

    if (!gate) {
      return { canTransition: false, reason: 'Gate not found' };
    }

    if (gate.status === 'APPROVED') {
      return { canTransition: false, reason: 'Gate already approved' };
    }

    if (gate.status === 'BLOCKED') {
      return { canTransition: false, reason: 'Gate is blocked by dependencies' };
    }

    // Check if previous gate is approved
    const gateIndex = GATE_PROGRESSION.indexOf(gateType);
    if (gateIndex > 0) {
      const previousGateType = GATE_PROGRESSION[gateIndex - 1];
      const previousGate = await this.prisma.gate.findFirst({
        where: { projectId, gateType: previousGateType },
      });

      if (!previousGate || previousGate.status !== 'APPROVED') {
        return {
          canTransition: false,
          reason: `Previous gate ${previousGateType} must be approved first`,
        };
      }
    }

    // Check if proof artifacts are required and present
    if (gate.requiresProof) {
      const proofCount = await this.prisma.proofArtifact.count({
        where: { gateId: gate.id },
      });

      if (proofCount === 0) {
        return {
          canTransition: false,
          reason: 'Gate requires proof artifacts before approval',
        };
      }
    }

    // Check if required deliverables are present and complete
    const deliverables = await this.prisma.deliverable.findMany({
      where: { projectId },
    });

    if (deliverables.length > 0) {
      // Check if all deliverables are complete
      const incompleteDeliverables = deliverables.filter((d) => d.status !== 'complete');

      if (incompleteDeliverables.length > 0) {
        const deliverableNames = incompleteDeliverables.map((d) => d.name).join(', ');
        return {
          canTransition: false,
          reason: `Gate has incomplete deliverables: ${deliverableNames}. All deliverables must be complete before gate approval.`,
        };
      }
    }

    return { canTransition: true };
  }

  /**
   * Validate approval response (must be explicit)
   */
  validateApprovalResponse(response: string): {
    isValid: boolean;
    reason?: string;
  } {
    const normalized = response.toLowerCase().trim();

    // Check for invalid keywords
    if (INVALID_APPROVAL_KEYWORDS.some((keyword) => normalized === keyword)) {
      return {
        isValid: false,
        reason: `"${response}" is not a clear approval. Please use "approved" or "yes" to approve this gate.`,
      };
    }

    // Check for valid keywords
    if (VALID_APPROVAL_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
      return { isValid: true };
    }

    return {
      isValid: false,
      reason: `Please provide explicit approval using "approved" or "yes"`,
    };
  }

  /**
   * Transition gate to IN_REVIEW status (ready for user approval)
   */
  async transitionToReview(
    projectId: string,
    gateType: string,
    reviewData?: {
      description?: string;
      passingCriteria?: string;
    },
  ): Promise<void> {
    const gate = await this.prisma.gate.findFirst({
      where: { projectId, gateType },
    });

    if (!gate) {
      throw new BadRequestException(`Gate ${gateType} not found`);
    }

    await this.prisma.gate.update({
      where: { id: gate.id },
      data: {
        status: 'IN_REVIEW',
        description: reviewData?.description || gate.description,
        passingCriteria: reviewData?.passingCriteria || gate.passingCriteria,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Approve a gate and create next gate
   * All operations are wrapped in a transaction to ensure data consistency.
   * If any step fails, all changes are rolled back.
   */
  async approveGate(
    projectId: string,
    gateType: string,
    userId: string,
    approvalResponse: string,
    reviewNotes?: string,
  ): Promise<{ success: boolean; nextGate?: string }> {
    // Validate approval response (outside transaction - no DB writes)
    const validation = this.validateApprovalResponse(approvalResponse);
    if (!validation.isValid) {
      throw new BadRequestException(validation.reason);
    }

    // Check if can transition (outside transaction - read-only checks)
    const canTransition = await this.canTransitionGate(projectId, gateType, userId);
    if (!canTransition.canTransition) {
      throw new ForbiddenException(canTransition.reason);
    }

    // Get the gate (outside transaction - needed for validation)
    const gate = await this.prisma.gate.findFirst({
      where: { projectId, gateType },
    });

    if (!gate) {
      throw new BadRequestException(`Gate ${gateType} not found`);
    }

    // Wrap all write operations in a transaction for data consistency
    return this.prisma.$transaction(async (tx) => {
      // Approve the gate
      await tx.gate.update({
        where: { id: gate.id },
        data: {
          status: 'APPROVED',
          approvedById: userId,
          approvedAt: new Date(),
          reviewNotes,
        },
      });

      // Lock documents if applicable
      await this.lockDocumentsForGate(projectId, gateType, tx);

      // Create next gate and update project state to point to it
      const nextGateType = this.getNextGateType(gateType);
      if (nextGateType) {
        await this.createNextGate(projectId, nextGateType, tx);

        // Update project state to the next gate (not the approved one)
        await tx.project.update({
          where: { id: projectId },
          data: {
            state: {
              update: {
                currentGate: nextGateType,
              },
            },
          },
        });

        return { success: true, nextGate: nextGateType };
      } else {
        // No next gate - update to the approved gate
        await tx.project.update({
          where: { id: projectId },
          data: {
            state: {
              update: {
                currentGate: gateType,
              },
            },
          },
        });
      }

      // Mark project as complete if this was G9_COMPLETE
      if (gateType === 'G9_COMPLETE') {
        await tx.project.update({
          where: { id: projectId },
          data: {
            state: {
              update: {
                currentGate: 'PROJECT_COMPLETE',
              },
            },
          },
        });
      }

      return { success: true };
    });
  }

  /**
   * Reject a gate with reason
   */
  async rejectGate(
    projectId: string,
    gateType: string,
    userId: string,
    blockingReason: string,
  ): Promise<void> {
    const canTransition = await this.canTransitionGate(projectId, gateType, userId);
    if (!canTransition.canTransition) {
      throw new ForbiddenException(canTransition.reason);
    }

    const gate = await this.prisma.gate.findFirst({
      where: { projectId, gateType },
    });

    if (!gate) {
      throw new BadRequestException(`Gate ${gateType} not found`);
    }

    await this.prisma.gate.update({
      where: { id: gate.id },
      data: {
        status: 'REJECTED',
        blockingReason,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get next gate type in progression
   */
  private getNextGateType(currentGateType: string): string | null {
    const currentIndex = GATE_PROGRESSION.indexOf(currentGateType);
    if (currentIndex === -1 || currentIndex === GATE_PROGRESSION.length - 1) {
      return null;
    }
    return GATE_PROGRESSION[currentIndex + 1];
  }

  /**
   * Create next gate in progression with deliverables
   * @param projectId - The project ID
   * @param gateType - The gate type to create
   * @param tx - Optional transaction client for atomic operations
   */
  private async createNextGate(
    projectId: string,
    gateType: string,
    tx?: TransactionClient,
  ): Promise<void> {
    const db = tx || this.prisma;

    // Get project type for project-specific configuration
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { type: true },
    });

    const projectType = project?.type || 'traditional';

    // Get gate configuration from centralized config
    const config = getGateConfig(projectType, gateType);

    // _COMPLETE gates are auto-approved markers (they follow _PENDING approval)
    // _PENDING gates start in PENDING status requiring user action
    const isCompleteGate = gateType.endsWith('_COMPLETE');
    const initialStatus = isCompleteGate ? 'APPROVED' : 'PENDING';

    // Create the gate
    await db.gate.create({
      data: {
        projectId,
        gateType,
        status: initialStatus,
        description: config?.description || `Gate ${gateType}`,
        passingCriteria: config?.passingCriteria || 'Complete gate requirements',
        requiresProof: config?.requiresProof ?? false,
        ...(isCompleteGate && { approvedAt: new Date() }),
      },
    });

    // Create deliverables for this gate
    const deliverables = getDeliverablesForGate(projectType, gateType);
    if (deliverables.length > 0) {
      await db.deliverable.createMany({
        data: deliverables.map((d) => ({
          projectId,
          name: d.name,
          path: d.path,
          owner: d.owner,
          status: 'not_started',
        })),
      });

      console.log(
        `[GateStateMachine] Created ${deliverables.length} deliverables for gate ${gateType}:`,
        deliverables.map((d) => d.name).join(', '),
      );
    }
  }

  /**
   * Lock documents when gate is approved (for future implementation)
   * @param _projectId - The project ID
   * @param _gateType - The gate type
   * @param _tx - Optional transaction client for atomic operations
   */
  private async lockDocumentsForGate(
    _projectId: string,
    _gateType: string,
    _tx?: TransactionClient,
  ): Promise<void> {
    // TODO: Add document locking when schema supports it
    // Documents and specifications will be locked after gate approval
    // to prevent modifications without re-approval
    // When implemented, use: const db = _tx || this.prisma;
  }

  /**
   * Ensure a gate exists, creating it if necessary
   * This handles race conditions and recovery from failed operations
   */
  async ensureGateExists(projectId: string, gateType: string): Promise<void> {
    const existingGate = await this.prisma.gate.findFirst({
      where: { projectId, gateType },
    });

    if (!existingGate) {
      console.log(`[GateStateMachine] Creating missing gate: ${gateType}`);
      await this.createNextGate(projectId, gateType);
    }
  }

  /**
   * Get all gates for a project with status
   */
  async getProjectGates(projectId: string): Promise<any[]> {
    return this.prisma.gate.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: {
        approvedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        proofArtifacts: {
          select: {
            id: true,
            proofType: true,
            filePath: true,
            createdAt: true,
          },
        },
      },
    });
  }
}
