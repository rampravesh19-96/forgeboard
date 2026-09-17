import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { Test } from '@nestjs/testing';
import { io } from 'socket.io-client';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/app.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { RealtimeGateway } from '../dist/realtime/realtime.gateway.js';
import { signSession, realtimeSecret } from '../dist/auth/session.js';

const workspaceA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const workspaceB = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const projectA = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const projectB = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
const userA = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';
const userB = 'ffffffff-ffff-4fff-afff-ffffffffffff';
const origin = 'http://localhost:3000';
const wait = (socket, event) =>
  once(socket, event, { signal: globalThis.AbortSignal.timeout(5000) });

test('real Socket.IO handshake rejects foreign origins, sessions, tenants and projects', async () => {
  await withServer(async ({ connect, url }) => {
    for (const auth of [
      { workspaceId: workspaceA },
      {
        ticket: signSession(userA, process.env.SESSION_SECRET),
        workspaceId: workspaceA,
      },
      {
        ticket: signSession(userA, realtimeSecret(), Date.now() - 1000, 1),
        workspaceId: workspaceA,
      },
      { ticket: signSession(userA, realtimeSecret()), workspaceId: workspaceB },
      { ticket: signSession(userA, realtimeSecret()), workspaceId: 'invalid' },
      {
        ticket: signSession(userA, realtimeSecret()),
        workspaceId: workspaceA,
        projectId: projectB,
      },
    ]) {
      const socket = connect(auth);
      const rejected = wait(socket, 'connect_error');
      socket.connect();
      await rejected;
      assert.equal(socket.connected, false);
    }
    const foreign = connect(
      { ticket: signSession(userA, realtimeSecret()), workspaceId: workspaceA },
      'https://untrusted.invalid',
    );
    const rejected = wait(foreign, 'connect_error');
    foreign.connect();
    await rejected;
    assert.equal(foreign.connected, false);
    const cookie = `forgeboard_session=${signSession(userA, process.env.SESSION_SECRET)}`;
    for (const [headers, status] of [
      [{ Origin: origin }, 401],
      [{ Cookie: cookie }, 403],
      [{ Origin: origin, Cookie: cookie }, 201],
    ]) {
      const response = await fetch(`${url}/api/auth/realtime`, {
        method: 'POST',
        headers,
      });
      assert.equal(response.status, status);
    }
  });
});

test('events stay scoped, project filters apply, and membership revocation stops delivery', async () => {
  await withServer(async ({ connect, gateway, members }) => {
    const a = connect({
      ticket: signSession(userA, realtimeSecret()),
      workspaceId: workspaceA,
      projectId: projectA,
    });
    const b = connect({
      ticket: signSession(userB, realtimeSecret()),
      workspaceId: workspaceB,
    });
    const receivedA = [],
      receivedB = [];
    a.on('workspace.changed', (event) => receivedA.push(event));
    b.on('workspace.changed', (event) => receivedB.push(event));
    const connected = [wait(a, 'connect'), wait(b, 'connect')];
    a.connect();
    b.connect();
    await Promise.all(connected);
    await gateway.publish({
      workspaceId: workspaceA,
      projectId: projectB,
      kind: 'task.updated',
    });
    const eventA = wait(a, 'workspace.changed');
    await gateway.publish({
      workspaceId: workspaceA,
      projectId: projectA,
      taskId: 'task-a',
      kind: 'task.updated',
    });
    await eventA;
    const eventB = wait(b, 'workspace.changed');
    await gateway.publish({
      workspaceId: workspaceB,
      projectId: projectB,
      kind: 'comment.added',
    });
    await eventB;
    assert.equal(receivedA.length, 1);
    assert.equal(receivedB.length, 1);
    assert.equal(receivedA[0].workspaceId, workspaceA);
    assert.equal(receivedB[0].workspaceId, workspaceB);
    assert.equal(typeof receivedA[0].eventId, 'string');
    members.delete(userA);
    const disconnected = wait(a, 'disconnect');
    await gateway.publish({
      workspaceId: workspaceA,
      projectId: projectA,
      kind: 'task.deleted',
    });
    await disconnected;
    assert.equal(receivedA.length, 1);
  });
});

test('an established socket disconnects when its ticket expires', async () => {
  await withServer(async ({ connect }) => {
    const socket = connect({
      ticket: signSession(userA, realtimeSecret(), Date.now(), 300),
      workspaceId: workspaceA,
    });
    const connected = wait(socket, 'connect');
    const disconnected = wait(socket, 'disconnect');
    socket.connect();
    await connected;
    await disconnected;
    assert.equal(socket.connected, false);
  });
});

async function withServer(run) {
  process.env.SESSION_SECRET = 'test-only-realtime-signing-secret-123456789';
  const members = new Map([
    [userA, workspaceA],
    [userB, workspaceB],
  ]);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      user: {
        findUnique: async ({ where }) =>
          members.has(where.id) ? { id: where.id } : null,
      },
      workspaceMember: {
        findUnique: async ({ where }) =>
          members.get(where.workspaceId_userId.userId) ===
          where.workspaceId_userId.workspaceId
            ? { id: 'membership' }
            : null,
        findMany: async ({ where }) =>
          [...members]
            .filter(
              ([id, workspace]) =>
                workspace === where.workspaceId && where.userId.in.includes(id),
            )
            .map(([userId]) => ({ userId })),
      },
      project: {
        findFirst: async ({ where }) =>
          where.id === projectA && where.workspaceId === workspaceA
            ? { id: projectA }
            : null,
      },
    })
    .compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  const sockets = [];
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const connect = (auth, Origin = origin) => {
      const socket = io(`${url}/collaboration`, {
        auth,
        transports: ['websocket'],
        extraHeaders: { Origin },
        autoConnect: false,
        reconnection: false,
      });
      sockets.push(socket);
      return socket;
    };
    await run({ connect, url, members, gateway: app.get(RealtimeGateway) });
  } finally {
    sockets.forEach((socket) => socket.disconnect());
    await app.close();
    delete process.env.SESSION_SECRET;
  }
}
