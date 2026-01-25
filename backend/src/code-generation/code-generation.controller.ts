import { Controller, Post, Get, Body, Param, UseGuards, Delete, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileSystemService } from './filesystem.service';
import { CodeParserService } from './code-parser.service';
import { BuildExecutorService } from './build-executor.service';
import { PreviewServerService } from './preview-server.service';

@Controller('code-generation')
@UseGuards(JwtAuthGuard)
export class CodeGenerationController {
  constructor(
    private readonly filesystem: FileSystemService,
    private readonly codeParser: CodeParserService,
    private readonly buildExecutor: BuildExecutorService,
    private readonly previewServer: PreviewServerService,
  ) {}

  /**
   * POST /api/code-generation/workspace/:projectId
   * Create project workspace
   */
  @Post('workspace/:projectId')
  async createWorkspace(
    @Param('projectId') projectId: string,
    @Body() body: { projectType?: string },
  ) {
    const projectPath = await this.filesystem.createProjectWorkspace(projectId);

    if (body.projectType) {
      await this.filesystem.initializeProjectStructure(projectId, body.projectType as any);
    }

    return {
      projectId,
      projectPath,
      workspaceRoot: this.filesystem.getWorkspaceRoot(),
    };
  }

  /**
   * POST /api/code-generation/:projectId/files
   * Write code files to workspace
   */
  @Post(':projectId/files')
  async writeFiles(
    @Param('projectId') projectId: string,
    @Body()
    body: {
      files: Array<{ path: string; content: string }>;
    },
  ) {
    await this.filesystem.writeFiles(projectId, body.files);

    return {
      success: true,
      filesWritten: body.files.length,
      files: body.files.map((f) => f.path),
    };
  }

  /**
   * POST /api/code-generation/:projectId/parse
   * Parse agent output and extract code
   */
  @Post(':projectId/parse')
  async parseAgentOutput(
    @Param('projectId') projectId: string,
    @Body() body: { agentOutput: string; writeFiles?: boolean },
  ) {
    const result = this.codeParser.extractFiles(body.agentOutput);

    // Optionally write files immediately
    if (body.writeFiles && result.files.length > 0) {
      await this.filesystem.writeFiles(projectId, result.files);
    }

    return {
      filesExtracted: result.files.length,
      unparsedBlocks: result.unparsedBlocks.length,
      totalBlocks: result.totalBlocks,
      files: result.files.map((f) => ({
        path: f.path,
        size: f.content.length,
      })),
    };
  }

  /**
   * GET /api/code-generation/:projectId/tree
   * Get directory tree
   */
  @Get(':projectId/tree')
  async getDirectoryTree(@Param('projectId') projectId: string) {
    return this.filesystem.getDirectoryTree(projectId);
  }

  /**
   * GET /api/code-generation/:projectId/file/:filePath
   * Read a specific file from the workspace
   */
  @Get(':projectId/file/*')
  async readFile(@Param('projectId') projectId: string, @Param() params: Record<string, string>) {
    // Extract file path from wildcard - NestJS puts it in params['0']
    const filePath = params['0'] || '';
    const content = await this.filesystem.readFile(projectId, filePath);
    return { path: filePath, content };
  }

  /**
   * POST /api/code-generation/:projectId/install
   * Run npm install
   */
  @Post(':projectId/install')
  async installDependencies(@Param('projectId') projectId: string) {
    return this.buildExecutor.installDependencies(projectId);
  }

  /**
   * POST /api/code-generation/:projectId/build
   * Run build
   */
  @Post(':projectId/build')
  async runBuild(@Param('projectId') projectId: string) {
    return this.buildExecutor.runBuild(projectId);
  }

  /**
   * POST /api/code-generation/:projectId/test
   * Run tests
   */
  @Post(':projectId/test')
  async runTests(@Param('projectId') projectId: string) {
    return this.buildExecutor.runTests(projectId);
  }

  /**
   * POST /api/code-generation/:projectId/lint
   * Run linter
   */
  @Post(':projectId/lint')
  async runLint(@Param('projectId') projectId: string) {
    return this.buildExecutor.runLint(projectId);
  }

  /**
   * POST /api/code-generation/:projectId/security
   * Run security scan
   */
  @Post(':projectId/security')
  async runSecurityScan(@Param('projectId') projectId: string) {
    return this.buildExecutor.runSecurityScan(projectId);
  }

  /**
   * POST /api/code-generation/:projectId/validate
   * Run full validation pipeline
   */
  @Post(':projectId/validate')
  async runFullValidation(@Param('projectId') projectId: string) {
    return this.buildExecutor.runFullValidation(projectId);
  }

  /**
   * DELETE /api/code-generation/workspace/:projectId
   * Delete project workspace
   */
  @Delete('workspace/:projectId')
  async deleteWorkspace(@Param('projectId') projectId: string) {
    await this.filesystem.deleteProjectWorkspace(projectId);

    return {
      success: true,
      message: `Workspace for project ${projectId} deleted`,
    };
  }

  // ==================== Preview Server Endpoints ====================

  /**
   * POST /api/code-generation/:projectId/preview/start
   * Start a dev server for live preview
   * Also validates the preview and creates a proof artifact for G5 gate
   */
  @Post(':projectId/preview/start')
  async startPreviewServer(@Param('projectId') projectId: string, @Request() req: any) {
    const server = await this.previewServer.startServer(projectId);

    // If server started successfully, validate and create proof artifact
    let proofResult: { success: boolean; proofArtifactId?: string; error?: string } | undefined;
    if (server.status === 'running') {
      // Give the server a moment to fully initialize before validation
      await new Promise((resolve) => setTimeout(resolve, 2000));
      proofResult = await this.previewServer.validateAndCreateProof(projectId, req.user?.id);
    }

    return {
      projectId: server.projectId,
      port: server.port,
      url: server.url,
      status: server.status,
      startedAt: server.startedAt,
      proofArtifact: proofResult,
    };
  }

  /**
   * POST /api/code-generation/:projectId/preview/stop
   * Stop a dev server
   */
  @Post(':projectId/preview/stop')
  async stopPreviewServer(@Param('projectId') projectId: string) {
    await this.previewServer.stopServer(projectId);
    return {
      success: true,
      message: `Preview server for project ${projectId} stopped`,
    };
  }

  /**
   * GET /api/code-generation/:projectId/preview/status
   * Get preview server status
   */
  @Get(':projectId/preview/status')
  async getPreviewStatus(@Param('projectId') projectId: string) {
    const server = this.previewServer.getServerStatus(projectId);
    if (!server) {
      return {
        running: false,
        projectId,
      };
    }
    return {
      running: server.status === 'running',
      projectId: server.projectId,
      port: server.port,
      url: server.url,
      status: server.status,
      startedAt: server.startedAt,
      logs: server.logs.slice(-20), // Last 20 log lines
    };
  }

  /**
   * GET /api/code-generation/preview/all
   * Get all running preview servers
   */
  @Get('preview/all')
  async getAllPreviewServers() {
    return this.previewServer.getAllServers();
  }
}
