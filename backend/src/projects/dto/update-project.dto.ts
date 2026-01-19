import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class UpdateProjectDto {
  @ApiProperty({
    example: 'Updated Project Name',
    description: 'Project name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @ApiProperty({
    example: 'Updated project description',
    description: 'Project description',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: 'https://github.com/username/repo',
    description: 'GitHub repository URL',
    required: false,
  })
  @IsOptional()
  @IsString()
  repository?: string;

  @ApiProperty({
    example: 'https://github.com/username/repo',
    description: 'GitHub repository ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  githubRepoId?: string;

  @ApiProperty({
    example: 'railway-project-id',
    description: 'Railway project ID',
    required: false,
  })
  @IsOptional()
  @IsString()
  railwayProjectId?: string;
}
