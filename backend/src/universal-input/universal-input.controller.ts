import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UniversalInputService } from './universal-input.service';
import { StartAnalysisDto, AnalysisStatusDto } from './dto/input-analysis.dto';
import {
  ConfirmGatePlanDto,
  GatePlanResponseDto,
  GateContext,
} from './dto/gate-recommendation.dto';

interface RequestWithUser extends Request {
  user: { id: string };
}

@Controller('universal-input')
@UseGuards(JwtAuthGuard)
export class UniversalInputController {
  constructor(private readonly universalInputService: UniversalInputService) {}

  /**
   * Start analysis of uploaded assets
   * Phase 0 (Classification) + Phase 2 (Deep Analysis)
   */
  @Post('analyze')
  async startAnalysis(@Body() dto: StartAnalysisDto): Promise<AnalysisStatusDto> {
    if (!dto.sessionId) {
      throw new BadRequestException('sessionId is required');
    }

    return this.universalInputService.startAnalysis(dto.sessionId, dto.assetIds || [], {
      includeSecurityScan: dto.includeSecurityScan ?? true,
      includeQualityMetrics: dto.includeQualityMetrics ?? true,
    });
  }

  /**
   * Get analysis status and results
   */
  @Get('status/:sessionId')
  async getStatus(@Param('sessionId') sessionId: string): Promise<AnalysisStatusDto> {
    return this.universalInputService.getStatus(sessionId);
  }

  /**
   * Get gate plan (recommendations) after analysis is complete
   */
  @Get('gate-plan/:sessionId')
  async getGatePlan(@Param('sessionId') sessionId: string): Promise<GatePlanResponseDto> {
    const plan = await this.universalInputService.getGatePlan(sessionId);

    if (!plan) {
      return {
        success: false,
        error: 'Analysis not complete or session not found',
      };
    }

    return {
      success: true,
      plan,
    };
  }

  /**
   * Confirm gate plan with user decisions
   * Returns GateContext to pass to workflow execution
   */
  @Post('confirm-plan')
  async confirmGatePlan(
    @Body() dto: ConfirmGatePlanDto,
    @Request() req: RequestWithUser,
  ): Promise<{ success: boolean; context?: GateContext; error?: string }> {
    if (!dto.sessionId || !dto.decisions || dto.decisions.length === 0) {
      throw new BadRequestException('sessionId and decisions are required');
    }

    const context = await this.universalInputService.confirmGatePlan(
      dto.sessionId,
      dto.decisions,
      req.user.id,
    );

    if (!context) {
      return {
        success: false,
        error: 'Session not found or analysis not complete',
      };
    }

    return {
      success: true,
      context,
    };
  }
}
