import { ApiProperty } from '@nestjs/swagger';
import { ProjectType } from '@prisma/client';

export class ProjectResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ enum: ['traditional', 'ai_ml', 'hybrid', 'enhancement'] })
  type: ProjectType;

  @ApiProperty({ required: false })
  repository?: string;

  @ApiProperty({ required: false })
  githubRepoUrl?: string;

  @ApiProperty({ required: false })
  githubRepoId?: string;

  @ApiProperty({ required: false })
  railwayProjectId?: string;

  @ApiProperty()
  ownerId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false })
  state?: {
    currentPhase: string;
    currentGate: string;
    currentAgent?: string;
    percentComplete: number;
  };
}
