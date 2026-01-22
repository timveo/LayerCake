import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * AgentMemoryService - Persistent agent execution memory
 *
 * Purpose:
 * - Capture full agent transcripts (system prompt, user prompt, response)
 * - Survive context compaction (AI context window limits)
 * - Enable querying "what did agent X see and produce?"
 * - Provide audit trail for debugging and compliance
 * - Support cross-project learning (find similar past work)
 *
 * Unlike SessionContext (TTL-based, temporary), AgentMemory is permanent.
 * Unlike EventStore (state changes), AgentMemory captures full content.
 */
@Injectable()
export class AgentMemoryService {
  private readonly logger = new Logger(AgentMemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Save complete agent execution memory
   * Called after each agent completes successfully
   */
  async saveAgentMemory(input: {
    projectId: string;
    agentId: string;
    agentType: string;
    gateType: string;
    systemPrompt: string;
    userPrompt: string;
    response: string;
    documentsUsed?: string[];
    handoffContext?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    durationMs?: number;
  }): Promise<{ id: string }> {
    this.logger.log(`Saving memory for ${input.agentType} at ${input.gateType}`);

    const memory = await this.prisma.agentMemory.create({
      data: {
        projectId: input.projectId,
        agentId: input.agentId,
        agentType: input.agentType,
        gateType: input.gateType,
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        response: input.response,
        documentsUsed: input.documentsUsed || [],
        handoffContext: input.handoffContext,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        durationMs: input.durationMs,
      },
    });

    this.logger.log(`Memory saved: ${memory.id}`);

    return { id: memory.id };
  }

  /**
   * Get memory for a specific agent execution
   */
  async getAgentMemory(agentId: string): Promise<any | null> {
    return this.prisma.agentMemory.findFirst({
      where: { agentId },
    });
  }

  /**
   * Get all memories for a project
   */
  async getProjectMemories(
    projectId: string,
    options?: {
      agentType?: string;
      gateType?: string;
      limit?: number;
    },
  ): Promise<any[]> {
    const where: any = { projectId };

    if (options?.agentType) {
      where.agentType = options.agentType;
    }

    if (options?.gateType) {
      where.gateType = options.gateType;
    }

    return this.prisma.agentMemory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 100,
    });
  }

  /**
   * Get memories by agent type across all projects
   * Useful for cross-project learning
   */
  async getMemoriesByAgentType(agentType: string, limit = 50): Promise<any[]> {
    return this.prisma.agentMemory.findMany({
      where: { agentType },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        projectId: true,
        gateType: true,
        userPrompt: true,
        response: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        createdAt: true,
      },
    });
  }

  /**
   * Get what an agent saw (input context)
   */
  async getAgentInputContext(agentId: string): Promise<{
    systemPrompt: string;
    userPrompt: string;
    documentsUsed: string[];
    handoffContext: string | null;
  } | null> {
    const memory = await this.prisma.agentMemory.findFirst({
      where: { agentId },
      select: {
        systemPrompt: true,
        userPrompt: true,
        documentsUsed: true,
        handoffContext: true,
      },
    });

    return memory;
  }

  /**
   * Get what an agent produced (output)
   */
  async getAgentOutput(agentId: string): Promise<{
    response: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
  } | null> {
    const memory = await this.prisma.agentMemory.findFirst({
      where: { agentId },
      select: {
        response: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
      },
    });

    return memory;
  }

  /**
   * Get memory statistics for a project
   */
  async getMemoryStatistics(projectId: string): Promise<{
    totalMemories: number;
    byAgentType: Record<string, number>;
    byGate: Record<string, number>;
    totalTokensUsed: { input: number; output: number };
  }> {
    const memories = await this.prisma.agentMemory.findMany({
      where: { projectId },
      select: {
        agentType: true,
        gateType: true,
        inputTokens: true,
        outputTokens: true,
      },
    });

    const byAgentType: Record<string, number> = {};
    const byGate: Record<string, number> = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const memory of memories) {
      byAgentType[memory.agentType] = (byAgentType[memory.agentType] || 0) + 1;
      byGate[memory.gateType] = (byGate[memory.gateType] || 0) + 1;
      totalInputTokens += memory.inputTokens;
      totalOutputTokens += memory.outputTokens;
    }

    return {
      totalMemories: memories.length,
      byAgentType,
      byGate,
      totalTokensUsed: {
        input: totalInputTokens,
        output: totalOutputTokens,
      },
    };
  }

  /**
   * Search memories by content (basic text search)
   * For semantic search, use embeddings module
   */
  async searchMemories(projectId: string, query: string, limit = 10): Promise<any[]> {
    // PostgreSQL full-text search on response content
    return this.prisma.agentMemory.findMany({
      where: {
        projectId,
        OR: [
          { response: { contains: query, mode: 'insensitive' } },
          { userPrompt: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        agentType: true,
        gateType: true,
        response: true,
        createdAt: true,
      },
    });
  }

  /**
   * Get agent execution timeline for a project
   */
  async getExecutionTimeline(projectId: string): Promise<
    Array<{
      id: string;
      agentType: string;
      gateType: string;
      inputTokens: number;
      outputTokens: number;
      durationMs: number | null;
      createdAt: Date;
    }>
  > {
    return this.prisma.agentMemory.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        agentType: true,
        gateType: true,
        inputTokens: true,
        outputTokens: true,
        durationMs: true,
        createdAt: true,
      },
    });
  }

  /**
   * Delete memories for a project (for cleanup/GDPR)
   */
  async deleteProjectMemories(projectId: string): Promise<number> {
    const result = await this.prisma.agentMemory.deleteMany({
      where: { projectId },
    });

    this.logger.log(`Deleted ${result.count} memories for project ${projectId}`);

    return result.count;
  }

  /**
   * Get context for reconstructing agent state
   * Useful for debugging or resuming failed executions
   */
  async getReconstructionContext(
    projectId: string,
    gateType: string,
  ): Promise<{
    previousAgents: Array<{
      agentType: string;
      summary: string | null;
      documentsCreated: string[];
    }>;
    handoffChain: string[];
  }> {
    const memories = await this.prisma.agentMemory.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: {
        agentType: true,
        gateType: true,
        summary: true,
        documentsUsed: true,
      },
    });

    // Filter to gates before current one
    const gateOrder = [
      'G1_PENDING',
      'G2_PENDING',
      'G3_PENDING',
      'G4_PENDING',
      'G5_PENDING',
      'G6_PENDING',
      'G7_PENDING',
      'G8_PENDING',
      'G9_PENDING',
    ];
    const currentGateIndex = gateOrder.indexOf(gateType);

    const previousAgents = memories
      .filter((m) => gateOrder.indexOf(m.gateType) < currentGateIndex)
      .map((m) => ({
        agentType: m.agentType,
        summary: m.summary,
        documentsCreated: m.documentsUsed,
      }));

    const handoffChain = memories.map((m) => m.agentType);

    return {
      previousAgents,
      handoffChain,
    };
  }
}
