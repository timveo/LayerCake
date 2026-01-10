import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ProofArtifactsService } from './proof-artifacts.service';
import { CreateProofArtifactDto } from './dto/create-proof-artifact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('proof-artifacts')
@Controller('proof-artifacts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProofArtifactsController {
  constructor(
    private readonly proofArtifactsService: ProofArtifactsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new proof artifact' })
  @ApiResponse({
    status: 201,
    description: 'Proof artifact created successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Cannot create proof artifact for project you do not own',
  })
  async create(
    @Body() createDto: CreateProofArtifactDto,
    @CurrentUser() user: any,
  ) {
    return this.proofArtifactsService.create(createDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all proof artifacts for a project' })
  @ApiQuery({ name: 'gate', required: false, description: 'Filter by gate' })
  @ApiResponse({
    status: 200,
    description: 'Proof artifacts retrieved successfully',
  })
  async findAll(
    @Query('projectId') projectId: string,
    @Query('gate') gate: string,
    @CurrentUser() user: any,
  ) {
    return this.proofArtifactsService.findAll(projectId, user.id, gate);
  }

  @Get('gate/:gateId')
  @ApiOperation({ summary: 'Get all proof artifacts for a specific gate' })
  @ApiResponse({
    status: 200,
    description: 'Proof artifacts retrieved successfully',
  })
  async getArtifactsForGate(
    @Param('gateId') gateId: string,
    @CurrentUser() user: any,
  ) {
    return this.proofArtifactsService.getArtifactsForGate(gateId, user.id);
  }

  @Post('gate/:gateId/validate-all')
  @ApiOperation({ summary: 'Validate all proof artifacts for a gate' })
  @ApiResponse({
    status: 200,
    description: 'All artifacts validated successfully',
  })
  async validateGateArtifacts(
    @Param('gateId') gateId: string,
    @CurrentUser() user: any,
  ) {
    return this.proofArtifactsService.validateGateArtifacts(gateId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific proof artifact by ID' })
  @ApiResponse({
    status: 200,
    description: 'Proof artifact retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Proof artifact not found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.proofArtifactsService.findOne(id, user.id);
  }

  @Post(':id/validate')
  @ApiOperation({ summary: 'Validate a proof artifact' })
  @ApiResponse({
    status: 200,
    description: 'Proof artifact validated successfully',
  })
  @ApiResponse({ status: 404, description: 'Proof artifact not found' })
  async validate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.proofArtifactsService.validate(id, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a proof artifact' })
  @ApiResponse({
    status: 200,
    description: 'Proof artifact deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Proof artifact not found' })
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.proofArtifactsService.delete(id, user.id);
  }
}
