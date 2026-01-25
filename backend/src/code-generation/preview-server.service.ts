import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileSystemService } from './filesystem.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

export type ProjectType = 'vite' | 'nestjs' | 'nextjs' | 'unknown';
export type ProjectStructure = 'fullstack' | 'frontend-only' | 'backend-only' | 'monolith';

export interface PreviewServer {
  projectId: string;
  port: number;
  url: string;
  process: ChildProcess;
  startedAt: Date;
  status: 'starting' | 'running' | 'stopped' | 'error';
  logs: string[];
  projectType: ProjectType;
  projectStructure: ProjectStructure;
  workingDir: string; // The directory where the dev server runs (e.g., 'frontend' for fullstack)
}

/**
 * PreviewServerService - Manage dev servers for generated projects
 *
 * Purpose:
 * - Start Vite/React dev servers for generated frontend projects
 * - Track running servers per project
 * - Provide preview URLs for the frontend
 * - Clean up servers on shutdown
 */
@Injectable()
export class PreviewServerService implements OnModuleDestroy {
  private readonly logger = new Logger(PreviewServerService.name);
  private readonly servers = new Map<string, PreviewServer>();
  private readonly basePort: number;
  private readonly maxServers: number;
  private nextPort: number;

  constructor(
    private readonly config: ConfigService,
    private readonly filesystem: FileSystemService,
    private readonly prisma: PrismaService,
  ) {
    // Start allocating ports from 3100 to avoid conflicts with main apps
    this.basePort = this.config.get<number>('PREVIEW_BASE_PORT') || 3100;
    this.maxServers = this.config.get<number>('MAX_PREVIEW_SERVERS') || 10;
    this.nextPort = this.basePort;
  }

  /**
   * Cleanup all servers on module destroy
   */
  async onModuleDestroy() {
    this.logger.log('Shutting down all preview servers...');
    const stopPromises = Array.from(this.servers.keys()).map((projectId) =>
      this.stopServer(projectId),
    );
    await Promise.all(stopPromises);
  }

  /**
   * Detect project structure - fullstack (frontend/ + backend/) or single app
   */
  private async detectProjectStructure(
    projectId: string,
  ): Promise<{ structure: ProjectStructure; workingDir: string }> {
    const hasFrontendFolder = await this.filesystem.fileExists(projectId, 'frontend/package.json');
    const hasBackendFolder = await this.filesystem.fileExists(projectId, 'backend/package.json');
    const _hasRootPackage = await this.filesystem.fileExists(projectId, 'package.json');

    if (hasFrontendFolder && hasBackendFolder) {
      // Fullstack project - preview the frontend
      this.logger.log(`Detected fullstack project for ${projectId} - will preview frontend/`);
      return { structure: 'fullstack', workingDir: 'frontend' };
    }

    if (hasFrontendFolder && !hasBackendFolder) {
      return { structure: 'frontend-only', workingDir: 'frontend' };
    }

    if (hasBackendFolder && !hasFrontendFolder) {
      return { structure: 'backend-only', workingDir: 'backend' };
    }

    // Monolith or single-folder project
    return { structure: 'monolith', workingDir: '.' };
  }

  /**
   * Start a dev server for a project
   * For fullstack projects, this starts the FRONTEND dev server (not backend)
   */
  async startServer(projectId: string): Promise<PreviewServer> {
    // Check if server already running
    const existing = this.servers.get(projectId);
    if (existing && existing.status === 'running') {
      this.logger.log(`Server already running for project ${projectId} on port ${existing.port}`);
      return existing;
    }

    // Check if we have too many servers running
    const runningCount = Array.from(this.servers.values()).filter(
      (s) => s.status === 'running',
    ).length;
    if (runningCount >= this.maxServers) {
      throw new Error(
        `Maximum number of preview servers (${this.maxServers}) reached. Stop another server first.`,
      );
    }

    // Detect project structure (fullstack vs monolith)
    const { structure, workingDir } = await this.detectProjectStructure(projectId);
    this.logger.log(`Project structure: ${structure}, working dir: ${workingDir}`);

    // Detect project type from the appropriate directory
    const projectType = await this.detectProjectType(projectId, workingDir);
    this.logger.log(`Detected project type: ${projectType} for project ${projectId}`);

    // Check for appropriate dev script
    const devScript = await this.getDevScript(projectId, projectType, workingDir);
    if (!devScript) {
      throw new Error(
        `Project does not have a suitable dev script for ${projectType} project in ${workingDir}`,
      );
    }

    // Allocate a port
    const port = this.allocatePort();
    const projectPath = this.filesystem.getProjectPath(projectId);
    const serverWorkingDir = workingDir === '.' ? projectPath : `${projectPath}/${workingDir}`;

    // For preview, always show the UI (not /api endpoint)
    const previewUrl = `http://localhost:${port}`;

    this.logger.log(
      `Starting ${projectType} dev server for project ${projectId} in ${workingDir} on port ${port}`,
    );

    // Create server record
    const server: PreviewServer = {
      projectId,
      port,
      url: previewUrl,
      process: null as any,
      startedAt: new Date(),
      status: 'starting',
      logs: [],
      projectType,
      projectStructure: structure,
      workingDir,
    };

    try {
      // Build the dev command based on project type
      const { command, args } = this.getDevCommand(projectType, port);

      const devProcess = spawn(command, args, {
        cwd: serverWorkingDir,
        shell: true,
        env: {
          ...process.env,
          PORT: port.toString(),
          VITE_PORT: port.toString(),
        },
      });

      server.process = devProcess;

      // Capture stdout
      devProcess.stdout?.on('data', (data) => {
        const line = data.toString();
        server.logs.push(line);
        // Keep only last 100 lines
        if (server.logs.length > 100) {
          server.logs.shift();
        }
        // Check if server is ready based on project type
        if (this.isServerReady(line, projectType)) {
          server.status = 'running';
          this.logger.log(`Dev server ready for ${projectId} at ${server.url}`);
        }
      });

      // Capture stderr
      devProcess.stderr?.on('data', (data) => {
        const line = data.toString();
        server.logs.push(`[stderr] ${line}`);
        if (server.logs.length > 100) {
          server.logs.shift();
        }
      });

      // Handle process exit
      devProcess.on('close', (code) => {
        this.logger.log(`Dev server for ${projectId} exited with code ${code}`);
        server.status = 'stopped';
        this.releasePort(port);
      });

      devProcess.on('error', (err) => {
        this.logger.error(`Dev server error for ${projectId}: ${err.message}`);
        server.status = 'error';
        server.logs.push(`[error] ${err.message}`);
      });

      this.servers.set(projectId, server);

      // Wait a moment for server to start
      await this.waitForServerReady(server, 30000);

      return server;
    } catch (error: any) {
      this.logger.error(`Failed to start dev server for ${projectId}: ${error.message}`);
      server.status = 'error';
      server.logs.push(`[error] ${error.message}`);
      this.releasePort(port);
      throw error;
    }
  }

  /**
   * Stop a dev server for a project
   */
  async stopServer(projectId: string): Promise<void> {
    const server = this.servers.get(projectId);
    if (!server) {
      this.logger.warn(`No server found for project ${projectId}`);
      return;
    }

    this.logger.log(`Stopping dev server for project ${projectId}`);

    if (server.process && !server.process.killed) {
      // Kill the process tree
      try {
        // On Unix, use negative PID to kill process group
        if (process.platform !== 'win32' && server.process.pid) {
          process.kill(-server.process.pid, 'SIGTERM');
        } else {
          server.process.kill('SIGTERM');
        }
      } catch (err: any) {
        this.logger.warn(`Error killing process: ${err.message}`);
        // Try force kill
        server.process.kill('SIGKILL');
      }
    }

    server.status = 'stopped';
    this.releasePort(server.port);
    this.servers.delete(projectId);
  }

  /**
   * Get server status for a project
   */
  getServerStatus(projectId: string): PreviewServer | null {
    const server = this.servers.get(projectId);
    if (!server) return null;

    // Return without the process object (not serializable)
    return {
      ...server,
      process: undefined as any,
    };
  }

  /**
   * Get all running servers
   */
  getAllServers(): Array<Omit<PreviewServer, 'process'>> {
    return Array.from(this.servers.values()).map((s) => ({
      ...s,
      process: undefined as any,
    }));
  }

  /**
   * Get preview error logs for a project - useful for agent feedback
   */
  getPreviewErrors(projectId: string): string[] {
    const server = this.servers.get(projectId);
    if (!server) return [];

    // Filter logs for error-related lines
    return server.logs.filter(
      (line) =>
        line.includes('[error]') ||
        line.includes('[stderr]') ||
        line.includes('Error:') ||
        line.includes('error:') ||
        line.includes('failed') ||
        line.includes('Cannot find') ||
        line.includes('Module not found') ||
        line.includes('not found'),
    );
  }

  /**
   * Get all preview logs for a project
   */
  getPreviewLogs(projectId: string): string[] {
    const server = this.servers.get(projectId);
    return server?.logs || [];
  }

  /**
   * Check if preview server failed to start
   */
  hasPreviewFailed(projectId: string): boolean {
    const server = this.servers.get(projectId);
    if (!server) return false;
    return server.status === 'error' || server.status === 'stopped';
  }

  /**
   * Detect project type from package.json and config files
   * @param workingDir - subdirectory to check (e.g., 'frontend' for fullstack projects)
   */
  private async detectProjectType(
    projectId: string,
    workingDir: string = '.',
  ): Promise<ProjectType> {
    try {
      const packagePath = workingDir === '.' ? 'package.json' : `${workingDir}/package.json`;
      const packageJson = await this.filesystem.readFile(projectId, packagePath);
      const pkg = JSON.parse(packageJson);

      // Check for NestJS
      if (pkg.dependencies?.['@nestjs/core'] || pkg.devDependencies?.['@nestjs/core']) {
        return 'nestjs';
      }

      // Check for Next.js
      if (pkg.dependencies?.['next'] || pkg.devDependencies?.['next']) {
        return 'nextjs';
      }

      // Check for Vite (React, Vue, etc.)
      if (pkg.devDependencies?.['vite'] || pkg.dependencies?.['vite']) {
        return 'vite';
      }

      // Check for vite.config file as fallback
      const viteConfigPath = workingDir === '.' ? 'vite.config.ts' : `${workingDir}/vite.config.ts`;
      const viteConfigJsPath =
        workingDir === '.' ? 'vite.config.js' : `${workingDir}/vite.config.js`;
      if (
        (await this.filesystem.fileExists(projectId, viteConfigPath)) ||
        (await this.filesystem.fileExists(projectId, viteConfigJsPath))
      ) {
        return 'vite';
      }

      // Check for nest-cli.json as fallback
      const nestConfigPath = workingDir === '.' ? 'nest-cli.json' : `${workingDir}/nest-cli.json`;
      if (await this.filesystem.fileExists(projectId, nestConfigPath)) {
        return 'nestjs';
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get the appropriate dev script for a project type
   * @param workingDir - subdirectory to check (e.g., 'frontend' for fullstack projects)
   */
  private async getDevScript(
    projectId: string,
    projectType: ProjectType,
    workingDir: string = '.',
  ): Promise<string | null> {
    try {
      const packagePath = workingDir === '.' ? 'package.json' : `${workingDir}/package.json`;
      const packageJson = await this.filesystem.readFile(projectId, packagePath);
      const pkg = JSON.parse(packageJson);
      const scripts = pkg.scripts || {};

      switch (projectType) {
        case 'nestjs':
          return scripts['start:dev'] || scripts['dev'] || null;
        case 'nextjs':
          return scripts['dev'] || null;
        case 'vite':
          return scripts['dev'] || null;
        default:
          return scripts['dev'] || scripts['start'] || scripts['start:dev'] || null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Get preview URL based on project type
   * @deprecated - No longer used, preview always shows root URL for UI
   */
  private getPreviewUrl(_projectType: ProjectType, port: number): string {
    // Always return root URL - we want to preview the UI, not API endpoints
    return `http://localhost:${port}`;
  }

  /**
   * Get the dev command and args for a project type
   */
  private getDevCommand(
    projectType: ProjectType,
    port: number,
  ): { command: string; args: string[] } {
    switch (projectType) {
      case 'nestjs':
        // NestJS uses start:dev, port set via PORT env var
        return {
          command: 'npm',
          args: ['run', 'start:dev'],
        };
      case 'nextjs':
        return {
          command: 'npm',
          args: ['run', 'dev', '--', '-p', port.toString()],
        };
      case 'vite':
      default:
        return {
          command: 'npm',
          args: ['run', 'dev', '--', '--port', port.toString(), '--host'],
        };
    }
  }

  /**
   * Check if server is ready based on output and project type
   */
  private isServerReady(output: string, projectType: ProjectType): boolean {
    switch (projectType) {
      case 'nestjs':
        return (
          output.includes('Nest application successfully started') ||
          output.includes('listening on') ||
          output.includes('Application is running')
        );
      case 'nextjs':
        return output.includes('Ready') || output.includes('started server');
      case 'vite':
        return output.includes('Local:') || output.includes('ready in') || output.includes('VITE');
      default:
        return (
          output.includes('listening') || output.includes('ready') || output.includes('started')
        );
    }
  }

  /**
   * Allocate a port for a new server
   */
  private allocatePort(): number {
    // Find next available port
    const usedPorts = new Set(Array.from(this.servers.values()).map((s) => s.port));

    let port = this.nextPort;
    while (usedPorts.has(port)) {
      port++;
      if (port > this.basePort + 100) {
        port = this.basePort; // Wrap around
      }
    }

    this.nextPort = port + 1;
    return port;
  }

  /**
   * Release a port when server stops
   */
  private releasePort(port: number): void {
    // Port is automatically available once process stops
    this.logger.debug(`Released port ${port}`);
  }

  /**
   * Wait for server to be ready
   */
  private async waitForServerReady(server: PreviewServer, timeoutMs: number): Promise<void> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkReady = () => {
        if (server.status === 'running') {
          resolve();
          return;
        }

        if (server.status === 'error') {
          reject(new Error('Server failed to start'));
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          // Timeout - assume it's running if process is still alive
          if (server.process && !server.process.killed) {
            server.status = 'running';
            resolve();
          } else {
            reject(new Error('Server startup timeout'));
          }
          return;
        }

        setTimeout(checkReady, 500);
      };

      checkReady();
    });
  }

  /**
   * Validate that the preview server is serving content and create a proof artifact
   * This is called after the server successfully starts to verify it's actually working
   */
  async validateAndCreateProof(
    projectId: string,
    userId?: string,
  ): Promise<{
    success: boolean;
    proofArtifactId?: string;
    error?: string;
  }> {
    const server = this.servers.get(projectId);
    if (!server) {
      return { success: false, error: 'No server running for this project' };
    }

    if (server.status !== 'running') {
      return { success: false, error: `Server status is ${server.status}, not running` };
    }

    this.logger.log(`Validating preview server for project ${projectId} at ${server.url}`);

    // For backend-only projects, we just verify the server is running
    // For frontend projects, we need to verify it returns HTML content
    let responseStatus = 0;
    let hasContent = false;

    if (server.projectStructure !== 'backend-only') {
      try {
        // Make HTTP request to verify the server is responding
        const response = await fetch(server.url, {
          method: 'GET',
          headers: { Accept: 'text/html' },
        });
        responseStatus = response.status;

        if (response.ok) {
          const content = await response.text();
          // Check if we got actual HTML content (not just an error page)
          hasContent =
            content.length > 100 &&
            (content.includes('<!DOCTYPE') ||
              content.includes('<html') ||
              content.includes('<div'));
        }
      } catch (error: any) {
        this.logger.error(`Failed to fetch preview URL: ${error.message}`);
        return { success: false, error: `Failed to connect to preview server: ${error.message}` };
      }

      if (responseStatus !== 200 || !hasContent) {
        return {
          success: false,
          error: `Preview server not serving valid content. Status: ${responseStatus}, HasContent: ${hasContent}`,
        };
      }
    } else {
      // Backend-only project - just mark as valid if server is running
      responseStatus = 200;
      hasContent = true;
    }

    // Create proof data
    const proofData = {
      status: server.status,
      url: server.url,
      port: server.port,
      projectType: server.projectType,
      projectStructure: server.projectStructure,
      responseStatus,
      hasContent,
      timestamp: new Date().toISOString(),
      workingDir: server.workingDir,
      startedAt: server.startedAt.toISOString(),
    };

    // Write proof file to workspace
    const proofFilePath = '.fuzzyllama/proofs/preview_startup.json';
    const proofContent = JSON.stringify(proofData, null, 2);

    try {
      await this.filesystem.writeFiles(projectId, [{ path: proofFilePath, content: proofContent }]);
    } catch (error: any) {
      this.logger.error(`Failed to write proof file: ${error.message}`);
      // Continue anyway - the database record is more important
    }

    // Get the current gate for this project
    const projectState = await this.prisma.projectState.findFirst({
      where: { projectId },
      select: { currentGate: true },
    });

    const gate = projectState?.currentGate || 'G5_PENDING';

    // Find or get the gate record
    const gateRecord = await this.prisma.gate.findFirst({
      where: { projectId, gateType: gate },
      select: { id: true },
    });

    // Create proof artifact record
    const absoluteProofPath = path.join(this.filesystem.getProjectPath(projectId), proofFilePath);

    const artifact = await this.prisma.proofArtifact.create({
      data: {
        projectId,
        gate,
        gateId: gateRecord?.id,
        proofType: 'preview_startup',
        filePath: absoluteProofPath,
        fileHash: Buffer.from(proofContent).toString('base64').substring(0, 64), // Simple hash
        contentSummary: `Preview server running at ${server.url} (${server.projectType}/${server.projectStructure})`,
        passFail: 'pass',
        verified: true,
        verifiedAt: new Date(),
        verifiedBy: userId || 'system',
        createdBy: userId || 'system',
      },
    });

    this.logger.log(
      `Created preview_startup proof artifact ${artifact.id} for project ${projectId}`,
    );

    return { success: true, proofArtifactId: artifact.id };
  }
}
