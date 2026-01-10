import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  public?: boolean;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  etag: string;
}

/**
 * StorageService - Cloudflare R2 / S3-compatible Storage
 *
 * Handles file uploads, downloads, and management for:
 * - Proof artifacts (build outputs, test reports)
 * - Generated code files
 * - Documents and specifications
 * - User uploads
 *
 * Uses Cloudflare R2 (S3-compatible) for zero egress fees.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    this.bucket = this.config.get<string>('R2_BUCKET', 'layercake-artifacts');
    this.publicUrl = this.config.get<string>('R2_PUBLIC_URL', '');

    // Cloudflare R2 endpoint format: https://<account-id>.r2.cloudflarestorage.com
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.logger.log(`Storage service initialized (bucket: ${this.bucket})`);
  }

  /**
   * Upload file to storage
   */
  async upload(
    key: string,
    data: Buffer | Readable | string,
    options: UploadOptions = {},
  ): Promise<string> {
    try {
      const body = typeof data === 'string' ? Buffer.from(data) : data;

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: options.contentType || 'application/octet-stream',
          Metadata: options.metadata,
        }),
      );

      this.logger.log(`Uploaded: ${key}`);

      // Return public URL if configured and public
      if (this.publicUrl && options.public) {
        return `${this.publicUrl}/${key}`;
      }

      // Otherwise return signed URL (valid for 1 hour)
      return this.getSignedUrl(key, 3600);
    } catch (error) {
      this.logger.error(`Failed to upload ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download file from storage
   */
  async download(key: string): Promise<Buffer> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(`Failed to download ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete file from storage
   */
  async delete(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      this.logger.log(`Deleted: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }

      throw error;
    }
  }

  /**
   * List files with prefix
   */
  async list(prefix: string, maxKeys = 1000): Promise<StorageObject[]> {
    try {
      const response = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          MaxKeys: maxKeys,
        }),
      );

      return (
        response.Contents?.map((obj) => ({
          key: obj.Key,
          size: obj.Size,
          lastModified: obj.LastModified,
          etag: obj.ETag,
        })) || []
      );
    } catch (error) {
      this.logger.error(`Failed to list files with prefix ${prefix}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get signed URL for temporary access
   */
  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      this.logger.error(`Failed to generate signed URL for ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload proof artifact
   */
  async uploadArtifact(
    projectId: string,
    artifactType: string,
    filename: string,
    data: Buffer | string,
    contentType?: string,
  ): Promise<string> {
    const key = `artifacts/${projectId}/${artifactType}/${filename}`;

    return this.upload(key, data, {
      contentType,
      metadata: {
        projectId,
        artifactType,
        uploadedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Upload generated code file
   */
  async uploadGeneratedCode(
    projectId: string,
    filePath: string,
    code: string,
  ): Promise<string> {
    const key = `generated/${projectId}/${filePath}`;

    return this.upload(key, code, {
      contentType: this.getContentTypeForFile(filePath),
      metadata: {
        projectId,
        generatedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Delete all files for a project
   */
  async deleteProject(projectId: string): Promise<number> {
    const files = await this.list(`artifacts/${projectId}/`);
    const generatedFiles = await this.list(`generated/${projectId}/`);

    const allFiles = [...files, ...generatedFiles];

    await Promise.all(allFiles.map((file) => this.delete(file.key)));

    this.logger.log(`Deleted ${allFiles.length} files for project ${projectId}`);

    return allFiles.length;
  }

  /**
   * Get content type based on file extension
   */
  private getContentTypeForFile(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();

    const contentTypes: Record<string, string> = {
      js: 'text/javascript',
      ts: 'text/typescript',
      tsx: 'text/typescript',
      jsx: 'text/javascript',
      json: 'application/json',
      html: 'text/html',
      css: 'text/css',
      md: 'text/markdown',
      txt: 'text/plain',
      yaml: 'text/yaml',
      yml: 'text/yaml',
      xml: 'application/xml',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
    };

    return contentTypes[ext] || 'application/octet-stream';
  }
}
