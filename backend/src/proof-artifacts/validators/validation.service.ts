import { Injectable } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

export interface ValidationResult {
  passed: boolean;
  summary: string;
  details?: any;
  errors?: string[];
}

@Injectable()
export class ValidationService {
  /**
   * Validate proof artifact based on type
   */
  async validateArtifact(
    proofType: string,
    filePath: string,
  ): Promise<ValidationResult> {
    switch (proofType) {
      case 'test_output':
        return this.validateTestOutput(filePath);
      case 'coverage_report':
        return this.validateCoverageReport(filePath);
      case 'lint_output':
        return this.validateLintOutput(filePath);
      case 'security_scan':
        return this.validateSecurityScan(filePath);
      case 'build_output':
        return this.validateBuildOutput(filePath);
      case 'spec_validation':
        return this.validateSpecification(filePath);
      case 'lighthouse_report':
        return this.validateLighthouseReport(filePath);
      default:
        return {
          passed: true,
          summary: 'Manual validation required',
        };
    }
  }

  /**
   * Calculate SHA256 hash of file
   */
  async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Validate test output - looks for pass/fail indicators
   */
  private async validateTestOutput(filePath: string): Promise<ValidationResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Check for common test failure patterns
      const failurePatterns = [
        /(\d+) failing/i,
        /(\d+) failed/i,
        /FAIL/,
        /ERROR:/i,
        /Tests failed/i,
      ];

      const successPatterns = [
        /(\d+) passing/i,
        /(\d+) passed/i,
        /All tests passed/i,
        /Test run successful/i,
      ];

      let failCount = 0;
      let passCount = 0;
      const errors: string[] = [];

      for (const pattern of failurePatterns) {
        const match = content.match(pattern);
        if (match) {
          failCount += parseInt(match[1] || '1', 10);
          errors.push(match[0]);
        }
      }

      for (const pattern of successPatterns) {
        const match = content.match(pattern);
        if (match) {
          passCount += parseInt(match[1] || '0', 10);
        }
      }

      const passed = failCount === 0 && passCount > 0;
      return {
        passed,
        summary: passed
          ? `${passCount} tests passed`
          : `${failCount} tests failed, ${passCount} passed`,
        details: { passCount, failCount },
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        passed: false,
        summary: 'Failed to read test output',
        errors: [error.message],
      };
    }
  }

  /**
   * Validate coverage report - checks for minimum coverage threshold
   */
  private async validateCoverageReport(filePath: string): Promise<ValidationResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Look for coverage percentage (common formats)
      const coveragePatterns = [
        /All files\s*\|\s*(\d+\.?\d*)/,
        /Total\s*\|\s*(\d+\.?\d*)/,
        /Statements\s*:\s*(\d+\.?\d*)%/,
        /"total":\s*(\d+\.?\d*)/,
      ];

      let coverage = 0;
      for (const pattern of coveragePatterns) {
        const match = content.match(pattern);
        if (match) {
          coverage = parseFloat(match[1]);
          break;
        }
      }

      const threshold = 80; // 80% coverage threshold
      const passed = coverage >= threshold;

      return {
        passed,
        summary: `Code coverage: ${coverage}% (threshold: ${threshold}%)`,
        details: { coverage, threshold },
        errors: passed ? undefined : [`Coverage ${coverage}% is below threshold ${threshold}%`],
      };
    } catch (error) {
      return {
        passed: false,
        summary: 'Failed to read coverage report',
        errors: [error.message],
      };
    }
  }

  /**
   * Validate lint output - checks for errors and warnings
   */
  private async validateLintOutput(filePath: string): Promise<ValidationResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Look for ESLint/TSLint style output
      const errorPattern = /(\d+)\s*errors?/i;
      const warningPattern = /(\d+)\s*warnings?/i;

      const errorMatch = content.match(errorPattern);
      const warningMatch = content.match(warningPattern);

      const errors = errorMatch ? parseInt(errorMatch[1], 10) : 0;
      const warnings = warningMatch ? parseInt(warningMatch[1], 10) : 0;

      const passed = errors === 0;

      return {
        passed,
        summary: `Linting: ${errors} errors, ${warnings} warnings`,
        details: { errors, warnings },
        errors: passed ? undefined : [`${errors} linting errors found`],
      };
    } catch (error) {
      return {
        passed: false,
        summary: 'Failed to read lint output',
        errors: [error.message],
      };
    }
  }

  /**
   * Validate security scan - checks for vulnerabilities
   */
  private async validateSecurityScan(filePath: string): Promise<ValidationResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Parse npm audit JSON output
      try {
        const auditData = JSON.parse(content);
        const critical = auditData.metadata?.vulnerabilities?.critical || 0;
        const high = auditData.metadata?.vulnerabilities?.high || 0;
        const moderate = auditData.metadata?.vulnerabilities?.moderate || 0;
        const low = auditData.metadata?.vulnerabilities?.low || 0;

        const passed = critical === 0 && high === 0;

        return {
          passed,
          summary: `Security: ${critical} critical, ${high} high, ${moderate} moderate, ${low} low`,
          details: { critical, high, moderate, low },
          errors: passed ? undefined : [`${critical + high} critical/high vulnerabilities found`],
        };
      } catch {
        // Fallback to text parsing
        const criticalMatch = content.match(/(\d+)\s*critical/i);
        const highMatch = content.match(/(\d+)\s*high/i);

        const critical = criticalMatch ? parseInt(criticalMatch[1], 10) : 0;
        const high = highMatch ? parseInt(highMatch[1], 10) : 0;

        const passed = critical === 0 && high === 0;

        return {
          passed,
          summary: `Security: ${critical} critical, ${high} high severity issues`,
          details: { critical, high },
          errors: passed ? undefined : [`${critical + high} critical/high vulnerabilities found`],
        };
      }
    } catch (error) {
      return {
        passed: false,
        summary: 'Failed to read security scan',
        errors: [error.message],
      };
    }
  }

  /**
   * Validate build output - checks for successful build
   */
  private async validateBuildOutput(filePath: string): Promise<ValidationResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      const successPatterns = [
        /build successful/i,
        /compiled successfully/i,
        /built at:/i,
        /Done in/i,
        /webpack.*compiled successfully/i,
      ];

      const errorPatterns = [
        /build failed/i,
        /compilation error/i,
        /ERROR in/i,
        /Module not found/i,
        /SyntaxError:/i,
      ];

      let passed = false;
      let summary = 'Build status unknown';

      for (const pattern of successPatterns) {
        if (pattern.test(content)) {
          passed = true;
          summary = 'Build completed successfully';
          break;
        }
      }

      const errors: string[] = [];
      for (const pattern of errorPatterns) {
        if (pattern.test(content)) {
          passed = false;
          const match = content.match(pattern);
          if (match) {
            errors.push(match[0]);
          }
        }
      }

      return {
        passed,
        summary,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        passed: false,
        summary: 'Failed to read build output',
        errors: [error.message],
      };
    }
  }

  /**
   * Validate specification - runs external validation tools
   */
  private async validateSpecification(filePath: string): Promise<ValidationResult> {
    try {
      const ext = filePath.split('.').pop()?.toLowerCase();

      if (ext === 'yaml' || ext === 'yml') {
        // Validate OpenAPI spec
        return this.validateOpenAPISpec(filePath);
      } else if (ext === 'prisma') {
        // Validate Prisma schema
        return this.validatePrismaSchema(filePath);
      } else if (ext === 'json') {
        // Validate JSON syntax
        const content = await fs.readFile(filePath, 'utf-8');
        JSON.parse(content);
        return {
          passed: true,
          summary: 'Valid JSON specification',
        };
      }

      return {
        passed: true,
        summary: 'Specification format not validated',
      };
    } catch (error) {
      return {
        passed: false,
        summary: 'Specification validation failed',
        errors: [error.message],
      };
    }
  }

  /**
   * Validate OpenAPI specification using swagger-cli
   */
  private async validateOpenAPISpec(filePath: string): Promise<ValidationResult> {
    try {
      const { stdout, stderr } = await execAsync(`npx swagger-cli validate "${filePath}"`);

      const passed = stderr === '' && !stdout.includes('error');

      return {
        passed,
        summary: passed ? 'Valid OpenAPI specification' : 'OpenAPI validation failed',
        details: { stdout, stderr },
        errors: passed ? undefined : [stderr || stdout],
      };
    } catch (error) {
      return {
        passed: false,
        summary: 'OpenAPI validation failed',
        errors: [error.message, error.stderr || ''].filter(Boolean),
      };
    }
  }

  /**
   * Validate Prisma schema using prisma validate
   */
  private async validatePrismaSchema(filePath: string): Promise<ValidationResult> {
    try {
      const { stdout, stderr } = await execAsync(`npx prisma validate --schema="${filePath}"`);

      const passed = stdout.includes('valid') && stderr === '';

      return {
        passed,
        summary: passed ? 'Valid Prisma schema' : 'Prisma validation failed',
        details: { stdout, stderr },
        errors: passed ? undefined : [stderr || stdout],
      };
    } catch (error) {
      return {
        passed: false,
        summary: 'Prisma validation failed',
        errors: [error.message, error.stderr || ''].filter(Boolean),
      };
    }
  }

  /**
   * Validate Lighthouse report
   */
  private async validateLighthouseReport(filePath: string): Promise<ValidationResult> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const report = JSON.parse(content);

      const scores = report.categories || {};
      const performance = scores.performance?.score || 0;
      const accessibility = scores.accessibility?.score || 0;
      const bestPractices = scores['best-practices']?.score || 0;
      const seo = scores.seo?.score || 0;

      const threshold = 0.8; // 80% threshold for all categories
      const passed =
        performance >= threshold &&
        accessibility >= threshold &&
        bestPractices >= threshold &&
        seo >= threshold;

      return {
        passed,
        summary: `Lighthouse: Performance ${(performance * 100).toFixed(0)}%, Accessibility ${(accessibility * 100).toFixed(0)}%, Best Practices ${(bestPractices * 100).toFixed(0)}%, SEO ${(seo * 100).toFixed(0)}%`,
        details: { performance, accessibility, bestPractices, seo, threshold },
        errors: passed
          ? undefined
          : ['One or more Lighthouse scores below 80% threshold'],
      };
    } catch (error) {
      return {
        passed: false,
        summary: 'Failed to read Lighthouse report',
        errors: [error.message],
      };
    }
  }
}
