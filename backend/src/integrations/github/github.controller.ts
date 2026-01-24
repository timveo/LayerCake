import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { GitHubService } from './github.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/user.types';
import { AssetsService } from '../../assets/assets.service';
import { StorageService } from '../../storage/storage.service';
import { AuthService } from '../../auth/auth.service';

@ApiTags('github')
@Controller('github')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class GitHubController {
  constructor(
    private readonly githubService: GitHubService,
    private readonly assetsService: AssetsService,
    private readonly storageService: StorageService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Helper to get GitHub token - either from header or stored OAuth token
   */
  private async getGitHubToken(headerToken: string | undefined, userId: string): Promise<string> {
    if (headerToken) {
      return headerToken;
    }

    const storedToken = await this.authService.getGitHubToken(userId);
    if (!storedToken) {
      throw new BadRequestException(
        'GitHub token required. Either provide x-github-token header or connect GitHub via OAuth.',
      );
    }

    return storedToken;
  }

  @Get('user')
  @ApiOperation({ summary: 'Get authenticated GitHub user info' })
  @ApiHeader({
    name: 'x-github-token',
    description: 'GitHub personal access token',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'GitHub user info retrieved' })
  @ApiResponse({ status: 400, description: 'Invalid GitHub token' })
  async getUser(@Headers('x-github-token') githubToken: string) {
    if (!githubToken) {
      throw new BadRequestException('GitHub token is required in x-github-token header');
    }

    return this.githubService.getAuthenticatedUser(githubToken);
  }

  @Get('repositories')
  @ApiOperation({ summary: 'List user repositories' })
  @ApiHeader({
    name: 'x-github-token',
    description: 'GitHub personal access token (optional if OAuth connected)',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Repositories retrieved' })
  async listRepositories(
    @Headers('x-github-token') githubToken: string,
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
    @CurrentUser() user?: RequestUser,
  ) {
    const token = await this.getGitHubToken(githubToken, user?.id || '');
    return this.githubService.listUserRepositories(token, page || 1, perPage || 30);
  }

  @Post('projects/:id/export')
  @ApiOperation({ summary: 'Export project to GitHub' })
  @ApiHeader({
    name: 'x-github-token',
    description: 'GitHub personal access token',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Project exported to GitHub successfully',
  })
  @ApiResponse({ status: 400, description: 'Export failed' })
  async exportProject(
    @Param('id') projectId: string,
    @Headers('x-github-token') githubToken: string,
    @Body() body: { repoName?: string },
    @CurrentUser() user: RequestUser,
  ) {
    if (!githubToken) {
      throw new BadRequestException('GitHub token is required in x-github-token header');
    }

    return this.githubService.exportProjectToGitHub(projectId, user.id, githubToken, body.repoName);
  }

  @Post('projects/:id/push')
  @ApiOperation({ summary: 'Push updates to existing GitHub repository' })
  @ApiHeader({
    name: 'x-github-token',
    description: 'GitHub personal access token',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Updates pushed successfully' })
  @ApiResponse({ status: 400, description: 'Push failed' })
  async pushUpdates(
    @Param('id') projectId: string,
    @Headers('x-github-token') githubToken: string,
    @Body() body: { commitMessage?: string },
    @CurrentUser() user: RequestUser,
  ) {
    if (!githubToken) {
      throw new BadRequestException('GitHub token is required in x-github-token header');
    }

    return this.githubService.pushUpdatesToGitHub(
      projectId,
      user.id,
      githubToken,
      body.commitMessage,
    );
  }

  @Get('repositories/:owner/:repo')
  @ApiOperation({ summary: 'Get repository info' })
  @ApiHeader({
    name: 'x-github-token',
    description: 'GitHub personal access token',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Repository info retrieved' })
  async getRepositoryInfo(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Headers('x-github-token') githubToken: string,
  ) {
    if (!githubToken) {
      throw new BadRequestException('GitHub token is required in x-github-token header');
    }

    return this.githubService.getRepositoryInfo(githubToken, owner, repo);
  }

  @Post('projects/:id/readme')
  @ApiOperation({ summary: 'Generate and write README.md for project' })
  @ApiResponse({ status: 200, description: 'README created successfully' })
  async createReadme(@Param('id') projectId: string, @CurrentUser() _user: RequestUser) {
    const readme = await this.githubService.createReadme(projectId);

    return {
      success: true,
      content: readme,
      message: 'README.md created',
    };
  }

  // ==================== File Browsing Endpoints ====================

  @Get('repos/:owner/:repo/contents')
  @ApiOperation({ summary: 'Get repository contents (files and directories)' })
  @ApiHeader({
    name: 'x-github-token',
    description: 'GitHub personal access token (optional if OAuth connected)',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Repository contents retrieved' })
  async getRepoContents(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Query('path') path: string = '',
    @Headers('x-github-token') githubToken: string,
    @CurrentUser() user: RequestUser,
  ) {
    const token = await this.getGitHubToken(githubToken, user.id);
    return this.githubService.getRepositoryContents(token, owner, repo, path);
  }

  @Get('repos/:owner/:repo/file/*')
  @ApiOperation({ summary: 'Get file content from repository' })
  @ApiHeader({
    name: 'x-github-token',
    description: 'GitHub personal access token (optional if OAuth connected)',
    required: false,
  })
  @ApiResponse({ status: 200, description: 'File content retrieved' })
  async getFileContent(
    @Param('owner') owner: string,
    @Param('repo') repo: string,
    @Param('*') filePath: string,
    @Headers('x-github-token') githubToken: string,
    @CurrentUser() user: RequestUser,
  ) {
    const token = await this.getGitHubToken(githubToken, user.id);
    return this.githubService.getFileContent(token, owner, repo, filePath);
  }

  @Post('parse-url')
  @ApiOperation({ summary: 'Parse GitHub URL to extract owner and repo' })
  @ApiResponse({ status: 200, description: 'URL parsed successfully' })
  parseGitHubUrl(@Body() body: { url: string }) {
    const result = this.githubService.parseGitHubUrl(body.url);

    if (!result) {
      throw new BadRequestException('Invalid GitHub URL format');
    }

    return result;
  }

  @Post('import-temp')
  @ApiOperation({ summary: 'Import file(s) from GitHub to temporary storage' })
  @ApiHeader({
    name: 'x-github-token',
    description: 'GitHub personal access token (optional if OAuth connected)',
    required: false,
  })
  @ApiResponse({ status: 201, description: 'Files imported to temp storage' })
  async importFilesToTemp(
    @Body()
    body: {
      owner: string;
      repo: string;
      filePaths: string[];
      sessionId: string;
    },
    @Headers('x-github-token') headerToken: string,
    @CurrentUser() user: RequestUser,
  ) {
    const githubToken = await this.getGitHubToken(headerToken, user.id);

    const results: {
      tempKey: string;
      filename: string;
      size: number;
      signedUrl: string;
      githubPath: string;
    }[] = [];

    for (const filePath of body.filePaths) {
      try {
        // Get file content from GitHub
        const fileContent = await this.githubService.getFileContent(
          githubToken,
          body.owner,
          body.repo,
          filePath,
        );

        // Decode content (GitHub returns base64)
        const buffer = Buffer.from(fileContent.content, 'base64');

        // Determine MIME type
        const mimeType = this.getMimeTypeFromPath(filePath);

        // Store metadata for GitHub import
        const tempKey = this.assetsService.storeTempGitHubMeta(
          body.sessionId,
          user.id,
          body.owner,
          body.repo,
          filePath,
          fileContent.sha,
          buffer.length,
          mimeType,
        );

        // Upload to storage
        const signedUrl = await this.storageService.upload(tempKey, buffer, {
          contentType: mimeType,
          metadata: {
            originalName: fileContent.name,
            sessionId: body.sessionId,
            userId: user.id,
            githubOwner: body.owner,
            githubRepo: body.repo,
            githubPath: filePath,
            githubSha: fileContent.sha,
          },
        });

        results.push({
          tempKey,
          filename: fileContent.name,
          size: buffer.length,
          signedUrl,
          githubPath: filePath,
        });
      } catch (error) {
        // Log error but continue with other files
        console.error(`Failed to import ${filePath}: ${error.message}`);
      }
    }

    return results;
  }

  private getMimeTypeFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp',
      js: 'text/javascript',
      ts: 'text/typescript',
      tsx: 'text/typescript',
      jsx: 'text/javascript',
      json: 'application/json',
      md: 'text/markdown',
      html: 'text/html',
      css: 'text/css',
      yaml: 'text/yaml',
      yml: 'text/yaml',
      txt: 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
