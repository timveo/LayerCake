import { IsString, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProofArtifactDto {
  @ApiProperty()
  @IsString()
  projectId: string;

  @ApiProperty()
  @IsString()
  gate: string;

  @ApiProperty({ enum: ['test_output', 'coverage_report', 'lint_output', 'security_scan', 'build_output', 'lighthouse_report', 'accessibility_scan', 'spec_validation', 'deployment_log', 'smoke_test', 'screenshot', 'manual_verification'] })
  @IsEnum(['test_output', 'coverage_report', 'lint_output', 'security_scan', 'build_output', 'lighthouse_report', 'accessibility_scan', 'spec_validation', 'deployment_log', 'smoke_test', 'screenshot', 'manual_verification'])
  proofType: string;

  @ApiProperty()
  @IsString()
  filePath: string;

  @ApiProperty()
  @IsString()
  contentSummary: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  gateId?: string;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  autoValidate?: boolean; // If true, run validation automatically
}
