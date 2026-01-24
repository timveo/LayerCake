/**
 * DTOs for Gate Recommendations and User Confirmation
 */

import { SecurityIssue, QualityMetrics } from './input-analysis.dto';

// Gate action types
export type GateAction = 'skip' | 'validate' | 'delta' | 'full';

// Individual gate recommendation
export interface GateRecommendation {
  gate: 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8' | 'G9';
  gateName: string;
  recommendedAction: GateAction;
  reason: string;
  confidence: number; // 0-1 how confident system is in recommendation
  existingArtifacts: string[];
  userQuestion: string;
  options: GateActionOption[];
}

// Option for user to choose
export interface GateActionOption {
  action: GateAction;
  label: string;
  description: string;
  isRecommended: boolean;
}

// Full gate plan with all recommendations
export interface GatePlan {
  sessionId: string;
  analysisId: string;

  // Summary
  completenessLevel: string;
  summary: string;

  // Per-gate recommendations
  recommendations: GateRecommendation[];

  // Highlighted findings
  highlights: {
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    description: string;
    relatedGate?: string;
  }[];

  // Security summary (if issues found)
  securitySummary?: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    topIssues: SecurityIssue[];
  };

  // Quality summary
  qualitySummary?: {
    testCoverage: number;
    overallScore: number; // 0-100
    recommendations: string[];
  };
}

// User's confirmed decision for a gate
export interface GateDecision {
  gate: string;
  selectedAction: GateAction;
  userReason?: string; // Optional reason if user chose different from recommendation
  confirmedAt: Date;
}

// Full confirmed gate plan
export interface ConfirmedGatePlan {
  sessionId: string;
  analysisId: string;
  decisions: GateDecision[];
  confirmedAt: Date;
  confirmedBy: string; // User ID
}

// Context passed to gates during execution
export interface GateContext {
  // From analysis
  classification: {
    completeness: string;
    hasUI: boolean;
    hasBackend: boolean;
    uiFramework?: string;
    backendFramework?: string;
    orm?: string;
  };

  // Extracted artifacts to inject
  extractedArtifacts: {
    openApiSpec?: object;
    prismaSchema?: string;
    uiRequirements?: { method: string; path: string }[];
    securityIssues?: SecurityIssue[];
    qualityMetrics?: QualityMetrics;
  };

  // User-confirmed decisions
  decisions: {
    [gate: string]: {
      action: GateAction;
      reason?: string;
    };
  };

  // Computed routing info
  routing: {
    skipGates: string[];
    deltaGates: string[];
    validateGates: string[];
    fullGates: string[];
    focusAreas: string[];
  };

  // Original assets
  assetIds: string[];
}

// Request DTO for confirming gate plan
export class ConfirmGatePlanDto {
  sessionId: string;
  decisions: {
    gate: string;
    action: GateAction;
    reason?: string;
  }[];
}

// Response DTO for gate plan
export class GatePlanResponseDto {
  success: boolean;
  plan?: GatePlan;
  error?: string;
}

// Request DTO for asking a clarifying question
export class AskClarificationDto {
  sessionId: string;
  gate: string;
  question: string;
}

// Response DTO for clarification
export class ClarificationResponseDto {
  answer: string;
  updatedRecommendation?: GateRecommendation;
}
