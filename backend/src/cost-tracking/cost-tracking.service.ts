import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * CostTrackingService - Track AI API costs per project, gate, and agent
 *
 * Purpose:
 * - Calculate costs from token usage (input + output tokens)
 * - Track costs per gate (G1-G9)
 * - Aggregate costs per project
 * - Provide cost breakdowns for billing
 *
 * Pricing (as of 2024):
 * - Claude Opus 4: $15/$75 per 1M tokens (input/output)
 * - Claude Sonnet 4: $3/$15 per 1M tokens
 * - GPT-4 Turbo: $10/$30 per 1M tokens
 * - GPT-3.5 Turbo: $0.50/$1.50 per 1M tokens
 */
@Injectable()
export class CostTrackingService {
  constructor(private readonly prisma: PrismaService) {}

  // Model pricing per 1M tokens (USD)
  private readonly MODEL_PRICING = {
    'claude-opus-4': { input: 15, output: 75 },
    'claude-sonnet-4': { input: 3, output: 15 },
    'claude-3-opus-20240229': { input: 15, output: 75 },
    'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
    'gpt-4-turbo': { input: 10, output: 30 },
    'gpt-4o': { input: 5, output: 15 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  };

  /**
   * Calculate cost for a single agent execution
   */
  calculateAgentCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = this.MODEL_PRICING[model] || {
      input: 3,
      output: 15,
    }; // Default to Sonnet pricing

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Get costs per gate for a project
   */
  async getCostsPerGate(projectId: string): Promise<
    Array<{
      gateType: string;
      agentExecutions: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCost: number;
      agents: Array<{
        agentType: string;
        executions: number;
        cost: number;
      }>;
    }>
  > {
    // Get all gates for project
    const gates = await this.prisma.gate.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });

    // Get all agent executions for the project
    const allAgents = await this.prisma.agent.findMany({
      where: { projectId },
    });

    const costsByGate = [];

    for (const gate of gates) {
      // Filter agents by gate type (agents created during this gate's phase)
      // Since there's no direct relation, we filter by context or just include all for now
      const agents = allAgents;

      // Calculate totals
      const totalInputTokens = agents.reduce((sum, a) => sum + a.inputTokens, 0);
      const totalOutputTokens = agents.reduce((sum, a) => sum + a.outputTokens, 0);

      // Calculate cost per agent type
      const agentTypeCosts: Record<string, { executions: number; cost: number }> = {};

      agents.forEach((agent) => {
        const cost = this.calculateAgentCost(agent.model, agent.inputTokens, agent.outputTokens);

        if (!agentTypeCosts[agent.agentType]) {
          agentTypeCosts[agent.agentType] = { executions: 0, cost: 0 };
        }

        agentTypeCosts[agent.agentType].executions++;
        agentTypeCosts[agent.agentType].cost += cost;
      });

      const totalCost = Object.values(agentTypeCosts).reduce((sum, a) => sum + a.cost, 0);

      costsByGate.push({
        gateType: gate.gateType,
        agentExecutions: agents.length,
        totalInputTokens,
        totalOutputTokens,
        totalCost,
        agents: Object.entries(agentTypeCosts).map(([agentType, data]) => ({
          agentType,
          executions: data.executions,
          cost: data.cost,
        })),
      });
    }

    return costsByGate;
  }

  /**
   * Get total project costs
   */
  async getProjectCosts(projectId: string): Promise<{
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalAgentExecutions: number;
    costsByModel: Record<string, { cost: number; executions: number }>;
    costsByAgent: Record<string, { cost: number; executions: number }>;
  }> {
    const agents = await this.prisma.agent.findMany({
      where: { projectId },
      select: {
        model: true,
        agentType: true,
        inputTokens: true,
        outputTokens: true,
      },
    });

    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const costsByModel: Record<string, { cost: number; executions: number }> = {};
    const costsByAgent: Record<string, { cost: number; executions: number }> = {};

    agents.forEach((agent) => {
      const cost = this.calculateAgentCost(agent.model, agent.inputTokens, agent.outputTokens);

      totalCost += cost;
      totalInputTokens += agent.inputTokens;
      totalOutputTokens += agent.outputTokens;

      // By model
      if (!costsByModel[agent.model]) {
        costsByModel[agent.model] = { cost: 0, executions: 0 };
      }
      costsByModel[agent.model].cost += cost;
      costsByModel[agent.model].executions++;

      // By agent type
      if (!costsByAgent[agent.agentType]) {
        costsByAgent[agent.agentType] = { cost: 0, executions: 0 };
      }
      costsByAgent[agent.agentType].cost += cost;
      costsByAgent[agent.agentType].executions++;
    });

    return {
      totalCost,
      totalInputTokens,
      totalOutputTokens,
      totalAgentExecutions: agents.length,
      costsByModel,
      costsByAgent,
    };
  }

  /**
   * Record usage metric for billing
   */
  async recordUsageMetric(
    userId: string,
    projectId: string,
    agentExecutions: number,
    apiTokensUsed: number,
    cost: number,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<any> {
    return this.prisma.usageMetric.create({
      data: {
        userId,
        projectId,
        agentExecutions,
        apiTokensUsed,
        cost: new Decimal(cost),
        periodStart,
        periodEnd,
      },
    });
  }

  /**
   * Get usage metrics for a user
   */
  async getUserUsage(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalAgentExecutions: number;
    totalTokensUsed: number;
    totalCost: number;
    byProject: Array<{
      projectId: string;
      projectName: string;
      agentExecutions: number;
      cost: number;
    }>;
  }> {
    const where: any = { userId };

    if (startDate && endDate) {
      where.periodStart = { gte: startDate };
      where.periodEnd = { lte: endDate };
    }

    const metrics = await this.prisma.usageMetric.findMany({
      where,
    });

    const totalAgentExecutions = metrics.reduce((sum, m) => sum + m.agentExecutions, 0);
    const totalTokensUsed = metrics.reduce((sum, m) => sum + m.apiTokensUsed, 0);
    const totalCost = metrics.reduce((sum, m) => sum + parseFloat(m.cost.toString()), 0);

    // Group by project
    const projectCosts: Record<string, { agentExecutions: number; cost: number }> = {};

    metrics.forEach((m) => {
      if (m.projectId) {
        if (!projectCosts[m.projectId]) {
          projectCosts[m.projectId] = { agentExecutions: 0, cost: 0 };
        }
        projectCosts[m.projectId].agentExecutions += m.agentExecutions;
        projectCosts[m.projectId].cost += parseFloat(m.cost.toString());
      }
    });

    // Get project names
    const projectIds = Object.keys(projectCosts);
    const projects = await this.prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
    });

    const projectMap = new Map(projects.map((p) => [p.id, p.name]));

    const byProject = Object.entries(projectCosts).map(([projectId, data]) => ({
      projectId,
      projectName: projectMap.get(projectId) || 'Unknown',
      agentExecutions: data.agentExecutions,
      cost: data.cost,
    }));

    return {
      totalAgentExecutions,
      totalTokensUsed,
      totalCost,
      byProject,
    };
  }

  /**
   * Log cost for a single agent execution and update COST_LOG document
   * This is called after each agent completes to track real-time costs
   */
  async logAgentCost(
    projectId: string,
    agentType: string,
    gateType: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<{ cost: number; totalProjectCost: number }> {
    const cost = this.calculateAgentCost(model, inputTokens, outputTokens);

    // Update the COST_LOG document with this agent's usage
    await this.updateCostLogDocument(projectId, {
      date: new Date().toISOString().split('T')[0],
      gate: gateType,
      agent: agentType,
      model,
      inputTokens,
      outputTokens,
      cost,
    });

    // Get total project cost
    const projectCosts = await this.getProjectCosts(projectId);

    return {
      cost,
      totalProjectCost: projectCosts.totalCost,
    };
  }

  /**
   * Update the COST_LOG document with new usage entry
   */
  async updateCostLogDocument(
    projectId: string,
    entry: {
      date: string;
      gate: string;
      agent: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      cost: number;
    },
  ): Promise<void> {
    // Find the Cost Log document
    const costLogDoc = await this.prisma.document.findFirst({
      where: {
        projectId,
        title: 'Cost Log',
      },
    });

    if (!costLogDoc) {
      console.log('[CostTracking] Cost Log document not found for project:', projectId);
      return;
    }

    // Get project costs for totals
    const projectCosts = await this.getProjectCosts(projectId);

    // Format agent name for display
    const agentDisplay = entry.agent
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    // Build new table row
    const newRow = `| ${entry.date} | ${entry.gate} | ${agentDisplay} | ${entry.model} | ${entry.inputTokens.toLocaleString()} | ${entry.outputTokens.toLocaleString()} | $${entry.cost.toFixed(4)} |`;

    // Parse current content and insert new row
    let content = costLogDoc.content;

    // Find the "Token Usage by Gate" table and add the new row
    const tableMatch = content.match(
      /## Token Usage by Gate\s*\n\n\| Date \| Gate \| Agent \| Model \| Input Tokens \| Output Tokens \| Est\. Cost \|\n\|[-|\s]+\|\n([\s\S]*?)\n\n---/,
    );

    if (tableMatch) {
      const existingRows = tableMatch[1].trim();
      let newTableContent: string;

      // Replace placeholder row if exists, otherwise append
      if (existingRows.includes('| - | - |') || existingRows.trim() === '') {
        // Replace placeholder with actual data
        newTableContent = newRow;
      } else {
        // Append new row
        newTableContent = existingRows + '\n' + newRow;
      }

      content = content.replace(
        /## Token Usage by Gate\s*\n\n\| Date \| Gate \| Agent \| Model \| Input Tokens \| Output Tokens \| Est\. Cost \|\n\|[-|\s]+\|\n[\s\S]*?\n\n---/,
        `## Token Usage by Gate

| Date | Gate | Agent | Model | Input Tokens | Output Tokens | Est. Cost |
|------|------|-------|-------|--------------|---------------|-----------|
${newTableContent}

---`,
      );
    }

    // Update running totals section
    content = content.replace(
      /## Running Totals\s*\n\n\| Metric \| Value \|\n\|[-|\s]+\|\n[\s\S]*?\n\n---/,
      `## Running Totals

| Metric | Value |
|--------|-------|
| **Total Input Tokens** | ${projectCosts.totalInputTokens.toLocaleString()} |
| **Total Output Tokens** | ${projectCosts.totalOutputTokens.toLocaleString()} |
| **Total Estimated Cost** | $${projectCosts.totalCost.toFixed(4)} |
| **Agent Executions** | ${projectCosts.totalAgentExecutions} |

---`,
    );

    // Update the document
    await this.prisma.document.update({
      where: { id: costLogDoc.id },
      data: {
        content,
        updatedAt: new Date(),
      },
    });

    console.log(
      `[CostTracking] Updated Cost Log: ${agentDisplay} at ${entry.gate} - $${entry.cost.toFixed(4)}`,
    );
  }

  /**
   * Get cost estimate for a gate based on historical data
   */
  async estimateGateCost(gateType: string): Promise<{
    averageCost: number;
    minCost: number;
    maxCost: number;
    sampleSize: number;
  }> {
    // Get all gates of this type across all projects
    const gates = await this.prisma.gate.findMany({
      where: { gateType },
    });

    // Get all agent executions for projects with this gate type
    const projectIds = gates.map((g) => g.projectId);
    const allAgents = await this.prisma.agent.findMany({
      where: { projectId: { in: projectIds } },
    });

    const costs: number[] = [];

    for (const gate of gates) {
      // Filter agents for this project
      const agents = allAgents.filter((a) => a.projectId === gate.projectId);

      const gateCost = agents.reduce((sum, agent) => {
        return sum + this.calculateAgentCost(agent.model, agent.inputTokens, agent.outputTokens);
      }, 0);

      costs.push(gateCost);
    }

    if (costs.length === 0) {
      return { averageCost: 0, minCost: 0, maxCost: 0, sampleSize: 0 };
    }

    const averageCost = costs.reduce((sum, c) => sum + c, 0) / costs.length;
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);

    return {
      averageCost,
      minCost,
      maxCost,
      sampleSize: costs.length,
    };
  }
}
