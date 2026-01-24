import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { InputClassifierService } from './services/input-classifier.service';
import { BackendAnalyzerService } from './services/backend-analyzer.service';
import { UIAnalyzerService } from './services/ui-analyzer.service';
import { CrossAnalyzerService } from './services/cross-analyzer.service';
import { GateRecommenderService } from './services/gate-recommender.service';
import {
  InputClassification,
  InputAnalysisResult,
  AnalysisStatusDto,
} from './dto/input-analysis.dto';
import { GatePlan, GateContext, GateAction } from './dto/gate-recommendation.dto';

interface FileInfo {
  path: string;
  content?: string;
  size: number;
  mimeType?: string;
}

interface AnalysisSession {
  sessionId: string;
  status: AnalysisStatusDto['status'];
  progress: number;
  currentPhase: string;
  classification?: InputClassification;
  result?: InputAnalysisResult;
  error?: string;
  startedAt: Date;
}

@Injectable()
export class UniversalInputService {
  private readonly logger = new Logger(UniversalInputService.name);

  // In-memory session storage (consider Redis for production)
  private sessions: Map<string, AnalysisSession> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly inputClassifier: InputClassifierService,
    private readonly backendAnalyzer: BackendAnalyzerService,
    private readonly uiAnalyzer: UIAnalyzerService,
    private readonly crossAnalyzer: CrossAnalyzerService,
    private readonly gateRecommender: GateRecommenderService,
  ) {}

  /**
   * Start a new analysis session
   * This orchestrates the entire Universal Input Handler workflow
   */
  async startAnalysis(
    sessionId: string,
    assetIds: string[],
    options: {
      includeSecurityScan?: boolean;
      includeQualityMetrics?: boolean;
    } = {},
  ): Promise<AnalysisStatusDto> {
    this.logger.log(`Starting analysis session ${sessionId} with ${assetIds.length} assets`);

    // Initialize session
    const session: AnalysisSession = {
      sessionId,
      status: 'pending',
      progress: 0,
      currentPhase: 'Initializing',
      startedAt: new Date(),
    };
    this.sessions.set(sessionId, session);

    // Run analysis asynchronously
    this.runAnalysis(sessionId, assetIds, options).catch((error) => {
      this.logger.error(`Analysis failed for session ${sessionId}`, error);
      const s = this.sessions.get(sessionId);
      if (s) {
        s.status = 'failed';
        s.error = error.message;
      }
    });

    return this.getStatus(sessionId);
  }

  /**
   * Get current analysis status
   */
  getStatus(sessionId: string): AnalysisStatusDto {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        sessionId,
        status: 'failed',
        progress: 0,
        currentPhase: 'Unknown',
        error: 'Session not found',
      };
    }

    return {
      sessionId,
      status: session.status,
      progress: session.progress,
      currentPhase: session.currentPhase,
      classification: session.classification,
      result: session.result,
      error: session.error,
    };
  }

  /**
   * Generate gate plan from analysis results
   */
  async getGatePlan(sessionId: string): Promise<GatePlan | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'complete' || !session.result) {
      return null;
    }

    return this.gateRecommender.generateGatePlan(
      sessionId,
      `analysis-${sessionId}`,
      session.result,
    );
  }

  /**
   * Confirm gate plan and build execution context
   */
  async confirmGatePlan(
    sessionId: string,
    decisions: { gate: string; action: GateAction; reason?: string }[],
    userId: string,
  ): Promise<GateContext | null> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.result) {
      return null;
    }

    this.logger.log(`User ${userId} confirming gate plan for session ${sessionId}`);

    // Convert array to record
    const decisionRecord: Record<string, { action: GateAction; reason?: string }> = {};
    for (const d of decisions) {
      decisionRecord[d.gate] = { action: d.action, reason: d.reason };
    }

    // Get asset IDs from session (would need to store these)
    const assetIds: string[] = []; // TODO: Store asset IDs in session

    return this.gateRecommender.buildGateContext(session.result, decisionRecord, assetIds);
  }

  /**
   * Main analysis orchestration
   */
  private async runAnalysis(
    sessionId: string,
    assetIds: string[],
    options: {
      includeSecurityScan?: boolean;
      includeQualityMetrics?: boolean;
    },
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const startTime = Date.now();
    const { includeSecurityScan = true, includeQualityMetrics = true } = options;
    this.logger.log(
      `Running analysis with options: securityScan=${includeSecurityScan}, qualityMetrics=${includeQualityMetrics}`,
    );

    try {
      // Phase 0: Load files and classify
      this.updateSession(sessionId, 'classifying', 10, 'Loading and classifying files');

      const files = await this.loadFilesFromAssets(assetIds);
      this.logger.log(`Loaded ${files.length} files for analysis`);

      const classification = await this.inputClassifier.classifyInput(files);
      session.classification = classification;

      this.updateSession(sessionId, 'classifying', 25, 'Classification complete');

      // Phase 2A: UI Analysis (if UI files present)
      let uiAnalysis: InputAnalysisResult['uiAnalysis'] | undefined;
      if (
        classification.completeness === 'ui-only' ||
        classification.completeness === 'full-stack'
      ) {
        this.updateSession(sessionId, 'analyzing-ui', 35, 'Analyzing UI code');

        const uiResult = await this.uiAnalyzer.analyzeUI(files);
        uiAnalysis = {
          extractedEndpoints: uiResult.extractedEndpoints,
          stateManagement: uiResult.stateManagement,
          routingLibrary: uiResult.routingLibrary,
          stylingApproach: uiResult.stylingApproach,
          componentCount: uiResult.componentCount,
          pageCount: uiResult.pageCount,
        };

        this.updateSession(sessionId, 'analyzing-ui', 50, 'UI analysis complete');
      }

      // Phase 2B: Backend Analysis (if backend files present)
      let backendAnalysis: InputAnalysisResult['backendAnalysis'] | undefined;
      if (
        classification.completeness === 'backend-only' ||
        classification.completeness === 'full-stack'
      ) {
        this.updateSession(sessionId, 'analyzing-backend', 55, 'Analyzing backend code');

        const backendResult = await this.backendAnalyzer.analyzeBackend(files);
        backendAnalysis = {
          extractedRoutes: backendResult.extractedRoutes,
          extractedSchema: backendResult.extractedSchema,
          generatedOpenAPI: backendResult.generatedOpenAPI,
          authPatterns: backendResult.authPatterns,
          validationSchemas: backendResult.validationSchemas,
          securityIssues: backendResult.securityIssues,
          qualityMetrics: backendResult.qualityMetrics,
          dependencyAnalysis: backendResult.dependencyAnalysis,
        };

        this.updateSession(sessionId, 'analyzing-backend', 75, 'Backend analysis complete');
      }

      // Phase 2C: Cross-Analysis (if full-stack)
      let crossAnalysis: InputAnalysisResult['crossAnalysis'] | undefined;
      if (classification.completeness === 'full-stack' && uiAnalysis && backendAnalysis) {
        this.updateSession(sessionId, 'cross-analyzing', 80, 'Performing cross-analysis');

        // Prepare file contents for cross-analyzer
        const uiFiles = files.filter((f) => this.isUIFile(f.path));
        const backendFiles = files.filter((f) => this.isBackendFile(f.path));

        const uiContents = uiFiles.map((f) => `=== ${f.path} ===\n${f.content || ''}`).join('\n\n');
        const backendContents = backendFiles
          .map((f) => `=== ${f.path} ===\n${f.content || ''}`)
          .join('\n\n');

        const crossResult = await this.crossAnalyzer.analyzeCross(
          uiAnalysis.extractedEndpoints,
          backendAnalysis.extractedRoutes,
          uiContents,
          backendContents,
        );

        crossAnalysis = {
          missingBackendEndpoints: crossResult.missingBackendEndpoints,
          unusedBackendEndpoints: crossResult.unusedBackendEndpoints,
          typeMismatches: crossResult.typeMismatches,
          authMisalignments: crossResult.authMisalignments,
        };

        this.updateSession(sessionId, 'cross-analyzing', 95, 'Cross-analysis complete');
      }

      // Compile final result
      const endTime = Date.now();
      const result: InputAnalysisResult = {
        classification,
        uiAnalysis,
        backendAnalysis,
        crossAnalysis,
        startedAt: session.startedAt,
        completedAt: new Date(),
        durationMs: endTime - startTime,
      };

      session.result = result;
      this.updateSession(sessionId, 'complete', 100, 'Analysis complete');

      this.logger.log(`Analysis complete for session ${sessionId} in ${result.durationMs}ms`);
    } catch (error) {
      this.logger.error(`Analysis failed for session ${sessionId}`, error);
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  /**
   * Load files from project assets
   */
  private async loadFilesFromAssets(assetIds: string[]): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    for (const assetId of assetIds) {
      try {
        // Get asset metadata
        const asset = await this.prisma.projectAsset.findUnique({
          where: { id: assetId },
        });

        if (!asset) continue;

        // For code files, download content
        if (this.isCodeFile(asset.filename)) {
          try {
            const content = await this.storage.download(asset.storageKey);
            files.push({
              path: asset.originalName,
              content: content.toString('utf-8'),
              size: asset.fileSize,
              mimeType: asset.mimeType,
            });
          } catch (err) {
            this.logger.warn(`Failed to download asset ${assetId}: ${err}`);
            files.push({
              path: asset.originalName,
              size: asset.fileSize,
              mimeType: asset.mimeType,
            });
          }
        } else {
          // For non-code files, just include metadata
          files.push({
            path: asset.originalName,
            size: asset.fileSize,
            mimeType: asset.mimeType,
          });
        }
      } catch (err) {
        this.logger.warn(`Failed to load asset ${assetId}: ${err}`);
      }
    }

    return files;
  }

  /**
   * Update session status
   */
  private updateSession(
    sessionId: string,
    status: AnalysisStatusDto['status'],
    progress: number,
    currentPhase: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.progress = progress;
      session.currentPhase = currentPhase;
    }
  }

  /**
   * Check if file is a code file (should download content)
   */
  private isCodeFile(filename: string): boolean {
    const codeExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.go',
      '.rs',
      '.java',
      '.vue',
      '.svelte',
      '.json',
      '.yaml',
      '.yml',
      '.toml',
      '.prisma',
      '.graphql',
      '.gql',
      '.md',
      '.txt',
      '.env',
      '.gitignore',
      '.sql',
      '.sh',
      '.bash',
      '.css',
      '.scss',
      '.less',
      '.html',
    ];

    const lower = filename.toLowerCase();
    return codeExtensions.some((ext) => lower.endsWith(ext));
  }

  /**
   * Check if file is UI-related
   */
  private isUIFile(path: string): boolean {
    const lowerPath = path.toLowerCase();
    const includePatterns = ['.tsx', '.jsx', '.vue', '.svelte', '/components/', '/pages/'];
    const excludePatterns = ['.controller.ts', '.service.ts', '.module.ts'];

    return (
      includePatterns.some((p) => lowerPath.includes(p)) &&
      !excludePatterns.some((p) => lowerPath.includes(p))
    );
  }

  /**
   * Check if file is backend-related
   */
  private isBackendFile(path: string): boolean {
    const lowerPath = path.toLowerCase();
    const backendIndicators = [
      'controller',
      'service',
      'module',
      'guard',
      'middleware',
      'entity',
      'dto',
      'repository',
    ];

    return (
      lowerPath.endsWith('.ts') &&
      !lowerPath.endsWith('.tsx') &&
      backendIndicators.some((i) => lowerPath.includes(i))
    );
  }
}
