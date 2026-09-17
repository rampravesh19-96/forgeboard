import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import { isUUID } from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { Namespace, Socket } from 'socket.io';
import type { WorkspaceChange } from '@forgeboard/types';
import { PrismaService } from '../database/prisma.service';
import { readSessionClaims, realtimeSecret } from '../auth/session';

const room = (id: string) => `workspace:${id}`;

@WebSocketGateway({
  namespace: '/collaboration',
  transports: ['websocket'],
  maxHttpBufferSize: 16_384,
  // WebSocket Origin must be checked explicitly; browser CORS alone is insufficient.
  allowRequest: (
    request: { headers: { origin?: string } },
    callback: (error: string | null, allowed: boolean) => void,
  ) =>
    callback(
      null,
      request.headers.origin ===
        (process.env.WEB_ORIGIN ?? 'http://localhost:3000'),
    ),
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Namespace;
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly expirations = new Map<string, NodeJS.Timeout>();

  constructor(private readonly prisma: PrismaService) {}

  afterInit(server: Namespace) {
    server.use((socket, next) => {
      void this.authorize(socket).then(
        () => next(),
        () => next(new Error('Subscription not authorized.')),
      );
    });
  }

  private async authorize(socket: Socket) {
    const { ticket, workspaceId, projectId } = socket.handshake.auth as Record<
      string,
      unknown
    >;
    const claims = readSessionClaims(ticket, realtimeSecret());
    if (!claims || typeof workspaceId !== 'string' || !isUUID(workspaceId))
      throw new Error('Unauthorized');
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: claims.userId } },
    });
    if (!member) throw new Error('Unauthorized');
    if (
      projectId !== undefined &&
      (typeof projectId !== 'string' ||
        !isUUID(projectId) ||
        !(await this.prisma.project.findFirst({
          where: { id: projectId, workspaceId },
        })))
    )
      throw new Error('Unauthorized');
    socket.data = { ...claims, workspaceId, projectId };
    await socket.join(room(workspaceId));
    if (typeof projectId === 'string')
      await socket.join(`project:${projectId}`);
  }

  handleConnection(socket: Socket) {
    // Reconnect obtains a new ticket through the guarded REST endpoint, so expired
    // sessions, deleted users and logout cannot leave an indefinitely live socket.
    const delay = Math.max(0, Number(socket.data.expires) - Date.now());
    const timer = setTimeout(() => socket.disconnect(true), delay);
    timer.unref();
    this.expirations.set(socket.id, timer);
  }

  handleDisconnect(socket: Socket) {
    clearTimeout(this.expirations.get(socket.id));
    this.expirations.delete(socket.id);
  }

  // Called only after a successful REST transaction and cache invalidation.
  // Notifications contain identifiers, never task/comment content. REST is authoritative.
  async publish(change: Omit<WorkspaceChange, 'eventId'>) {
    if (!this.server) return;
    try {
      const sockets = [...this.server.sockets.values()].filter((socket) =>
        socket.rooms.has(room(change.workspaceId)),
      );
      if (!sockets.length) return;
      const members = await this.prisma.workspaceMember.findMany({
        where: {
          workspaceId: change.workspaceId,
          userId: { in: sockets.map((s) => String(s.data.userId)) },
        },
        select: { userId: true },
      });
      const allowed = new Set(members.map((member) => member.userId));
      const event: WorkspaceChange = { ...change, eventId: randomUUID() };
      for (const socket of sockets) {
        if (
          !allowed.has(String(socket.data.userId)) ||
          Number(socket.data.expires) <= Date.now()
        ) {
          socket.disconnect(true);
          continue;
        }
        // Optional project subscriptions are strictly limited to that project.
        if (socket.data.projectId && socket.data.projectId !== change.projectId)
          continue;
        socket.emit('workspace.changed', event);
      }
    } catch {
      // A committed mutation must never be reported as failed because delivery failed.
      this.logger.warn(
        'Realtime delivery unavailable; clients recover through REST on reconnect or refresh.',
      );
    }
  }
}
