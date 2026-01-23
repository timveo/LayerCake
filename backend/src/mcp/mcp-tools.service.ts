import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { TaskStatus } from '@prisma/client';
import { StateSyncService } from '../state-sync/state-sync.service';
import { FileSystemService } from '../code-generation/filesystem.service';
import { CodeParserService } from '../code-generation/code-parser.service';
import { BuildExecutorService } from '../code-generation/build-executor.service';
import { GitIntegrationService } from '../code-generation/git-integration.service';
import { GitHubService } from '../integrations/github/github.service';
import { RailwayService } from '../integrations/railway/railway.service';
import { EventStoreService } from '../events/event-store.service';
import { EventType } from '../events/domain-event.interface';

/**
 * McpToolsService - Tool Execution Layer
 *
 * Implements all 160+ tools for MCP protocol
 * Bridges MCP requests to FuzzyLlama services
 *
 * NOTE: This service should NOT depend on AgentExecutionService
 * to avoid circular dependencies. Agents call tools, not vice versa.
 */
@Injectable()
export class McpToolsService {
  private readonly logger = new Logger(McpToolsService.name);

  // Circuit breaker: track tool failures
  private toolFailureCounts: Map<string, { count: number; lastFailure: Date }> = new Map();
  private readonly MAX_FAILURES = 3;
  private readonly FAILURE_RESET_MS = 60000; // Reset after 1 minute

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateSync: StateSyncService,
    private readonly filesystem: FileSystemService,
    private readonly codeParser: CodeParserService,
    private readonly buildExecutor: BuildExecutorService,
    private readonly gitIntegration: GitIntegrationService,
    private readonly github: GitHubService,
    private readonly railway: RailwayService,
    private readonly eventStore: EventStoreService,
  ) {}

  /**
   * Check if a tool is currently circuit-broken
   */
  private isCircuitBroken(toolName: string): boolean {
    const failure = this.toolFailureCounts.get(toolName);
    if (!failure) return false;

    // Reset if enough time has passed
    if (Date.now() - failure.lastFailure.getTime() > this.FAILURE_RESET_MS) {
      this.toolFailureCounts.delete(toolName);
      return false;
    }

    return failure.count >= this.MAX_FAILURES;
  }

  /**
   * Record a tool failure for circuit breaker
   */
  private recordToolFailure(toolName: string): void {
    const existing = this.toolFailureCounts.get(toolName);
    if (existing) {
      existing.count++;
      existing.lastFailure = new Date();
    } else {
      this.toolFailureCounts.set(toolName, { count: 1, lastFailure: new Date() });
    }
  }

  /**
   * Reset failure count on success
   */
  private recordToolSuccess(toolName: string): void {
    this.toolFailureCounts.delete(toolName);
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    this.logger.log(`Executing tool: ${toolName}`);

    // Circuit breaker check
    if (this.isCircuitBroken(toolName)) {
      this.logger.warn(`Tool ${toolName} is circuit-broken due to repeated failures`);
      return {
        error: `Tool ${toolName} is temporarily unavailable due to repeated failures. Try again later.`,
        circuit_broken: true,
      };
    }

    try {
      let result: any;

      // Route to appropriate handler based on tool name
      switch (toolName) {
        // ========== TOOL-USE TOOLS (used during agent execution) ==========
        case 'get_context_for_story':
          result = await this.getContextForStory(args);
          break;
        case 'register_spec':
          result = await this.registerSpec(args);
          break;
        case 'check_spec_integrity':
          result = await this.checkSpecIntegrity(args);
          break;
        case 'record_decision':
          result = await this.recordDecisionTool(args);
          break;
        case 'get_documents':
          result = await this.getDocuments(args);
          break;
        case 'record_handoff':
          result = await this.recordHandoff(args);
          break;
        case 'create_task_for_agent':
          result = await this.createTaskForAgent(args);
          break;

        // ========== STATE MANAGEMENT TOOLS ==========
        case 'read_status':
          result = await this.readStatus(args);
          break;
        case 'update_status':
          result = await this.updateStatus(args);
          break;
        case 'read_decisions':
          result = await this.readDecisions(args);
          break;
        case 'create_decision':
          result = await this.createDecision(args);
          break;
        case 'read_memory':
          result = await this.readMemory(args);
          break;
        case 'read_gates':
          result = await this.readGates(args);
          break;
        case 'read_tasks':
          result = await this.readTasks(args);
          break;

        // ========== PROJECT MANAGEMENT TOOLS ==========
        case 'create_project':
          result = await this.createProject(args);
          break;
        case 'get_project':
          result = await this.getProject(args);
          break;
        case 'list_projects':
          result = await this.listProjects(args);
          break;
        case 'update_project':
          result = await this.updateProject(args);
          break;

        // ========== AGENT TOOLS ==========
        case 'execute_agent':
          throw new Error(
            'execute_agent requires authentication context - use AgentExecutionService directly',
          );
        case 'get_agent_history':
          result = await this.getAgentHistory(args);
          break;
        case 'get_agent_status':
          result = await this.getAgentStatus(args);
          break;

        // ========== GATE MANAGEMENT TOOLS ==========
        case 'get_gates':
          result = await this.getGates(args);
          break;
        case 'approve_gate':
          result = await this.approveGate(args);
          break;
        case 'reject_gate':
          result = await this.rejectGate(args);
          break;
        case 'get_gate_artifacts':
          result = await this.getGateArtifacts(args);
          break;

        // ========== DOCUMENT TOOLS ==========
        case 'create_document':
          result = await this.createDocument(args);
          break;
        case 'get_document':
          result = await this.getDocument(args);
          break;
        case 'update_document':
          result = await this.updateDocument(args);
          break;

        // ========== FILE SYSTEM TOOLS ==========
        case 'write_file':
          result = await this.writeFile(args);
          break;
        case 'read_file':
          result = await this.readFile(args);
          break;
        case 'list_files':
          result = await this.listFiles(args);
          break;
        case 'delete_file':
          result = await this.deleteFile(args);
          break;

        // ========== CODE GENERATION TOOLS ==========
        case 'initialize_workspace':
          result = await this.initializeWorkspace(args);
          break;
        case 'parse_code':
          result = await this.parseCode(args);
          break;
        case 'validate_build':
          result = await this.validateBuild(args);
          break;
        case 'run_tests':
          result = await this.runTests(args);
          break;

        // ========== GIT TOOLS ==========
        case 'git_init':
          result = await this.gitInit(args);
          break;
        case 'git_commit':
          result = await this.gitCommit(args);
          break;
        case 'git_status':
          result = await this.gitStatus(args);
          break;

        // ========== GITHUB TOOLS ==========
        case 'github_export':
          result = await this.githubExport(args);
          break;
        case 'github_push':
          result = await this.githubPush(args);
          break;

        // ========== RAILWAY TOOLS ==========
        case 'railway_deploy':
          result = await this.railwayDeploy(args);
          break;
        case 'railway_status':
          result = await this.railwayStatus(args);
          break;

        // ========== TASK MANAGEMENT TOOLS ==========
        case 'create_task':
          result = await this.createTask(args);
          break;
        case 'get_tasks':
          result = await this.getTasks(args);
          break;
        case 'update_task':
          result = await this.updateTask(args);
          break;

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      // Record success
      this.recordToolSuccess(toolName);
      return result;
    } catch (error) {
      this.logger.error(`Tool execution failed: ${toolName} - ${error.message}`);
      this.recordToolFailure(toolName);
      throw error;
    }
  }

  // ===========================
  // TOOL-USE HANDLERS
  // (Business logic for tools called during agent execution)
  // ===========================

  /**
   * Get context for a story/task on demand
   */
  private async getContextForStory(args: {
    projectId: string;
    query: string;
    context_types?: string[];
  }): Promise<any> {
    const contextTypes = args.context_types || ['documents', 'decisions'];
    const results: Record<string, any> = {};

    if (contextTypes.includes('documents')) {
      const docs = await this.prisma.document.findMany({
        where: { projectId: args.projectId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          content: true,
          documentType: true,
          updatedAt: true,
        },
        take: 50,
      });
      // Filter by query relevance
      const relevantDocs = docs.filter(
        (d) =>
          d.title?.toLowerCase().includes(args.query.toLowerCase()) ||
          d.content?.toLowerCase().includes(args.query.toLowerCase()),
      );
      results.documents = relevantDocs.slice(0, 5);
    }

    if (contextTypes.includes('decisions')) {
      const decisions = await this.prisma.decision.findMany({
        where: { projectId: args.projectId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      results.decisions = decisions;
    }

    if (contextTypes.includes('specs')) {
      results.specs = {
        openapi: await this.filesystem
          .readFile(args.projectId, 'specs/openapi.yaml')
          .catch(() => null),
        prisma: await this.filesystem
          .readFile(args.projectId, 'prisma/schema.prisma')
          .catch(() => null),
      };
    }

    if (contextTypes.includes('handoffs')) {
      const handoffs = await this.prisma.handoff.findMany({
        where: { projectId: args.projectId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { handoffDeliverables: true },
      });
      results.handoffs = handoffs;
    }

    return {
      success: true,
      query: args.query,
      context: results,
    };
  }

  /**
   * Register a spec file explicitly
   */
  private async registerSpec(args: {
    projectId: string;
    spec_type: string;
    file_path: string;
    content: string;
    description?: string;
  }): Promise<any> {
    // Write the spec file
    await this.filesystem.writeFile(args.projectId, args.file_path, args.content);

    // Record event
    await this.eventStore.appendEvent(args.projectId, {
      type: EventType.SPECIFICATION_CREATED,
      data: {
        spec_type: args.spec_type,
        file_path: args.file_path,
        description: args.description,
      },
    });

    this.logger.log(`Registered ${args.spec_type} spec at ${args.file_path}`);

    return {
      success: true,
      spec_type: args.spec_type,
      file_path: args.file_path,
      message: `Spec registered: ${args.file_path}`,
    };
  }

  /**
   * Check spec integrity across OpenAPI, Prisma, and Zod
   */
  private async checkSpecIntegrity(args: { projectId: string }): Promise<any> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Read specs
    let openapi: string | null = null;
    let prisma: string | null = null;

    try {
      openapi = await this.filesystem.readFile(args.projectId, 'specs/openapi.yaml');
    } catch {
      errors.push('OpenAPI spec not found at specs/openapi.yaml');
    }

    try {
      prisma = await this.filesystem.readFile(args.projectId, 'prisma/schema.prisma');
    } catch {
      errors.push('Prisma schema not found at prisma/schema.prisma');
    }

    // Basic integrity checks
    if (openapi && prisma) {
      // Extract model names from Prisma
      const prismaModels = prisma.match(/model\s+(\w+)\s*\{/g) || [];
      const modelNames = prismaModels.map((m) => m.match(/model\s+(\w+)/)?.[1]).filter(Boolean);

      // Check if OpenAPI references these models
      for (const model of modelNames) {
        if (!openapi.includes(model as string)) {
          warnings.push(`Prisma model "${model}" not found in OpenAPI spec`);
        }
      }

      // Extract OpenAPI schemas
      const schemaMatch = openapi.match(/schemas:\s*([\s\S]*?)(?=\n\w+:|$)/);
      if (schemaMatch) {
        const schemaNames = schemaMatch[1].match(/^\s{4}(\w+):/gm) || [];
        for (const schema of schemaNames) {
          const name = schema.trim().replace(':', '');
          if (!prisma.includes(name) && !['Error', 'Pagination', 'Health'].includes(name)) {
            warnings.push(`OpenAPI schema "${name}" not found in Prisma models`);
          }
        }
      }
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
      message:
        errors.length === 0
          ? warnings.length === 0
            ? 'All specs are aligned'
            : `Specs valid but ${warnings.length} alignment warnings`
          : `${errors.length} integrity errors found`,
    };
  }

  /**
   * Record a decision (tool-use version with more fields)
   */
  private async recordDecisionTool(args: {
    projectId: string;
    agentType?: string;
    title: string;
    decision: string;
    rationale: string;
    alternatives?: string[];
    impact?: string;
  }): Promise<any> {
    const decision = await this.prisma.decision.create({
      data: {
        projectId: args.projectId,
        description: `${args.title}: ${args.decision}`,
        rationale: `${args.rationale}${args.alternatives ? `\n\nAlternatives considered: ${args.alternatives.join(', ')}` : ''}`,
        decisionType: 'technical',
        gate: 'current',
        agent: args.agentType || 'unknown',
      },
    });

    // Record event
    await this.eventStore.appendEvent(args.projectId, {
      type: EventType.DECISION_MADE,
      data: { decisionId: decision.id, title: args.title },
    });

    return {
      success: true,
      decision_id: decision.id,
      message: `Decision recorded: ${args.title}`,
    };
  }

  /**
   * Record a handoff to another agent
   */
  private async recordHandoff(args: {
    projectId: string;
    fromAgent?: string;
    to_agent: string;
    deliverables: string[];
    notes?: string;
    blockers?: string[];
  }): Promise<any> {
    // Get current phase
    const project = await this.prisma.project.findUnique({
      where: { id: args.projectId },
      include: { state: true },
    });

    const handoff = await this.prisma.handoff.create({
      data: {
        projectId: args.projectId,
        fromAgent: args.fromAgent || 'unknown',
        toAgent: args.to_agent,
        phase: project?.state?.currentPhase || 'unknown',
        status: 'complete',
        notes: `${args.notes || ''}\n\nBlockers: ${args.blockers?.join(', ') || 'None'}`,
      },
    });

    // Create handoff deliverables
    for (const deliverable of args.deliverables) {
      await this.prisma.handoffDeliverable.create({
        data: {
          handoffId: handoff.id,
          deliverable,
        },
      });
    }

    // Record event
    await this.eventStore.appendEvent(args.projectId, {
      type: EventType.PHASE_CHANGED,
      data: {
        eventSubtype: 'HandoffRecorded',
        handoffId: handoff.id,
        fromAgent: args.fromAgent,
        toAgent: args.to_agent,
        deliverables: args.deliverables,
      },
    });

    return {
      success: true,
      handoff_id: handoff.id,
      from: args.fromAgent,
      to: args.to_agent,
      deliverables: args.deliverables,
      message: `Handoff recorded to ${args.to_agent}`,
    };
  }

  /**
   * Create a task for another agent (async, non-blocking)
   */
  private async createTaskForAgent(args: {
    projectId: string;
    fromAgent?: string;
    to_agent: string;
    task_type: string;
    title: string;
    description: string;
    context?: string;
    priority?: string;
  }): Promise<any> {
    const task = await this.prisma.task.create({
      data: {
        projectId: args.projectId,
        name: args.title,
        title: args.title,
        description: `Type: ${args.task_type}\nFrom: ${args.fromAgent || 'unknown'}\n\n${args.description}\n\nContext: ${args.context || 'None'}`,
        phase: args.task_type,
        owner: args.to_agent,
        priority: args.priority?.toUpperCase() || 'MEDIUM',
        status: TaskStatus.not_started,
      },
    });

    // Record event
    await this.eventStore.appendEvent(args.projectId, {
      type: EventType.TASK_CREATED,
      data: {
        taskId: task.id,
        taskType: args.task_type,
        toAgent: args.to_agent,
        fromAgent: args.fromAgent,
      },
    });

    return {
      success: true,
      task_id: task.id,
      to_agent: args.to_agent,
      task_type: args.task_type,
      message: `Task created for ${args.to_agent}. It will be processed when that agent next runs.`,
    };
  }

  // ===========================
  // State Management Tools
  // ===========================

  private async readStatus(args: { projectId: string }): Promise<string> {
    const statusMd = await this.filesystem.readFile(args.projectId, 'docs/STATUS.md');
    return statusMd;
  }

  private async updateStatus(args: { projectId: string; updates: any }): Promise<string> {
    await this.stateSync.updateProjectState(args.projectId, args.updates);
    return 'Status updated successfully';
  }

  private async readDecisions(args: { projectId: string }): Promise<string> {
    const decisionsMd = await this.filesystem.readFile(args.projectId, 'docs/DECISIONS.md');
    return decisionsMd;
  }

  private async createDecision(args: {
    projectId: string;
    description: string;
    rationale?: string;
    gate?: string;
    agent?: string;
  }): Promise<any> {
    const decision = await this.prisma.decision.create({
      data: {
        projectId: args.projectId,
        description: args.description,
        rationale: args.rationale,
        decisionType: 'technical',
        gate: args.gate || 'G0',
        agent: args.agent || 'mcp-tool',
      },
    });

    // Sync to markdown
    await this.stateSync.syncProjectToMarkdown(args.projectId);

    // Record event
    await this.eventStore.appendEvent(args.projectId, {
      type: EventType.DECISION_MADE,
      data: { decisionId: decision.id, description: args.description },
    });

    return decision;
  }

  private async readMemory(args: { projectId: string }): Promise<string> {
    const memoryMd = await this.filesystem.readFile(args.projectId, 'docs/MEMORY.md');
    return memoryMd;
  }

  private async readGates(args: { projectId: string }): Promise<string> {
    const gatesMd = await this.filesystem.readFile(args.projectId, 'docs/GATES.md');
    return gatesMd;
  }

  private async readTasks(args: { projectId: string }): Promise<string> {
    const tasksMd = await this.filesystem.readFile(args.projectId, 'docs/TASKS.md');
    return tasksMd;
  }

  // ===========================
  // Project Management Tools
  // ===========================

  private async createProject(_args: {
    name: string;
    type: string;
    description?: string;
  }): Promise<any> {
    // Note: This would need userId from context
    throw new Error('create_project requires authentication context');
  }

  private async getProject(args: { projectId: string }): Promise<any> {
    const project = await this.stateSync.getProject(args.projectId);
    return project;
  }

  private async listProjects(_args: any): Promise<any> {
    // Note: This would need userId from context
    throw new Error('list_projects requires authentication context');
  }

  private async updateProject(args: { projectId: string; updates: any }): Promise<any> {
    const project = await this.prisma.project.update({
      where: { id: args.projectId },
      data: args.updates,
    });
    return project;
  }

  // ===========================
  // Agent Execution Tools
  // ===========================

  private async getAgentHistory(args: { projectId: string }): Promise<any> {
    const agents = await this.prisma.agent.findMany({
      where: { projectId: args.projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return agents;
  }

  private async getAgentStatus(args: { agentId: string }): Promise<any> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: args.agentId },
    });
    return agent;
  }

  // ===========================
  // Gate Management Tools
  // ===========================

  private async getGates(args: { projectId: string }): Promise<any> {
    const gates = await this.prisma.gate.findMany({
      where: { projectId: args.projectId },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    return gates;
  }

  private async approveGate(_args: { gateId: string; reviewNotes?: string }): Promise<any> {
    // Note: This would need userId from context
    throw new Error('approve_gate requires authentication context');
  }

  private async rejectGate(_args: { gateId: string; reviewNotes: string }): Promise<any> {
    // Note: This would need userId from context
    throw new Error('reject_gate requires authentication context');
  }

  private async getGateArtifacts(args: { gateId: string }): Promise<any> {
    const artifacts = await this.prisma.proofArtifact.findMany({
      where: { gateId: args.gateId },
      take: 100,
    });
    return artifacts;
  }

  // ===========================
  // Document Tools
  // ===========================

  private async createDocument(_args: {
    projectId: string;
    title: string;
    content: string;
    documentType: string;
  }): Promise<any> {
    // Note: This would need userId from context
    throw new Error('create_document requires authentication context');
  }

  private async getDocuments(args: { projectId: string }): Promise<any> {
    const documents = await this.prisma.document.findMany({
      where: { projectId: args.projectId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return documents;
  }

  private async getDocument(args: { documentId: string }): Promise<any> {
    const document = await this.prisma.document.findUnique({
      where: { id: args.documentId },
    });
    return document;
  }

  private async updateDocument(args: { documentId: string; content: string }): Promise<any> {
    const document = await this.prisma.document.update({
      where: { id: args.documentId },
      data: { content: args.content },
    });
    return document;
  }

  // ===========================
  // File System Tools
  // ===========================

  private async writeFile(args: {
    projectId: string;
    filePath: string;
    content: string;
  }): Promise<string> {
    await this.filesystem.writeFile(args.projectId, args.filePath, args.content);
    return `File written: ${args.filePath}`;
  }

  private async readFile(args: { projectId: string; filePath: string }): Promise<string> {
    const content = await this.filesystem.readFile(args.projectId, args.filePath);
    return content;
  }

  private async listFiles(args: { projectId: string; directory?: string }): Promise<any> {
    // Use getDirectoryTree instead of non-existent listFiles
    const tree = await this.filesystem.getDirectoryTree(args.projectId, args.directory || '.');
    return { files: tree };
  }

  private async deleteFile(_args: { projectId: string; filePath: string }): Promise<string> {
    // Implement delete functionality
    throw new Error('delete_file not yet implemented');
  }

  // ===========================
  // Code Generation Tools
  // ===========================

  private async initializeWorkspace(args: {
    projectId: string;
    projectType: string;
  }): Promise<any> {
    // Create workspace and initialize project structure
    await this.filesystem.createProjectWorkspace(args.projectId);
    await this.filesystem.initializeProjectStructure(
      args.projectId,
      args.projectType as 'react-vite' | 'nestjs' | 'nextjs' | 'express',
    );
    return { success: true, message: 'Workspace initialized' };
  }

  private async parseCode(args: { agentOutput: string }): Promise<any> {
    const result = this.codeParser.extractFiles(args.agentOutput);
    return result;
  }

  private async validateBuild(args: { projectId: string }): Promise<any> {
    const result = await this.buildExecutor.runFullValidation(args.projectId);
    return result;
  }

  private async runTests(args: { projectId: string }): Promise<any> {
    const result = await this.buildExecutor.runTests(args.projectId);
    return result;
  }

  // ===========================
  // Git Tools
  // ===========================

  private async gitInit(args: { projectId: string }): Promise<any> {
    const result = await this.gitIntegration.initRepository(args.projectId);
    return result;
  }

  private async gitCommit(args: { projectId: string; message: string }): Promise<any> {
    const result = await this.gitIntegration.commitAll(args.projectId, args.message);
    return result;
  }

  private async gitStatus(args: { projectId: string }): Promise<any> {
    // Use getUncommittedFiles and getCurrentBranch instead of non-existent getStatus
    const uncommittedFiles = await this.gitIntegration.getUncommittedFiles(args.projectId);
    const currentBranch = await this.gitIntegration.getCurrentBranch(args.projectId);
    return {
      branch: currentBranch,
      uncommittedFiles,
      hasChanges: uncommittedFiles.length > 0,
    };
  }

  // ===========================
  // GitHub Tools
  // ===========================

  private async githubExport(_args: { projectId: string; repoName?: string }): Promise<any> {
    // Note: This would need authentication context
    throw new Error('github_export requires authentication context');
  }

  private async githubPush(_args: { projectId: string; message?: string }): Promise<any> {
    // Note: This would need authentication context
    throw new Error('github_push requires authentication context');
  }

  // ===========================
  // Railway Tools
  // ===========================

  private async railwayDeploy(_args: { projectId: string }): Promise<any> {
    // Note: This would need authentication context
    throw new Error('railway_deploy requires authentication context');
  }

  private async railwayStatus(args: { projectId: string }): Promise<any> {
    const project = await this.prisma.project.findUnique({
      where: { id: args.projectId },
      select: { railwayProjectId: true },
    });

    if (!project?.railwayProjectId) {
      throw new Error('Project not deployed to Railway');
    }

    // Note: This would need authentication context for Railway API
    throw new Error('railway_status requires authentication context');
  }

  // ===========================
  // Task Management Tools
  // ===========================

  private async createTask(args: {
    projectId: string;
    name: string;
    description?: string;
    phase: string;
    owner?: string;
    priority?: string;
  }): Promise<any> {
    const task = await this.prisma.task.create({
      data: {
        projectId: args.projectId,
        name: args.name,
        title: args.name,
        description: args.description,
        phase: args.phase,
        owner: args.owner,
        priority: args.priority || 'MEDIUM',
        status: TaskStatus.not_started,
      },
    });

    // Record event
    await this.eventStore.appendEvent(args.projectId, {
      type: EventType.TASK_CREATED,
      data: { taskId: task.id, name: args.name },
    });

    return task;
  }

  private async getTasks(args: { projectId: string }): Promise<any> {
    const tasks = await this.prisma.task.findMany({
      where: { projectId: args.projectId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return tasks;
  }

  private async updateTask(args: { taskId: string; status: TaskStatus }): Promise<any> {
    const task = await this.prisma.task.update({
      where: { id: args.taskId },
      data: { status: args.status },
    });

    if (args.status === TaskStatus.complete) {
      await this.eventStore.appendEvent(task.projectId, {
        type: EventType.TASK_COMPLETED,
        data: { taskId: task.id },
      });
    }

    return task;
  }
}
