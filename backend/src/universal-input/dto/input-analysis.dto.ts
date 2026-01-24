/**
 * DTOs for Universal Input Handler - Analysis Results
 */

// Framework detection results
export type UIFramework = 'react' | 'vue' | 'angular' | 'svelte' | 'html' | 'nextjs' | 'unknown';
export type BackendFramework =
  | 'nestjs'
  | 'express'
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'hono'
  | 'elysia'
  | 'unknown';
export type ORMType =
  | 'prisma'
  | 'typeorm'
  | 'sequelize'
  | 'drizzle'
  | 'sqlalchemy'
  | 'mongoose'
  | 'none'
  | 'unknown';
export type AuthType = 'jwt' | 'session' | 'oauth' | 'api-key' | 'basic' | 'none' | 'unknown';
export type ValidationLibrary = 'zod' | 'class-validator' | 'joi' | 'yup' | 'none' | 'unknown';

// Completeness classification
export type CompletenessLevel =
  | 'prompt-only' // No files, just text description
  | 'ui-only' // Frontend code/mockups only
  | 'backend-only' // Backend code only
  | 'full-stack' // Both frontend and backend
  | 'contracts-only' // OpenAPI/Prisma specs without implementation
  | 'docs-only'; // PRD/Architecture docs without code

// Detected artifact types
export interface DetectedArtifacts {
  // Documentation
  hasPRD: boolean;
  prdFiles: string[];
  hasArchitectureDoc: boolean;
  architectureFiles: string[];
  hasReadme: boolean;

  // Contracts/Specs
  hasOpenAPI: boolean;
  openAPIFiles: string[];
  hasPrismaSchema: boolean;
  prismaSchemaPath?: string;
  hasGraphQLSchema: boolean;
  graphQLFiles: string[];

  // UI Assets
  hasUICode: boolean;
  uiCodePaths: string[];
  hasDesignMockups: boolean;
  mockupFiles: string[];
  hasFigmaLinks: boolean;

  // Backend Assets
  hasBackendCode: boolean;
  backendCodePaths: string[];
  hasControllers: boolean;
  hasServices: boolean;
  hasModels: boolean;

  // Testing & CI
  hasTests: boolean;
  testFiles: string[];
  hasCI: boolean;
  ciFiles: string[];
  hasDockerfile: boolean;
}

// Classification result from Phase 0
export interface InputClassification {
  completeness: CompletenessLevel;

  // Framework detection
  uiFramework?: UIFramework;
  uiFrameworkVersion?: string;
  backendFramework?: BackendFramework;
  backendFrameworkVersion?: string;

  // ORM and database
  orm?: ORMType;
  databaseType?: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb' | 'unknown';

  // Auth and validation
  authType?: AuthType;
  validationLibrary?: ValidationLibrary;

  // Package managers
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun';

  // Detected artifacts
  artifacts: DetectedArtifacts;

  // File stats
  totalFiles: number;
  codeFiles: number;
  configFiles: number;
  docFiles: number;
  assetFiles: number;

  // Confidence score (0-1)
  confidence: number;
}

// Extracted API endpoint from UI code
export interface ExtractedAPIEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  sourceFile: string;
  sourceLine: number;
  inferredRequestType?: string;
  inferredResponseType?: string;
  isAuthenticated?: boolean;
}

// Extracted route from backend code
export interface ExtractedBackendRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  controllerFile: string;
  controllerMethod: string;
  hasAuth: boolean;
  authGuards: string[];
  requestDto?: string;
  responseDto?: string;
}

// Security issue found during analysis
export interface SecurityIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category:
    | 'sql-injection'
    | 'auth-bypass'
    | 'secrets-exposure'
    | 'dependency'
    | 'cors'
    | 'xss'
    | 'other';
  title: string;
  description: string;
  file?: string;
  line?: number;
  recommendation: string;
}

// Quality metrics from analysis
export interface QualityMetrics {
  testCoverage?: number; // 0-100%
  typeCoverage?: number; // 0-100% (for TypeScript)
  codeComplexity?: number; // Average cyclomatic complexity
  duplicateCodePercent?: number;
  lintErrors: number;
  lintWarnings: number;
}

// Dependency analysis result
export interface DependencyAnalysis {
  totalDependencies: number;
  outdatedCount: number;
  vulnerableCount: number;
  deprecatedCount: number;
  outdatedPackages: { name: string; current: string; latest: string }[];
  vulnerablePackages: { name: string; severity: string; advisory: string }[];
}

// Full analysis result from Phase 2
export interface InputAnalysisResult {
  // Classification from Phase 0
  classification: InputClassification;

  // UI Analysis (Phase 2A)
  uiAnalysis?: {
    extractedEndpoints: ExtractedAPIEndpoint[];
    stateManagement?: 'redux' | 'zustand' | 'context' | 'mobx' | 'recoil' | 'jotai' | 'none';
    routingLibrary?: 'react-router' | 'next-router' | 'vue-router' | 'tanstack-router' | 'none';
    stylingApproach?:
      | 'tailwind'
      | 'css-modules'
      | 'styled-components'
      | 'emotion'
      | 'sass'
      | 'plain-css';
    componentCount: number;
    pageCount: number;
  };

  // Backend Analysis (Phase 2B)
  backendAnalysis?: {
    extractedRoutes: ExtractedBackendRoute[];
    extractedSchema?: string; // Prisma schema content
    generatedOpenAPI?: object; // Generated OpenAPI spec
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
  };

  // Cross-Analysis (Phase 2C) - only for full-stack
  crossAnalysis?: {
    missingBackendEndpoints: ExtractedAPIEndpoint[]; // UI needs, backend lacks
    unusedBackendEndpoints: ExtractedBackendRoute[]; // Backend has, UI ignores
    typeMismatches: {
      endpoint: string;
      uiExpects: string;
      backendProvides: string;
      file: string;
    }[];
    authMisalignments: {
      endpoint: string;
      uiExpectsAuth: boolean;
      backendHasAuth: boolean;
    }[];
  };

  // Timestamps
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

// Request DTO for starting analysis
export class StartAnalysisDto {
  sessionId: string;
  assetIds?: string[]; // Optional - analyze specific assets
  includeSecurityScan?: boolean;
  includeQualityMetrics?: boolean;
}

// Response DTO for analysis status
export class AnalysisStatusDto {
  sessionId: string;
  status:
    | 'pending'
    | 'classifying'
    | 'analyzing-ui'
    | 'analyzing-backend'
    | 'cross-analyzing'
    | 'complete'
    | 'failed';
  progress: number; // 0-100
  currentPhase: string;
  classification?: InputClassification;
  result?: InputAnalysisResult;
  error?: string;
}
