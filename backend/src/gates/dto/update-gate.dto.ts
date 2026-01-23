import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateGateDto {
  @ApiPropertyOptional({ description: 'Gate description/requirements' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Criteria for passing this gate' })
  @IsOptional()
  @IsString()
  passingCriteria?: string;

  @ApiPropertyOptional({ description: 'Review notes from approver' })
  @IsOptional()
  @IsString()
  reviewNotes?: string;

  @ApiPropertyOptional({ description: 'Blocking reason if status is BLOCKED' })
  @IsOptional()
  @IsString()
  blockingReason?: string;

  @ApiPropertyOptional({ description: 'Whether proof artifacts are required' })
  @IsOptional()
  @IsBoolean()
  requiresProof?: boolean;
}
