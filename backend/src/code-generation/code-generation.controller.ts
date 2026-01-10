import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileSystemService } from './filesystem.service';
import { CodeParserService } from './code-parser.service';
import { BuildExecutorService } from './build-executor.service';

@Controller('api/code-generation')
@UseGuards(JwtAuthGuard)
export class CodeGenerationController {
  constructor(
    private readonly filesystem: FileSystemService,
    private readonly codeParser: CodeParserService,
    private readonly buildExecutor: BuildExecutorService,
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
      await this.filesystem.initializeProjectStructure(
        projectId,
        body.projectType as any,
      );
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
}
