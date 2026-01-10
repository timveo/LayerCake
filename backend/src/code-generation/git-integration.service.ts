import { Injectable } from '@nestjs/common';
import { FileSystemService } from './filesystem.service';
import * as path from 'path';

export interface GitInitResult {
  success: boolean;
  branch: string;
  error?: string;
}

export interface GitCommitResult {
  success: boolean;
  commitHash: string;
  filesCommitted: number;
  error?: string;
}

export interface GitPushResult {
  success: boolean;
  remoteUrl: string;
  error?: string;
}

@Injectable()
export class GitIntegrationService {
  constructor(private filesystem: FileSystemService) {}

  /**
   * Initialize a new Git repository in the project workspace
   */
  async initRepository(projectId: string, defaultBranch = 'main'): Promise<GitInitResult> {
    try {
      const projectPath = this.filesystem.getProjectPath(projectId);

      // Check if git repo already exists
      const gitCheckResult = await this.filesystem.executeCommand(
        projectId,
        'git rev-parse --git-dir',
        { timeout: 5000 },
      );

      if (gitCheckResult.success) {
        return {
          success: true,
          branch: defaultBranch,
          error: 'Git repository already initialized',
        };
      }

      // Initialize git repository
      await this.filesystem.executeCommand(projectId, 'git init');

      // Set default branch name
      await this.filesystem.executeCommand(
        projectId,
        `git branch -M ${defaultBranch}`,
      );

      // Configure user (required for commits)
      await this.filesystem.executeCommand(
        projectId,
        'git config user.name "LayerCake Agent"',
      );

      await this.filesystem.executeCommand(
        projectId,
        'git config user.email "agent@layercake.dev"',
      );

      // Create .gitignore
      await this.createGitignore(projectId);

      console.log(`[Git] Initialized repository for project ${projectId}`);

      return {
        success: true,
        branch: defaultBranch,
      };
    } catch (error) {
      console.error('Git init error:', error);
      return {
        success: false,
        branch: '',
        error: error.message,
      };
    }
  }

  /**
   * Create initial commit with all generated files
   */
  async commitAll(
    projectId: string,
    message: string,
    author?: { name: string; email: string },
  ): Promise<GitCommitResult> {
    try {
      // Stage all files
      await this.filesystem.executeCommand(projectId, 'git add .');

      // Check if there are files to commit
      const statusResult = await this.filesystem.executeCommand(
        projectId,
        'git status --porcelain',
      );

      const stagedFiles = statusResult.stdout.split('\n').filter((line) => line.trim());

      if (stagedFiles.length === 0) {
        return {
          success: true,
          commitHash: '',
          filesCommitted: 0,
          error: 'No files to commit',
        };
      }

      // Configure author if provided
      if (author) {
        await this.filesystem.executeCommand(
          projectId,
          `git config user.name "${author.name}"`,
        );
        await this.filesystem.executeCommand(
          projectId,
          `git config user.email "${author.email}"`,
        );
      }

      // Create commit
      await this.filesystem.executeCommand(
        projectId,
        `git commit -m "${this.escapeCommitMessage(message)}"`,
      );

      // Get commit hash
      const hashResult = await this.filesystem.executeCommand(
        projectId,
        'git rev-parse HEAD',
      );

      const commitHash = hashResult.stdout.trim();

      console.log(
        `[Git] Created commit ${commitHash} with ${stagedFiles.length} files`,
      );

      return {
        success: true,
        commitHash,
        filesCommitted: stagedFiles.length,
      };
    } catch (error) {
      console.error('Git commit error:', error);
      return {
        success: false,
        commitHash: '',
        filesCommitted: 0,
        error: error.message,
      };
    }
  }

  /**
   * Add remote origin and push to GitHub/GitLab
   */
  async addRemoteAndPush(
    projectId: string,
    remoteUrl: string,
    branch = 'main',
  ): Promise<GitPushResult> {
    try {
      // Add remote if not exists
      const remoteCheckResult = await this.filesystem.executeCommand(
        projectId,
        'git remote get-url origin',
        { timeout: 5000 },
      );

      if (!remoteCheckResult.success) {
        await this.filesystem.executeCommand(
          projectId,
          `git remote add origin ${remoteUrl}`,
        );
      } else {
        // Update remote URL
        await this.filesystem.executeCommand(
          projectId,
          `git remote set-url origin ${remoteUrl}`,
        );
      }

      // Push to remote
      const pushResult = await this.filesystem.executeCommand(
        projectId,
        `git push -u origin ${branch}`,
        { timeout: 60000 }, // 1 minute timeout for push
      );

      if (!pushResult.success) {
        throw new Error(`Git push failed: ${pushResult.stderr}`);
      }

      console.log(`[Git] Pushed to remote: ${remoteUrl}`);

      return {
        success: true,
        remoteUrl,
      };
    } catch (error) {
      console.error('Git push error:', error);
      return {
        success: false,
        remoteUrl,
        error: error.message,
      };
    }
  }

  /**
   * Get current commit hash
   */
  async getCurrentCommit(projectId: string): Promise<string | null> {
    try {
      const result = await this.filesystem.executeCommand(
        projectId,
        'git rev-parse HEAD',
      );

      return result.success ? result.stdout.trim() : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get list of uncommitted files
   */
  async getUncommittedFiles(projectId: string): Promise<string[]> {
    try {
      const result = await this.filesystem.executeCommand(
        projectId,
        'git status --porcelain',
      );

      if (!result.success) {
        return [];
      }

      return result.stdout
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.substring(3).trim());
    } catch (error) {
      return [];
    }
  }

  /**
   * Create branch
   */
  async createBranch(projectId: string, branchName: string): Promise<boolean> {
    try {
      await this.filesystem.executeCommand(
        projectId,
        `git checkout -b ${branchName}`,
      );

      return true;
    } catch (error) {
      console.error('Branch creation error:', error);
      return false;
    }
  }

  /**
   * Switch branch
   */
  async switchBranch(projectId: string, branchName: string): Promise<boolean> {
    try {
      await this.filesystem.executeCommand(
        projectId,
        `git checkout ${branchName}`,
      );

      return true;
    } catch (error) {
      console.error('Branch switch error:', error);
      return false;
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(projectId: string): Promise<string | null> {
    try {
      const result = await this.filesystem.executeCommand(
        projectId,
        'git rev-parse --abbrev-ref HEAD',
      );

      return result.success ? result.stdout.trim() : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get commit history
   */
  async getCommitHistory(
    projectId: string,
    limit = 10,
  ): Promise<Array<{ hash: string; message: string; author: string; date: string }>> {
    try {
      const result = await this.filesystem.executeCommand(
        projectId,
        `git log --pretty=format:"%H|%s|%an|%ad" --date=iso -n ${limit}`,
      );

      if (!result.success) {
        return [];
      }

      return result.stdout
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const [hash, message, author, date] = line.split('|');
          return { hash, message, author, date };
        });
    } catch (error) {
      return [];
    }
  }

  /**
   * Create .gitignore file with standard patterns
   */
  private async createGitignore(projectId: string): Promise<void> {
    const gitignoreContent = `# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
.nyc_output

# Production
build/
dist/
out/

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
.pnpm-debug.log*

# Editor directories and files
.idea
.vscode
*.swp
*.swo
*~
.DS_Store

# Miscellaneous
.cache
.temp
*.pid
*.seed
*.pid.lock

# Prisma
prisma/migrations/*/migration.sql

# Build artifacts
*.tsbuildinfo
`;

    await this.filesystem.writeFile(projectId, '.gitignore', gitignoreContent);
  }

  /**
   * Escape commit message for shell execution
   */
  private escapeCommitMessage(message: string): string {
    return message
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
      .replace(/\n/g, ' ');
  }

  /**
   * Full workflow: Init → Add all → Commit → Push
   */
  async initializeAndCommit(
    projectId: string,
    initialCommitMessage = 'Initial commit - Generated by LayerCake',
  ): Promise<{
    init: GitInitResult;
    commit: GitCommitResult;
  }> {
    const initResult = await this.initRepository(projectId);

    if (!initResult.success && !initResult.error?.includes('already')) {
      return {
        init: initResult,
        commit: {
          success: false,
          commitHash: '',
          filesCommitted: 0,
          error: 'Init failed',
        },
      };
    }

    const commitResult = await this.commitAll(projectId, initialCommitMessage);

    return {
      init: initResult,
      commit: commitResult,
    };
  }
}
