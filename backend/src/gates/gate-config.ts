/**
 * Gate Configuration - Maps gates to agents by project type
 *
 * This file defines which agents execute at each gate, what deliverables
 * they produce, and supports parallel agent execution for gates like G5.
 */

import { ProofType } from '@prisma/client';

/**
 * Required proof types for each gate that requires proof artifacts.
 * Gates not listed here either don't require proofs or have no specific requirements.
 *
 * This ensures that gate approval validates ALL required proof types are present
 * with passing status, not just "any proof exists".
 */
export const GATE_REQUIRED_PROOFS: Record<string, ProofType[]> = {
  // G3: Architecture gate requires spec validation
  G3_PENDING: ['spec_validation'],

  // G5: Development gate requires build, lint, AND working preview
  // The preview_startup proof validates that the app actually runs and serves content
  G5_PENDING: ['build_output', 'lint_output', 'preview_startup'],

  // G6: Testing gate requires unit, e2e, and integration test outputs
  G6_PENDING: ['unit_test_output', 'e2e_test_output', 'integration_test_output'],

  // G7: Security gate requires security scan
  G7_PENDING: ['security_scan'],

  // G8: Staging deployment gate requires deployment log and smoke test
  G8_PENDING: ['deployment_log', 'smoke_test'],

  // G9: Production deployment gate requires deployment log, smoke test, and manual verification
  G9_PENDING: ['deployment_log', 'smoke_test', 'manual_verification'],
};

/**
 * Minimum coverage threshold for G6 (Testing gate)
 * Coverage must be at least this percentage to pass
 */
export const COVERAGE_THRESHOLD_PERCENT = 80;

export interface GateDeliverable {
  name: string;
  owner: string;
  path?: string;
}

export interface GateAgentConfig {
  agents: string[]; // Multiple agents = parallel execution
  deliverables: GateDeliverable[];
  requiresProof: boolean;
  description: string;
  passingCriteria: string;
}

/**
 * Project-type aware gate configuration
 * - traditional: Standard web/mobile apps
 * - ai_ml: ML/AI-focused projects
 * - hybrid: Combines traditional + AI features
 */
export const GATE_CONFIG: Record<string, Record<string, GateAgentConfig>> = {
  // ============================================================
  // TRADITIONAL PROJECTS
  // ============================================================
  traditional: {
    G1_PENDING: {
      agents: ['PRODUCT_MANAGER_ONBOARDING'],
      deliverables: [
        { name: 'Project Intake', owner: 'PRODUCT_MANAGER_ONBOARDING', path: 'docs/INTAKE.md' },
      ],
      requiresProof: false,
      description: 'Project scope approval - intake questionnaire complete',
      passingCriteria: 'User has approved project scope, vision, goals, and constraints',
    },
    G1_COMPLETE: {
      agents: ['ORCHESTRATOR'],
      deliverables: [{ name: 'Task Breakdown', owner: 'ORCHESTRATOR', path: 'docs/TASKS.md' }],
      requiresProof: false,
      description: 'Intake complete, requirements gathered',
      passingCriteria: 'User has reviewed and approved the intake summary',
    },
    G2_PENDING: {
      agents: ['PRODUCT_MANAGER'],
      deliverables: [
        { name: 'Product Requirements Document', owner: 'PRODUCT_MANAGER', path: 'docs/PRD.md' },
        { name: 'User Stories', owner: 'PRODUCT_MANAGER', path: 'docs/USER_STORIES.md' },
      ],
      requiresProof: false,
      description: 'PRD creation in progress',
      passingCriteria: 'Product Manager has created complete PRD with user stories',
    },
    G2_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: false,
      description: 'PRD approved',
      passingCriteria: 'User has reviewed and approved the PRD',
    },
    G3_PENDING: {
      agents: ['ARCHITECT'],
      deliverables: [
        { name: 'OpenAPI Specification', owner: 'ARCHITECT', path: 'specs/openapi.yaml' },
        { name: 'Prisma Schema', owner: 'ARCHITECT', path: 'prisma/schema.prisma' },
        { name: 'Zod Schemas', owner: 'ARCHITECT', path: 'specs/schemas/' },
        { name: 'Architecture Document', owner: 'ARCHITECT', path: 'docs/ARCHITECTURE.md' },
        { name: 'Tech Stack Document', owner: 'ARCHITECT', path: 'docs/TECH_STACK.md' },
      ],
      requiresProof: true,
      description: 'Architecture and specifications in progress',
      passingCriteria: 'Architect has created OpenAPI spec, Prisma schema, and Zod schemas',
    },
    G3_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Architecture approved, specs locked',
      passingCriteria: 'User has reviewed and approved the architecture and specs',
    },
    G4_PENDING: {
      agents: ['UX_UI_DESIGNER'],
      deliverables: [
        { name: 'Design System', owner: 'UX_UI_DESIGNER', path: 'design/system/' },
        { name: 'UI Mockups', owner: 'UX_UI_DESIGNER', path: 'design/mockups/' },
        { name: 'Component Library', owner: 'UX_UI_DESIGNER', path: 'design/components/' },
      ],
      requiresProof: false,
      description: 'Design in progress',
      passingCriteria: 'UX/UI Designer has created 3 design options, user has selected one',
    },
    G4_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: false,
      description: 'Design approved',
      passingCriteria: 'User has reviewed and approved the final design',
    },
    G5_PENDING: {
      agents: ['FRONTEND_DEVELOPER', 'BACKEND_DEVELOPER'], // PARALLEL
      deliverables: [
        { name: 'Frontend Implementation', owner: 'FRONTEND_DEVELOPER', path: 'src/frontend/' },
        { name: 'Backend Implementation', owner: 'BACKEND_DEVELOPER', path: 'src/backend/' },
        { name: 'API Implementation', owner: 'BACKEND_DEVELOPER', path: 'src/api/' },
      ],
      requiresProof: true,
      description: 'Development in progress',
      passingCriteria: 'Developers have implemented features, all builds passing',
    },
    G5_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Development complete',
      passingCriteria: 'User has reviewed code, all tests passing',
    },
    G6_PENDING: {
      agents: ['QA_ENGINEER'],
      deliverables: [
        { name: 'Test Plan', owner: 'QA_ENGINEER', path: 'tests/TEST_PLAN.md' },
        { name: 'Test Results', owner: 'QA_ENGINEER', path: 'tests/results/' },
        { name: 'Coverage Report', owner: 'QA_ENGINEER', path: 'tests/coverage/' },
      ],
      requiresProof: true,
      description: 'Testing in progress',
      passingCriteria: 'QA Engineer has created and executed test plan, >80% coverage',
    },
    G6_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Testing complete',
      passingCriteria: 'User has reviewed test results, all critical tests passing',
    },
    G7_PENDING: {
      agents: ['SECURITY_ENGINEER'],
      deliverables: [
        {
          name: 'Security Audit Report',
          owner: 'SECURITY_ENGINEER',
          path: 'docs/SECURITY_AUDIT.md',
        },
        { name: 'Vulnerability Scan', owner: 'SECURITY_ENGINEER', path: 'security/scan-results/' },
      ],
      requiresProof: true,
      description: 'Security audit in progress',
      passingCriteria: 'Security Engineer has completed OWASP audit, no critical issues',
    },
    G7_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Security audit complete',
      passingCriteria: 'User has reviewed security audit, all issues addressed',
    },
    G8_PENDING: {
      agents: ['DEVOPS_ENGINEER'],
      deliverables: [
        { name: 'Staging Deployment', owner: 'DEVOPS_ENGINEER', path: 'deploy/staging/' },
        { name: 'CI/CD Pipeline', owner: 'DEVOPS_ENGINEER', path: '.github/workflows/' },
        { name: 'Infrastructure Config', owner: 'DEVOPS_ENGINEER', path: 'infrastructure/' },
      ],
      requiresProof: true,
      description: 'Staging deployment in progress',
      passingCriteria: 'DevOps has deployed to staging, smoke tests passing',
    },
    G8_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Staging deployment complete',
      passingCriteria: 'User has tested staging environment, ready for production',
    },
    G9_PENDING: {
      agents: ['DEVOPS_ENGINEER'],
      deliverables: [
        { name: 'Production Deployment', owner: 'DEVOPS_ENGINEER', path: 'deploy/production/' },
        { name: 'Monitoring Setup', owner: 'DEVOPS_ENGINEER', path: 'monitoring/' },
        { name: 'Runbook', owner: 'DEVOPS_ENGINEER', path: 'docs/RUNBOOK.md' },
      ],
      requiresProof: true,
      description: 'Production deployment in progress',
      passingCriteria: 'DevOps has deployed to production, health checks passing',
    },
    G9_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Production deployment complete',
      passingCriteria: 'Application is live and operational',
    },
  },

  // ============================================================
  // AI/ML PROJECTS
  // ============================================================
  ai_ml: {
    G1_PENDING: {
      agents: ['PRODUCT_MANAGER_ONBOARDING'],
      deliverables: [
        { name: 'Project Intake', owner: 'PRODUCT_MANAGER_ONBOARDING', path: 'docs/INTAKE.md' },
      ],
      requiresProof: false,
      description: 'Project scope approval - intake questionnaire complete',
      passingCriteria: 'User has approved project scope, vision, goals, and constraints',
    },
    G1_COMPLETE: {
      agents: ['ORCHESTRATOR'],
      deliverables: [{ name: 'Task Breakdown', owner: 'ORCHESTRATOR', path: 'docs/TASKS.md' }],
      requiresProof: false,
      description: 'Intake complete, requirements gathered',
      passingCriteria: 'User has reviewed and approved the intake summary',
    },
    G2_PENDING: {
      agents: ['PRODUCT_MANAGER'],
      deliverables: [
        { name: 'Product Requirements Document', owner: 'PRODUCT_MANAGER', path: 'docs/PRD.md' },
        { name: 'User Stories', owner: 'PRODUCT_MANAGER', path: 'docs/USER_STORIES.md' },
        { name: 'ML Requirements', owner: 'PRODUCT_MANAGER', path: 'docs/ML_REQUIREMENTS.md' },
      ],
      requiresProof: false,
      description: 'PRD creation in progress',
      passingCriteria:
        'Product Manager has created complete PRD with user stories and ML requirements',
    },
    G2_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: false,
      description: 'PRD approved',
      passingCriteria: 'User has reviewed and approved the PRD',
    },
    G3_PENDING: {
      agents: ['ARCHITECT'],
      deliverables: [
        { name: 'OpenAPI Specification', owner: 'ARCHITECT', path: 'specs/openapi.yaml' },
        { name: 'Prisma Schema', owner: 'ARCHITECT', path: 'prisma/schema.prisma' },
        { name: 'Zod Schemas', owner: 'ARCHITECT', path: 'specs/schemas/' },
        { name: 'Architecture Document', owner: 'ARCHITECT', path: 'docs/ARCHITECTURE.md' },
        { name: 'ML Architecture', owner: 'ARCHITECT', path: 'docs/ML_ARCHITECTURE.md' },
        { name: 'Tech Stack Document', owner: 'ARCHITECT', path: 'docs/TECH_STACK.md' },
      ],
      requiresProof: true,
      description: 'Architecture and specifications in progress',
      passingCriteria: 'Architect has created specs including ML architecture',
    },
    G3_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Architecture approved, specs locked',
      passingCriteria: 'User has reviewed and approved the architecture and specs',
    },
    G4_PENDING: {
      agents: ['UX_UI_DESIGNER'],
      deliverables: [
        { name: 'Design System', owner: 'UX_UI_DESIGNER', path: 'design/system/' },
        { name: 'UI Mockups', owner: 'UX_UI_DESIGNER', path: 'design/mockups/' },
        { name: 'ML Dashboard Design', owner: 'UX_UI_DESIGNER', path: 'design/ml-dashboard/' },
      ],
      requiresProof: false,
      description: 'Design in progress',
      passingCriteria: 'UX/UI Designer has created designs including ML interfaces',
    },
    G4_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: false,
      description: 'Design approved',
      passingCriteria: 'User has reviewed and approved the final design',
    },
    G5_PENDING: {
      // ALL 5 AGENTS RUN IN PARALLEL for AI/ML projects
      agents: [
        'FRONTEND_DEVELOPER',
        'BACKEND_DEVELOPER',
        'DATA_ENGINEER',
        'ML_ENGINEER',
        'PROMPT_ENGINEER',
      ],
      deliverables: [
        { name: 'Frontend Implementation', owner: 'FRONTEND_DEVELOPER', path: 'src/frontend/' },
        { name: 'Backend Implementation', owner: 'BACKEND_DEVELOPER', path: 'src/backend/' },
        { name: 'Data Pipelines', owner: 'DATA_ENGINEER', path: 'data/pipelines/' },
        { name: 'Feature Store', owner: 'DATA_ENGINEER', path: 'data/features/' },
        { name: 'ML Models', owner: 'ML_ENGINEER', path: 'models/' },
        { name: 'Training Pipeline', owner: 'ML_ENGINEER', path: 'ml/training/' },
        { name: 'Prompt Library', owner: 'PROMPT_ENGINEER', path: 'prompts/' },
        { name: 'Prompt Tests', owner: 'PROMPT_ENGINEER', path: 'prompts/tests/' },
      ],
      requiresProof: true,
      description: 'Development in progress (parallel: Frontend, Backend, Data, ML, Prompts)',
      passingCriteria: 'All development teams have completed implementation',
    },
    G5_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Development complete',
      passingCriteria: 'User has reviewed all implementations',
    },
    G6_PENDING: {
      agents: ['QA_ENGINEER', 'MODEL_EVALUATOR'], // PARALLEL
      deliverables: [
        { name: 'Test Plan', owner: 'QA_ENGINEER', path: 'tests/TEST_PLAN.md' },
        { name: 'Test Results', owner: 'QA_ENGINEER', path: 'tests/results/' },
        { name: 'Model Evaluation Report', owner: 'MODEL_EVALUATOR', path: 'ml/evaluation/' },
        { name: 'Model Comparison', owner: 'MODEL_EVALUATOR', path: 'ml/comparison/' },
        { name: 'Performance Benchmarks', owner: 'MODEL_EVALUATOR', path: 'ml/benchmarks/' },
      ],
      requiresProof: true,
      description: 'Testing and model evaluation in progress',
      passingCriteria: 'QA and Model Evaluator have completed testing and evaluation',
    },
    G6_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Testing and evaluation complete',
      passingCriteria: 'User has reviewed test and evaluation results',
    },
    G7_PENDING: {
      agents: ['SECURITY_ENGINEER'],
      deliverables: [
        {
          name: 'Security Audit Report',
          owner: 'SECURITY_ENGINEER',
          path: 'docs/SECURITY_AUDIT.md',
        },
        { name: 'ML Security Review', owner: 'SECURITY_ENGINEER', path: 'docs/ML_SECURITY.md' },
        {
          name: 'Data Privacy Assessment',
          owner: 'SECURITY_ENGINEER',
          path: 'docs/DATA_PRIVACY.md',
        },
      ],
      requiresProof: true,
      description: 'Security audit in progress',
      passingCriteria: 'Security Engineer has completed audit including ML-specific concerns',
    },
    G7_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Security audit complete',
      passingCriteria: 'User has reviewed security audit, all issues addressed',
    },
    G8_PENDING: {
      agents: ['AIOPS_ENGINEER'],
      deliverables: [
        { name: 'Staging Deployment', owner: 'AIOPS_ENGINEER', path: 'deploy/staging/' },
        { name: 'MLOps Pipeline', owner: 'AIOPS_ENGINEER', path: 'mlops/' },
        { name: 'Model Registry', owner: 'AIOPS_ENGINEER', path: 'models/registry/' },
        { name: 'Monitoring Config', owner: 'AIOPS_ENGINEER', path: 'monitoring/ml/' },
      ],
      requiresProof: true,
      description: 'Staging deployment with MLOps in progress',
      passingCriteria: 'AIOps has deployed models to staging with monitoring',
    },
    G8_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Staging deployment complete',
      passingCriteria: 'User has tested staging environment with ML features',
    },
    G9_PENDING: {
      agents: ['AIOPS_ENGINEER'],
      deliverables: [
        { name: 'Production Deployment', owner: 'AIOPS_ENGINEER', path: 'deploy/production/' },
        { name: 'Model Serving', owner: 'AIOPS_ENGINEER', path: 'serving/' },
        { name: 'A/B Testing Config', owner: 'AIOPS_ENGINEER', path: 'experiments/' },
        { name: 'Drift Detection', owner: 'AIOPS_ENGINEER', path: 'monitoring/drift/' },
      ],
      requiresProof: true,
      description: 'Production deployment with MLOps in progress',
      passingCriteria: 'AIOps has deployed to production with full MLOps pipeline',
    },
    G9_COMPLETE: {
      agents: [],
      deliverables: [],
      requiresProof: true,
      description: 'Production deployment complete',
      passingCriteria: 'ML application is live and operational',
    },
  },
};

// Hybrid projects inherit from ai_ml with same configuration
GATE_CONFIG.hybrid = GATE_CONFIG.ai_ml;

// Enhancement projects use traditional with reduced gates
GATE_CONFIG.enhancement = GATE_CONFIG.traditional;

/**
 * Get gate configuration for a project type and gate
 * Falls back to traditional if project type not found
 */
export function getGateConfig(
  projectType: string | null,
  gateType: string,
): GateAgentConfig | null {
  const type = projectType === 'hybrid' ? 'ai_ml' : projectType || 'traditional';
  const config = GATE_CONFIG[type];

  if (!config) {
    return GATE_CONFIG.traditional[gateType] || null;
  }

  return config[gateType] || GATE_CONFIG.traditional[gateType] || null;
}

/**
 * Get all agents for a gate (for parallel execution)
 */
export function getAgentsForGate(projectType: string | null, gateType: string): string[] {
  const config = getGateConfig(projectType, gateType);
  return config?.agents || [];
}

/**
 * Get deliverables for a gate
 */
export function getDeliverablesForGate(
  projectType: string | null,
  gateType: string,
): GateDeliverable[] {
  const config = getGateConfig(projectType, gateType);
  return config?.deliverables || [];
}

/**
 * Check if a gate supports parallel agent execution
 */
export function isParallelGate(projectType: string | null, gateType: string): boolean {
  const agents = getAgentsForGate(projectType, gateType);
  return agents.length > 1;
}

/**
 * Get task description for an agent at a specific gate
 */
export function getAgentTaskDescription(agentType: string, gateType: string): string {
  const descriptions: Record<string, Record<string, string>> = {
    PRODUCT_MANAGER_ONBOARDING: {
      G1_PENDING: 'Conduct project intake interview and gather requirements',
    },
    ORCHESTRATOR: {
      G1_COMPLETE: 'Analyze intake and create task breakdown for the project',
    },
    PRODUCT_MANAGER: {
      G2_PENDING: 'Create comprehensive Product Requirements Document with user stories',
    },
    ARCHITECT: {
      G3_PENDING: 'Design system architecture and generate OpenAPI, Prisma, and Zod specs',
    },
    UX_UI_DESIGNER: {
      G4_PENDING: `Create 3 VIEWABLE HTML design options. OUTPUT ACTUAL HTML CODE - do not describe designs.

CRITICAL REQUIREMENTS:
1. Output 3 complete HTML files using markdown code fences with filenames:
   \`\`\`html:designs/option-1-conservative.html
   <!DOCTYPE html>...
   \`\`\`
2. Each must be a WORKING HTML page (Tailwind CSS via CDN, Alpine.js for interactivity)
3. Include responsive design (mobile, tablet, desktop)
4. Follow WCAG 2.1 AA accessibility
5. After HTML files, output a Design System document

DO NOT write "I'll create..." or describe what you plan to do. START with the HTML code immediately.`,
    },
    FRONTEND_DEVELOPER: {
      G5_PENDING: 'Implement frontend from specs and design system',
    },
    BACKEND_DEVELOPER: {
      G5_PENDING: 'Implement backend API from OpenAPI and Prisma specs',
    },
    DATA_ENGINEER: {
      G5_PENDING: 'Build data pipelines and feature store for ML workflow',
    },
    ML_ENGINEER: {
      G5_PENDING: 'Train and optimize ML models according to specifications',
    },
    PROMPT_ENGINEER: {
      G5_PENDING: 'Design and test prompts for LLM integrations',
    },
    QA_ENGINEER: {
      G6_PENDING: 'Create test plan and execute tests with >80% coverage',
    },
    MODEL_EVALUATOR: {
      G6_PENDING: 'Evaluate model performance and recommend best model',
    },
    SECURITY_ENGINEER: {
      G7_PENDING: 'Perform OWASP security audit and vulnerability scan',
    },
    DEVOPS_ENGINEER: {
      G8_PENDING: 'Deploy to staging environment with CI/CD pipeline',
      G9_PENDING: 'Deploy to production with monitoring and alerting',
    },
    AIOPS_ENGINEER: {
      G8_PENDING: 'Deploy ML models to staging with MLOps monitoring',
      G9_PENDING: 'Deploy ML models to production with full MLOps pipeline',
    },
  };

  return descriptions[agentType]?.[gateType] || `Complete ${agentType} tasks for ${gateType}`;
}

/**
 * Get the next agent(s) after current agent completes (for handoff)
 */
export function getNextAgents(agentType: string, projectType: string | null): string[] {
  const handoffs: Record<string, Record<string, string[]>> = {
    traditional: {
      PRODUCT_MANAGER_ONBOARDING: ['ORCHESTRATOR'],
      ORCHESTRATOR: ['PRODUCT_MANAGER'],
      PRODUCT_MANAGER: ['ARCHITECT'],
      ARCHITECT: ['UX_UI_DESIGNER'],
      UX_UI_DESIGNER: ['FRONTEND_DEVELOPER', 'BACKEND_DEVELOPER'],
      FRONTEND_DEVELOPER: ['QA_ENGINEER'],
      BACKEND_DEVELOPER: ['QA_ENGINEER'],
      QA_ENGINEER: ['SECURITY_ENGINEER'],
      SECURITY_ENGINEER: ['DEVOPS_ENGINEER'],
      DEVOPS_ENGINEER: [],
    },
    ai_ml: {
      PRODUCT_MANAGER_ONBOARDING: ['ORCHESTRATOR'],
      ORCHESTRATOR: ['PRODUCT_MANAGER'],
      PRODUCT_MANAGER: ['ARCHITECT'],
      ARCHITECT: ['UX_UI_DESIGNER'],
      UX_UI_DESIGNER: [
        'FRONTEND_DEVELOPER',
        'BACKEND_DEVELOPER',
        'DATA_ENGINEER',
        'ML_ENGINEER',
        'PROMPT_ENGINEER',
      ],
      FRONTEND_DEVELOPER: ['QA_ENGINEER', 'MODEL_EVALUATOR'],
      BACKEND_DEVELOPER: ['QA_ENGINEER', 'MODEL_EVALUATOR'],
      DATA_ENGINEER: ['QA_ENGINEER', 'MODEL_EVALUATOR'],
      ML_ENGINEER: ['QA_ENGINEER', 'MODEL_EVALUATOR'],
      PROMPT_ENGINEER: ['QA_ENGINEER', 'MODEL_EVALUATOR'],
      QA_ENGINEER: ['SECURITY_ENGINEER'],
      MODEL_EVALUATOR: ['SECURITY_ENGINEER'],
      SECURITY_ENGINEER: ['AIOPS_ENGINEER'],
      AIOPS_ENGINEER: [],
    },
  };

  const type = projectType === 'hybrid' ? 'ai_ml' : projectType || 'traditional';
  return handoffs[type]?.[agentType] || handoffs.traditional[agentType] || [];
}
