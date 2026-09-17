import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateProjectDto, UpdateProjectDto } from './project.dto';
import { Prisma } from '@prisma/client';

export const taskInclude = {
  assignees: { include: { member: { include: { user: true } } } },
  _count: { select: { comments: true } },
} as const;
export const boardInclude = {
  columns: {
    orderBy: { position: 'asc' },
    include: {
      tasks: {
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        include: taskInclude,
      },
    },
  },
} satisfies Prisma.BoardInclude;
export const COLUMN_NAMES = [
  'Backlog',
  'Todo',
  'In Progress',
  'Review',
  'Done',
];

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly realtime: RealtimeGateway,
  ) {}
  async list(workspaceId: string) {
    const projects = await this.prisma.project.findMany({
      where: { workspaceId },
      include: {
        board: {
          include: {
            columns: { include: { _count: { select: { tasks: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return projects.map(({ board, ...project }) => ({
      ...project,
      totalTasks:
        board?.columns.reduce((n, col) => n + col._count.tasks, 0) ?? 0,
      completedTasks:
        board?.columns
          .filter((c) => c.isDone)
          .reduce((n, col) => n + col._count.tasks, 0) ?? 0,
    }));
  }
  async detail(workspaceId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, workspaceId },
      include: { board: { include: boardInclude } },
    });
    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }
  async create(workspaceId: string, actorId: string, dto: CreateProjectDto) {
    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          workspaceId,
          ...dto,
          board: {
            create: {
              columns: {
                create: COLUMN_NAMES.map((name, position) => ({
                  name,
                  position,
                  isDone: name === 'Done',
                })),
              },
            },
          },
        },
      });
      await tx.activity.create({
        data: {
          workspaceId,
          actorId,
          kind: 'PROJECT_CREATED',
          message: `created project “${created.name}”`,
        },
      });
      return created;
    });
    await this.cache.invalidate(workspaceId);
    await this.realtime.publish({
      workspaceId,
      projectId: project.id,
      kind: 'project.created',
    });
    return project;
  }
  async update(
    workspaceId: string,
    actorId: string,
    id: string,
    dto: UpdateProjectDto,
  ) {
    await this.detail(workspaceId, id);
    const { archived, ...data } = dto;
    const project = await this.prisma.$transaction(async (tx) => {
      // Use the same lock as task mutations, including archive/restore.
      await tx.board.update({
        where: { projectId: id },
        data: { version: { increment: 1 } },
      });
      const updated = await tx.project.update({
        where: { id, workspaceId },
        data: {
          ...data,
          ...(archived === undefined
            ? {}
            : { archivedAt: archived ? new Date() : null }),
        },
      });
      await tx.activity.create({
        data: {
          workspaceId,
          actorId,
          kind: 'PROJECT_UPDATED',
          message: `${archived === true ? 'archived' : archived === false ? 'restored' : 'updated'} project “${updated.name}”`,
        },
      });
      return updated;
    });
    await this.cache.invalidate(workspaceId);
    await this.realtime.publish({
      workspaceId,
      projectId: id,
      kind: 'project.updated',
    });
    return project;
  }
}
