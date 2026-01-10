import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface FileToWrite {
  path: string; // Relative path from project root (e.g., "src/components/Button.tsx")
  content: string;
  encoding?: BufferEncoding;
}

export interface DirectoryStructure {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryStructure[];
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

/**
 * FileSystemService - Manage project workspaces and code files
 *
 * Purpose:
 * - Create project workspace directories
 * - Write generated code files to disk
 * - Read existing files for context
 * - Execute shell commands (npm, git, etc.)
 * - Manage file permissions and safety
 *
 * Security:
 * - All operations are scoped to workspace root
 * - Path traversal attacks prevented
 * - Commands executed in isolated workspaces
 */
@Injectable()
export class FileSystemService {
  private readonly logger = new Logger(FileSystemService.name);
  private readonly workspaceRoot: string;

  constructor(private readonly config: ConfigService) {
    // Workspace root where all project folders are created
    this.workspaceRoot =
      this.config.get<string>('WORKSPACE_ROOT') ||
      path.join(process.cwd(), '..', 'workspaces');

    // Ensure workspace root exists
    fs.ensureDirSync(this.workspaceRoot);
    this.logger.log(`Workspace root initialized at: ${this.workspaceRoot}`);
  }

  /**
   * Get the workspace root directory
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Get the full path for a project workspace
   */
  getProjectPath(projectId: string): string {
    return path.join(this.workspaceRoot, projectId);
  }

  /**
   * Create a new project workspace directory
   */
  async createProjectWorkspace(projectId: string): Promise<string> {
    const projectPath = this.getProjectPath(projectId);

    // Check if workspace already exists
    if (await fs.pathExists(projectPath)) {
      this.logger.warn(
        `Workspace already exists for project ${projectId}, using existing`,
      );
      return projectPath;
    }

    // Create workspace directory
    await fs.ensureDir(projectPath);
    this.logger.log(`Created workspace for project ${projectId} at ${projectPath}`);

    return projectPath;
  }

  /**
   * Initialize project with base structure
   */
  async initializeProjectStructure(
    projectId: string,
    projectType: 'react-vite' | 'nestjs' | 'nextjs' | 'express',
  ): Promise<void> {
    const projectPath = this.getProjectPath(projectId);

    // Create base directories
    const baseDirs = this.getBaseDirectories(projectType);
    for (const dir of baseDirs) {
      await fs.ensureDir(path.join(projectPath, dir));
    }

    // Create base files
    const baseFiles = this.getBaseFiles(projectType);
    for (const file of baseFiles) {
      await this.writeFile(projectId, file.path, file.content);
    }

    this.logger.log(
      `Initialized ${projectType} project structure for ${projectId}`,
    );
  }

  /**
   * Write a file to the project workspace
   */
  async writeFile(
    projectId: string,
    filePath: string,
    content: string,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<void> {
    const projectPath = this.getProjectPath(projectId);
    const fullPath = path.join(projectPath, filePath);

    // Security: Prevent path traversal
    if (!fullPath.startsWith(projectPath)) {
      throw new Error(`Invalid file path: ${filePath} (path traversal detected)`);
    }

    // Ensure parent directory exists
    await fs.ensureDir(path.dirname(fullPath));

    // Write file
    await fs.writeFile(fullPath, content, encoding);
    this.logger.debug(`Wrote file: ${filePath} (${content.length} bytes)`);
  }

  /**
   * Write multiple files at once
   */
  async writeFiles(projectId: string, files: FileToWrite[]): Promise<void> {
    for (const file of files) {
      await this.writeFile(
        projectId,
        file.path,
        file.content,
        file.encoding || 'utf-8',
      );
    }

    this.logger.log(`Wrote ${files.length} files for project ${projectId}`);
  }

  /**
   * Read a file from the project workspace
   */
  async readFile(
    projectId: string,
    filePath: string,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<string> {
    const projectPath = this.getProjectPath(projectId);
    const fullPath = path.join(projectPath, filePath);

    // Security: Prevent path traversal
    if (!fullPath.startsWith(projectPath)) {
      throw new Error(`Invalid file path: ${filePath} (path traversal detected)`);
    }

    // Check if file exists
    if (!(await fs.pathExists(fullPath))) {
      throw new Error(`File not found: ${filePath}`);
    }

    return fs.readFile(fullPath, encoding);
  }

  /**
   * Check if a file exists
   */
  async fileExists(projectId: string, filePath: string): Promise<boolean> {
    const projectPath = this.getProjectPath(projectId);
    const fullPath = path.join(projectPath, filePath);

    if (!fullPath.startsWith(projectPath)) {
      return false;
    }

    return fs.pathExists(fullPath);
  }

  /**
   * Delete a file
   */
  async deleteFile(projectId: string, filePath: string): Promise<void> {
    const projectPath = this.getProjectPath(projectId);
    const fullPath = path.join(projectPath, filePath);

    if (!fullPath.startsWith(projectPath)) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    await fs.remove(fullPath);
    this.logger.debug(`Deleted file: ${filePath}`);
  }

  /**
   * Get directory structure
   */
  async getDirectoryTree(
    projectId: string,
    relativePath: string = '',
  ): Promise<DirectoryStructure> {
    const projectPath = this.getProjectPath(projectId);
    const fullPath = path.join(projectPath, relativePath);

    if (!fullPath.startsWith(projectPath)) {
      throw new Error(`Invalid path: ${relativePath}`);
    }

    return this.buildDirectoryTree(fullPath, relativePath || '.');
  }

  /**
   * Execute a command in the project workspace
   */
  async executeCommand(
    projectId: string,
    command: string,
    options?: {
      timeout?: number; // milliseconds
      env?: Record<string, string>;
    },
  ): Promise<CommandResult> {
    const projectPath = this.getProjectPath(projectId);

    this.logger.log(`Executing command in ${projectId}: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: projectPath,
        timeout: options?.timeout || 120000, // Default 2 minutes
        env: { ...process.env, ...options?.env },
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      return {
        stdout,
        stderr,
        exitCode: 0,
        success: true,
      };
    } catch (error: any) {
      this.logger.error(`Command failed: ${error.message}`);

      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        success: false,
      };
    }
  }

  /**
   * Delete entire project workspace
   */
  async deleteProjectWorkspace(projectId: string): Promise<void> {
    const projectPath = this.getProjectPath(projectId);

    if (await fs.pathExists(projectPath)) {
      await fs.remove(projectPath);
      this.logger.log(`Deleted workspace for project ${projectId}`);
    }
  }

  /**
   * Get workspace size in bytes
   */
  async getWorkspaceSize(projectId: string): Promise<number> {
    const projectPath = this.getProjectPath(projectId);

    if (!(await fs.pathExists(projectPath))) {
      return 0;
    }

    return this.calculateDirectorySize(projectPath);
  }

  /**
   * Copy files from template
   */
  async copyTemplate(
    templateName: string,
    projectId: string,
  ): Promise<void> {
    const templatesPath = path.join(process.cwd(), 'templates', templateName);
    const projectPath = this.getProjectPath(projectId);

    if (!(await fs.pathExists(templatesPath))) {
      throw new Error(`Template not found: ${templateName}`);
    }

    await fs.copy(templatesPath, projectPath);
    this.logger.log(`Copied template ${templateName} to project ${projectId}`);
  }

  // ==================== Private Helper Methods ====================

  private getBaseDirectories(
    projectType: string,
  ): string[] {
    const common = ['docs', 'specs'];

    switch (projectType) {
      case 'react-vite':
        return [...common, 'src', 'src/components', 'src/pages', 'src/services', 'public'];
      case 'nestjs':
        return [...common, 'src', 'src/modules', 'test', 'prisma'];
      case 'nextjs':
        return [...common, 'src', 'src/app', 'src/components', 'public'];
      case 'express':
        return [...common, 'src', 'src/routes', 'src/controllers', 'src/services'];
      default:
        return common;
    }
  }

  private getBaseFiles(projectType: string): FileToWrite[] {
    return [
      {
        path: '.gitignore',
        content: this.getGitignoreContent(projectType),
      },
      {
        path: 'README.md',
        content: '# Project\n\nGenerated by LayerCake\n',
      },
      {
        path: '.env.example',
        content: '# Environment variables\n',
      },
    ];
  }

  private getGitignoreContent(projectType: string): string {
    return `# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
*.lcov

# Production
build/
dist/
.next/

# Environment
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo
`;
  }

  private async buildDirectoryTree(
    fullPath: string,
    relativePath: string,
  ): Promise<DirectoryStructure> {
    const stats = await fs.stat(fullPath);
    const name = path.basename(fullPath);

    if (stats.isFile()) {
      return {
        name,
        path: relativePath,
        type: 'file',
      };
    }

    const children: DirectoryStructure[] = [];
    const entries = await fs.readdir(fullPath);

    for (const entry of entries) {
      // Skip node_modules and hidden files
      if (entry === 'node_modules' || entry.startsWith('.')) {
        continue;
      }

      const childPath = path.join(fullPath, entry);
      const childRelativePath = path.join(relativePath, entry);
      const child = await this.buildDirectoryTree(childPath, childRelativePath);
      children.push(child);
    }

    return {
      name,
      path: relativePath,
      type: 'directory',
      children,
    };
  }

  private async calculateDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;
    const entries = await fs.readdir(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stats = await fs.stat(fullPath);

      if (stats.isFile()) {
        totalSize += stats.size;
      } else if (stats.isDirectory()) {
        totalSize += await this.calculateDirectorySize(fullPath);
      }
    }

    return totalSize;
  }
}
