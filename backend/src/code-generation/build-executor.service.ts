import { Injectable, Logger } from '@nestjs/common';
import { FileSystemService } from './filesystem.service';

export interface BuildResult {
  success: boolean;
  output: string;
  errors: string[];
  warnings: string[];
  duration: number; // milliseconds
}

export interface TestResult extends BuildResult {
  testsPassed: number;
  testsFailed: number;
  testsTotal: number;
  coverage?: {
    lines: number;
    statements: number;
    functions: number;
    branches: number;
  };
}

export interface LintResult extends BuildResult {
  errorCount: number;
  warningCount: number;
  fixableErrors: number;
  fixableWarnings: number;
}

export interface SecurityScanResult extends BuildResult {
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
  };
  totalVulnerabilities: number;
}

export interface FullstackValidationResult {
  isFullstack: boolean;
  frontend?: BuildResult;
  backend?: BuildResult;
  overallSuccess: boolean;
  errors: string[];
}

/**
 * BuildExecutorService - Execute build, test, and validation commands
 *
 * Purpose:
 * - Run npm install/build/test/lint
 * - Parse command outputs for results
 * - Generate proof artifacts
 * - Validate code quality gates
 *
 * Use Cases:
 * 1. G3 (Architecture): Validate specs compile (tsc --noEmit)
 * 2. G5 (Development): Run build, ensure no errors
 * 3. G6 (Testing): Run tests, check coverage >80%
 * 4. G7 (Security): Run npm audit, check for vulnerabilities
 */
@Injectable()
export class BuildExecutorService {
  private readonly logger = new Logger(BuildExecutorService.name);

  constructor(private readonly filesystem: FileSystemService) {}

  /**
   * Detect if this is a fullstack project with separate frontend/backend folders
   */
  async detectProjectStructure(
    projectId: string,
  ): Promise<{ isFullstack: boolean; hasFrontend: boolean; hasBackend: boolean }> {
    const hasFrontend = await this.filesystem.fileExists(projectId, 'frontend/package.json');
    const hasBackend = await this.filesystem.fileExists(projectId, 'backend/package.json');

    return {
      isFullstack: hasFrontend && hasBackend,
      hasFrontend,
      hasBackend,
    };
  }

  /**
   * Validate a fullstack project - BOTH frontend AND backend must build successfully
   * This is the primary validation method for G5 (Development gate)
   */
  async validateFullstackProject(projectId: string): Promise<FullstackValidationResult> {
    this.logger.log(`Validating fullstack project ${projectId}`);

    const structure = await this.detectProjectStructure(projectId);

    if (!structure.isFullstack) {
      // Not a fullstack project, use standard validation
      this.logger.log('Not a fullstack project, using standard validation');
      return {
        isFullstack: false,
        overallSuccess: true,
        errors: [],
      };
    }

    this.logger.log('Detected fullstack project - validating both frontend and backend');
    const errors: string[] = [];

    // Validate frontend
    const frontendResult = await this.validateSubproject(projectId, 'frontend');
    if (!frontendResult.success) {
      errors.push(`Frontend build failed: ${frontendResult.errors.join(', ')}`);
    }

    // Validate backend
    const backendResult = await this.validateSubproject(projectId, 'backend');
    if (!backendResult.success) {
      errors.push(`Backend build failed: ${backendResult.errors.join(', ')}`);
    }

    const overallSuccess = frontendResult.success && backendResult.success;

    if (!overallSuccess) {
      this.logger.error(`Fullstack validation FAILED: ${errors.join('; ')}`);
    } else {
      this.logger.log('Fullstack validation PASSED - both frontend and backend build successfully');
    }

    return {
      isFullstack: true,
      frontend: frontendResult,
      backend: backendResult,
      overallSuccess,
      errors,
    };
  }

  /**
   * Validate a subproject (frontend/ or backend/)
   */
  private async validateSubproject(projectId: string, subfolder: string): Promise<BuildResult> {
    this.logger.log(`Validating subproject: ${subfolder}`);
    const startTime = Date.now();

    // Install dependencies
    const installResult = await this.filesystem.executeCommand(
      projectId,
      `cd ${subfolder} && npm install`,
      { timeout: 300000 },
    );

    if (!installResult.success) {
      return {
        success: false,
        output: installResult.stdout,
        errors: [`npm install failed in ${subfolder}: ${installResult.stderr}`],
        warnings: [],
        duration: Date.now() - startTime,
      };
    }

    // Check if build script exists
    try {
      const packageJson = await this.filesystem.readFile(projectId, `${subfolder}/package.json`);
      const pkg = JSON.parse(packageJson);

      if (!pkg.scripts?.build && !pkg.scripts?.dev) {
        return {
          success: false,
          output: '',
          errors: [`No build or dev script found in ${subfolder}/package.json`],
          warnings: [],
          duration: Date.now() - startTime,
        };
      }

      // Run build (prefer build over dev for validation)
      const buildScript = pkg.scripts?.build ? 'build' : 'dev';
      const buildResult = await this.filesystem.executeCommand(
        projectId,
        `cd ${subfolder} && npm run ${buildScript}`,
        { timeout: 300000 },
      );

      const errors = this.parseBuildErrors(buildResult.stdout + buildResult.stderr);

      return {
        success: buildResult.success && errors.length === 0,
        output: buildResult.stdout,
        errors:
          errors.length > 0 ? errors : buildResult.success ? [] : [`Build failed in ${subfolder}`],
        warnings: this.parseWarnings(buildResult.stdout + buildResult.stderr),
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        errors: [`Failed to read ${subfolder}/package.json: ${error}`],
        warnings: [],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Install dependencies (npm install)
   */
  async installDependencies(projectId: string): Promise<BuildResult> {
    this.logger.log(`Installing dependencies for project ${projectId}`);
    const startTime = Date.now();

    const result = await this.filesystem.executeCommand(
      projectId,
      'npm install',
      { timeout: 300000 }, // 5 minutes
    );

    const duration = Date.now() - startTime;

    return {
      success: result.success,
      output: result.stdout,
      errors: this.parseErrors(result.stderr),
      warnings: this.parseWarnings(result.stderr),
      duration,
    };
  }

  /**
   * Run build command
   */
  async runBuild(projectId: string): Promise<BuildResult> {
    this.logger.log(`Running build for project ${projectId}`);
    const startTime = Date.now();

    // Check if package.json has build script
    const hasBuildScript = await this.hasBuildScript(projectId);

    if (!hasBuildScript) {
      return {
        success: true,
        output: 'No build script found, skipping build',
        errors: [],
        warnings: [],
        duration: 0,
      };
    }

    const result = await this.filesystem.executeCommand(
      projectId,
      'npm run build',
      { timeout: 300000 }, // 5 minutes
    );

    const duration = Date.now() - startTime;
    const errors = this.parseBuildErrors(result.stdout + result.stderr);

    return {
      success: result.success && errors.length === 0,
      output: result.stdout,
      errors,
      warnings: this.parseWarnings(result.stdout + result.stderr),
      duration,
    };
  }

  /**
   * Run TypeScript compiler without emitting (validation only)
   */
  async runTypeCheck(projectId: string): Promise<BuildResult> {
    this.logger.log(`Running type check for project ${projectId}`);
    const startTime = Date.now();

    const result = await this.filesystem.executeCommand(
      projectId,
      'npx tsc --noEmit',
      { timeout: 120000 }, // 2 minutes
    );

    const duration = Date.now() - startTime;
    const errors = this.parseTypeScriptErrors(result.stdout + result.stderr);

    return {
      success: result.success && errors.length === 0,
      output: result.stdout,
      errors,
      warnings: [],
      duration,
    };
  }

  /**
   * Run tests with coverage
   */
  async runTests(projectId: string): Promise<TestResult> {
    this.logger.log(`Running tests for project ${projectId}`);
    const startTime = Date.now();

    // Check if package.json has test script
    const hasTestScript = await this.hasTestScript(projectId);

    if (!hasTestScript) {
      return {
        success: true,
        output: 'No test script found, skipping tests',
        errors: [],
        warnings: [],
        duration: 0,
        testsPassed: 0,
        testsFailed: 0,
        testsTotal: 0,
      };
    }

    const result = await this.filesystem.executeCommand(
      projectId,
      'npm test -- --coverage --json --outputFile=test-results.json',
      { timeout: 300000 }, // 5 minutes
    );

    const duration = Date.now() - startTime;

    // Parse test results
    const testStats = await this.parseTestResults(projectId, result.stdout);
    const coverage = await this.parseCoverageReport(projectId);

    return {
      success: result.success && testStats.failed === 0,
      output: result.stdout,
      errors: testStats.failed > 0 ? [`${testStats.failed} tests failed`] : [],
      warnings: [],
      duration,
      testsPassed: testStats.passed,
      testsFailed: testStats.failed,
      testsTotal: testStats.total,
      coverage,
    };
  }

  /**
   * Run linter
   */
  async runLint(projectId: string): Promise<LintResult> {
    this.logger.log(`Running linter for project ${projectId}`);
    const startTime = Date.now();

    const result = await this.filesystem.executeCommand(
      projectId,
      'npm run lint',
      { timeout: 120000 }, // 2 minutes
    );

    const duration = Date.now() - startTime;
    const lintStats = this.parseLintOutput(result.stdout + result.stderr);

    return {
      success: result.success && lintStats.errorCount === 0,
      output: result.stdout,
      errors: lintStats.errors,
      warnings: lintStats.warnings,
      duration,
      errorCount: lintStats.errorCount,
      warningCount: lintStats.warningCount,
      fixableErrors: lintStats.fixableErrors,
      fixableWarnings: lintStats.fixableWarnings,
    };
  }

  /**
   * Run security audit
   */
  async runSecurityScan(projectId: string): Promise<SecurityScanResult> {
    this.logger.log(`Running security scan for project ${projectId}`);
    const startTime = Date.now();

    const result = await this.filesystem.executeCommand(
      projectId,
      'npm audit --json',
      { timeout: 120000 }, // 2 minutes
    );

    const duration = Date.now() - startTime;
    const vulnerabilities = await this.parseSecurityScan(projectId, result.stdout);

    return {
      success: vulnerabilities.critical === 0 && vulnerabilities.high === 0,
      output: result.stdout,
      errors:
        vulnerabilities.critical > 0
          ? [`${vulnerabilities.critical} critical vulnerabilities found`]
          : [],
      warnings:
        vulnerabilities.high > 0 ? [`${vulnerabilities.high} high vulnerabilities found`] : [],
      duration,
      vulnerabilities,
      totalVulnerabilities:
        vulnerabilities.critical +
        vulnerabilities.high +
        vulnerabilities.moderate +
        vulnerabilities.low,
    };
  }

  /**
   * Run full validation pipeline
   */
  async runFullValidation(projectId: string): Promise<{
    install: BuildResult;
    typeCheck: BuildResult;
    build: BuildResult;
    tests: TestResult;
    lint: LintResult;
    security: SecurityScanResult;
    overallSuccess: boolean;
  }> {
    this.logger.log(`Running full validation pipeline for project ${projectId}`);

    const install = await this.installDependencies(projectId);
    if (!install.success) {
      // If install fails, can't continue
      return {
        install,
        typeCheck: this.createFailedResult('Skipped (install failed)'),
        build: this.createFailedResult('Skipped (install failed)'),
        tests: this.createFailedTestResult('Skipped (install failed)'),
        lint: this.createFailedLintResult('Skipped (install failed)'),
        security: this.createFailedSecurityResult('Skipped (install failed)'),
        overallSuccess: false,
      };
    }

    // Run validations in parallel
    const [typeCheck, build, tests, lint, security] = await Promise.all([
      this.runTypeCheck(projectId),
      this.runBuild(projectId),
      this.runTests(projectId),
      this.runLint(projectId),
      this.runSecurityScan(projectId),
    ]);

    const overallSuccess =
      install.success &&
      typeCheck.success &&
      build.success &&
      tests.success &&
      lint.success &&
      security.success;

    return {
      install,
      typeCheck,
      build,
      tests,
      lint,
      security,
      overallSuccess,
    };
  }

  // ==================== Private Helper Methods ====================

  private async hasBuildScript(projectId: string): Promise<boolean> {
    return this.hasScript(projectId, 'build');
  }

  private async hasTestScript(projectId: string): Promise<boolean> {
    return this.hasScript(projectId, 'test');
  }

  private async hasScript(projectId: string, scriptName: string): Promise<boolean> {
    try {
      const packageJson = await this.filesystem.readFile(projectId, 'package.json');
      const pkg = JSON.parse(packageJson);
      return !!pkg.scripts?.[scriptName];
    } catch {
      return false;
    }
  }

  private parseErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('ERR!') || line.includes('error') || line.includes('Error')) {
        errors.push(line.trim());
      }
    }

    return errors;
  }

  private parseWarnings(output: string): string[] {
    const warnings: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('WARN') || line.includes('warning')) {
        warnings.push(line.trim());
      }
    }

    return warnings;
  }

  private parseBuildErrors(output: string): string[] {
    const errors: string[] = [];

    // TypeScript errors
    const tsErrors = output.match(/error TS\d+:.*$/gm);
    if (tsErrors) {
      errors.push(...tsErrors);
    }

    // Generic build errors
    const buildErrors = output.match(/^ERROR.*$/gm);
    if (buildErrors) {
      errors.push(...buildErrors);
    }

    // Vite/Rollup import resolution errors
    const viteErrors = output.match(/\[vite\]:.*failed to resolve import.*$/gim);
    if (viteErrors) {
      errors.push(...viteErrors);
    }

    // Rollup errors
    const rollupErrors = output.match(/Rollup failed.*$/gm);
    if (rollupErrors) {
      errors.push(...rollupErrors);
    }

    // "error during build" messages
    const buildFailures = output.match(/error during build:.*$/gim);
    if (buildFailures) {
      errors.push(...buildFailures);
    }

    // Module not found errors
    const moduleErrors = output.match(/Module not found:.*$/gm);
    if (moduleErrors) {
      errors.push(...moduleErrors);
    }

    // Cannot find module errors
    const cannotFindModule = output.match(/Cannot find module.*$/gm);
    if (cannotFindModule) {
      errors.push(...cannotFindModule);
    }

    return errors;
  }

  private parseTypeScriptErrors(output: string): string[] {
    const errors: string[] = [];
    const tsErrors = output.match(/.*\(\d+,\d+\): error TS\d+:.*$/gm);

    if (tsErrors) {
      errors.push(...tsErrors);
    }

    return errors;
  }

  private async parseTestResults(
    projectId: string,
    output: string,
  ): Promise<{ passed: number; failed: number; total: number }> {
    // Try to read test-results.json if it exists
    try {
      const resultsPath = 'test-results.json';
      if (await this.filesystem.fileExists(projectId, resultsPath)) {
        const results = await this.filesystem.readFile(projectId, resultsPath);
        const json = JSON.parse(results);

        return {
          passed: json.numPassedTests || 0,
          failed: json.numFailedTests || 0,
          total: json.numTotalTests || 0,
        };
      }
    } catch (error) {
      this.logger.warn('Could not parse test results JSON');
    }

    // Fallback: Parse from output
    const passMatch = output.match(/(\d+) passing/);
    const failMatch = output.match(/(\d+) failing/);

    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;

    return { passed, failed, total: passed + failed };
  }

  private async parseCoverageReport(projectId: string): Promise<
    | {
        lines: number;
        statements: number;
        functions: number;
        branches: number;
      }
    | undefined
  > {
    try {
      const coveragePath = 'coverage/coverage-summary.json';
      if (await this.filesystem.fileExists(projectId, coveragePath)) {
        const coverage = await this.filesystem.readFile(projectId, coveragePath);
        const json = JSON.parse(coverage);
        const total = json.total;

        return {
          lines: total.lines.pct,
          statements: total.statements.pct,
          functions: total.functions.pct,
          branches: total.branches.pct,
        };
      }
    } catch (error) {
      this.logger.warn('Could not parse coverage report');
    }

    return undefined;
  }

  private parseLintOutput(output: string): {
    errors: string[];
    warnings: string[];
    errorCount: number;
    warningCount: number;
    fixableErrors: number;
    fixableWarnings: number;
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const lines = output.split('\n');

    for (const line of lines) {
      if (line.includes('error')) {
        errors.push(line.trim());
      } else if (line.includes('warning')) {
        warnings.push(line.trim());
      }
    }

    // Parse summary line (e.g., "5 errors, 3 warnings")
    const summaryMatch = output.match(/(\d+) errors?, (\d+) warnings?/);
    const errorCount = summaryMatch ? parseInt(summaryMatch[1]) : errors.length;
    const warningCount = summaryMatch ? parseInt(summaryMatch[2]) : warnings.length;

    // Parse fixable counts
    const fixableMatch = output.match(/(\d+) errors? and (\d+) warnings? potentially fixable/);
    const fixableErrors = fixableMatch ? parseInt(fixableMatch[1]) : 0;
    const fixableWarnings = fixableMatch ? parseInt(fixableMatch[2]) : 0;

    return {
      errors,
      warnings,
      errorCount,
      warningCount,
      fixableErrors,
      fixableWarnings,
    };
  }

  private async parseSecurityScan(
    projectId: string,
    output: string,
  ): Promise<{
    critical: number;
    high: number;
    moderate: number;
    low: number;
  }> {
    try {
      const json = JSON.parse(output);

      return {
        critical: json.metadata?.vulnerabilities?.critical || 0,
        high: json.metadata?.vulnerabilities?.high || 0,
        moderate: json.metadata?.vulnerabilities?.moderate || 0,
        low: json.metadata?.vulnerabilities?.low || 0,
      };
    } catch {
      return { critical: 0, high: 0, moderate: 0, low: 0 };
    }
  }

  private createFailedResult(message: string): BuildResult {
    return {
      success: false,
      output: message,
      errors: [message],
      warnings: [],
      duration: 0,
    };
  }

  private createFailedTestResult(message: string): TestResult {
    return {
      ...this.createFailedResult(message),
      testsPassed: 0,
      testsFailed: 0,
      testsTotal: 0,
    };
  }

  private createFailedLintResult(message: string): LintResult {
    return {
      ...this.createFailedResult(message),
      errorCount: 0,
      warningCount: 0,
      fixableErrors: 0,
      fixableWarnings: 0,
    };
  }

  private createFailedSecurityResult(message: string): SecurityScanResult {
    return {
      ...this.createFailedResult(message),
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0 },
      totalVulnerabilities: 0,
    };
  }
}
