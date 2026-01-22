import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Document template definition
 */
interface DocumentTemplate {
  title: string;
  template: string;
}

/**
 * Options for document initialization
 */
export interface GateDocumentOptions {
  projectName?: string;
  budget?: string;
}

/**
 * Service for initializing required documents after gate approvals.
 *
 * Per the Multi-Agent-Product-Creator framework:
 * - G1 creates: FEEDBACK_LOG.md, COST_LOG.md, PROJECT_CONTEXT.md
 * - G2 creates: CHANGE_REQUESTS.md
 * - G9 creates: POST_LAUNCH.md
 */
@Injectable()
export class GateDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initialize documents required after a gate approval.
   *
   * @param projectId - The project ID
   * @param gate - The gate that was just approved ('G1', 'G2', 'G9')
   * @param userId - The user ID for document creation
   * @param options - Optional configuration (project name, budget)
   */
  async initializeGateDocuments(
    projectId: string,
    gate: 'G1' | 'G2' | 'G9',
    userId: string,
    options?: GateDocumentOptions,
  ): Promise<string[]> {
    const documentsToCreate = this.getDocumentsForGate(gate);
    const createdDocuments: string[] = [];

    for (const docTemplate of documentsToCreate) {
      // Check if document already exists
      const existing = await this.prisma.document.findFirst({
        where: { projectId, title: docTemplate.title },
      });

      if (!existing) {
        const content = this.generateDocumentContent(
          docTemplate,
          options?.projectName || 'Project',
          options?.budget,
        );

        await this.prisma.document.create({
          data: {
            projectId,
            title: docTemplate.title,
            documentType: 'OTHER',
            content,
            createdById: userId,
          },
        });

        createdDocuments.push(docTemplate.title);
      }
    }

    return createdDocuments;
  }

  /**
   * Get the list of documents required for a specific gate
   */
  private getDocumentsForGate(gate: string): DocumentTemplate[] {
    switch (gate) {
      case 'G1':
        return [
          { title: 'Feedback Log', template: 'FEEDBACK_LOG' },
          { title: 'Cost Log', template: 'COST_LOG' },
          { title: 'Project Context', template: 'PROJECT_CONTEXT' },
          { title: 'Agent Log', template: 'AGENT_LOG' },
        ];
      case 'G2':
        return [{ title: 'Change Requests', template: 'CHANGE_REQUESTS' }];
      case 'G9':
        return [
          { title: 'Post Launch', template: 'POST_LAUNCH' },
          { title: 'Completion Report', template: 'COMPLETION_REPORT' },
        ];
      default:
        return [];
    }
  }

  /**
   * Generate document content from a template
   */
  private generateDocumentContent(
    template: DocumentTemplate,
    projectName: string,
    budget?: string,
  ): string {
    const today = new Date().toISOString().split('T')[0];

    switch (template.template) {
      case 'FEEDBACK_LOG':
        return `# Feedback Log - ${projectName}

## Purpose

Track all user feedback throughout the project lifecycle. This log ensures that:
- All feedback is captured and not lost
- Decisions can be traced back to user input
- Patterns in feedback can be identified

## How to Use

Add entries whenever the user provides feedback, asks questions, or makes decisions.

---

## Feedback Entries

| Date | Gate | Source | Feedback | Action Taken | Status |
|------|------|--------|----------|--------------|--------|
| ${today} | G1 | User | Project scope approved | Proceeding with planning | Complete |

---

## Summary Statistics

- **Total Entries:** 1
- **Open Items:** 0
- **Resolved Items:** 1

---

*Auto-generated after G1 approval on ${today}*
`;

      case 'COST_LOG':
        return `# Cost Log - ${projectName}

## Purpose

Track token usage and estimated costs throughout the project. This helps with:
- Budget monitoring
- Cost optimization decisions
- Usage pattern analysis

---

## Budget Configuration

| Setting | Value |
|---------|-------|
| **Allocated Budget** | ${budget || 'Not specified'} |
| **Alert Threshold** | ${budget ? '80% of budget' : 'Not set'} |
| **Track Costs** | Yes |

---

## Token Usage by Gate

| Date | Gate | Agent | Model | Input Tokens | Output Tokens | Est. Cost |
|------|------|-------|-------|--------------|---------------|-----------|
| ${today} | G1 | PM Onboarding | claude-3-5-sonnet | - | - | $0.00 |

---

## Running Totals

| Metric | Value |
|--------|-------|
| **Total Input Tokens** | 0 |
| **Total Output Tokens** | 0 |
| **Total Estimated Cost** | $0.00 |
| **Budget Remaining** | ${budget || 'N/A'} |

---

## Cost Alerts

*No alerts yet.*

---

*Auto-generated after G1 approval on ${today}*
`;

      case 'PROJECT_CONTEXT':
        return `# Project Context - ${projectName}

## Purpose

This document provides essential context for anyone (human or AI) joining the project. It serves as the single source of truth for understanding:
- What the project is about
- Key decisions made
- Current status and next steps

---

## Project Overview

| Attribute | Value |
|-----------|-------|
| **Project Name** | ${projectName} |
| **Started** | ${today} |
| **Current Phase** | Planning |
| **Current Gate** | G1 Complete |

---

## Project Description

*See PROJECT_INTAKE.md for full details.*

---

## Key Decisions

| Date | Decision | Rationale | Gate |
|------|----------|-----------|------|
| ${today} | Project scope approved | User approved classification and approach | G1 |

*Full decision history available in DECISIONS table.*

---

## Team & Stakeholders

| Role | Entity |
|------|--------|
| **Project Owner** | User |
| **AI Agents** | FuzzyLlama Multi-Agent System |

---

## Important Links

- **Intake Document:** PROJECT_INTAKE.md
- **Decisions:** Tracked in database
- **Feedback:** FEEDBACK_LOG.md
- **Costs:** COST_LOG.md

---

## Current Status

**Gate:** G1 Complete
**Next:** G2 - PRD Creation

The Product Manager will create a detailed Product Requirements Document based on the approved intake.

---

*Auto-generated after G1 approval on ${today}*
`;

      case 'CHANGE_REQUESTS':
        return `# Change Requests - ${projectName}

## Purpose

Track all scope changes requested after PRD approval. This ensures:
- Changes are evaluated before implementation
- Impact is assessed
- Stakeholder approval is obtained

---

## Change Request Process

1. **Log Request** - Add entry below with details
2. **Impact Analysis** - Assess effort, timeline, and dependencies
3. **Decision** - Approve, Defer, or Reject
4. **Implementation** - If approved, track in tasks

---

## Active Change Requests

| ID | Date | Requested By | Description | Impact | Status | Decision |
|----|------|--------------|-------------|--------|--------|----------|
| - | - | - | *No change requests yet* | - | - | - |

---

## Completed Change Requests

| ID | Date | Description | Outcome |
|----|------|-------------|---------|
| - | - | *None yet* | - |

---

## Summary

- **Total Requests:** 0
- **Approved:** 0
- **Rejected:** 0
- **Pending:** 0

---

*Auto-generated after G2 approval on ${today}*
`;

      case 'POST_LAUNCH':
        return `# Post Launch - ${projectName}

## Purpose

Track post-launch activities, monitoring, and follow-up actions.

---

## Launch Information

| Attribute | Value |
|-----------|-------|
| **Launch Date** | ${today} |
| **Environment** | Production |
| **Version** | 1.0.0 |

---

## Monitoring Checklist

- [ ] Health checks passing
- [ ] Error rates normal
- [ ] Performance metrics acceptable
- [ ] User feedback collected
- [ ] Analytics tracking active

---

## Post-Launch Issues

| Date | Issue | Severity | Status | Resolution |
|------|-------|----------|--------|------------|
| - | *No issues reported* | - | - | - |

---

## User Feedback (First 7 Days)

| Date | Source | Feedback | Action |
|------|--------|----------|--------|
| - | *Collecting...* | - | - |

---

## Next Steps

1. Monitor for 7 days
2. Collect user feedback
3. Plan iteration based on feedback
4. Schedule retrospective

---

*Auto-generated after G9 approval on ${today}*
`;

      case 'AGENT_LOG':
        return `# Agent Execution Log - ${projectName}

## Purpose

Track all AI agent executions throughout the project lifecycle. This log provides:
- Visibility into which agents ran and when
- Duration and outcome tracking
- Debugging information for troubleshooting
- Audit trail for compliance

---

## Agent Executions

| Timestamp | Gate | Agent | Task | Duration | Outcome |
|-----------|------|-------|------|----------|---------|
| ${today} | G1 | PM Onboarding | Project intake interview | - | Started |

---

## Summary by Agent

| Agent | Total Executions | Successful | Failed |
|-------|-----------------|------------|--------|
| *Collecting...* | - | - | - |

---

## Summary by Gate

| Gate | Agents Run | Total Duration | Status |
|------|------------|----------------|--------|
| G1 | 1 | - | In Progress |

---

## Notes

- Agent executions are logged automatically after each completion
- Duration is calculated from start to finish
- Failed executions include error details in the Outcome column

---

*Auto-generated after G1 approval on ${today}*
`;

      case 'COMPLETION_REPORT':
        return `# Completion Report - ${projectName}

## Purpose

This comprehensive report summarizes the entire project from inception to deployment, documenting all gates passed, agents involved, deliverables created, and lessons learned.

---

## Project Summary

| Attribute | Value |
|-----------|-------|
| **Project Name** | ${projectName} |
| **Completed** | ${today} |
| **Total Gates** | 9 (G1-G9) |
| **Status** | Production Deployed |

---

## Gate History

| Gate | Name | Approved Date | Approver | Duration |
|------|------|---------------|----------|----------|
| G1 | Scope Approved | - | - | - |
| G2 | PRD Approved | - | - | - |
| G3 | Architecture Approved | - | - | - |
| G4 | Design Approved | - | - | - |
| G5 | Feature Acceptance | - | - | - |
| G6 | Quality Sign-off | - | - | - |
| G7 | Security Acceptance | - | - | - |
| G8 | Go/No-Go | - | - | - |
| G9 | Production Acceptance | ${today} | User | - |

---

## Agent Contributions

| Agent | Executions | Key Deliverables |
|-------|------------|------------------|
| PM Onboarding | 1 | Project Intake |
| Product Manager | 1 | PRD |
| Architect | 1 | OpenAPI, Prisma Schema, Architecture Doc |
| UX/UI Designer | 1 | Design System, Mockups |
| Frontend Developer | 1+ | Frontend Implementation |
| Backend Developer | 1+ | Backend Implementation |
| QA Engineer | 1+ | Test Plan, Test Results |
| Security Engineer | 1 | Security Audit Report |
| DevOps Engineer | 2 | Staging Deploy, Production Deploy |

---

## Deliverables Checklist

### Planning Phase (G1-G4)
- [ ] Project Intake Document
- [ ] Product Requirements Document (PRD)
- [ ] System Architecture Document
- [ ] API Specification (OpenAPI)
- [ ] Database Schema (Prisma)
- [ ] Design System
- [ ] UI Mockups

### Development Phase (G5-G6)
- [ ] Frontend Code
- [ ] Backend Code
- [ ] Unit Tests (>80% coverage)
- [ ] Integration Tests
- [ ] Test Results Report

### Ship Phase (G7-G9)
- [ ] Security Audit Report
- [ ] Staging Deployment
- [ ] Production Deployment
- [ ] Post-Launch Monitoring

---

## Cost Summary

| Metric | Value |
|--------|-------|
| **Total Input Tokens** | - |
| **Total Output Tokens** | - |
| **Total Estimated Cost** | $0.00 |
| **Agent Executions** | - |

*See COST_LOG.md for detailed breakdown*

---

## Test Metrics

| Metric | Value | Target |
|--------|-------|--------|
| **Code Coverage** | - | >80% |
| **Unit Tests** | - | Pass |
| **Integration Tests** | - | Pass |
| **E2E Tests** | - | Pass |
| **Security Vulnerabilities** | 0 | 0 Critical/High |

---

## Security Summary

| Check | Status |
|-------|--------|
| OWASP Top 10 | - |
| Authentication | - |
| Authorization | - |
| Data Protection | - |
| Input Validation | - |

---

## Lessons Learned

### What Worked Well
1. *To be filled by user or orchestrator*

### What Could Be Improved
1. *To be filled by user or orchestrator*

### Recommendations for Future Projects
1. *To be filled by user or orchestrator*

---

## Acknowledgments

This project was built using the FuzzyLlama multi-agent system with the following AI agents:
- Product Manager Onboarding
- Product Manager
- Architect
- UX/UI Designer
- Frontend Developer
- Backend Developer
- QA Engineer
- Security Engineer
- DevOps Engineer

---

*Auto-generated Completion Report on ${today}*
`;

      default:
        return `# ${template.title}

*Auto-generated document*

Created: ${today}
`;
    }
  }

  /**
   * Check if all required documents for a gate exist
   */
  async checkGateDocumentsExist(
    projectId: string,
    gate: 'G1' | 'G2' | 'G9',
  ): Promise<{
    complete: boolean;
    missing: string[];
  }> {
    const requiredDocs = this.getDocumentsForGate(gate);
    const missing: string[] = [];

    for (const doc of requiredDocs) {
      const exists = await this.prisma.document.findFirst({
        where: { projectId, title: doc.title },
      });

      if (!exists) {
        missing.push(doc.title);
      }
    }

    return {
      complete: missing.length === 0,
      missing,
    };
  }
}
