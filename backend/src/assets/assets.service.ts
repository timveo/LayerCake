import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AssetType, AssetSource, ProjectAsset } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

// Temporary asset metadata stored in memory (for session-based uploads)
interface TempAssetMeta {
  tempKey: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  assetType?: AssetType;
  description?: string;
  userId: string;
  uploadedAt: Date;
  // GitHub source metadata
  githubOwner?: string;
  githubRepo?: string;
  githubPath?: string;
  githubSha?: string;
}

// In-memory store for temp uploads (should use Redis in production)
const tempAssetStore = new Map<string, TempAssetMeta>();

const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/svg+xml',
  'image/webp',
];

const ALLOWED_CODE_TYPES = [
  'text/plain',
  'text/javascript',
  'text/typescript',
  'application/json',
  'text/markdown',
  'text/html',
  'text/css',
  'text/yaml',
  'application/x-yaml',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Upload a file to temporary storage (before project creation)
   */
  async uploadTemporary(
    file: Express.Multer.File,
    sessionId: string,
    userId: string,
    assetType?: AssetType,
    description?: string,
  ): Promise<{ tempKey: string; signedUrl: string; filename: string; size: number }> {
    // Validate file
    this.validateFile(file);

    // Generate unique filename
    const ext = file.originalname.split('.').pop() || '';
    const uniqueFilename = `${Date.now()}_${uuidv4().slice(0, 8)}.${ext}`;
    const tempKey = `temp-uploads/${sessionId}/${uniqueFilename}`;

    // Upload to storage
    const signedUrl = await this.storage.upload(tempKey, file.buffer, {
      contentType: file.mimetype,
      metadata: {
        originalName: file.originalname,
        sessionId,
        userId,
        uploadedAt: new Date().toISOString(),
      },
    });

    // Store metadata in memory
    tempAssetStore.set(tempKey, {
      tempKey,
      originalName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      assetType: assetType || this.inferAssetType(file.mimetype, file.originalname),
      description,
      userId,
      uploadedAt: new Date(),
    });

    this.logger.log(`Uploaded temp asset: ${tempKey} for session ${sessionId}`);

    return {
      tempKey,
      signedUrl,
      filename: file.originalname,
      size: file.size,
    };
  }

  /**
   * Upload a file directly to a project
   */
  async uploadToProject(
    file: Express.Multer.File,
    projectId: string,
    userId: string,
    assetType: AssetType,
    description?: string,
  ): Promise<ProjectAsset> {
    // Validate file
    this.validateFile(file);

    // Verify project access
    await this.verifyProjectAccess(projectId, userId);

    // Generate storage path
    const ext = file.originalname.split('.').pop() || '';
    const uniqueFilename = `${Date.now()}_${uuidv4().slice(0, 8)}.${ext}`;
    const storagePath = `assets/${projectId}/${assetType.toLowerCase()}`;
    const storageKey = `${storagePath}/${uniqueFilename}`;

    // Upload to storage
    await this.storage.upload(storageKey, file.buffer, {
      contentType: file.mimetype,
      metadata: {
        projectId,
        assetType,
        originalName: file.originalname,
        uploadedBy: userId,
      },
    });

    // Create database record
    const asset = await this.prisma.projectAsset.create({
      data: {
        projectId,
        assetType,
        sourceType: AssetSource.LOCAL_UPLOAD,
        filename: uniqueFilename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        storagePath,
        storageKey,
        description,
        uploadedById: userId,
      },
    });

    this.logger.log(`Created project asset: ${asset.id} for project ${projectId}`);

    return asset;
  }

  /**
   * Associate temporary uploads with a newly created project
   */
  async associateTempUploads(
    tempKeys: string[],
    projectId: string,
    userId: string,
    overrideAssetType?: AssetType,
  ): Promise<ProjectAsset[]> {
    // Verify project access
    await this.verifyProjectAccess(projectId, userId);

    const assets: ProjectAsset[] = [];

    for (const tempKey of tempKeys) {
      const meta = tempAssetStore.get(tempKey);
      if (!meta) {
        this.logger.warn(`Temp asset not found: ${tempKey}`);
        continue;
      }

      // Verify ownership
      if (meta.userId !== userId) {
        this.logger.warn(`User ${userId} does not own temp asset ${tempKey}`);
        continue;
      }

      // Determine asset type
      const assetType = overrideAssetType || meta.assetType || AssetType.OTHER;

      // Generate new storage path
      const ext = meta.originalName.split('.').pop() || '';
      const uniqueFilename = `${Date.now()}_${uuidv4().slice(0, 8)}.${ext}`;
      const storagePath = `assets/${projectId}/${assetType.toLowerCase()}`;
      const newStorageKey = `${storagePath}/${uniqueFilename}`;

      try {
        // Move file from temp to permanent storage
        await this.storage.moveObject(tempKey, newStorageKey);

        // Determine source type based on GitHub metadata
        const sourceType = meta.githubOwner ? AssetSource.GITHUB : AssetSource.LOCAL_UPLOAD;

        // Create database record
        const asset = await this.prisma.projectAsset.create({
          data: {
            projectId,
            assetType,
            sourceType,
            filename: uniqueFilename,
            originalName: meta.originalName,
            mimeType: meta.mimeType,
            fileSize: meta.fileSize,
            storagePath,
            storageKey: newStorageKey,
            description: meta.description,
            githubOwner: meta.githubOwner,
            githubRepo: meta.githubRepo,
            githubPath: meta.githubPath,
            githubSha: meta.githubSha,
            uploadedById: userId,
          },
        });

        assets.push(asset);

        // Remove from temp store
        tempAssetStore.delete(tempKey);

        this.logger.log(`Associated temp asset ${tempKey} with project ${projectId}`);
      } catch (error) {
        this.logger.error(`Failed to associate temp asset ${tempKey}: ${error.message}`);
      }
    }

    return assets;
  }

  /**
   * Store metadata for a GitHub import (before file download)
   */
  storeTempGitHubMeta(
    sessionId: string,
    userId: string,
    githubOwner: string,
    githubRepo: string,
    githubPath: string,
    githubSha: string,
    fileSize: number,
    mimeType: string,
    assetType?: AssetType,
  ): string {
    const ext = githubPath.split('.').pop() || '';
    const uniqueFilename = `${Date.now()}_${uuidv4().slice(0, 8)}.${ext}`;
    const tempKey = `temp-uploads/${sessionId}/${uniqueFilename}`;

    tempAssetStore.set(tempKey, {
      tempKey,
      originalName: githubPath.split('/').pop() || githubPath,
      mimeType,
      fileSize,
      assetType: assetType || this.inferAssetType(mimeType, githubPath),
      userId,
      uploadedAt: new Date(),
      githubOwner,
      githubRepo,
      githubPath,
      githubSha,
    });

    return tempKey;
  }

  /**
   * Get project assets with signed URLs
   */
  async getProjectAssets(
    projectId: string,
    userId: string,
  ): Promise<(ProjectAsset & { signedUrl: string })[]> {
    // Verify project access
    await this.verifyProjectAccess(projectId, userId);

    const assets = await this.prisma.projectAsset.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    // Generate signed URLs for each asset
    const assetsWithUrls = await Promise.all(
      assets.map(async (asset) => ({
        ...asset,
        signedUrl: await this.storage.getSignedUrl(asset.storageKey, 3600),
      })),
    );

    return assetsWithUrls;
  }

  /**
   * Get a single asset with signed URL
   */
  async getAsset(assetId: string, userId: string): Promise<ProjectAsset & { signedUrl: string }> {
    const asset = await this.prisma.projectAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Verify project access
    await this.verifyProjectAccess(asset.projectId, userId);

    return {
      ...asset,
      signedUrl: await this.storage.getSignedUrl(asset.storageKey, 3600),
    };
  }

  /**
   * Delete an asset
   */
  async deleteAsset(assetId: string, userId: string): Promise<void> {
    const asset = await this.prisma.projectAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    // Verify project access
    await this.verifyProjectAccess(asset.projectId, userId);

    // Delete from storage
    await this.storage.delete(asset.storageKey);

    // Delete database record
    await this.prisma.projectAsset.delete({
      where: { id: assetId },
    });

    this.logger.log(`Deleted asset: ${assetId}`);
  }

  /**
   * Delete a temporary upload
   */
  async deleteTempUpload(tempKey: string, userId: string): Promise<void> {
    const meta = tempAssetStore.get(tempKey);

    if (!meta) {
      throw new NotFoundException('Temporary upload not found');
    }

    if (meta.userId !== userId) {
      throw new ForbiddenException('Not authorized to delete this upload');
    }

    // Delete from storage
    await this.storage.delete(tempKey);

    // Remove from temp store
    tempAssetStore.delete(tempKey);

    this.logger.log(`Deleted temp upload: ${tempKey}`);
  }

  /**
   * Get temp upload metadata
   */
  getTempUploadMeta(tempKey: string): TempAssetMeta | undefined {
    return tempAssetStore.get(tempKey);
  }

  // Private helper methods

  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
    const isCode = ALLOWED_CODE_TYPES.includes(file.mimetype);

    if (!isImage && !isCode) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed. Allowed types: images (png, jpg, gif, svg, webp) and code files.`,
      );
    }
  }

  private inferAssetType(mimeType: string, filename: string): AssetType {
    if (ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      // Try to infer more specific type from filename
      const lower = filename.toLowerCase();
      if (lower.includes('mockup') || lower.includes('design') || lower.includes('wireframe')) {
        return AssetType.DESIGN_MOCKUP;
      }
      if (lower.includes('screenshot') || lower.includes('screen')) {
        return AssetType.SCREENSHOT;
      }
      if (lower.includes('logo') || lower.includes('brand')) {
        return AssetType.LOGO;
      }
      return AssetType.DESIGN_MOCKUP; // Default for images
    }

    if (ALLOWED_CODE_TYPES.includes(mimeType)) {
      const ext = filename.split('.').pop()?.toLowerCase();
      if (['json', 'yaml', 'yml', 'env', 'config'].includes(ext || '')) {
        return AssetType.CONFIG_FILE;
      }
      return AssetType.CODE_FILE;
    }

    return AssetType.OTHER;
  }

  private async verifyProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to access this project');
    }
  }
}
