import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  ExtractedBackendRoute,
  SecurityIssue,
  QualityMetrics,
  DependencyAnalysis,
  AuthType,
  ValidationLibrary,
} from '../dto/input-analysis.dto';

interface FileInfo {
  path: string;
  content?: string;
  size: number;
  mimeType?: string;
}

interface BackendAnalysisResult {
  extractedRoutes: ExtractedBackendRoute[];
  extractedSchema?: string;
  generatedOpenAPI?: object;
  authPatterns: {
    type: AuthType;
    details: string;
    files: string[];
  }[];
  validationSchemas: {
    library: ValidationLibrary;
    schemas: { name: string; file: string }[];
  };
  securityIssues: SecurityIssue[];
  qualityMetrics: QualityMetrics;
  dependencyAnalysis: DependencyAnalysis;
}

@Injectable()
export class BackendAnalyzerService {
  private readonly logger = new Logger(BackendAnalyzerService.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly configService: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  /**
   * AI-Native Backend Analysis - Uses Claude to deeply analyze backend code
   * Extracts routes, schemas, auth patterns, and identifies security issues
   */
  async analyzeBackend(files: FileInfo[]): Promise<BackendAnalysisResult> {
    this.logger.log(`Analyzing ${files.length} backend files using AI`);

    // Filter to backend-relevant files
    const backendFiles = files.filter((f) => this.isBackendFile(f.path));

    if (backendFiles.length === 0) {
      return this.createEmptyResult();
    }

    // Prepare file contents for Claude
    const fileContents = this.prepareFileContents(backendFiles);

    // Run parallel AI analyses
    const [routeAnalysis, schemaAnalysis, securityAnalysis, qualityAnalysis] = await Promise.all([
      this.analyzeRoutesWithAI(fileContents, backendFiles),
      this.analyzeSchemaWithAI(fileContents, backendFiles),
      this.analyzeSecurityWithAI(fileContents, backendFiles),
      this.analyzeQualityWithAI(fileContents, backendFiles),
    ]);

    // Merge results
    const result: BackendAnalysisResult = {
      extractedRoutes: routeAnalysis.routes,
      extractedSchema: schemaAnalysis.prismaSchema,
      generatedOpenAPI: routeAnalysis.openAPI,
      authPatterns: routeAnalysis.authPatterns,
      validationSchemas: routeAnalysis.validationSchemas,
      securityIssues: securityAnalysis.issues,
      qualityMetrics: qualityAnalysis.metrics,
      dependencyAnalysis: qualityAnalysis.dependencies,
    };

    this.logger.log(
      `Backend analysis complete: ${result.extractedRoutes.length} routes, ` +
        `${result.securityIssues.length} security issues`,
    );

    return result;
  }

  /**
   * AI-Native Route Extraction and OpenAPI Generation
   */
  private async analyzeRoutesWithAI(
    fileContents: string,
    files: FileInfo[],
  ): Promise<{
    routes: ExtractedBackendRoute[];
    openAPI: object;
    authPatterns: { type: AuthType; details: string; files: string[] }[];
    validationSchemas: { library: ValidationLibrary; schemas: { name: string; file: string }[] };
  }> {
    const filePaths = files.map((f) => f.path).join(', ');
    this.logger.debug(`Analyzing routes from files: ${filePaths}`);

    const systemPrompt = `You are an expert backend code analyst. Your job is to analyze backend code and extract:
1. All API routes/endpoints with their HTTP methods, paths, controllers, and auth requirements
2. Generate a valid OpenAPI 3.0 specification from the routes
3. Identify authentication patterns (JWT, session, OAuth, API keys)
4. Extract validation schemas (Zod, class-validator, Joi, Yup)

Be thorough and accurate. Extract every route you can find from decorators, router definitions, or route registrations.

Return ONLY valid JSON, no markdown code blocks.`;

    const userPrompt = `Analyze this backend code and extract all routes, authentication patterns, and validation schemas:

${fileContents}

Return a JSON object with this structure:
{
  "routes": [
    {
      "method": "GET|POST|PUT|PATCH|DELETE",
      "path": "/api/...",
      "controllerFile": "path/to/file.ts",
      "controllerMethod": "methodName",
      "hasAuth": true/false,
      "authGuards": ["JwtAuthGuard"],
      "requestDto": "CreateUserDto or null",
      "responseDto": "UserResponse or null"
    }
  ],
  "openAPI": {
    "openapi": "3.0.0",
    "info": { "title": "Extracted API", "version": "1.0.0" },
    "paths": { ... }
  },
  "authPatterns": [
    {
      "type": "jwt|session|oauth|api-key|basic|none",
      "details": "Description of the auth implementation",
      "files": ["path/to/auth/file.ts"]
    }
  ],
  "validationSchemas": {
    "library": "zod|class-validator|joi|yup|none",
    "schemas": [
      { "name": "CreateUserDto", "file": "path/to/dto.ts" }
    ]
  }
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const result = JSON.parse(textBlock.text.trim());
      return {
        routes: result.routes || [],
        openAPI: result.openAPI || {},
        authPatterns: result.authPatterns || [],
        validationSchemas: result.validationSchemas || { library: 'none', schemas: [] },
      };
    } catch (error) {
      this.logger.error('Route analysis failed', error);
      return {
        routes: [],
        openAPI: {},
        authPatterns: [],
        validationSchemas: { library: 'none', schemas: [] },
      };
    }
  }

  /**
   * AI-Native Schema Extraction (ORM → Prisma format)
   */
  private async analyzeSchemaWithAI(
    fileContents: string,
    files: FileInfo[],
  ): Promise<{ prismaSchema?: string }> {
    // Find schema files
    const schemaFiles = files.filter(
      (f) =>
        f.path.includes('schema.prisma') ||
        f.path.includes('.entity.ts') ||
        f.path.includes('/models/') ||
        f.path.includes('/entities/'),
    );

    if (schemaFiles.length === 0) {
      return {};
    }

    const systemPrompt = `You are an expert database schema analyst. Your job is to:
1. Detect the ORM being used (Prisma, TypeORM, Sequelize, Drizzle, SQLAlchemy, Mongoose)
2. If Prisma schema exists, return it as-is
3. If another ORM is used, convert the schema to Prisma format

Return ONLY valid JSON, no markdown code blocks.`;

    const schemaContent = schemaFiles
      .map((f) => `=== ${f.path} ===\n${f.content || '(no content)'}`)
      .join('\n\n');

    const userPrompt = `Analyze these schema/model files and extract or convert to Prisma schema:

${schemaContent}

Return a JSON object:
{
  "detectedORM": "prisma|typeorm|sequelize|drizzle|sqlalchemy|mongoose",
  "prismaSchema": "// Prisma schema content here...",
  "models": [
    { "name": "User", "fields": ["id", "email", "name"] }
  ]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const result = JSON.parse(textBlock.text.trim());
      return { prismaSchema: result.prismaSchema };
    } catch (error) {
      this.logger.error('Schema analysis failed', error);
      return {};
    }
  }

  /**
   * AI-Native Security Analysis
   */
  private async analyzeSecurityWithAI(
    fileContents: string,
    files: FileInfo[],
  ): Promise<{ issues: SecurityIssue[] }> {
    const filePaths = files.map((f) => f.path).join(', ');
    this.logger.debug(`Analyzing security for files: ${filePaths}`);

    const systemPrompt = `You are an expert application security analyst. Your job is to analyze backend code and identify security vulnerabilities:

CATEGORIES TO CHECK:
- SQL Injection: Raw queries without parameterization
- Auth Bypass: Unprotected routes, missing guards
- Secrets Exposure: Hardcoded API keys, passwords, tokens
- CORS Issues: Overly permissive origins
- XSS: Server-side rendering without escaping
- Dependency Issues: Known vulnerable patterns
- Input Validation: Missing or weak validation
- Access Control: Missing authorization checks

SEVERITY LEVELS:
- critical: Exploitable with severe impact (data breach, RCE)
- high: Exploitable with significant impact
- medium: Exploitable with moderate impact
- low: Potential issue with limited impact
- info: Informational finding

Be thorough but avoid false positives. Only report real security issues.

Return ONLY valid JSON, no markdown code blocks.`;

    const userPrompt = `Perform a security analysis of this backend code:

${fileContents}

Return a JSON object:
{
  "issues": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "sql-injection|auth-bypass|secrets-exposure|dependency|cors|xss|other",
      "title": "Brief title",
      "description": "Detailed description of the issue",
      "file": "path/to/file.ts",
      "line": 42,
      "recommendation": "How to fix this issue"
    }
  ],
  "summary": {
    "criticalCount": 0,
    "highCount": 0,
    "mediumCount": 0,
    "lowCount": 0,
    "infoCount": 0
  }
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const result = JSON.parse(textBlock.text.trim());
      return { issues: result.issues || [] };
    } catch (error) {
      this.logger.error('Security analysis failed', error);
      return { issues: [] };
    }
  }

  /**
   * AI-Native Quality Metrics Analysis
   */
  private async analyzeQualityWithAI(
    fileContents: string,
    files: FileInfo[],
  ): Promise<{ metrics: QualityMetrics; dependencies: DependencyAnalysis }> {
    // Extract package.json for dependency analysis
    const packageJson = files.find((f) => f.path.endsWith('package.json'));
    const packageContent = packageJson?.content || '';

    const systemPrompt = `You are an expert code quality analyst. Your job is to analyze code and provide quality metrics:

METRICS TO ASSESS:
- Type coverage: Percentage of typed vs any/unknown in TypeScript
- Code complexity: Estimate average cyclomatic complexity
- Duplicate code: Estimate percentage of duplicate patterns
- Lint-worthy issues: Count potential ESLint/TSLint violations
- Test coverage hints: Look for test files, estimate coverage

For dependencies, analyze package.json for:
- Total count
- Known outdated/deprecated packages
- Known vulnerable packages (common CVEs)

Be realistic in your estimates based on the code patterns you see.

Return ONLY valid JSON, no markdown code blocks.`;

    const userPrompt = `Analyze this code for quality metrics:

${fileContents}

Package.json:
${packageContent}

Return a JSON object:
{
  "metrics": {
    "testCoverage": 0-100 or null,
    "typeCoverage": 0-100 or null,
    "codeComplexity": number (average),
    "duplicateCodePercent": 0-100,
    "lintErrors": number,
    "lintWarnings": number
  },
  "dependencies": {
    "totalDependencies": number,
    "outdatedCount": number,
    "vulnerableCount": number,
    "deprecatedCount": number,
    "outdatedPackages": [{ "name": "pkg", "current": "1.0.0", "latest": "2.0.0" }],
    "vulnerablePackages": [{ "name": "pkg", "severity": "high", "advisory": "CVE-..." }]
  }
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const result = JSON.parse(textBlock.text.trim());
      return {
        metrics: result.metrics || this.createEmptyMetrics(),
        dependencies: result.dependencies || this.createEmptyDependencies(),
      };
    } catch (error) {
      this.logger.error('Quality analysis failed', error);
      return {
        metrics: this.createEmptyMetrics(),
        dependencies: this.createEmptyDependencies(),
      };
    }
  }

  /**
   * Prepare file contents for Claude, respecting token limits
   */
  private prepareFileContents(files: FileInfo[]): string {
    let contents = '';
    const maxTotalLength = 80000; // Leave room for response
    let currentLength = 0;

    // Prioritize important files
    const priorityOrder = [
      'controller',
      'service',
      'module',
      'route',
      'auth',
      'guard',
      'dto',
      'entity',
      'model',
      'schema',
      'middleware',
    ];

    const sortedFiles = [...files].sort((a, b) => {
      const aScore = priorityOrder.findIndex((p) => a.path.toLowerCase().includes(p));
      const bScore = priorityOrder.findIndex((p) => b.path.toLowerCase().includes(p));
      return (aScore === -1 ? 999 : aScore) - (bScore === -1 ? 999 : bScore);
    });

    for (const file of sortedFiles) {
      if (!file.content) continue;

      const fileSection = `\n=== ${file.path} ===\n${file.content}\n`;
      if (currentLength + fileSection.length > maxTotalLength) {
        // Truncate or skip
        const remaining = maxTotalLength - currentLength;
        if (remaining > 500) {
          contents += `\n=== ${file.path} (truncated) ===\n${file.content.substring(0, remaining - 100)}\n... (truncated)\n`;
        }
        break;
      }

      contents += fileSection;
      currentLength += fileSection.length;
    }

    return contents;
  }

  /**
   * Check if file is backend-related
   */
  private isBackendFile(path: string): boolean {
    const lowerPath = path.toLowerCase();

    // Include patterns
    const includePatterns = [
      '.ts',
      '.js',
      '.py',
      '.go',
      '.java',
      '.rs',
      'package.json',
      'schema.prisma',
      'requirements.txt',
      'pyproject.toml',
      'go.mod',
      'Cargo.toml',
    ];

    // Exclude patterns (UI files)
    const excludePatterns = [
      '.tsx',
      '.jsx',
      '.vue',
      '.svelte',
      '/components/',
      '/pages/',
      '/app/',
      'tailwind',
      '.css',
      '.scss',
    ];

    const isIncluded = includePatterns.some((p) => lowerPath.includes(p));
    const isExcluded = excludePatterns.some((p) => lowerPath.includes(p));

    // Special case: .ts files that look like backend
    if (lowerPath.endsWith('.ts') && !lowerPath.endsWith('.tsx')) {
      const backendIndicators = [
        'controller',
        'service',
        'module',
        'guard',
        'middleware',
        'entity',
        'dto',
        'repository',
        'resolver',
        'gateway',
        'interceptor',
        'filter',
        'pipe',
        'decorator',
      ];
      return backendIndicators.some((i) => lowerPath.includes(i)) || !isExcluded;
    }

    return isIncluded && !isExcluded;
  }

  private createEmptyResult(): BackendAnalysisResult {
    return {
      extractedRoutes: [],
      authPatterns: [],
      validationSchemas: { library: 'none', schemas: [] },
      securityIssues: [],
      qualityMetrics: this.createEmptyMetrics(),
      dependencyAnalysis: this.createEmptyDependencies(),
    };
  }

  private createEmptyMetrics(): QualityMetrics {
    return {
      lintErrors: 0,
      lintWarnings: 0,
    };
  }

  private createEmptyDependencies(): DependencyAnalysis {
    return {
      totalDependencies: 0,
      outdatedCount: 0,
      vulnerableCount: 0,
      deprecatedCount: 0,
      outdatedPackages: [],
      vulnerablePackages: [],
    };
  }
}
