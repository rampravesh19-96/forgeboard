import { Global, Module } from '@nestjs/common';
import { WorkspaceGuard } from './workspace.guard';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { CacheService } from '../cache/cache.service';
import { ProjectsModule } from '../projects/projects.module';

@Global()
@Module({
  imports: [ProjectsModule],
  providers: [WorkspaceGuard, WorkspacesService, CacheService],
  controllers: [WorkspacesController],
  exports: [WorkspaceGuard, CacheService],
})
export class WorkspacesModule {}
