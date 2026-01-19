import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DocumentGitService } from './services/document-git.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/user.types';
import { PrismaService } from '../common/prisma/prisma.service';

@ApiTags('document-git')
@Controller('documents/git')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DocumentGitController {
  constructor(
    private readonly documentGit: DocumentGitService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Verify project ownership
   */
  private async verifyProjectAccess(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== userId) {
      throw new ForbiddenException('Access denied to this project');
    }
  }

  @Get(':projectId/status')
  @ApiOperation({ summary: 'Get git status for project documents' })
  @ApiResponse({ status: 200, description: 'Git status retrieved successfully' })
  async getStatus(@Param('projectId') projectId: string, @CurrentUser() user: RequestUser) {
    await this.verifyProjectAccess(projectId, user.id);
    return this.documentGit.getStatus(projectId);
  }

  @Get(':projectId/history')
  @ApiOperation({ summary: 'Get commit history for all documents' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  async getHistory(
    @Param('projectId') projectId: string,
    @Query('limit') limit: number,
    @CurrentUser() user: RequestUser,
  ) {
    await this.verifyProjectAccess(projectId, user.id);
    return this.documentGit.getAllDocumentHistory(projectId, limit || 50);
  }

  @Get(':projectId/history/:filePath')
  @ApiOperation({ summary: 'Get commit history for a specific document' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Document history retrieved successfully' })
  async getDocumentHistory(
    @Param('projectId') projectId: string,
    @Param('filePath') filePath: string,
    @Query('limit') limit: number,
    @CurrentUser() user: RequestUser,
  ) {
    await this.verifyProjectAccess(projectId, user.id);
    return this.documentGit.getDocumentHistory(
      projectId,
      decodeURIComponent(filePath),
      limit || 20,
    );
  }

  @Get(':projectId/version/:commitHash/:filePath')
  @ApiOperation({ summary: 'Get document content at a specific commit' })
  @ApiResponse({ status: 200, description: 'Document version retrieved successfully' })
  async getDocumentAtCommit(
    @Param('projectId') projectId: string,
    @Param('commitHash') commitHash: string,
    @Param('filePath') filePath: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.verifyProjectAccess(projectId, user.id);
    const result = await this.documentGit.getDocumentAtCommit(
      projectId,
      decodeURIComponent(filePath),
      commitHash,
    );

    if (!result) {
      throw new NotFoundException('Document version not found');
    }

    return result;
  }

  @Get(':projectId/branches')
  @ApiOperation({ summary: 'Get list of branches' })
  @ApiResponse({ status: 200, description: 'Branches retrieved successfully' })
  async getBranches(@Param('projectId') projectId: string, @CurrentUser() user: RequestUser) {
    await this.verifyProjectAccess(projectId, user.id);
    return this.documentGit.getBranches(projectId);
  }

  @Get(':projectId/files')
  @ApiOperation({ summary: 'List all document files in the repository' })
  @ApiResponse({ status: 200, description: 'Files listed successfully' })
  async listFiles(@Param('projectId') projectId: string, @CurrentUser() user: RequestUser) {
    await this.verifyProjectAccess(projectId, user.id);
    return this.documentGit.listDocumentFiles(projectId);
  }

  @Post(':projectId/commit')
  @ApiOperation({ summary: 'Commit all pending document changes' })
  @ApiResponse({ status: 200, description: 'Changes committed successfully' })
  async commitAll(
    @Param('projectId') projectId: string,
    @Body() body: { message: string },
    @CurrentUser() user: RequestUser,
  ) {
    await this.verifyProjectAccess(projectId, user.id);

    const userData = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true },
    });

    return this.documentGit.commitAllDocuments(projectId, body.message, {
      name: userData?.name || 'FuzzyLlama User',
      email: userData?.email || 'user@fuzzyllama.dev',
    });
  }

  @Post(':projectId/commit/:documentId')
  @ApiOperation({ summary: 'Commit a specific document' })
  @ApiResponse({ status: 200, description: 'Document committed successfully' })
  async commitDocument(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() body: { message: string },
    @CurrentUser() user: RequestUser,
  ) {
    await this.verifyProjectAccess(projectId, user.id);

    // Get document
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || !document.filePath) {
      throw new NotFoundException('Document not found or not saved to filesystem');
    }

    const userData = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true },
    });

    return this.documentGit.commitDocument(projectId, document.filePath, body.message, {
      name: userData?.name || 'FuzzyLlama User',
      email: userData?.email || 'user@fuzzyllama.dev',
    });
  }

  @Post(':projectId/branch')
  @ApiOperation({ summary: 'Create a new branch' })
  @ApiResponse({ status: 200, description: 'Branch created successfully' })
  async createBranch(
    @Param('projectId') projectId: string,
    @Body() body: { branchName: string },
    @CurrentUser() user: RequestUser,
  ) {
    await this.verifyProjectAccess(projectId, user.id);
    const success = await this.documentGit.createBranch(projectId, body.branchName);
    return { success, branch: body.branchName };
  }

  @Post(':projectId/switch-branch')
  @ApiOperation({ summary: 'Switch to a different branch' })
  @ApiResponse({ status: 200, description: 'Branch switched successfully' })
  async switchBranch(
    @Param('projectId') projectId: string,
    @Body() body: { branchName: string },
    @CurrentUser() user: RequestUser,
  ) {
    await this.verifyProjectAccess(projectId, user.id);
    const success = await this.documentGit.switchBranch(projectId, body.branchName);
    return { success, branch: body.branchName };
  }

  @Post(':projectId/revert/:documentId')
  @ApiOperation({ summary: 'Revert a document to a previous commit' })
  @ApiResponse({ status: 200, description: 'Document reverted successfully' })
  async revertDocument(
    @Param('projectId') projectId: string,
    @Param('documentId') documentId: string,
    @Body() body: { commitHash: string },
    @CurrentUser() user: RequestUser,
  ) {
    await this.verifyProjectAccess(projectId, user.id);

    // Get document
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || !document.filePath) {
      throw new NotFoundException('Document not found or not saved to filesystem');
    }

    return this.documentGit.revertDocument(projectId, document.filePath, body.commitHash);
  }

  @Get(':projectId/diff')
  @ApiOperation({ summary: 'Compare document between two commits' })
  @ApiQuery({ name: 'filePath', required: true, type: String })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Diff retrieved successfully' })
  async diffDocument(
    @Param('projectId') projectId: string,
    @Query('filePath') filePath: string,
    @Query('from') fromCommit: string,
    @Query('to') toCommit: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.verifyProjectAccess(projectId, user.id);
    const diff = await this.documentGit.diffDocument(
      projectId,
      decodeURIComponent(filePath),
      fromCommit,
      toCommit,
    );

    return { diff };
  }

  @Post(':projectId/sync')
  @ApiOperation({ summary: 'Sync all database documents to filesystem' })
  @ApiResponse({ status: 200, description: 'Documents synced successfully' })
  async syncToFilesystem(@Param('projectId') projectId: string, @CurrentUser() user: RequestUser) {
    await this.verifyProjectAccess(projectId, user.id);
    const synced = await this.documentGit.syncDatabaseToFilesystem(projectId, user.id);
    return { success: true, documentsSynced: synced };
  }

  @Post(':projectId/init')
  @ApiOperation({ summary: 'Initialize git repository for project documents' })
  @ApiResponse({ status: 200, description: 'Repository initialized successfully' })
  async initRepository(@Param('projectId') projectId: string, @CurrentUser() user: RequestUser) {
    await this.verifyProjectAccess(projectId, user.id);
    const success = await this.documentGit.initializeRepository(projectId);
    return { success };
  }
}
