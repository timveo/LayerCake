import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FileSystemService } from '../../code-generation/filesystem.service';
import { GitIntegrationService } from '../../code-generation/git-integration.service';

export interface DocumentCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  filesChanged: string[];
}

export interface DocumentBranch {
  name: string;
  isCurrent: boolean;
  lastCommit?: string;
}

export interface GitStatus {
  branch: string;
  isClean: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface DocumentVersion {
  commitHash: string;
  content: string;
  message: string;
  author: string;
  date: string;
}

/**
 * DocumentGitService - Git-based document versioning
 *
 * Manages documents as files in a local git repository within the project workspace.
 * Provides commit/branch/history functionality and syncs with the database.
 *
 * Directory structure:
 * workspaces/{projectId}/
 *   ├── docs/                    # All documents
 *   │   ├── PROJECT_INTAKE.md
 *   │   ├── PRD.md
 *   │   ├── ARCHITECTURE.md
 *   │   └── ...
 *   ├── specs/                   # Specifications (OpenAPI, Prisma, etc.)
 *   ├── src/                     # Generated code
 *   └── .git/                    # Git repository
 */
@Injectable()
export class DocumentGitService {
  private readonly logger = new Logger(DocumentGitService.name);
  private readonly DOCS_DIR = 'docs';

  constructor(
    private prisma: PrismaService,
    private filesystem: FileSystemService,
    private git: GitIntegrationService,
  ) {}

  /**
   * Initialize git repository for a project if not already initialized
   */
  async initializeRepository(projectId: string): Promise<boolean> {
    try {
      // Create workspace if it doesn't exist
      await this.filesystem.createProjectWorkspace(projectId);

      // Initialize git
      const result = await this.git.initRepository(projectId);

      if (result.success) {
        this.logger.log(`Initialized git repository for project ${projectId}`);
      }

      return result.success || result.error?.includes('already') === true;
    } catch (error) {
      this.logger.error(`Failed to initialize git for ${projectId}:`, error);
      return false;
    }
  }

  /**
   * Save a document to the filesystem and optionally commit
   */
  async saveDocument(
    projectId: string,
    documentId: string,
    title: string,
    content: string,
    options?: {
      autoCommit?: boolean;
      commitMessage?: string;
      author?: { name: string; email: string };
    },
  ): Promise<{ filePath: string; committed: boolean; commitHash?: string }> {
    // Ensure repository is initialized
    await this.initializeRepository(projectId);

    // Generate file path from document title
    const filePath = this.generateFilePath(title);
    const fullPath = `${this.DOCS_DIR}/${filePath}`;

    // Write to filesystem
    await this.filesystem.writeFile(projectId, fullPath, content);

    // Update document record with file path
    await this.prisma.document.update({
      where: { id: documentId },
      data: { filePath: fullPath },
    });

    this.logger.debug(`Saved document ${title} to ${fullPath}`);

    // Auto-commit if requested
    let committed = false;
    let commitHash: string | undefined;

    if (options?.autoCommit !== false) {
      const message = options?.commitMessage || `Update ${title}`;
      const result = await this.commitDocument(projectId, fullPath, message, options?.author);
      committed = result.success;
      commitHash = result.commitHash;
    }

    return { filePath: fullPath, committed, commitHash };
  }

  /**
   * Commit a specific document
   */
  async commitDocument(
    projectId: string,
    filePath: string,
    message: string,
    author?: { name: string; email: string },
  ): Promise<{ success: boolean; commitHash?: string }> {
    try {
      // Stage the file
      await this.filesystem.executeCommand(projectId, `git add "${filePath}"`);

      // Check if there are changes to commit
      const statusResult = await this.filesystem.executeCommand(
        projectId,
        'git status --porcelain',
      );

      if (!statusResult.stdout.trim()) {
        return { success: true }; // No changes
      }

      // Configure author if provided
      if (author) {
        await this.filesystem.executeCommand(projectId, `git config user.name "${author.name}"`);
        await this.filesystem.executeCommand(projectId, `git config user.email "${author.email}"`);
      }

      // Commit
      const escapedMessage = message.replace(/"/g, '\\"').replace(/`/g, '\\`');
      await this.filesystem.executeCommand(projectId, `git commit -m "${escapedMessage}"`);

      // Get commit hash
      const hashResult = await this.filesystem.executeCommand(projectId, 'git rev-parse HEAD');
      const commitHash = hashResult.stdout.trim();

      this.logger.log(`Committed ${filePath} with hash ${commitHash.substring(0, 7)}`);

      return { success: true, commitHash };
    } catch (error) {
      this.logger.error(`Failed to commit ${filePath}:`, error);
      return { success: false };
    }
  }

  /**
   * Commit all pending document changes
   */
  async commitAllDocuments(
    projectId: string,
    message: string,
    author?: { name: string; email: string },
  ): Promise<{ success: boolean; commitHash?: string; filesCommitted: number }> {
    try {
      // Stage all docs
      await this.filesystem.executeCommand(projectId, `git add "${this.DOCS_DIR}/"`);

      // Use the existing commitAll method
      const result = await this.git.commitAll(projectId, message, author);

      return {
        success: result.success,
        commitHash: result.commitHash,
        filesCommitted: result.filesCommitted,
      };
    } catch (error) {
      this.logger.error('Failed to commit all documents:', error);
      return { success: false, filesCommitted: 0 };
    }
  }

  /**
   * Get document content at a specific commit
   */
  async getDocumentAtCommit(
    projectId: string,
    filePath: string,
    commitHash: string,
  ): Promise<DocumentVersion | null> {
    try {
      // Get content at commit
      const contentResult = await this.filesystem.executeCommand(
        projectId,
        `git show ${commitHash}:"${filePath}"`,
      );

      if (!contentResult.success) {
        return null;
      }

      // Get commit info
      const infoResult = await this.filesystem.executeCommand(
        projectId,
        `git log -1 --pretty=format:"%s|%an|%ad" --date=iso ${commitHash}`,
      );

      const [message, author, date] = infoResult.stdout.split('|');

      return {
        commitHash,
        content: contentResult.stdout,
        message: message || '',
        author: author || '',
        date: date || '',
      };
    } catch (error) {
      this.logger.error(`Failed to get document at ${commitHash}:`, error);
      return null;
    }
  }

  /**
   * Get commit history for a specific document
   */
  async getDocumentHistory(
    projectId: string,
    filePath: string,
    limit = 20,
  ): Promise<DocumentCommit[]> {
    try {
      const result = await this.filesystem.executeCommand(
        projectId,
        `git log --pretty=format:"%H|%s|%an|%ad" --date=iso -n ${limit} -- "${filePath}"`,
      );

      if (!result.success || !result.stdout.trim()) {
        return [];
      }

      return result.stdout
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const [hash, message, author, date] = line.split('|');
          return {
            hash,
            message,
            author,
            date,
            filesChanged: [filePath],
          };
        });
    } catch (error) {
      this.logger.error(`Failed to get history for ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Get full commit history for all documents
   */
  async getAllDocumentHistory(projectId: string, limit = 50): Promise<DocumentCommit[]> {
    try {
      const result = await this.filesystem.executeCommand(
        projectId,
        `git log --pretty=format:"%H|%s|%an|%ad" --date=iso -n ${limit} -- "${this.DOCS_DIR}/"`,
      );

      if (!result.success || !result.stdout.trim()) {
        return [];
      }

      const commits: DocumentCommit[] = [];

      for (const line of result.stdout.split('\n').filter((l) => l.trim())) {
        const [hash, message, author, date] = line.split('|');

        // Get files changed in this commit
        const filesResult = await this.filesystem.executeCommand(
          projectId,
          `git diff-tree --no-commit-id --name-only -r ${hash} -- "${this.DOCS_DIR}/"`,
        );

        commits.push({
          hash,
          message,
          author,
          date,
          filesChanged: filesResult.stdout.split('\n').filter((f) => f.trim()),
        });
      }

      return commits;
    } catch (error) {
      this.logger.error('Failed to get all document history:', error);
      return [];
    }
  }

  /**
   * Get git status for the docs directory
   */
  async getStatus(projectId: string): Promise<GitStatus> {
    try {
      // Get current branch
      const branchResult = await this.git.getCurrentBranch(projectId);
      const branch = branchResult || 'main';

      // Get status
      const statusResult = await this.filesystem.executeCommand(
        projectId,
        'git status --porcelain',
      );

      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      if (statusResult.stdout) {
        for (const line of statusResult.stdout.split('\n').filter((l) => l.trim())) {
          const statusCode = line.substring(0, 2);
          const file = line.substring(3).trim();

          // Only include docs directory files
          if (!file.startsWith(this.DOCS_DIR + '/')) continue;

          if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
            staged.push(file);
          }
          if (statusCode[1] !== ' ') {
            if (statusCode[1] === '?') {
              untracked.push(file);
            } else {
              unstaged.push(file);
            }
          }
        }
      }

      return {
        branch,
        isClean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
        staged,
        unstaged,
        untracked,
      };
    } catch (error) {
      this.logger.error('Failed to get git status:', error);
      return {
        branch: 'main',
        isClean: true,
        staged: [],
        unstaged: [],
        untracked: [],
      };
    }
  }

  /**
   * Create a new branch for document work
   */
  async createBranch(projectId: string, branchName: string): Promise<boolean> {
    return this.git.createBranch(projectId, branchName);
  }

  /**
   * Switch to a different branch
   */
  async switchBranch(projectId: string, branchName: string): Promise<boolean> {
    return this.git.switchBranch(projectId, branchName);
  }

  /**
   * Get list of branches
   */
  async getBranches(projectId: string): Promise<DocumentBranch[]> {
    try {
      const result = await this.filesystem.executeCommand(
        projectId,
        'git branch --format="%(refname:short)|%(objectname:short)|%(HEAD)"',
      );

      if (!result.success || !result.stdout.trim()) {
        return [{ name: 'main', isCurrent: true }];
      }

      return result.stdout
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => {
          const [name, lastCommit, head] = line.split('|');
          return {
            name,
            lastCommit,
            isCurrent: head === '*',
          };
        });
    } catch (error) {
      this.logger.error('Failed to get branches:', error);
      return [{ name: 'main', isCurrent: true }];
    }
  }

  /**
   * Revert a document to a previous commit
   */
  async revertDocument(
    projectId: string,
    filePath: string,
    commitHash: string,
  ): Promise<{ success: boolean; newCommitHash?: string }> {
    try {
      // Get content at that commit
      const oldContent = await this.getDocumentAtCommit(projectId, filePath, commitHash);
      if (!oldContent) {
        return { success: false };
      }

      // Write the old content
      await this.filesystem.writeFile(projectId, filePath, oldContent.content);

      // Commit the revert
      const result = await this.commitDocument(
        projectId,
        filePath,
        `Revert ${filePath.split('/').pop()} to ${commitHash.substring(0, 7)}`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to revert ${filePath}:`, error);
      return { success: false };
    }
  }

  /**
   * Compare document between two commits
   */
  async diffDocument(
    projectId: string,
    filePath: string,
    fromCommit: string,
    toCommit: string,
  ): Promise<string | null> {
    try {
      const result = await this.filesystem.executeCommand(
        projectId,
        `git diff ${fromCommit}..${toCommit} -- "${filePath}"`,
      );

      return result.success ? result.stdout : null;
    } catch (error) {
      this.logger.error('Failed to diff document:', error);
      return null;
    }
  }

  /**
   * Sync all database documents to filesystem
   * Used for initial setup or recovery
   */
  async syncDatabaseToFilesystem(projectId: string, userId: string): Promise<number> {
    // Verify project ownership
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project || project.ownerId !== userId) {
      throw new Error('Project not found or access denied');
    }

    // Initialize repository
    await this.initializeRepository(projectId);

    // Get all documents
    const documents = await this.prisma.document.findMany({
      where: { projectId },
    });

    let synced = 0;

    for (const doc of documents) {
      const filePath = this.generateFilePath(doc.title);
      const fullPath = `${this.DOCS_DIR}/${filePath}`;

      await this.filesystem.writeFile(projectId, fullPath, doc.content);

      // Update document with file path
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { filePath: fullPath },
      });

      synced++;
    }

    // Commit all synced documents
    if (synced > 0) {
      await this.git.commitAll(projectId, `Sync ${synced} documents from database`);
    }

    this.logger.log(`Synced ${synced} documents to filesystem for project ${projectId}`);

    return synced;
  }

  /**
   * Read document content from filesystem
   */
  async readDocument(projectId: string, filePath: string): Promise<string | null> {
    try {
      return await this.filesystem.readFile(projectId, filePath);
    } catch (error) {
      return null;
    }
  }

  /**
   * List all document files in the repository
   */
  async listDocumentFiles(projectId: string): Promise<string[]> {
    try {
      const tree = await this.filesystem.getDirectoryTree(projectId, this.DOCS_DIR);

      const files: string[] = [];
      const extractFiles = (node: { path: string; type: string; children?: any[] }) => {
        if (node.type === 'file') {
          files.push(node.path);
        }
        if (node.children) {
          for (const child of node.children) {
            extractFiles(child);
          }
        }
      };

      if (tree.children) {
        for (const child of tree.children) {
          extractFiles(child);
        }
      }

      return files;
    } catch (error) {
      return [];
    }
  }

  /**
   * Generate a safe file path from document title
   */
  private generateFilePath(title: string): string {
    // Convert title to safe filename
    const safeName = title
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')
      .toUpperCase();

    // Add .md extension if not present
    return safeName.endsWith('.md') ? safeName : `${safeName}.md`;
  }
}
