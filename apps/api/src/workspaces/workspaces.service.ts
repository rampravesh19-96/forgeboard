import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { ProjectsService, taskInclude } from '../projects/projects.service';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly projects: ProjectsService,
  ) {}
  members(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  async dashboard(workspaceId: string) {
    const key = `dashboard:${workspaceId}`;
    const cached = await this.cache.get<unknown>(key);
    if (cached) return cached;
    const [projects, tasks, activities] = await Promise.all([
      this.projects.list(workspaceId),
      this.prisma.task.findMany({
        where: {
          column: { board: { project: { workspaceId, archivedAt: null } } },
        },
        include: {
          ...taskInclude,
          column: { include: { board: { include: { project: true } } } },
        },
        orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
      }),
      this.prisma.activity.findMany({
        where: { workspaceId },
        include: { actor: true },
        orderBy: { createdAt: 'desc' },
        take: 12,
      }),
    ]);
    const result = {
      projects: projects.filter((p) => !p.archivedAt),
      tasks,
      activities,
    };
    await this.cache.set(key, result);
    return result;
  }
}
