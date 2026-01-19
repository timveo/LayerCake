import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ProjectType } from '@prisma/client';

export class CreateProjectDto {
  @ApiProperty({
    example: 'My Awesome App',
    description: 'Project name (optional - will be extracted from description if not provided)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    example: 'A task management app with Kanban boards and real-time collaboration',
    description: 'Project description - used to extract name and infer type if not provided',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description: string;

  @ApiProperty({
    example: 'traditional',
    description: 'Project type (optional - will be inferred from description if not provided)',
    enum: ['traditional', 'ai_ml', 'hybrid', 'enhancement'],
    required: false,
  })
  @IsOptional()
  @IsEnum(ProjectType)
  type?: ProjectType;

  @ApiProperty({
    example: 'https://github.com/username/repo',
    description: 'GitHub repository URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  repository?: string;
}
