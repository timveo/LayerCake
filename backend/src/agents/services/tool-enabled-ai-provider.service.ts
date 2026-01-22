import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { McpToolsService } from '../../mcp/mcp-tools.service';
import { AIProviderResponse, AIProviderStreamCallback } from './ai-provider.service';
import { getAnthropicTools } from '../../mcp/tool-definitions';

/**
 * ToolEnabledAIProviderService
 *
 * Thin wrapper that enables Claude tool_use during agent execution.
 * All business logic is in McpToolsService - this service just handles
 * the Anthropic API tool calling loop.
 *
 * Architecture:
 * - Tool definitions: mcp/tool-definitions.ts (single source of truth)
 * - Tool execution: mcp/mcp-tools.service.ts (all business logic)
 * - This service: Just the API loop orchestration
 */
@Injectable()
export class ToolEnabledAIProviderService {
  private readonly logger = new Logger(ToolEnabledAIProviderService.name);
  private anthropic: Anthropic;

  // Maximum tool call iterations to prevent infinite loops
  private readonly MAX_TOOL_ITERATIONS = 10;

  constructor(
    private config: ConfigService,
    private mcpTools: McpToolsService,
  ) {
    const claudeKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (claudeKey) {
      this.anthropic = new Anthropic({ apiKey: claudeKey });
    }
  }

  /**
   * Execute a Claude prompt with tool calling enabled
   * Implements the tool use loop: prompt → tool_use → execute → continue
   */
  async executeWithTools(
    systemPrompt: string,
    userPrompt: string,
    projectId: string,
    agentType: string,
    model: string = 'claude-sonnet-4-20250514',
    maxTokens: number = 8000,
  ): Promise<AIProviderResponse> {
    if (!this.anthropic) {
      throw new Error('Claude API key not configured');
    }

    // Get tools from centralized definitions
    const tools = getAnthropicTools(agentType);

    // Build initial messages
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: userPrompt,
      },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalContent = '';
    let iterations = 0;

    // Tool use loop
    while (iterations < this.MAX_TOOL_ITERATIONS) {
      iterations++;

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        tools,
        messages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // Collect response content for message history
      const contentBlocks: Anthropic.ContentBlock[] = [];
      let hasToolUse = false;

      // Process response content
      for (const block of response.content) {
        contentBlocks.push(block);

        if (block.type === 'text') {
          finalContent += block.text;
        } else if (block.type === 'tool_use') {
          hasToolUse = true;
          // Execute the tool via McpToolsService
          this.logger.log(`Agent ${agentType} calling tool: ${block.name}`);

          const toolResult = await this.executeToolCall(
            block.name,
            block.input as Record<string, any>,
            projectId,
            agentType,
          );

          // Add assistant message with tool use
          messages.push({
            role: 'assistant',
            content: contentBlocks,
          });

          // Add tool result
          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(toolResult),
              },
            ],
          });
        }
      }

      // Check if we should continue (no more tool calls)
      if (response.stop_reason === 'end_turn' || !hasToolUse) {
        break;
      }
    }

    if (iterations >= this.MAX_TOOL_ITERATIONS) {
      this.logger.warn(`Agent ${agentType} hit max tool iterations (${this.MAX_TOOL_ITERATIONS})`);
    }

    return {
      content: finalContent,
      model,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
      finishReason: 'end_turn',
    };
  }

  /**
   * Execute a Claude prompt with tool calling and streaming
   */
  async executeWithToolsStream(
    systemPrompt: string,
    userPrompt: string,
    projectId: string,
    agentType: string,
    callback: AIProviderStreamCallback,
    model: string = 'claude-sonnet-4-20250514',
    maxTokens: number = 8000,
  ): Promise<void> {
    if (!this.anthropic) {
      callback.onError(new Error('Claude API key not configured'));
      return;
    }

    try {
      // Get tools from centralized definitions
      const tools = getAnthropicTools(agentType);
      const messages: Anthropic.MessageParam[] = [
        {
          role: 'user',
          content: userPrompt,
        },
      ];

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let fullContent = '';
      let iterations = 0;

      // Tool use loop with streaming
      while (iterations < this.MAX_TOOL_ITERATIONS) {
        iterations++;

        const stream = await this.anthropic.messages.stream({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          tools,
          messages,
        });

        let currentToolUse: { id: string; name: string; input: string } | null = null;
        const responseContent: Anthropic.ContentBlock[] = [];
        let stopReason: string | null = null;

        for await (const event of stream) {
          if (event.type === 'message_start') {
            totalInputTokens += event.message.usage.input_tokens;
          } else if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
              currentToolUse = {
                id: event.content_block.id,
                name: event.content_block.name,
                input: '',
              };
              // Notify user that a tool is being called
              callback.onChunk(`\n[Calling ${event.content_block.name}...]\n`);
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              fullContent += event.delta.text;
              callback.onChunk(event.delta.text);
            } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
              currentToolUse.input += event.delta.partial_json;
            }
          } else if (event.type === 'content_block_stop') {
            if (currentToolUse) {
              // Parse tool input and add to response content
              try {
                const toolInput = JSON.parse(currentToolUse.input || '{}');
                responseContent.push({
                  type: 'tool_use',
                  id: currentToolUse.id,
                  name: currentToolUse.name,
                  input: toolInput,
                });
              } catch (e) {
                this.logger.error(`Failed to parse tool input: ${e}`);
              }
              currentToolUse = null;
            }
          } else if (event.type === 'message_delta') {
            totalOutputTokens += event.usage.output_tokens;
            stopReason = event.delta.stop_reason;
          }
        }

        // Process tool calls if any
        const toolUses = responseContent.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
        );

        if (toolUses.length > 0) {
          // Add assistant message
          messages.push({
            role: 'assistant',
            content: responseContent,
          });

          // Execute each tool and add results
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolUse of toolUses) {
            this.logger.log(`Agent ${agentType} calling tool: ${toolUse.name}`);

            const result = await this.executeToolCall(
              toolUse.name,
              toolUse.input as Record<string, any>,
              projectId,
              agentType,
            );

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });

            callback.onChunk(`[${toolUse.name} completed]\n`);
          }

          messages.push({
            role: 'user',
            content: toolResults,
          });
        }

        // Check if we should continue
        if (stopReason === 'end_turn' || toolUses.length === 0) {
          break;
        }
      }

      callback.onComplete({
        content: fullContent,
        model,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        },
        finishReason: 'end_turn',
      });
    } catch (error) {
      callback.onError(error as Error);
    }
  }

  /**
   * Execute a tool call via McpToolsService
   * All business logic is centralized there
   */
  private async executeToolCall(
    toolName: string,
    input: Record<string, any>,
    projectId: string,
    agentType: string,
  ): Promise<any> {
    // Inject projectId and agentType into all tool calls
    const argsWithContext = {
      ...input,
      projectId,
      agentType,
      fromAgent: agentType,
    };

    this.logger.debug(`Executing tool ${toolName} with args:`, argsWithContext);

    try {
      // All tool execution is handled by McpToolsService
      return await this.mcpTools.executeTool(toolName, argsWithContext);
    } catch (error) {
      this.logger.error(`Tool ${toolName} failed: ${(error as Error).message}`);
      return { error: (error as Error).message, success: false };
    }
  }
}
