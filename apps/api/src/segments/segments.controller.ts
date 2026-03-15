import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger'
import { SegmentsService } from './segments.service.js'
import { CreateSegmentDto } from './dto/create-segment.dto.js'
import { ReorderSegmentsDto } from './dto/reorder-segments.dto.js'
import { RenameSegmentDto } from './dto/rename-segment.dto.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@ApiTags('segments')
@Controller('adventures/:adventureId/segments')
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a GPX file as a new segment' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
      },
      required: ['file'],
    },
  })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateSegmentDto,
  ) {
    if (!file) throw new BadRequestException('GPX file is required')
    return this.segmentsService.createSegment(adventureId, user.id, file, dto.name)
  }

  @Patch('reorder')
  @ApiOperation({ summary: 'Reorder segments for an adventure' })
  async reorder(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
    @Body() dto: ReorderSegmentsDto,
  ) {
    return this.segmentsService.reorderSegments(adventureId, user.id, dto.orderedIds)
  }

  @Patch(':segmentId')
  @ApiOperation({ summary: 'Rename a segment' })
  async rename(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
    @Param('segmentId') segmentId: string,
    @Body() dto: RenameSegmentDto,
  ) {
    return this.segmentsService.renameSegment(adventureId, segmentId, user.id, dto.name)
  }

  @Delete(':segmentId')
  @ApiOperation({ summary: 'Delete a segment and its GPX file' })
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
    @Param('segmentId') segmentId: string,
  ) {
    return this.segmentsService.deleteSegment(adventureId, segmentId, user.id)
  }

  @Get()
  @ApiOperation({ summary: 'List segments for an adventure' })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
  ) {
    return this.segmentsService.listSegments(adventureId, user.id)
  }
}
