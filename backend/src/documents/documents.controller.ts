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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
  async create(
    @Body() createDocumentDto: CreateDocumentDto,
    @CurrentUser() user: any,
  ) {
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
    @CurrentUser() user: any,
  ) {
    return this.documentsService.findAll(projectId, user.id, documentType);
  }

  @Get('agent/:agentId')
  @ApiOperation({ summary: 'Get all documents created by an agent' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  async getDocumentsByAgent(
    @Param('agentId') agentId: string,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.getDocumentsByAgent(agentId, user.id);
  }

  @Get('stats/:projectId')
  @ApiOperation({ summary: 'Get document statistics for a project' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getDocumentStats(
    @Param('projectId') projectId: string,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.getDocumentStats(projectId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific document by ID' })
  @ApiResponse({ status: 200, description: 'Document retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.documentsService.findOne(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a document' })
  @ApiResponse({ status: 200, description: 'Document updated successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.documentsService.update(id, updateDocumentDto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document' })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async delete(@Param('id') id: string, @CurrentUser() user: any) {
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
    @CurrentUser() user: any,
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
