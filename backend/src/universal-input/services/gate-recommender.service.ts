import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { InputAnalysisResult, CompletenessLevel } from '../dto/input-analysis.dto';
import {
  GatePlan,
  GateRecommendation,
  GateActionOption,
  GateContext,
  GateAction,
} from '../dto/gate-recommendation.dto';

@Injectable()
export class GateRecommenderService {
  private readonly logger = new Logger(GateRecommenderService.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly configService: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  /**
   * AI-Native Gate Recommendation - Uses Claude to generate intelligent gate plan
   * Based on analysis results, recommends which gates to skip/validate/delta/full
   */
  async generateGatePlan(
    sessionId: string,
    analysisId: string,
    analysisResult: InputAnalysisResult,
  ): Promise<GatePlan> {
    this.logger.log(`Generating gate plan for session ${sessionId}`);

    // Run AI recommendation
    const recommendations = await this.generateRecommendationsWithAI(analysisResult);

    // Generate highlights from analysis
    const highlights = this.extractHighlights(analysisResult);

    // Build security summary if issues found
    const securitySummary = this.buildSecuritySummary(analysisResult);

    // Build quality summary
    const qualitySummary = this.buildQualitySummary(analysisResult);

    const plan: GatePlan = {
      sessionId,
      analysisId,
      completenessLevel: analysisResult.classification.completeness,
      summary: this.generateSummary(analysisResult),
      recommendations,
      highlights,
      securitySummary,
      qualitySummary,
    };

    this.logger.log(
      `Gate plan generated: ${recommendations.length} gates, ` +
        `${recommendations.filter((r) => r.recommendedAction === 'skip').length} skip, ` +
        `${recommendations.filter((r) => r.recommendedAction === 'full').length} full`,
    );

    return plan;
  }

  /**
   * AI-Native recommendation generation
   */
  private async generateRecommendationsWithAI(
    analysisResult: InputAnalysisResult,
  ): Promise<GateRecommendation[]> {
    const systemPrompt = `You are an expert software development workflow advisor. Your job is to recommend how to process a project through development gates based on what files were uploaded.

GATE DEFINITIONS:
- G1 (Scope): Define project scope and requirements - REPLACED BY FILE ANALYSIS
- G2 (PRD): Product Requirements Document - Define the product
- G3 (Architecture): Technical architecture and contracts (OpenAPI, DB schema)
- G4 (Design): UI/UX design and mockups
- G5 (Development): Code implementation
- G6 (QA): Testing and quality assurance
- G7 (Security): Security review and fixes
- G8 (Pre-Deploy): Deployment configuration
- G9 (Production): Production deployment

ACTION TYPES:
- "skip": Gate not needed because artifact already exists and is complete
- "validate": Artifact exists but needs review/confirmation
- "delta": Partial artifact exists, only fill gaps
- "full": Full gate execution needed

RULES:
1. G1 is ALWAYS skipped - file upload analysis replaces scope definition
2. G2 (PRD) - skip if PRD doc found, validate if requirements in README, full otherwise
3. G3 (Architecture) - skip if OpenAPI+schema complete, validate if partial, full if missing
4. G4 (Design) - skip if UI code complete, delta if missing screens, full if no UI
5. G5 (Development) - delta if code exists with gaps, full if new code needed
6. G6-G9 - typically full unless configs exist

Generate user-friendly questions that explain why you're asking and what each option means.

Return ONLY valid JSON, no markdown code blocks.`;

    // Prepare analysis summary for Claude
    const analysisSummary = this.prepareAnalysisSummary(analysisResult);

    const userPrompt = `Based on this analysis of uploaded files, recommend actions for each gate:

${analysisSummary}

Return a JSON array of gate recommendations:
[
  {
    "gate": "G1",
    "gateName": "Scope Definition",
    "recommendedAction": "skip",
    "reason": "File upload and analysis has defined the project scope",
    "confidence": 1.0,
    "existingArtifacts": ["analysis results"],
    "userQuestion": "Project scope has been determined from your uploaded files. Ready to proceed?",
    "options": [
      { "action": "skip", "label": "Proceed", "description": "Use analysis as scope definition", "isRecommended": true }
    ]
  },
  {
    "gate": "G2",
    "gateName": "Product Requirements",
    "recommendedAction": "validate|delta|full",
    "reason": "Explanation of why this action is recommended",
    "confidence": 0.0-1.0,
    "existingArtifacts": ["list of found artifacts"],
    "userQuestion": "User-friendly question explaining the decision point",
    "options": [
      { "action": "skip", "label": "Use existing", "description": "Your PRD looks complete", "isRecommended": false },
      { "action": "validate", "label": "Review & confirm", "description": "I'll review your PRD and confirm it's complete", "isRecommended": true },
      { "action": "full", "label": "Create new", "description": "Generate a complete PRD from scratch", "isRecommended": false }
    ]
  }
  // Continue for all gates G1-G9
]

Make sure to:
1. Include ALL gates G1 through G9
2. Provide 2-4 options per gate
3. Mark exactly one option as isRecommended: true
4. Make userQuestion conversational and helpful
5. Explain trade-offs in option descriptions`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 6000,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const recommendations = JSON.parse(textBlock.text.trim());

      // Validate and ensure all gates are present
      return this.validateRecommendations(recommendations);
    } catch (error) {
      this.logger.error('Gate recommendation generation failed', error);
      return this.createFallbackRecommendations(analysisResult);
    }
  }

  /**
   * Prepare analysis summary for AI consumption
   */
  private prepareAnalysisSummary(analysisResult: InputAnalysisResult): string {
    const { classification, uiAnalysis, backendAnalysis, crossAnalysis } = analysisResult;

    let summary = `CLASSIFICATION:
- Completeness: ${classification.completeness}
- UI Framework: ${classification.uiFramework || 'none'}
- Backend Framework: ${classification.backendFramework || 'none'}
- ORM: ${classification.orm || 'none'}
- Auth Type: ${classification.authType || 'none'}
- Total Files: ${classification.totalFiles}
- Code Files: ${classification.codeFiles}

DETECTED ARTIFACTS:
- Has PRD: ${classification.artifacts.hasPRD} ${classification.artifacts.prdFiles.length ? `(${classification.artifacts.prdFiles.join(', ')})` : ''}
- Has Architecture Doc: ${classification.artifacts.hasArchitectureDoc} ${classification.artifacts.architectureFiles.length ? `(${classification.artifacts.architectureFiles.join(', ')})` : ''}
- Has OpenAPI: ${classification.artifacts.hasOpenAPI} ${classification.artifacts.openAPIFiles.length ? `(${classification.artifacts.openAPIFiles.join(', ')})` : ''}
- Has Prisma Schema: ${classification.artifacts.hasPrismaSchema} ${classification.artifacts.prismaSchemaPath ? `(${classification.artifacts.prismaSchemaPath})` : ''}
- Has UI Code: ${classification.artifacts.hasUICode} ${classification.artifacts.uiCodePaths.length ? `(${classification.artifacts.uiCodePaths.join(', ')})` : ''}
- Has Design Mockups: ${classification.artifacts.hasDesignMockups}
- Has Backend Code: ${classification.artifacts.hasBackendCode} ${classification.artifacts.backendCodePaths.length ? `(${classification.artifacts.backendCodePaths.join(', ')})` : ''}
- Has Tests: ${classification.artifacts.hasTests}
- Has CI: ${classification.artifacts.hasCI}
- Has Dockerfile: ${classification.artifacts.hasDockerfile}
`;

    if (uiAnalysis) {
      summary += `
UI ANALYSIS:
- Extracted Endpoints: ${uiAnalysis.extractedEndpoints.length}
- State Management: ${uiAnalysis.stateManagement || 'none'}
- Components: ${uiAnalysis.componentCount}
- Pages: ${uiAnalysis.pageCount}
`;
    }

    if (backendAnalysis) {
      summary += `
BACKEND ANALYSIS:
- Extracted Routes: ${backendAnalysis.extractedRoutes.length}
- Has Schema: ${!!backendAnalysis.extractedSchema}
- Security Issues: ${backendAnalysis.securityIssues.length}
- Test Coverage: ${backendAnalysis.qualityMetrics.testCoverage ?? 'unknown'}%
`;
    }

    if (crossAnalysis) {
      summary += `
CROSS-ANALYSIS:
- Missing Backend Endpoints: ${crossAnalysis.missingBackendEndpoints.length}
- Unused Backend Endpoints: ${crossAnalysis.unusedBackendEndpoints.length}
- Type Mismatches: ${crossAnalysis.typeMismatches.length}
- Auth Misalignments: ${crossAnalysis.authMisalignments.length}
`;
    }

    return summary;
  }

  /**
   * Validate recommendations and fill any gaps
   */
  private validateRecommendations(recommendations: GateRecommendation[]): GateRecommendation[] {
    const gates = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'];
    const gateNames: Record<string, string> = {
      G1: 'Scope Definition',
      G2: 'Product Requirements',
      G3: 'Architecture',
      G4: 'Design',
      G5: 'Development',
      G6: 'QA & Testing',
      G7: 'Security Review',
      G8: 'Pre-Deployment',
      G9: 'Production Deployment',
    };

    const result: GateRecommendation[] = [];

    for (const gate of gates) {
      const existing = recommendations.find((r) => r.gate === gate);
      if (existing) {
        result.push(existing);
      } else {
        // Create default recommendation
        result.push({
          gate: gate as GateRecommendation['gate'],
          gateName: gateNames[gate],
          recommendedAction: gate === 'G1' ? 'skip' : 'full',
          reason:
            gate === 'G1' ? 'Analysis replaces scope definition' : 'Full execution recommended',
          confidence: 0.5,
          existingArtifacts: [],
          userQuestion: `How should we handle ${gateNames[gate]}?`,
          options: this.createDefaultOptions(gate === 'G1' ? 'skip' : 'full'),
        });
      }
    }

    return result;
  }

  /**
   * Create default options for a gate
   */
  private createDefaultOptions(recommendedAction: GateAction): GateActionOption[] {
    const allOptions: GateActionOption[] = [
      {
        action: 'skip',
        label: 'Skip',
        description: 'Not needed for this project',
        isRecommended: recommendedAction === 'skip',
      },
      {
        action: 'validate',
        label: 'Validate only',
        description: 'Review existing artifacts without changes',
        isRecommended: recommendedAction === 'validate',
      },
      {
        action: 'delta',
        label: 'Fill gaps only',
        description: "Only add what's missing",
        isRecommended: recommendedAction === 'delta',
      },
      {
        action: 'full',
        label: 'Full execution',
        description: 'Complete gate from scratch',
        isRecommended: recommendedAction === 'full',
      },
    ];

    return allOptions;
  }

  /**
   * Create fallback recommendations when AI fails
   */
  private createFallbackRecommendations(analysisResult: InputAnalysisResult): GateRecommendation[] {
    const { classification } = analysisResult;
    const recommendations: GateRecommendation[] = [];

    // G1 - Always skip
    recommendations.push({
      gate: 'G1',
      gateName: 'Scope Definition',
      recommendedAction: 'skip',
      reason: 'File upload and analysis defines scope',
      confidence: 1.0,
      existingArtifacts: ['analysis results'],
      userQuestion: 'Project scope determined from uploaded files.',
      options: this.createDefaultOptions('skip'),
    });

    // G2 - Based on PRD presence
    recommendations.push({
      gate: 'G2',
      gateName: 'Product Requirements',
      recommendedAction: classification.artifacts.hasPRD ? 'validate' : 'full',
      reason: classification.artifacts.hasPRD
        ? 'PRD document found in uploads'
        : 'No PRD document found',
      confidence: 0.7,
      existingArtifacts: classification.artifacts.prdFiles,
      userQuestion: classification.artifacts.hasPRD
        ? 'I found a PRD document. Should I use it as-is or review it?'
        : 'No PRD found. Shall I create one based on your files?',
      options: this.createDefaultOptions(classification.artifacts.hasPRD ? 'validate' : 'full'),
    });

    // G3 - Based on architecture artifacts
    const hasArchArtifacts =
      classification.artifacts.hasOpenAPI || classification.artifacts.hasPrismaSchema;
    recommendations.push({
      gate: 'G3',
      gateName: 'Architecture',
      recommendedAction: hasArchArtifacts ? 'validate' : 'full',
      reason: hasArchArtifacts
        ? 'Architecture artifacts found (OpenAPI/schema)'
        : 'No architecture documentation found',
      confidence: 0.7,
      existingArtifacts: [
        ...classification.artifacts.openAPIFiles,
        ...(classification.artifacts.prismaSchemaPath
          ? [classification.artifacts.prismaSchemaPath]
          : []),
      ],
      userQuestion: hasArchArtifacts
        ? 'I found API specs and/or database schema. Review and use them?'
        : 'No architecture docs found. Shall I design the technical architecture?',
      options: this.createDefaultOptions(hasArchArtifacts ? 'validate' : 'full'),
    });

    // G4 - Based on UI presence
    recommendations.push({
      gate: 'G4',
      gateName: 'Design',
      recommendedAction: classification.artifacts.hasUICode
        ? 'skip'
        : classification.artifacts.hasDesignMockups
          ? 'validate'
          : 'full',
      reason: classification.artifacts.hasUICode
        ? 'UI code already exists'
        : classification.artifacts.hasDesignMockups
          ? 'Design mockups found'
          : 'No UI or design assets found',
      confidence: 0.7,
      existingArtifacts: [
        ...classification.artifacts.uiCodePaths,
        ...classification.artifacts.mockupFiles,
      ],
      userQuestion: classification.artifacts.hasUICode
        ? 'UI code exists. Skip design phase?'
        : 'Shall I create UI designs?',
      options: this.createDefaultOptions(
        classification.artifacts.hasUICode
          ? 'skip'
          : classification.artifacts.hasDesignMockups
            ? 'validate'
            : 'full',
      ),
    });

    // G5 - Based on code presence
    const hasCode = classification.artifacts.hasUICode || classification.artifacts.hasBackendCode;
    recommendations.push({
      gate: 'G5',
      gateName: 'Development',
      recommendedAction: hasCode ? 'delta' : 'full',
      reason: hasCode ? 'Code exists, may need enhancements' : 'No implementation code found',
      confidence: 0.6,
      existingArtifacts: [
        ...classification.artifacts.uiCodePaths,
        ...classification.artifacts.backendCodePaths,
      ],
      userQuestion: hasCode
        ? 'Code exists. Should I enhance it or rebuild?'
        : 'No code found. Ready to generate implementation?',
      options: this.createDefaultOptions(hasCode ? 'delta' : 'full'),
    });

    // G6-G9 - Default to full
    const laterGates = [
      { gate: 'G6', name: 'QA & Testing' },
      { gate: 'G7', name: 'Security Review' },
      { gate: 'G8', name: 'Pre-Deployment' },
      { gate: 'G9', name: 'Production Deployment' },
    ];

    for (const g of laterGates) {
      recommendations.push({
        gate: g.gate as GateRecommendation['gate'],
        gateName: g.name,
        recommendedAction: 'full',
        reason: 'Standard gate execution recommended',
        confidence: 0.5,
        existingArtifacts: [],
        userQuestion: `How should we handle ${g.name}?`,
        options: this.createDefaultOptions('full'),
      });
    }

    return recommendations;
  }

  /**
   * Extract highlights from analysis
   */
  private extractHighlights(analysisResult: InputAnalysisResult): GatePlan['highlights'] {
    const highlights: GatePlan['highlights'] = [];
    const { classification, backendAnalysis, crossAnalysis } = analysisResult;

    // Success highlights
    if (classification.completeness === 'full-stack') {
      highlights.push({
        type: 'success',
        title: 'Full-Stack Project Detected',
        description: 'Both frontend and backend code found. Cross-analysis available.',
      });
    }

    if (classification.artifacts.hasOpenAPI && classification.artifacts.hasPrismaSchema) {
      highlights.push({
        type: 'success',
        title: 'Contracts Complete',
        description: 'OpenAPI spec and database schema found - architecture is well-defined.',
        relatedGate: 'G3',
      });
    }

    if (classification.artifacts.hasTests) {
      highlights.push({
        type: 'success',
        title: 'Tests Exist',
        description: 'Test files detected. QA phase can build on existing tests.',
        relatedGate: 'G6',
      });
    }

    // Warning highlights
    if (backendAnalysis && backendAnalysis.securityIssues.length > 0) {
      const critical = backendAnalysis.securityIssues.filter(
        (i) => i.severity === 'critical',
      ).length;
      highlights.push({
        type: critical > 0 ? 'error' : 'warning',
        title: `${backendAnalysis.securityIssues.length} Security Issue${backendAnalysis.securityIssues.length > 1 ? 's' : ''} Found`,
        description:
          critical > 0
            ? `${critical} critical issue(s) require immediate attention`
            : 'Security issues detected that should be addressed',
        relatedGate: 'G7',
      });
    }

    if (crossAnalysis && crossAnalysis.missingBackendEndpoints.length > 0) {
      highlights.push({
        type: 'warning',
        title: `${crossAnalysis.missingBackendEndpoints.length} Missing API Endpoint${crossAnalysis.missingBackendEndpoints.length > 1 ? 's' : ''}`,
        description: "UI calls endpoints that backend doesn't implement",
        relatedGate: 'G5',
      });
    }

    if (crossAnalysis && crossAnalysis.typeMismatches.length > 0) {
      highlights.push({
        type: 'warning',
        title: 'Type Mismatches Detected',
        description: `${crossAnalysis.typeMismatches.length} type inconsistencies between UI and backend`,
        relatedGate: 'G5',
      });
    }

    // Info highlights
    if (classification.completeness === 'ui-only') {
      highlights.push({
        type: 'info',
        title: 'Frontend Only',
        description: 'No backend code found. Backend will be generated based on UI requirements.',
        relatedGate: 'G5',
      });
    }

    if (classification.completeness === 'backend-only') {
      highlights.push({
        type: 'info',
        title: 'Backend Only',
        description: 'No frontend code found. UI will be designed and generated.',
        relatedGate: 'G4',
      });
    }

    return highlights;
  }

  /**
   * Build security summary from analysis
   */
  private buildSecuritySummary(
    analysisResult: InputAnalysisResult,
  ): GatePlan['securitySummary'] | undefined {
    if (
      !analysisResult.backendAnalysis ||
      analysisResult.backendAnalysis.securityIssues.length === 0
    ) {
      return undefined;
    }

    const issues = analysisResult.backendAnalysis.securityIssues;

    return {
      criticalCount: issues.filter((i) => i.severity === 'critical').length,
      highCount: issues.filter((i) => i.severity === 'high').length,
      mediumCount: issues.filter((i) => i.severity === 'medium').length,
      lowCount: issues.filter((i) => i.severity === 'low').length,
      topIssues: issues
        .sort((a, b) => {
          const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        })
        .slice(0, 5),
    };
  }

  /**
   * Build quality summary from analysis
   */
  private buildQualitySummary(
    analysisResult: InputAnalysisResult,
  ): GatePlan['qualitySummary'] | undefined {
    if (!analysisResult.backendAnalysis) {
      return undefined;
    }

    const { qualityMetrics } = analysisResult.backendAnalysis;
    const recommendations: string[] = [];

    // Generate recommendations based on metrics
    if (qualityMetrics.testCoverage !== undefined && qualityMetrics.testCoverage < 50) {
      recommendations.push('Increase test coverage (currently below 50%)');
    }
    if (qualityMetrics.lintErrors > 0) {
      recommendations.push(`Fix ${qualityMetrics.lintErrors} linting errors`);
    }
    if (qualityMetrics.typeCoverage !== undefined && qualityMetrics.typeCoverage < 80) {
      recommendations.push('Improve TypeScript type coverage');
    }

    // Calculate overall score
    let score = 100;
    if (qualityMetrics.testCoverage !== undefined) {
      score -= Math.max(0, 50 - qualityMetrics.testCoverage) * 0.5;
    }
    score -= qualityMetrics.lintErrors * 2;
    score -= qualityMetrics.lintWarnings * 0.5;
    score = Math.max(0, Math.min(100, score));

    return {
      testCoverage: qualityMetrics.testCoverage ?? 0,
      overallScore: Math.round(score),
      recommendations,
    };
  }

  /**
   * Generate summary text
   */
  private generateSummary(analysisResult: InputAnalysisResult): string {
    const { classification } = analysisResult;

    const parts: string[] = [];

    // Completeness
    const completenessLabels: Record<CompletenessLevel, string> = {
      'prompt-only': 'text description only',
      'ui-only': 'frontend code',
      'backend-only': 'backend code',
      'full-stack': 'complete full-stack codebase',
      'contracts-only': 'API specifications and schemas',
      'docs-only': 'documentation',
    };
    parts.push(`Detected ${completenessLabels[classification.completeness]}`);

    // Frameworks
    if (classification.uiFramework && classification.uiFramework !== 'unknown') {
      parts.push(`using ${classification.uiFramework}`);
    }
    if (classification.backendFramework && classification.backendFramework !== 'unknown') {
      parts.push(`with ${classification.backendFramework} backend`);
    }

    // File count
    parts.push(`(${classification.totalFiles} files)`);

    return parts.join(' ');
  }

  /**
   * Build GateContext for workflow execution
   */
  buildGateContext(
    analysisResult: InputAnalysisResult,
    confirmedDecisions: Record<string, { action: GateAction; reason?: string }>,
    assetIds: string[],
  ): GateContext {
    const { classification, backendAnalysis, uiAnalysis } = analysisResult;

    // Compute routing from decisions
    const skipGates: string[] = [];
    const deltaGates: string[] = [];
    const validateGates: string[] = [];
    const fullGates: string[] = [];

    for (const [gate, decision] of Object.entries(confirmedDecisions)) {
      switch (decision.action) {
        case 'skip':
          skipGates.push(gate);
          break;
        case 'delta':
          deltaGates.push(gate);
          break;
        case 'validate':
          validateGates.push(gate);
          break;
        case 'full':
          fullGates.push(gate);
          break;
      }
    }

    // Determine focus areas
    const focusAreas: string[] = [];
    if (classification.completeness === 'ui-only') {
      focusAreas.push('backend generation');
    }
    if (classification.completeness === 'backend-only') {
      focusAreas.push('UI design', 'frontend generation');
    }
    if (backendAnalysis?.securityIssues.length) {
      focusAreas.push('security fixes');
    }

    return {
      classification: {
        completeness: classification.completeness,
        hasUI: classification.artifacts.hasUICode,
        hasBackend: classification.artifacts.hasBackendCode,
        uiFramework: classification.uiFramework,
        backendFramework: classification.backendFramework,
        orm: classification.orm,
      },
      extractedArtifacts: {
        openApiSpec: backendAnalysis?.generatedOpenAPI,
        prismaSchema: backendAnalysis?.extractedSchema,
        uiRequirements: uiAnalysis?.extractedEndpoints.map((e) => ({
          method: e.method,
          path: e.path,
        })),
        securityIssues: backendAnalysis?.securityIssues,
        qualityMetrics: backendAnalysis?.qualityMetrics,
      },
      decisions: confirmedDecisions,
      routing: {
        skipGates,
        deltaGates,
        validateGates,
        fullGates,
        focusAreas,
      },
      assetIds,
    };
  }
}
