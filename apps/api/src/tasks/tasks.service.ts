import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ActivityKind } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CacheService } from '../cache/cache.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { taskInclude } from '../projects/projects.service';
import { CreateTaskDto, UpdateTaskDto, MoveTaskDto } from './task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly realtime: RealtimeGateway,
  ) {}
  async detail(workspaceId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, column: { board: { project: { workspaceId } } } },
      include: {
        ...taskInclude,
        column: {
          include: {
            board: {
              include: {
                project: true,
                columns: { orderBy: { position: 'asc' } },
              },
            },
          },
        },
        comments: { orderBy: { createdAt: 'asc' }, include: { author: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { actor: true },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found.');
    return task;
  }
  private async members(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    ids: string[],
  ) {
    const count = await tx.workspaceMember.count({
      where: { workspaceId, id: { in: ids } },
    });
    if (count !== ids.length)
      throw new BadRequestException('Assignees must belong to this workspace.');
  }
  private async log(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    actorId: string,
    taskId: string | null,
    kind: ActivityKind,
    message: string,
  ) {
    await tx.activity.create({
      data: { workspaceId, actorId, taskId, kind, message },
    });
  }
  private async lock(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    columnId: string,
  ) {
    const column = await tx.column.findFirst({
      where: { id: columnId, board: { project: { workspaceId } } },
      include: { board: { include: { project: true } } },
    });
    if (!column) throw new NotFoundException('Column not found.');
    // A board row update serializes concurrent ordering operations within this transaction.
    await tx.board.update({
      where: { id: column.boardId },
      data: { version: { increment: 1 } },
    });
    const fresh = await tx.column.findFirstOrThrow({
      where: { id: columnId },
      include: { board: { include: { project: true } } },
    });
    if (fresh.board.project.archivedAt)
      throw new ConflictException(
        'Restore this project before changing tasks.',
      );
    return fresh;
  }
  private async reorder(
    tx: Prisma.TransactionClient,
    columnId: string,
    movingId?: string,
    beforeId?: string | null,
  ) {
    const tasks = await tx.task.findMany({
      where: { columnId },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const ids = tasks.map((t) => t.id).filter((id) => id !== movingId);
    if (movingId) {
      const index = beforeId ? ids.indexOf(beforeId) : ids.length;
      if (index < 0)
        throw new BadRequestException(
          'The target task is no longer in this column. Refresh and try again.',
        );
      ids.splice(index, 0, movingId);
    }
    for (const [position, id] of ids.entries())
      await tx.task.update({ where: { id }, data: { position } });
  }
  async create(workspaceId: string, actorId: string, dto: CreateTaskDto) {
    const task = await this.prisma.$transaction(async (tx) => {
      const column = await this.lock(tx, workspaceId, dto.columnId);
      await this.members(tx, workspaceId, dto.assigneeIds ?? []);
      const { assigneeIds, dueDate, ...data } = dto;
      const count = await tx.task.count({ where: { columnId: dto.columnId } });
      const created = await tx.task.create({
        data: {
          ...data,
          dueDate: dueDate ? new Date(dueDate) : null,
          position: count,
          assignees: {
            create: (assigneeIds ?? []).map((memberId) => ({ memberId })),
          },
        },
        include: taskInclude,
      });
      await this.log(
        tx,
        workspaceId,
        actorId,
        created.id,
        'TASK_CREATED',
        `created “${created.title}”`,
      );
      if (assigneeIds?.length)
        await this.log(
          tx,
          workspaceId,
          actorId,
          created.id,
          'TASK_ASSIGNED',
          `assigned ${assigneeIds.length} teammate${assigneeIds.length === 1 ? '' : 's'} to “${created.title}”`,
        );
      return { created, projectId: column.board.projectId };
    });
    await this.cache.invalidate(workspaceId);
    await this.realtime.publish({
      workspaceId,
      projectId: task.projectId,
      taskId: task.created.id,
      kind: 'task.created',
    });
    return task.created;
  }
  async update(
    workspaceId: string,
    actorId: string,
    id: string,
    dto: UpdateTaskDto,
  ) {
    const current = await this.detail(workspaceId, id);
    const task = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId, current.columnId);
      const { assigneeIds, dueDate, ...data } = dto;
      if (assigneeIds) {
        await this.members(tx, workspaceId, assigneeIds);
        await tx.taskAssignee.deleteMany({ where: { taskId: id } });
        await tx.taskAssignee.createMany({
          data: assigneeIds.map((memberId) => ({ taskId: id, memberId })),
        });
      }
      const updated = await tx.task.update({
        where: { id },
        data: {
          ...data,
          ...(dueDate === undefined
            ? {}
            : { dueDate: dueDate ? new Date(dueDate) : null }),
        },
        include: taskInclude,
      });
      await this.log(
        tx,
        workspaceId,
        actorId,
        id,
        'TASK_UPDATED',
        `updated “${updated.title}”`,
      );
      if (assigneeIds)
        await this.log(
          tx,
          workspaceId,
          actorId,
          id,
          'TASK_ASSIGNED',
          `updated assignees on “${updated.title}”`,
        );
      return updated;
    });
    await this.cache.invalidate(workspaceId);
    await this.realtime.publish({
      workspaceId,
      projectId: current.column.board.project.id,
      taskId: id,
      kind: 'task.updated',
    });
    return task;
  }
  async move(
    workspaceId: string,
    actorId: string,
    id: string,
    dto: MoveTaskDto,
  ) {
    const current = await this.detail(workspaceId, id);
    if (dto.beforeTaskId === id)
      throw new BadRequestException('A task cannot be placed before itself.');
    const task = await this.prisma.$transaction(async (tx) => {
      const target = await this.lock(tx, workspaceId, dto.columnId);
      if (target.boardId !== current.column.boardId)
        throw new BadRequestException(
          'Tasks can only move within their project board.',
        );
      const fresh = await tx.task.findUniqueOrThrow({ where: { id } });
      const updated = await tx.task.update({
        where: { id },
        data: { columnId: dto.columnId },
        include: taskInclude,
      });
      if (fresh.columnId !== dto.columnId)
        await this.reorder(tx, fresh.columnId);
      await this.reorder(tx, dto.columnId, id, dto.beforeTaskId);
      await this.log(
        tx,
        workspaceId,
        actorId,
        id,
        'TASK_MOVED',
        `${fresh.columnId === dto.columnId ? 'reordered' : `moved to ${target.name}:`} “${updated.title}”`,
      );
      return tx.task.findUniqueOrThrow({ where: { id }, include: taskInclude });
    });
    await this.cache.invalidate(workspaceId);
    await this.realtime.publish({
      workspaceId,
      projectId: current.column.board.project.id,
      taskId: id,
      kind: 'task.moved',
    });
    return task;
  }
  async remove(workspaceId: string, actorId: string, id: string) {
    const task = await this.detail(workspaceId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId, task.columnId);
      const fresh = await tx.task.findUniqueOrThrow({ where: { id } });
      await tx.task.delete({ where: { id } });
      await this.reorder(tx, fresh.columnId);
      await this.log(
        tx,
        workspaceId,
        actorId,
        null,
        'TASK_DELETED',
        `deleted “${task.title}”`,
      );
    });
    await this.cache.invalidate(workspaceId);
    await this.realtime.publish({
      workspaceId,
      projectId: task.column.board.project.id,
      taskId: id,
      kind: 'task.deleted',
    });
    return { success: true };
  }
  async addComment(
    workspaceId: string,
    actorId: string,
    id: string,
    body: string,
  ) {
    const task = await this.detail(workspaceId, id);
    const comment = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId, task.columnId);
      const created = await tx.comment.create({
        data: { taskId: id, authorId: actorId, body },
        include: { author: true },
      });
      await this.log(
        tx,
        workspaceId,
        actorId,
        id,
        'COMMENT_ADDED',
        `commented on “${task.title}”`,
      );
      return created;
    });
    await this.cache.invalidate(workspaceId);
    await this.realtime.publish({
      workspaceId,
      projectId: task.column.board.project.id,
      taskId: id,
      kind: 'comment.added',
    });
    return comment;
  }
  async deleteComment(
    workspaceId: string,
    actorId: string,
    taskId: string,
    id: string,
  ) {
    const task = await this.detail(workspaceId, taskId);
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId, task.columnId);
      const comment = await tx.comment.findFirst({ where: { id, taskId } });
      if (!comment) throw new NotFoundException('Comment not found.');
      if (comment.authorId !== actorId)
        throw new ForbiddenException('You can only delete your own comments.');
      await tx.comment.delete({ where: { id } });
      await this.log(
        tx,
        workspaceId,
        actorId,
        taskId,
        'COMMENT_DELETED',
        `removed a comment from “${task.title}”`,
      );
    });
    await this.cache.invalidate(workspaceId);
    await this.realtime.publish({
      workspaceId,
      projectId: task.column.board.project.id,
      taskId: taskId,
      kind: 'comment.deleted',
    });
    return { success: true };
  }
}
