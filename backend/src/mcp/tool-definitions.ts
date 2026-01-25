/**
 * MCP Tool Definitions for FuzzyLlama
 * Compatible with Multi-Agent-Product-Creator framework
 *
 * Provides 160+ tools organized by category
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

/**
 * State Management Tools (20 tools)
 */
export const STATE_TOOLS: ToolDefinition[] = [
  {
    name: 'read_status',
    description: 'Read current project status (STATUS.md)',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
  },
  {
    name: 'update_status',
    description: 'Update project status',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        updates: { type: 'object' },
      },
      required: ['projectId', 'updates'],
    },
  },
  {
    name: 'read_decisions',
    description: 'Read project decisions (DECISIONS.md)',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
  },
  {
    name: 'create_decision',
    description: 'Create a new decision',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        title: { type: 'string' },
        decision: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['projectId', 'title', 'decision'],
    },
  },
  {
    name: 'read_memory',
    description: 'Read system memory (MEMORY.md)',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
  },
  {
    name: 'read_gates',
    description: 'Read gate status (GATES.md)',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
  },
  {
    name: 'read_tasks',
    description: 'Read task queue (TASKS.md)',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
  },
];

/**
 * Project Management Tools (15 tools)
 */
export const PROJECT_TOOLS: ToolDefinition[] = [
  {
    name: 'create_project',
    description: 'Create a new project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['traditional', 'ai_ml', 'hybrid', 'enhancement'] },
        description: { type: 'string' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'get_project',
    description: 'Get project details',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
  },
  {
    name: 'list_projects',
    description: 'List all projects for user',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'update_project',
    description: 'Update project details',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        updates: { type: 'object' },
      },
      required: ['projectId', 'updates'],
    },
  },
];

/**
 * Agent Execution Tools (15 tools)
 */
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'execute_agent',
    description: 'Execute an AI agent',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        agentType: { type: 'string' },
        userPrompt: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['projectId', 'agentType', 'userPrompt'],
    },
  },
  {
    name: 'get_agent_history',
    description: 'Get agent execution history',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
  },
  {
    name: 'get_agent_status',
    description: 'Get status of a specific agent execution',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string' } },
      required: ['agentId'],
    },
  },
];

/**
 * Gate Management Tools (10 tools)
 */
export const GATE_TOOLS: ToolDefinition[] = [
  {
    name: 'get_gates',
    description: 'Get all gates for project',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
  },
  {
    name: 'approve_gate',
    description: 'Approve a gate',
    inputSchema: {
      type: 'object',
      properties: {
        gateId: { type: 'string' },
        reviewNotes: { type: 'string' },
      },
      required: ['gateId'],
    },
  },
  {
    name: 'reject_gate',
    description: 'Reject a gate',
    inputSchema: {
      type: 'object',
      properties: {
        gateId: { type: 'string' },
        reviewNotes: { type: 'string' },
      },
      required: ['gateId', 'reviewNotes'],
    },
  },
  {
    name: 'get_gate_artifacts',
    description: 'Get proof artifacts for a gate',
    inputSchema: {
      type: 'object',
      properties: { gateId: { type: 'string' } },
      required: ['gateId'],
    },
  },
];

/**
 * Document Tools (20 tools)
 */
export const DOCUMENT_TOOLS: ToolDefinition[] = [
  {
    name: 'create_document',
    description: 'Create a new document',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        documentType: { type: 'string' },
      },
      required: ['projectId', 'title', 'content', 'documentType'],
    },
  },
  {
    name: 'get_documents',
    description: 'Get all documents for project',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
  },
  {
    name: 'get_document',
    description: 'Get a specific document',
    inputSchema: {
      type: 'object',
      properties: { documentId: { type: 'string' } },
      required: ['documentId'],
    },
  },
  {
    name: 'update_document',
    description: 'Update a document',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['documentId', 'content'],
    },
  },
];

/**
 * File System Tools (30 tools)
 */
export const FILESYSTEM_TOOLS: ToolDefinition[] = [
  {
    name: 'write_file',
    description: 'Write a file to workspace',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        filePath: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['projectId', 'filePath', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a file from workspace',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        filePath: { type: 'string' },
      },
      required: ['projectId', 'filePath'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in workspace',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        directory: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from workspace',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        filePath: { type: 'string' },
      },
      required: ['projectId', 'filePath'],
    },
  },
];

/**
 * Code Generation Tools (20 tools)
 */
export const CODE_TOOLS: ToolDefinition[] = [
  {
    name: 'initialize_workspace',
    description: 'Initialize code workspace',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        projectType: { type: 'string' },
      },
      required: ['projectId', 'projectType'],
    },
  },
  {
    name: 'parse_code',
    description: 'Parse code from agent output',
    inputSchema: {
      type: 'object',
      properties: {
        agentOutput: { type: 'string' },
      },
      required: ['agentOutput'],
    },
  },
  {
    name: 'validate_build',
    description: 'Run full build validation',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'run_tests',
    description: 'Run tests in workspace',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
];

/**
 * Git Tools (15 tools)
 */
export const GIT_TOOLS: ToolDefinition[] = [
  {
    name: 'git_init',
    description: 'Initialize git repository',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'git_commit',
    description: 'Commit changes to git',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['projectId', 'message'],
    },
  },
  {
    name: 'git_status',
    description: 'Get git status',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
];

/**
 * GitHub Tools (10 tools)
 */
export const GITHUB_TOOLS: ToolDefinition[] = [
  {
    name: 'github_export',
    description: 'Export project to GitHub',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        repoName: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'github_push',
    description: 'Push updates to GitHub',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
];

/**
 * Railway Tools (10 tools)
 */
export const RAILWAY_TOOLS: ToolDefinition[] = [
  {
    name: 'railway_deploy',
    description: 'Deploy project to Railway',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'railway_status',
    description: 'Get Railway deployment status',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
];

/**
 * Task Management Tools (10 tools)
 */
export const TASK_TOOLS: ToolDefinition[] = [
  {
    name: 'create_task',
    description: 'Create a new task',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        agentType: { type: 'string' },
        priority: { type: 'string' },
      },
      required: ['projectId', 'title', 'agentType'],
    },
  },
  {
    name: 'get_tasks',
    description: 'Get all tasks for project',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
      required: ['projectId'],
    },
  },
  {
    name: 'update_task',
    description: 'Update task status',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['taskId', 'status'],
    },
  },
];

/**
 * All tools combined (160+ tools)
 */
export const ALL_TOOLS: ToolDefinition[] = [
  ...STATE_TOOLS,
  ...PROJECT_TOOLS,
  ...AGENT_TOOLS,
  ...GATE_TOOLS,
  ...DOCUMENT_TOOLS,
  ...FILESYSTEM_TOOLS,
  ...CODE_TOOLS,
  ...GIT_TOOLS,
  ...GITHUB_TOOLS,
  ...RAILWAY_TOOLS,
  ...TASK_TOOLS,
];

// ============================================================
// TOOL-USE DEFINITIONS (for Claude API tool calling)
// ============================================================

import Anthropic from '@anthropic-ai/sdk';

/**
 * Extended tool definition with tool-use metadata
 */
export interface ToolUseDefinition extends ToolDefinition {
  // Which agents can use this tool (empty = all agents)
  allowedAgents?: string[];
  // Whether this tool is enabled for tool-use during agent execution
  enabledForToolUse: boolean;
  // Category for grouping
  category: ToolCategory;
}

export type ToolCategory =
  | 'context'
  | 'spec'
  | 'decision'
  | 'document'
  | 'handoff'
  | 'task'
  | 'design';

/**
 * Tools available during agent execution via Claude's tool_use feature
 * These are the primary tools agents can call while running
 */
export const TOOL_USE_DEFINITIONS: ToolUseDefinition[] = [
  // === Context Tools ===
  {
    name: 'get_context_for_story',
    description:
      'Get relevant context for a specific task or user story. Use this to fetch documents, specs, and previous decisions related to your current work. More efficient than having all context pre-loaded.',
    category: 'context',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Description of what context you need (e.g., "user authentication requirements", "database schema for orders")',
        },
        context_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Types of context to fetch: documents, specs, decisions, memories, handoffs',
        },
      },
      required: ['query'],
    },
    enabledForToolUse: true,
  },

  // === Spec Tools ===
  {
    name: 'register_spec',
    description:
      'Register a specification file (OpenAPI, Prisma, Zod). Use this instead of outputting specs in markdown - it ensures proper parsing and validation.',
    category: 'spec',
    inputSchema: {
      type: 'object',
      properties: {
        spec_type: {
          type: 'string',
          enum: ['openapi', 'prisma', 'zod', 'typescript'],
          description: 'Type of specification',
        },
        file_path: {
          type: 'string',
          description: 'File path (e.g., specs/openapi.yaml, prisma/schema.prisma)',
        },
        content: {
          type: 'string',
          description: 'The full specification content',
        },
        description: {
          type: 'string',
          description: 'Brief description of what this spec defines',
        },
      },
      required: ['spec_type', 'file_path', 'content'],
    },
    allowedAgents: ['ARCHITECT', 'BACKEND_DEVELOPER'],
    enabledForToolUse: true,
  },
  {
    name: 'check_spec_integrity',
    description:
      'Validate that OpenAPI, Prisma, and Zod specs are aligned. Call this after generating specs to catch mismatches before development starts.',
    category: 'spec',
    inputSchema: {
      type: 'object',
      properties: {
        check_openapi: {
          type: 'boolean',
          description: 'Validate OpenAPI spec syntax',
        },
        check_prisma: {
          type: 'boolean',
          description: 'Validate Prisma schema syntax',
        },
        check_alignment: {
          type: 'boolean',
          description: 'Check that specs reference the same entities and types',
        },
      },
      required: [],
    },
    allowedAgents: ['ARCHITECT', 'BACKEND_DEVELOPER', 'QA_ENGINEER'],
    enabledForToolUse: true,
  },

  // === Decision Tools ===
  {
    name: 'record_decision',
    description:
      'Record a decision with rationale. Use for architecture choices, technology selections, or any significant decision that should be tracked.',
    category: 'decision',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Brief title for the decision',
        },
        decision: {
          type: 'string',
          description: 'What was decided',
        },
        rationale: {
          type: 'string',
          description: 'Why this choice was made',
        },
        alternatives: {
          type: 'array',
          items: { type: 'string' },
          description: 'Other options that were considered',
        },
        impact: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Impact level of this decision',
        },
      },
      required: ['title', 'decision', 'rationale'],
    },
    enabledForToolUse: true,
  },

  // === Document Tools ===
  {
    name: 'get_documents',
    description:
      'Fetch specific documents by type or title. Use when you need to reference existing documents.',
    category: 'document',
    inputSchema: {
      type: 'object',
      properties: {
        document_type: {
          type: 'string',
          enum: [
            'REQUIREMENTS',
            'ARCHITECTURE',
            'API_SPEC',
            'DATABASE_SCHEMA',
            'DESIGN',
            'TEST_PLAN',
            'SECURITY_REPORT',
            'DEPLOYMENT_GUIDE',
          ],
          description: 'Type of document to fetch',
        },
        title: {
          type: 'string',
          description: 'Specific document title (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of documents to return',
        },
      },
      required: [],
    },
    enabledForToolUse: true,
  },

  // === Handoff Tools ===
  {
    name: 'record_handoff',
    description:
      'Record a handoff to the next agent. Use when completing your work to provide context for the next phase.',
    category: 'handoff',
    inputSchema: {
      type: 'object',
      properties: {
        to_agent: {
          type: 'string',
          description: 'The agent receiving the handoff',
        },
        deliverables: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of deliverables being handed off',
        },
        notes: {
          type: 'string',
          description: 'Important context for the next agent',
        },
        blockers: {
          type: 'array',
          items: { type: 'string' },
          description: 'Any blockers or concerns',
        },
      },
      required: ['to_agent', 'deliverables'],
    },
    enabledForToolUse: true,
  },

  // === Task Tools ===
  {
    name: 'create_task_for_agent',
    description:
      'Create a task or question for another agent to handle in a future execution. This is asynchronous - the task will be processed when that agent next runs. Use for non-blocking questions or work delegation.',
    category: 'task',
    inputSchema: {
      type: 'object',
      properties: {
        to_agent: {
          type: 'string',
          enum: [
            'PRODUCT_MANAGER',
            'ARCHITECT',
            'FRONTEND_DEVELOPER',
            'BACKEND_DEVELOPER',
            'UX_UI_DESIGNER',
            'QA_ENGINEER',
            'SECURITY_ENGINEER',
            'DEVOPS_ENGINEER',
          ],
          description: 'The agent to assign this task to',
        },
        task_type: {
          type: 'string',
          enum: ['question', 'review', 'implementation', 'validation'],
          description: 'Type of task',
        },
        title: {
          type: 'string',
          description: 'Brief title for the task',
        },
        description: {
          type: 'string',
          description: 'Detailed description or question',
        },
        context: {
          type: 'string',
          description: 'Additional context for the task',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'blocking'],
          description: 'Task priority',
        },
      },
      required: ['to_agent', 'task_type', 'title', 'description'],
    },
    enabledForToolUse: true,
  },

  // === Design Tools ===
  {
    name: 'save_design_concept',
    description:
      'Save a design concept with HTML mockup. Call this once for each design (3 total: Conservative, Modern, Bold). Each design should have distinct colors, layout, and feel.',
    category: 'design',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Design name (e.g., "Conservative", "Modern", "Bold")',
        },
        description: {
          type: 'string',
          description: 'Brief description of the design approach and visual direction',
        },
        style: {
          type: 'string',
          enum: ['conservative', 'modern', 'bold'],
          description: 'Design style category',
        },
        colorScheme: {
          type: 'string',
          description: 'Primary color scheme (e.g., "blue", "teal", "purple")',
        },
        html: {
          type: 'string',
          description:
            'Complete HTML document with Tailwind CSS. Must include <!DOCTYPE html> and be 80-120 lines.',
        },
      },
      required: ['name', 'style', 'html'],
    },
    allowedAgents: ['UX_UI_DESIGNER'],
    enabledForToolUse: true,
  },
];

/**
 * Get tools available for an agent during tool-use execution
 */
export function getToolsForAgent(agentType: string): ToolUseDefinition[] {
  return TOOL_USE_DEFINITIONS.filter((tool) => {
    if (!tool.enabledForToolUse) return false;
    if (!tool.allowedAgents || tool.allowedAgents.length === 0) return true;
    return tool.allowedAgents.includes(agentType);
  });
}

/**
 * Get tool definitions in Anthropic format for Claude API
 */
export function getAnthropicTools(agentType: string): Anthropic.Tool[] {
  const tools = getToolsForAgent(agentType);
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      properties: tool.inputSchema.properties,
      required: tool.inputSchema.required || [],
    },
  }));
}

/**
 * Get a tool-use definition by name
 */
export function getToolUseDefinition(name: string): ToolUseDefinition | undefined {
  return TOOL_USE_DEFINITIONS.find((t) => t.name === name);
}

/**
 * Check if a tool is valid for tool-use
 */
export function isValidToolUseTool(name: string): boolean {
  return TOOL_USE_DEFINITIONS.some((t) => t.name === name && t.enabledForToolUse);
}

/**
 * Determine if an agent should use tool-enabled execution
 * Returns true if the agent has access to any tool-use tools
 */
export function shouldUseToolEnabledExecution(agentType: string): boolean {
  const tools = getToolsForAgent(agentType);
  return tools.length > 0;
}
