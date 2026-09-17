import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthRequest } from '../auth/auth.guard';
import { WorkspaceGuard } from '../workspaces/workspace.guard';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './project.dto';

@Controller('workspaces/:workspaceId/projects')
@UseGuards(AuthGuard, WorkspaceGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}
  @Get() list(@Param('workspaceId') w: string) {
    return this.projects.list(w);
  }
  @Post() create(
    @Param('workspaceId') w: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projects.create(w, req.userId, dto);
  }
  @Get(':id') detail(
    @Param('workspaceId') w: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.detail(w, id);
  }
  @Patch(':id') update(
    @Param('workspaceId') w: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(w, req.userId, id, dto);
  }
}
