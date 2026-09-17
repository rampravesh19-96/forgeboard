import {
  Body,
  Controller,
  Delete,
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
import { TasksService } from './tasks.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  MoveTaskDto,
  CreateCommentDto,
} from './task.dto';

@Controller('workspaces/:workspaceId/tasks')
@UseGuards(AuthGuard, WorkspaceGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}
  @Post() create(
    @Param('workspaceId') w: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(w, req.userId, dto);
  }
  @Get(':id') detail(
    @Param('workspaceId') w: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasks.detail(w, id);
  }
  @Patch(':id') update(
    @Param('workspaceId') w: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(w, req.userId, id, dto);
  }
  @Patch(':id/move') move(
    @Param('workspaceId') w: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasks.move(w, req.userId, id, dto);
  }
  @Delete(':id') remove(
    @Param('workspaceId') w: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasks.remove(w, req.userId, id);
  }
  @Get(':id/comments') async comments(
    @Param('workspaceId') w: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return (await this.tasks.detail(w, id)).comments;
  }
  @Post(':id/comments') comment(
    @Param('workspaceId') w: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateCommentDto,
  ) {
    return this.tasks.addComment(w, req.userId, id, dto.body);
  }
  @Delete(':id/comments/:commentId') deleteComment(
    @Param('workspaceId') w: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasks.deleteComment(w, req.userId, id, commentId);
  }
}
