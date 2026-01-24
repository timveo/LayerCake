import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AssetsService } from './assets.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/user.types';
import { UploadTempAssetDto, UploadProjectAssetDto } from './dto/upload-asset.dto';
import { AssociateAssetsDto } from './dto/associate-assets.dto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@ApiTags('assets')
@Controller('assets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('upload-temp')
  @ApiOperation({ summary: 'Upload a file to temporary storage (before project creation)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sessionId: { type: 'string' },
        assetType: {
          type: 'string',
          enum: [
            'DESIGN_MOCKUP',
            'SCREENSHOT',
            'REFERENCE',
            'LOGO',
            'CODE_FILE',
            'CONFIG_FILE',
            'OTHER',
          ],
        },
        description: { type: 'string' },
      },
      required: ['file', 'sessionId'],
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or missing parameters' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadTemp(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Body() dto: UploadTempAssetDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetsService.uploadTemporary(
      file,
      dto.sessionId,
      user.id,
      dto.assetType,
      dto.description,
    );
  }

  @Post('projects/:projectId')
  @ApiOperation({ summary: 'Upload a file directly to a project' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        assetType: {
          type: 'string',
          enum: [
            'DESIGN_MOCKUP',
            'SCREENSHOT',
            'REFERENCE',
            'LOGO',
            'CODE_FILE',
            'CONFIG_FILE',
            'OTHER',
          ],
        },
        description: { type: 'string' },
      },
      required: ['file', 'assetType'],
    },
  })
  @ApiResponse({ status: 201, description: 'File uploaded to project successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or missing parameters' })
  @ApiResponse({ status: 403, description: 'Not authorized to access this project' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  @UseInterceptors(FileInterceptor('file'))
  async uploadToProject(
    @Param('projectId') projectId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Body() dto: UploadProjectAssetDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.assetsService.uploadToProject(
      file,
      projectId,
      user.id,
      dto.assetType,
      dto.description,
    );
  }

  @Post('associate')
  @ApiOperation({ summary: 'Associate temporary uploads with a project' })
  @ApiResponse({ status: 201, description: 'Assets associated with project successfully' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  @ApiResponse({ status: 403, description: 'Not authorized to access this project' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async associateWithProject(@Body() dto: AssociateAssetsDto, @CurrentUser() user: RequestUser) {
    return this.assetsService.associateTempUploads(
      dto.tempKeys,
      dto.projectId,
      user.id,
      dto.assetType,
    );
  }

  @Get('projects/:projectId')
  @ApiOperation({ summary: 'Get all assets for a project' })
  @ApiResponse({ status: 200, description: 'List of project assets with signed URLs' })
  @ApiResponse({ status: 403, description: 'Not authorized to access this project' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async getProjectAssets(@Param('projectId') projectId: string, @CurrentUser() user: RequestUser) {
    return this.assetsService.getProjectAssets(projectId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single asset by ID' })
  @ApiResponse({ status: 200, description: 'Asset details with signed URL' })
  @ApiResponse({ status: 403, description: 'Not authorized to access this asset' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  async getAsset(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.assetsService.getAsset(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an asset' })
  @ApiResponse({ status: 204, description: 'Asset deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to delete this asset' })
  @ApiResponse({ status: 404, description: 'Asset not found' })
  async deleteAsset(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.assetsService.deleteAsset(id, user.id);
  }

  @Delete('temp/:tempKey')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a temporary upload' })
  @ApiResponse({ status: 204, description: 'Temporary upload deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to delete this upload' })
  @ApiResponse({ status: 404, description: 'Temporary upload not found' })
  async deleteTempUpload(@Param('tempKey') tempKey: string, @CurrentUser() user: RequestUser) {
    // Decode the temp key (it's URL encoded due to slashes)
    const decodedKey = decodeURIComponent(tempKey);
    await this.assetsService.deleteTempUpload(decodedKey, user.id);
  }
}
