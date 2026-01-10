import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateProofArtifactDto } from './dto/create-proof-artifact.dto';
import { ValidationService } from './validators/validation.service';

@Injectable()
export class ProofArtifactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: ValidationService,
  ) {}

  /**
   * Create and optionally validate a proof artifact
   */
  async create(
    createDto: CreateProofArtifactDto,
    userId: string,
  ): Promise<any> {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: createDto.projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException(
        'You can only create proof artifacts for your own projects',
      );
    }

    // Calculate file hash
    const fileHash = await this.validationService.calculateFileHash(
      createDto.filePath,
    );

    // Run validation if requested
    let passFail: 'pass' | 'fail' | 'warning' | 'info' = 'info';
    let contentSummary = createDto.contentSummary;

    if (createDto.autoValidate) {
      const validation = await this.validationService.validateArtifact(
        createDto.proofType,
        createDto.filePath,
      );

      passFail = validation.passed ? 'pass' : 'fail';
      contentSummary = validation.summary;

      // If validation failed, store errors in summary
      if (validation.errors) {
        contentSummary += '\n\nErrors:\n' + validation.errors.join('\n');
      }
    }

    // Create proof artifact
    const artifact = await this.prisma.proofArtifact.create({
      data: {
        projectId: createDto.projectId,
        gate: createDto.gate,
        proofType: createDto.proofType as any,
        filePath: createDto.filePath,
        fileHash,
        contentSummary,
        passFail,
        createdBy: userId,
        gateId: createDto.gateId,
      },
      include: {
        project: true,
        gateRelation: true,
      },
    });

    return artifact;
  }

  /**
   * Validate an existing proof artifact
   */
  async validate(artifactId: string, userId: string): Promise<any> {
    const artifact = await this.prisma.proofArtifact.findUnique({
      where: { id: artifactId },
      include: { project: true },
    });

    if (!artifact) {
      throw new NotFoundException('Proof artifact not found');
    }

    if (artifact.project.ownerId !== userId) {
      throw new ForbiddenException(
        'You can only validate proof artifacts for your own projects',
      );
    }

    // Run validation
    const validation = await this.validationService.validateArtifact(
      artifact.proofType,
      artifact.filePath,
    );

    // Update artifact with validation results
    const updated = await this.prisma.proofArtifact.update({
      where: { id: artifactId },
      data: {
        passFail: validation.passed ? 'pass' : 'fail',
        contentSummary: validation.summary,
        verified: true,
        verifiedAt: new Date(),
        verifiedBy: userId,
      },
      include: {
        project: true,
        gateRelation: true,
      },
    });

    return {
      artifact: updated,
      validation,
    };
  }

  /**
   * Get all proof artifacts for a project
   */
  async findAll(projectId: string, userId: string, gate?: string): Promise<any[]> {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException(
        'You can only view proof artifacts for your own projects',
      );
    }

    const where: any = { projectId };
    if (gate) {
      where.gate = gate;
    }

    return await this.prisma.proofArtifact.findMany({
      where,
      include: {
        project: true,
        gateRelation: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get a single proof artifact by ID
   */
  async findOne(id: string, userId: string): Promise<any> {
    const artifact = await this.prisma.proofArtifact.findUnique({
      where: { id },
      include: {
        project: true,
        gateRelation: true,
      },
    });

    if (!artifact) {
      throw new NotFoundException('Proof artifact not found');
    }

    if (artifact.project.ownerId !== userId) {
      throw new ForbiddenException(
        'You can only view proof artifacts for your own projects',
      );
    }

    return artifact;
  }

  /**
   * Delete a proof artifact
   */
  async delete(id: string, userId: string): Promise<{ message: string }> {
    const artifact = await this.prisma.proofArtifact.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!artifact) {
      throw new NotFoundException('Proof artifact not found');
    }

    if (artifact.project.ownerId !== userId) {
      throw new ForbiddenException(
        'You can only delete proof artifacts for your own projects',
      );
    }

    await this.prisma.proofArtifact.delete({
      where: { id },
    });

    return { message: 'Proof artifact deleted successfully' };
  }

  /**
   * Get proof artifacts for a specific gate
   */
  async getArtifactsForGate(gateId: string, userId: string): Promise<any[]> {
    const gate = await this.prisma.gate.findUnique({
      where: { id: gateId },
      include: { project: true },
    });

    if (!gate) {
      throw new NotFoundException('Gate not found');
    }

    if (gate.project.ownerId !== userId) {
      throw new ForbiddenException(
        'You can only view proof artifacts for your own projects',
      );
    }

    return await this.prisma.proofArtifact.findMany({
      where: { gateId },
      include: {
        project: true,
        gateRelation: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Validate all artifacts for a gate
   */
  async validateGateArtifacts(
    gateId: string,
    userId: string,
  ): Promise<{
    gateId: string;
    totalArtifacts: number;
    passed: number;
    failed: number;
    warnings: number;
    allPassed: boolean;
    results: any[];
  }> {
    const artifacts = await this.getArtifactsForGate(gateId, userId);

    const results = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    for (const artifact of artifacts) {
      const validation = await this.validationService.validateArtifact(
        artifact.proofType,
        artifact.filePath,
      );

      // Update artifact
      await this.prisma.proofArtifact.update({
        where: { id: artifact.id },
        data: {
          passFail: validation.passed ? 'pass' : 'fail',
          contentSummary: validation.summary,
          verified: true,
          verifiedAt: new Date(),
          verifiedBy: userId,
        },
      });

      if (validation.passed) {
        passed++;
      } else {
        failed++;
      }

      results.push({
        artifactId: artifact.id,
        proofType: artifact.proofType,
        validation,
      });
    }

    return {
      gateId,
      totalArtifacts: artifacts.length,
      passed,
      failed,
      warnings,
      allPassed: failed === 0 && artifacts.length > 0,
      results,
    };
  }
}
