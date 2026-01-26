import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AIModel {
  CLAUDE_OPUS_4 = 'claude-opus-4-20250514',
  CLAUDE_OPUS_4_5 = 'claude-opus-4-5-20251101',
  CLAUDE_SONNET_4 = 'claude-sonnet-4-20250514',
  GPT_4O = 'gpt-4o',
  GPT_4O_MINI = 'gpt-4o-mini',
}

export class ExecuteAgentDto {
  @ApiProperty({ description: 'Agent type to execute' })
  @IsString()
  agentType: string;

  @ApiProperty({ description: 'Project ID' })
  @IsString()
  projectId: string;

  @ApiProperty({ description: 'User prompt/instruction for the agent' })
  @IsString()
  userPrompt: string;

  @ApiPropertyOptional({ description: 'Task ID if this execution is for a specific task' })
  @IsOptional()
  @IsString()
  taskId?: string;

  @ApiPropertyOptional({ enum: AIModel, description: 'Override the default AI model' })
  @IsOptional()
  @IsEnum(AIModel)
  model?: AIModel;

  @ApiPropertyOptional({ description: 'Additional context for the agent' })
  @IsOptional()
  @IsObject()
  context?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Input documents and specifications' })
  @IsOptional()
  @IsObject()
  inputs?: {
    documents?: string[];
    specifications?: string[];
    context?: any;
  };

  @ApiPropertyOptional({ description: 'Stream output via WebSocket' })
  @IsOptional()
  streaming?: boolean;
}
