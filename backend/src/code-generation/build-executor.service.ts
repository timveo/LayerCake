import { Injectable, Logger } from '@nestjs/common';
import { FileSystemService } from './filesystem.service';
import { PreviewServerService } from './preview-server.service';

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

  constructor(
    private readonly filesystem: FileSystemService,
    private readonly previewServer: PreviewServerService,
  ) {}

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
   * Run tests with coverage (G6 Testing gate - unit tests)
   * Requires actual test execution - fails if no test script or no tests found.
   */
  async runTests(projectId: string): Promise<TestResult> {
    this.logger.log(`Running unit tests for project ${projectId}`);
    const startTime = Date.now();

    // Check if package.json has test script
    const hasTestScript = await this.hasTestScript(projectId);

    if (!hasTestScript) {
      // For G6 validation, no test script means tests cannot run - this is a failure
      this.logger.warn(`No test script found for project ${projectId}`);
      return {
        success: false,
        output: 'No test script found in package.json',
        errors: [
          'No test script configured - unit tests cannot run',
          'Add a "test" script to package.json (e.g., "test": "jest" or "test": "vitest")',
        ],
        warnings: [],
        duration: 0,
        testsPassed: 0,
        testsFailed: 0,
        testsTotal: 0,
      };
    }

    // Execute actual tests
    this.logger.log(`Executing npm test for project ${projectId}...`);
    const result = await this.filesystem.executeCommand(
      projectId,
      'npm test -- --coverage --json --outputFile=test-results.json',
      { timeout: 300000 }, // 5 minutes
    );

    const duration = Date.now() - startTime;

    // Parse test results
    const testStats = await this.parseTestResults(projectId, result.stdout);
    const coverage = await this.parseCoverageReport(projectId);

    // If command succeeded but no tests were found/run, that's also a failure
    if (result.success && testStats.total === 0) {
      this.logger.warn(`No unit tests found for project ${projectId}`);
      return {
        success: false,
        output: result.stdout || 'No tests executed',
        errors: ['No unit tests found - add test files to your project'],
        warnings: [],
        duration,
        testsPassed: 0,
        testsFailed: 0,
        testsTotal: 0,
        coverage,
      };
    }

    this.logger.log(
      `Unit test execution complete: ${testStats.passed} passed, ${testStats.failed} failed, ${testStats.total} total`,
    );

    return {
      success: result.success && testStats.failed === 0,
      output: result.stdout,
      errors: testStats.failed > 0 ? [`${testStats.failed} unit tests failed`] : [],
      warnings: [],
      duration,
      testsPassed: testStats.passed,
      testsFailed: testStats.failed,
      testsTotal: testStats.total,
      coverage,
    };
  }

  /**
   * Run E2E tests with Playwright (G6 Testing gate)
   * Requires a running preview server - executes actual tests against the preview.
   */
  async runE2ETests(projectId: string): Promise<TestResult> {
    this.logger.log(`Running E2E tests for project ${projectId}`);
    const startTime = Date.now();

    // Step 1: Check if preview server is running (try in-memory first, then health check)
    let previewUrl: string | null = null;
    const previewStatus = this.previewServer.getServerStatus(projectId);

    if (previewStatus && previewStatus.status === 'running') {
      previewUrl = previewStatus.url;
      this.logger.log(`Preview server found in memory at ${previewUrl}`);
    } else {
      // Preview not in memory - try to check if it's running on expected ports
      // This handles cases where backend restarted but preview is still running
      const basePort = 3100;
      for (let portOffset = 0; portOffset < 10; portOffset++) {
        const testUrl = `http://localhost:${basePort + portOffset}`;
        try {
          const http = await import('http');
          const isRunning = await new Promise<boolean>((resolve) => {
            const req = http.request(testUrl, { method: 'HEAD', timeout: 2000 }, (res) => {
              resolve(res.statusCode !== undefined && res.statusCode < 500);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
          });
          if (isRunning) {
            previewUrl = testUrl;
            this.logger.log(`Found running preview server at ${previewUrl} (not in memory)`);
            break;
          }
        } catch {
          // Continue checking next port
        }
      }
    }

    if (!previewUrl) {
      return {
        success: false,
        output: 'Preview server not running',
        errors: [
          'E2E tests require a running preview server. Ensure the preview is started and healthy before running tests.',
          'The preview server must be running at G5 completion before G6 testing can proceed.',
        ],
        warnings: [],
        duration: 0,
        testsPassed: 0,
        testsFailed: 0,
        testsTotal: 0,
      };
    }

    this.logger.log(`Preview server running at ${previewUrl}`);

    // Step 2: Check if playwright.config.ts exists
    const hasPlaywrightConfig = await this.filesystem.fileExists(
      projectId,
      'playwright.config.ts',
    );

    if (!hasPlaywrightConfig) {
      return {
        success: false,
        output: 'No playwright.config.ts found',
        errors: ['No playwright.config.ts found - E2E tests cannot run'],
        warnings: [],
        duration: 0,
        testsPassed: 0,
        testsFailed: 0,
        testsTotal: 0,
      };
    }

    // Step 2.5: Validate frontend build before running E2E tests
    // This catches TypeScript/build errors that would cause Playwright to fail silently
    this.logger.log('Validating frontend build before E2E tests...');
    const frontendBuildCheck = await this.filesystem.executeCommand(
      projectId,
      'cd frontend && npm run build 2>&1',
      { timeout: 120000 },
    );

    // Check for build errors in output (even if command technically "succeeded")
    const buildOutput = frontendBuildCheck.stdout + frontendBuildCheck.stderr;
    const errorLines = buildOutput
      .split('\n')
      .filter((line: string) =>
        line.includes('error TS') ||
        line.includes('Module not found') ||
        line.includes('Cannot find module') ||
        line.includes('has no default export') ||
        line.includes('Failed to compile')
      )
      .slice(0, 20) // Limit to 20 most relevant errors
      .map((line: string) => line.trim());

    // If build failed OR we found TypeScript errors in output
    if (!frontendBuildCheck.success || errorLines.length > 0) {
      this.logger.error(`Frontend build failed before E2E tests: ${errorLines.length} errors found`);

      return {
        success: false,
        output: buildOutput.slice(0, 3000),
        errors: [
          'Frontend build failed - cannot run E2E tests until build errors are fixed',
          ...errorLines,
        ],
        warnings: [],
        duration: Date.now() - startTime,
        testsPassed: 0,
        testsFailed: 0,
        testsTotal: 0,
      };
    }

    this.logger.log('Frontend build validation passed');

    // Step 3: Check if E2E test files exist
    const lsResult = await this.filesystem.executeCommand(
      projectId,
      'ls -1 tests/e2e/*.spec.ts tests/e2e/*.e2e-spec.ts tests/e2e/*.test.ts 2>/dev/null || true',
      { timeout: 10000 },
    );
    const specFiles = lsResult.stdout
      .split('\n')
      .filter((f: string) => f.trim().length > 0)
      .map((f: string) => f.replace('tests/e2e/', ''));

    if (specFiles.length === 0) {
      return {
        success: false,
        output: 'No E2E test files found in tests/e2e/',
        errors: ['No E2E test files found - create *.e2e-spec.ts files'],
        warnings: [],
        duration: 0,
        testsPassed: 0,
        testsFailed: 0,
        testsTotal: 0,
      };
    }

    // Step 4: Install Playwright browsers if needed
    this.logger.log('Ensuring Playwright browsers are installed...');
    await this.filesystem.executeCommand(
      projectId,
      'npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium',
      { timeout: 120000 },
    );

    // Step 5: Execute actual Playwright tests against the preview
    this.logger.log(`Executing Playwright tests against ${previewUrl}...`);
    const testResult = await this.filesystem.executeCommand(
      projectId,
      `BASE_URL=${previewUrl} npx playwright test --reporter=json --project=chromium`,
      { timeout: 300000 }, // 5 minutes for test execution
    );

    const duration = Date.now() - startTime;

    // Step 6: Parse Playwright JSON output
    let testsPassed = 0;
    let testsFailed = 0;
    let testsTotal = 0;
    const errors: string[] = [];

    try {
      // Playwright JSON reporter outputs to stdout
      const jsonOutput = testResult.stdout;
      if (jsonOutput && jsonOutput.includes('"stats"')) {
        const results = JSON.parse(jsonOutput);
        testsPassed = results.stats?.expected || 0;
        testsFailed = results.stats?.unexpected || 0;
        testsTotal = testsPassed + testsFailed + (results.stats?.skipped || 0);

        // Collect failed test names
        if (results.suites) {
          this.collectFailedTests(results.suites, errors);
        }
      } else {
        // Fallback: parse from text output
        const parsed = this.parsePlaywrightOutput(testResult.stdout + testResult.stderr);
        testsPassed = parsed.passed;
        testsFailed = parsed.failed;
        testsTotal = parsed.total;
      }
    } catch (parseError) {
      this.logger.warn(`Could not parse Playwright JSON output: ${parseError}`);
      // Fallback: parse from text output
      const parsed = this.parsePlaywrightOutput(testResult.stdout + testResult.stderr);
      testsPassed = parsed.passed;
      testsFailed = parsed.failed;
      testsTotal = parsed.total;
    }

    // If no tests were found in output, check if command failed
    if (testsTotal === 0 && !testResult.success) {
      errors.push('Playwright test execution failed');
      if (testResult.stderr) {
        errors.push(testResult.stderr.slice(0, 500));
      }
    }

    const success = testResult.success && testsFailed === 0;

    this.logger.log(
      `E2E test execution complete: ${testsPassed} passed, ${testsFailed} failed, ${testsTotal} total`,
    );

    return {
      success,
      output: testResult.stdout || `E2E tests: ${testsPassed} passed, ${testsFailed} failed`,
      errors: errors.length > 0 ? errors : testsFailed > 0 ? [`${testsFailed} E2E tests failed`] : [],
      warnings: [],
      duration,
      testsPassed,
      testsFailed,
      testsTotal,
    };
  }

  /**
   * Recursively collect failed test names from Playwright JSON output
   */
  private collectFailedTests(suites: any[], errors: string[], prefix = ''): void {
    for (const suite of suites) {
      const suiteName = prefix ? `${prefix} > ${suite.title}` : suite.title;

      if (suite.specs) {
        for (const spec of suite.specs) {
          if (spec.ok === false) {
            errors.push(`FAILED: ${suiteName} > ${spec.title}`);
          }
        }
      }

      if (suite.suites) {
        this.collectFailedTests(suite.suites, errors, suiteName);
      }
    }
  }

  /**
   * Run integration tests (G6 Testing gate)
   * Integration tests are optional - success with 0 tests is acceptable.
   * But if files exist, we should attempt to run them.
   */
  async runIntegrationTests(projectId: string): Promise<TestResult> {
    this.logger.log(`Running integration tests for project ${projectId}`);
    const startTime = Date.now();

    // Check if integration test files exist
    const lsResult = await this.filesystem.executeCommand(
      projectId,
      'find . -name "*.integration.spec.ts" -o -name "*.integration.test.ts" -o -path "*/integration/*.spec.ts" -o -path "*/integration/*.test.ts" 2>/dev/null | head -20 || true',
      { timeout: 10000 },
    );

    const integrationFiles = lsResult.stdout
      .split('\n')
      .filter((f: string) => f.trim().length > 0);

    const duration = Date.now() - startTime;

    // If no integration tests exist, that's acceptable (not all projects need them)
    if (integrationFiles.length === 0) {
      this.logger.log('No integration test files found - skipping (optional)');
      return {
        success: true,
        output: 'No integration tests configured (optional)',
        errors: [],
        warnings: [],
        duration,
        testsPassed: 0,
        testsFailed: 0,
        testsTotal: 0,
      };
    }

    // Integration test files exist - try to run them with Jest or the project's test runner
    this.logger.log(`Found ${integrationFiles.length} integration test files, attempting to run...`);

    // Check if there's a test:integration script
    const hasIntegrationScript = await this.hasScript(projectId, 'test:integration');

    if (hasIntegrationScript) {
      const testResult = await this.filesystem.executeCommand(
        projectId,
        'npm run test:integration -- --json 2>/dev/null || npm run test:integration',
        { timeout: 300000 },
      );

      // Parse results if available
      const testStats = await this.parseTestResults(projectId, testResult.stdout);

      return {
        success: testResult.success && testStats.failed === 0,
        output: testResult.stdout || `Integration tests executed`,
        errors: testStats.failed > 0 ? [`${testStats.failed} integration tests failed`] : [],
        warnings: [],
        duration: Date.now() - startTime,
        testsPassed: testStats.passed,
        testsFailed: testStats.failed,
        testsTotal: testStats.total,
      };
    }

    // No dedicated integration test script - files exist but can't run them automatically
    // Mark as success with warning (files validated but not executed)
    return {
      success: true,
      output: `Integration test files found: ${integrationFiles.length} files (no test:integration script to run them)\n${integrationFiles.join('\n')}`,
      errors: [],
      warnings: [`Found ${integrationFiles.length} integration test files but no 'test:integration' script to run them`],
      duration,
      testsPassed: 0,
      testsFailed: 0,
      testsTotal: 0,
    };
  }

  /**
   * Run performance tests
   */
  async runPerformanceTests(projectId: string): Promise<TestResult> {
    this.logger.log(`Running performance tests for project ${projectId}`);
    const startTime = Date.now();

    // Check for performance test script
    try {
      const packageJson = await this.filesystem.readFile(projectId, 'package.json');
      const pkg = JSON.parse(packageJson);
      if (pkg.scripts?.['test:performance'] || pkg.scripts?.['test:perf']) {
        const testCommand = pkg.scripts['test:performance']
          ? 'npm run test:performance'
          : 'npm run test:perf';

        const result = await this.filesystem.executeCommand(projectId, testCommand, {
          timeout: 600000,
        });

        return {
          success: result.success,
          output: result.stdout,
          errors: result.success ? [] : ['Performance tests failed'],
          warnings: [],
          duration: Date.now() - startTime,
          testsPassed: result.success ? 1 : 0,
          testsFailed: result.success ? 0 : 1,
          testsTotal: 1,
        };
      }
    } catch {
      // No performance tests configured
    }

    return {
      success: true,
      output: 'No performance tests configured',
      errors: [],
      warnings: ['No performance test configuration found - skipping'],
      duration: 0,
      testsPassed: 0,
      testsFailed: 0,
      testsTotal: 0,
    };
  }

  /**
   * Parse Playwright test output
   */
  private parsePlaywrightOutput(output: string): { passed: number; failed: number; total: number } {
    const passedMatch = output.match(/(\d+)\s+passed/);
    const failedMatch = output.match(/(\d+)\s+failed/);
    const skippedMatch = output.match(/(\d+)\s+skipped/);

    const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
    const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;

    return { passed, failed, total: passed + failed + skipped };
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
