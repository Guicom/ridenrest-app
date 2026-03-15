import {
  Controller,
  Get,
  Post,
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

  @Get()
  @ApiOperation({ summary: 'List segments for an adventure' })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
  ) {
    return this.segmentsService.listSegments(adventureId, user.id)
  }
}
