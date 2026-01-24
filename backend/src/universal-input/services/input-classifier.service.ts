import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  InputClassification,
  UIFramework,
  BackendFramework,
  ORMType,
  AuthType,
  ValidationLibrary,
  CompletenessLevel,
  DetectedArtifacts,
} from '../dto/input-analysis.dto';

interface FileInfo {
  path: string;
  content?: string;
  size: number;
  mimeType?: string;
}

interface AIClassificationResult {
  completeness: CompletenessLevel;
  uiFramework?: UIFramework;
  uiFrameworkVersion?: string;
  backendFramework?: BackendFramework;
  backendFrameworkVersion?: string;
  orm?: ORMType;
  databaseType?: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb' | 'unknown';
  authType?: AuthType;
  validationLibrary?: ValidationLibrary;
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';
  artifacts: DetectedArtifacts;
  confidence: number;
  reasoning: string;
}

@Injectable()
export class InputClassifierService {
  private readonly logger = new Logger(InputClassifierService.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly configService: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  /**
   * AI-Native Classification - Uses Claude to intelligently analyze uploaded files
   * Phase 0 - should complete in <30 seconds
   */
  async classifyInput(files: FileInfo[]): Promise<InputClassification> {
    this.logger.log(`Classifying ${files.length} files using AI`);

    // Prepare file summary for Claude
    const fileSummary = this.prepareFileSummary(files);

    // Get key file contents (package.json, schema files, etc.)
    const keyFileContents = this.extractKeyFileContents(files);

    // Call Claude for intelligent classification
    const aiResult = await this.runAIClassification(fileSummary, keyFileContents, files);

    // Count file types for stats
    const codeFiles = files.filter((f) => this.isCodeFile(f.path)).length;
    const configFiles = files.filter((f) => this.isConfigFile(f.path)).length;
    const docFiles = files.filter((f) => this.isDocFile(f.path)).length;
    const assetFiles = files.filter((f) => this.isAssetFile(f.path)).length;

    const classification: InputClassification = {
      completeness: aiResult.completeness,
      uiFramework: aiResult.uiFramework,
      uiFrameworkVersion: aiResult.uiFrameworkVersion,
      backendFramework: aiResult.backendFramework,
      backendFrameworkVersion: aiResult.backendFrameworkVersion,
      orm: aiResult.orm,
      databaseType: aiResult.databaseType,
      authType: aiResult.authType,
      validationLibrary: aiResult.validationLibrary,
      packageManager: aiResult.packageManager,
      artifacts: aiResult.artifacts,
      totalFiles: files.length,
      codeFiles,
      configFiles,
      docFiles,
      assetFiles,
      confidence: aiResult.confidence,
    };

    this.logger.log(
      `AI Classification complete: ${classification.completeness}, ` +
        `UI: ${classification.uiFramework || 'none'}, ` +
        `Backend: ${classification.backendFramework || 'none'}, ` +
        `Confidence: ${(classification.confidence * 100).toFixed(0)}%`,
    );

    return classification;
  }

  /**
   * Prepare a structured summary of all files for Claude
   */
  private prepareFileSummary(files: FileInfo[]): string {
    const filesByDirectory: Record<string, string[]> = {};

    for (const file of files) {
      const parts = file.path.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
      const fileName = parts[parts.length - 1];

      if (!filesByDirectory[dir]) {
        filesByDirectory[dir] = [];
      }
      filesByDirectory[dir].push(`${fileName} (${this.formatFileSize(file.size)})`);
    }

    let summary = 'FILE STRUCTURE:\n';
    for (const [dir, fileList] of Object.entries(filesByDirectory).sort()) {
      summary += `\n${dir}/\n`;
      for (const f of fileList) {
        summary += `  - ${f}\n`;
      }
    }

    return summary;
  }

  /**
   * Extract content from key files that help with classification
   */
  private extractKeyFileContents(files: FileInfo[]): string {
    const keyFiles = [
      'package.json',
      'requirements.txt',
      'pyproject.toml',
      'schema.prisma',
      'openapi.yaml',
      'openapi.yml',
      'swagger.json',
      'tsconfig.json',
      'next.config.js',
      'next.config.ts',
      'vite.config.ts',
      'angular.json',
      '.env.example',
      'docker-compose.yml',
      'Dockerfile',
      'prd.md',
      'README.md',
      'architecture.md',
    ];

    let contents = 'KEY FILE CONTENTS:\n\n';

    for (const file of files) {
      const fileName = file.path.split('/').pop()?.toLowerCase() || '';

      if (keyFiles.some((k) => fileName === k.toLowerCase()) && file.content) {
        // Truncate large files
        const maxLength = 3000;
        const content =
          file.content.length > maxLength
            ? file.content.substring(0, maxLength) + '\n... (truncated)'
            : file.content;

        contents += `=== ${file.path} ===\n${content}\n\n`;
      }
    }

    // Also include a sample of code files (first 500 chars of up to 5 files)
    const codeFiles = files.filter(
      (f) =>
        f.content &&
        (f.path.endsWith('.ts') ||
          f.path.endsWith('.tsx') ||
          f.path.endsWith('.py') ||
          f.path.endsWith('.js') ||
          f.path.endsWith('.jsx')),
    );

    if (codeFiles.length > 0) {
      contents += '=== SAMPLE CODE FILES ===\n\n';
      for (const file of codeFiles.slice(0, 5)) {
        const sample = file.content?.substring(0, 500) || '';
        contents += `--- ${file.path} ---\n${sample}\n...\n\n`;
      }
    }

    return contents;
  }

  /**
   * Run AI classification using Claude
   */
  private async runAIClassification(
    fileSummary: string,
    keyFileContents: string,
    files: FileInfo[],
  ): Promise<AIClassificationResult> {
    const systemPrompt = `You are an expert code analyst. Your job is to analyze uploaded project files and classify them accurately.

You must return a JSON object with your analysis. Be precise and confident in your assessments.

COMPLETENESS LEVELS:
- "prompt-only": No meaningful files, just text description
- "ui-only": Frontend code/mockups only, no backend
- "backend-only": Backend code only, no frontend
- "full-stack": Both frontend and backend code present
- "contracts-only": Only specification files (OpenAPI, Prisma schemas) without implementation
- "docs-only": Only documentation (PRD, architecture docs) without code

FRAMEWORK OPTIONS:
- UI: react, vue, angular, svelte, html, nextjs, unknown
- Backend: nestjs, express, fastapi, django, flask, hono, elysia, unknown
- ORM: prisma, typeorm, sequelize, drizzle, sqlalchemy, mongoose, none, unknown
- Auth: jwt, session, oauth, api-key, basic, none, unknown
- Validation: zod, class-validator, joi, yup, none, unknown
- Database: postgresql, mysql, sqlite, mongodb, unknown

Return ONLY valid JSON, no markdown code blocks.`;

    const userPrompt = `Analyze these uploaded project files and classify them:

${fileSummary}

${keyFileContents}

Return a JSON object with this structure:
{
  "completeness": "<completeness_level>",
  "uiFramework": "<framework or null>",
  "uiFrameworkVersion": "<version or null>",
  "backendFramework": "<framework or null>",
  "backendFrameworkVersion": "<version or null>",
  "orm": "<orm or null>",
  "databaseType": "<db_type or null>",
  "authType": "<auth_type or null>",
  "validationLibrary": "<validation or null>",
  "packageManager": "<npm|yarn|pnpm|bun or null>",
  "artifacts": {
    "hasPRD": <boolean>,
    "prdFiles": [<file paths>],
    "hasArchitectureDoc": <boolean>,
    "architectureFiles": [<file paths>],
    "hasReadme": <boolean>,
    "hasOpenAPI": <boolean>,
    "openAPIFiles": [<file paths>],
    "hasPrismaSchema": <boolean>,
    "prismaSchemaPath": "<path or null>",
    "hasGraphQLSchema": <boolean>,
    "graphQLFiles": [<file paths>],
    "hasUICode": <boolean>,
    "uiCodePaths": [<main UI directories>],
    "hasDesignMockups": <boolean>,
    "mockupFiles": [<file paths>],
    "hasFigmaLinks": <boolean>,
    "hasBackendCode": <boolean>,
    "backendCodePaths": [<main backend directories>],
    "hasControllers": <boolean>,
    "hasServices": <boolean>,
    "hasModels": <boolean>,
    "hasTests": <boolean>,
    "testFiles": [<file paths>],
    "hasCI": <boolean>,
    "ciFiles": [<file paths>],
    "hasDockerfile": <boolean>
  },
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation of your classification>"
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        system: systemPrompt,
      });

      // Extract text from response
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      // Parse JSON response
      const jsonStr = textBlock.text.trim();
      const result = JSON.parse(jsonStr) as AIClassificationResult;

      // Validate and sanitize the result
      return this.validateAndSanitizeResult(result, files);
    } catch (error) {
      this.logger.error('AI classification failed, falling back to heuristics', error);
      return this.fallbackClassification(files);
    }
  }

  /**
   * Validate and sanitize AI result
   */
  private validateAndSanitizeResult(
    result: AIClassificationResult,
    files: FileInfo[],
  ): AIClassificationResult {
    // Ensure completeness is valid
    const validCompleteness: CompletenessLevel[] = [
      'prompt-only',
      'ui-only',
      'backend-only',
      'full-stack',
      'contracts-only',
      'docs-only',
    ];

    if (!validCompleteness.includes(result.completeness)) {
      result.completeness = 'prompt-only';
    }

    // Ensure confidence is in valid range
    result.confidence = Math.max(0, Math.min(1, result.confidence || 0.5));

    // Ensure artifacts object exists with all required fields
    if (!result.artifacts) {
      result.artifacts = this.createEmptyArtifacts();
    }

    // Validate that referenced artifact paths actually exist in uploaded files
    const filePaths = new Set(files.map((f) => f.path));
    if (result.artifacts.prdFiles) {
      result.artifacts.prdFiles = result.artifacts.prdFiles.filter((p) => filePaths.has(p));
    }
    if (result.artifacts.architectureFiles) {
      result.artifacts.architectureFiles = result.artifacts.architectureFiles.filter((p) =>
        filePaths.has(p),
      );
    }

    return result;
  }

  /**
   * Fallback classification using basic heuristics (when AI fails)
   */
  private fallbackClassification(files: FileInfo[]): AIClassificationResult {
    this.logger.warn('Using fallback classification');

    const filePaths = files.map((f) => f.path.toLowerCase());
    const fileNames = files.map((f) => f.path.split('/').pop()?.toLowerCase() || '');

    // Basic detection
    const hasUICode = filePaths.some(
      (p) => p.endsWith('.tsx') || p.endsWith('.jsx') || p.endsWith('.vue'),
    );
    const hasBackendCode = filePaths.some(
      (p) =>
        p.includes('/controllers/') || p.includes('/services/') || p.endsWith('.controller.ts'),
    );
    const hasPrisma = filePaths.some((p) => p.endsWith('schema.prisma'));
    const hasOpenAPI = fileNames.some((n) => n.includes('openapi') || n.includes('swagger'));

    let completeness: CompletenessLevel = 'prompt-only';
    if (hasUICode && hasBackendCode) completeness = 'full-stack';
    else if (hasUICode) completeness = 'ui-only';
    else if (hasBackendCode) completeness = 'backend-only';
    else if (hasPrisma || hasOpenAPI) completeness = 'contracts-only';

    return {
      completeness,
      artifacts: this.createEmptyArtifacts(),
      confidence: 0.3,
      reasoning: 'Fallback classification due to AI error',
    };
  }

  /**
   * Create empty artifacts object
   */
  private createEmptyArtifacts(): DetectedArtifacts {
    return {
      hasPRD: false,
      prdFiles: [],
      hasArchitectureDoc: false,
      architectureFiles: [],
      hasReadme: false,
      hasOpenAPI: false,
      openAPIFiles: [],
      hasPrismaSchema: false,
      prismaSchemaPath: undefined,
      hasGraphQLSchema: false,
      graphQLFiles: [],
      hasUICode: false,
      uiCodePaths: [],
      hasDesignMockups: false,
      mockupFiles: [],
      hasFigmaLinks: false,
      hasBackendCode: false,
      backendCodePaths: [],
      hasControllers: false,
      hasServices: false,
      hasModels: false,
      hasTests: false,
      testFiles: [],
      hasCI: false,
      ciFiles: [],
      hasDockerfile: false,
    };
  }

  // Helper methods for file stats
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  private isCodeFile(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase();
    return ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'vue', 'svelte'].includes(
      ext || '',
    );
  }

  private isConfigFile(path: string): boolean {
    const name = path.split('/').pop()?.toLowerCase() || '';
    return (
      name.includes('config') ||
      name.endsWith('.json') ||
      name.endsWith('.yaml') ||
      name.endsWith('.yml') ||
      name.endsWith('.toml') ||
      name.endsWith('.env')
    );
  }

  private isDocFile(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase();
    return ['md', 'txt', 'rst', 'adoc'].includes(ext || '');
  }

  private isAssetFile(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext || '');
  }
}
