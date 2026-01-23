import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface AIProviderResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason: string;
}

export interface AIProviderStreamCallback {
  onChunk: (chunk: string) => void;
  onComplete: (response: AIProviderResponse) => void;
  onError: (error: Error) => void;
}

// Timeout constants (in milliseconds)
const AI_REQUEST_TIMEOUT = 300000; // 5 minutes for standard requests
const AI_STREAM_TIMEOUT = 600000; // 10 minutes for streaming (may have multiple chunks)

@Injectable()
export class AIProviderService {
  private anthropic: Anthropic;
  private openai: OpenAI;

  constructor(private config: ConfigService) {
    const claudeKey = this.config.get<string>('ANTHROPIC_API_KEY');
    const openaiKey = this.config.get<string>('OPENAI_API_KEY');

    if (claudeKey) {
      this.anthropic = new Anthropic({
        apiKey: claudeKey,
      });
    }

    if (openaiKey) {
      this.openai = new OpenAI({
        apiKey: openaiKey,
      });
    }
  }

  async executeClaudePrompt(
    systemPrompt: string,
    userPrompt: string,
    model: string = 'claude-sonnet-4-20250514',
    maxTokens: number = 8000,
  ): Promise<AIProviderResponse> {
    if (!this.anthropic) {
      throw new Error('Claude API key not configured');
    }

    const response = await this.anthropic.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      },
      { timeout: AI_REQUEST_TIMEOUT },
    );

    const textContent = response.content.find((c) => c.type === 'text');

    return {
      content: textContent ? (textContent as any).text : '',
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      finishReason: response.stop_reason || 'end_turn',
    };
  }

  async executeOpenAIPrompt(
    systemPrompt: string,
    userPrompt: string,
    model: string = 'gpt-4o',
    maxTokens: number = 8000,
  ): Promise<AIProviderResponse> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await this.openai.chat.completions.create(
      {
        model,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      },
      { timeout: AI_REQUEST_TIMEOUT },
    );

    const choice = response.choices[0];

    return {
      content: choice.message.content || '',
      model: response.model,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
      finishReason: choice.finish_reason || 'stop',
    };
  }

  async executePrompt(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    maxTokens: number = 8000,
  ): Promise<AIProviderResponse> {
    if (model.startsWith('claude-')) {
      return this.executeClaudePrompt(systemPrompt, userPrompt, model, maxTokens);
    } else if (model.startsWith('gpt-')) {
      return this.executeOpenAIPrompt(systemPrompt, userPrompt, model, maxTokens);
    } else {
      throw new Error(`Unsupported model: ${model}`);
    }
  }

  isClaudeAvailable(): boolean {
    return !!this.anthropic;
  }

  isOpenAIAvailable(): boolean {
    return !!this.openai;
  }

  async executeClaudePromptStream(
    systemPrompt: string,
    userPrompt: string,
    callback: AIProviderStreamCallback,
    model: string = 'claude-sonnet-4-20250514',
    maxTokens: number = 8000,
  ): Promise<void> {
    if (!this.anthropic) {
      callback.onError(new Error('Claude API key not configured'));
      return;
    }

    try {
      const stream = await this.anthropic.messages.create(
        {
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          stream: true,
        },
        { timeout: AI_STREAM_TIMEOUT },
      );

      let fullContent = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let finishReason = 'end_turn';

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const chunk = event.delta.text;
            fullContent += chunk;
            callback.onChunk(chunk);
          }
        } else if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens;
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens;
          finishReason = event.delta.stop_reason || 'end_turn';
        }
      }

      callback.onComplete({
        content: fullContent,
        model,
        usage: {
          inputTokens,
          outputTokens,
        },
        finishReason,
      });
    } catch (error) {
      callback.onError(error as Error);
    }
  }

  async executeOpenAIPromptStream(
    systemPrompt: string,
    userPrompt: string,
    callback: AIProviderStreamCallback,
    model: string = 'gpt-4o',
    maxTokens: number = 8000,
  ): Promise<void> {
    if (!this.openai) {
      callback.onError(new Error('OpenAI API key not configured'));
      return;
    }

    try {
      const stream = await this.openai.chat.completions.create(
        {
          model,
          max_tokens: maxTokens,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: userPrompt,
            },
          ],
          stream: true,
        },
        { timeout: AI_STREAM_TIMEOUT },
      );

      let fullContent = '';
      const inputTokens = 0;
      const outputTokens = 0;
      let finishReason = 'stop';

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          callback.onChunk(delta.content);
        }

        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }

        // OpenAI doesn't provide token counts in streaming mode
        // We'll estimate or get them after completion
      }

      callback.onComplete({
        content: fullContent,
        model,
        usage: {
          inputTokens,
          outputTokens,
        },
        finishReason,
      });
    } catch (error) {
      callback.onError(error as Error);
    }
  }

  async executePromptStream(
    systemPrompt: string,
    userPrompt: string,
    callback: AIProviderStreamCallback,
    model: string,
    maxTokens: number = 8000,
  ): Promise<void> {
    if (model.startsWith('claude-')) {
      return this.executeClaudePromptStream(systemPrompt, userPrompt, callback, model, maxTokens);
    } else if (model.startsWith('gpt-')) {
      return this.executeOpenAIPromptStream(systemPrompt, userPrompt, callback, model, maxTokens);
    } else {
      callback.onError(new Error(`Unsupported model: ${model}`));
    }
  }
}
