import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetType } from '@prisma/client';

export class ImportGitHubFileDto {
  @ApiProperty({ description: 'GitHub repository owner' })
  @IsString()
  owner: string;

  @ApiProperty({ description: 'GitHub repository name' })
  @IsString()
  repo: string;

  @ApiProperty({ description: 'File path within the repository' })
  @IsString()
  filePath: string;

  @ApiProperty({ description: 'Session ID for temporary storage' })
  @IsString()
  sessionId: string;

  @ApiPropertyOptional({ enum: AssetType, description: 'Type of asset' })
  @IsOptional()
  @IsEnum(AssetType)
  assetType?: AssetType;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class ImportGitHubFilesDto {
  @ApiProperty({ description: 'GitHub repository owner' })
  @IsString()
  owner: string;

  @ApiProperty({ description: 'GitHub repository name' })
  @IsString()
  repo: string;

  @ApiProperty({ description: 'Array of file paths to import', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  filePaths: string[];

  @ApiProperty({ description: 'Session ID for temporary storage' })
  @IsString()
  sessionId: string;

  @ApiPropertyOptional({ enum: AssetType, description: 'Type of asset for all files' })
  @IsOptional()
  @IsEnum(AssetType)
  assetType?: AssetType;
}
