import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { WorkspaceGuard } from './workspace.guard';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces/:workspaceId')
@UseGuards(AuthGuard, WorkspaceGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}
  @Get('members') members(@Param('workspaceId') id: string) {
    return this.workspaces.members(id);
  }
  @Get('dashboard') dashboard(@Param('workspaceId') id: string) {
    return this.workspaces.dashboard(id);
  }
}
