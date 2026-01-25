import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/user.types';

@ApiTags('documents')
@Controller('documents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new document' })
  @ApiResponse({ status: 201, description: 'Document created successfully' })
  @ApiResponse({
    status: 403,
    description: 'Cannot create document for project you do not own',
  })
  async create(@Body() createDocumentDto: CreateDocumentDto, @CurrentUser() user: RequestUser) {
    return this.documentsService.create(createDocumentDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all documents for a project' })
  @ApiQuery({
    name: 'documentType',
    required: false,
    description: 'Filter by document type',
  })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  async findAll(
    @Query('projectId') projectId: string,
    @Query('documentType') documentType: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.findAll(projectId, user.id, documentType);
  }

  @Get('agent/:agentId')
  @ApiOperation({ summary: 'Get all documents created by an agent' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  async getDocumentsByAgent(@Param('agentId') agentId: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.getDocumentsByAgent(agentId, user.id);
  }

  @Get('stats/:projectId')
  @ApiOperation({ summary: 'Get document statistics for a project' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getDocumentStats(@Param('projectId') projectId: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.getDocumentStats(projectId, user.id);
  }

  // ============================================================
  // DESIGN CONCEPTS - Must be before :id catch-all route
  // ============================================================

  @Get('designs/:projectId')
  @ApiOperation({ summary: 'Get all design concepts for a project' })
  @ApiResponse({ status: 200, description: 'Design concepts retrieved successfully' })
  async getDesignConcepts(@Param('projectId') projectId: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.getDesignConcepts(projectId, user.id);
  }

  @Get('designs/:projectId/selected')
  @ApiOperation({ summary: 'Get the selected design concept for a project' })
  @ApiResponse({ status: 200, description: 'Selected design concept retrieved' })
  async getSelectedDesignConcept(
    @Param('projectId') projectId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.getSelectedDesignConcept(projectId, user.id);
  }

  @Post('designs/:conceptId/select')
  @ApiOperation({ summary: 'Select a design concept as the chosen design' })
  @ApiResponse({ status: 200, description: 'Design concept selected successfully' })
  async selectDesignConcept(
    @Param('conceptId') conceptId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.selectDesignConcept(conceptId, user.id);
  }

  // Generic document by ID - must be LAST to avoid catching specific routes
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific document by ID' })
  @ApiResponse({ status: 200, description: 'Document retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a document' })
  @ApiResponse({ status: 200, description: 'Document updated successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.update(id, updateDocumentDto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document' })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async delete(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.documentsService.delete(id, user.id);
  }

  @Post('generate-from-agent')
  @ApiOperation({ summary: 'Generate documents from agent output' })
  @ApiResponse({
    status: 201,
    description: 'Documents generated successfully from agent output',
  })
  @ApiResponse({
    status: 403,
    description: 'Cannot generate documents for project you do not own',
  })
  async generateFromAgent(
    @Body()
    body: {
      projectId: string;
      agentId: string;
      agentType: string;
      agentOutput: string;
    },
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentsService.generateFromAgentOutput(
      body.projectId,
      body.agentId,
      body.agentType,
      body.agentOutput,
      user.id,
    );
  }
}
