import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/app.js';
import { PrismaService } from '../dist/database/prisma.service.js';
import { readSession, signSession } from '../dist/auth/session.js';
import { TasksService } from '../dist/tasks/tasks.service.js';

test('HTTP movement accepts null/omitted anchors, validates UUIDs, and retains tenant guards', async () => {
  const secret = 'test-only-movement-contract-secret-123456789';
  process.env.SESSION_SECRET = secret;
  const workspaceId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const userId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  const taskId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  const columnId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
  const anchorId = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';
  const calls = [];
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({
      user: { findUnique: async () => ({ id: userId }) },
      workspaceMember: {
        findUnique: async ({ where }) =>
          where.workspaceId_userId.workspaceId === workspaceId
            ? { id: 'membership' }
            : null,
      },
    })
    .overrideProvider(TasksService)
    .useValue({
      move: async (...args) => {
        calls.push(args);
        return { id: taskId };
      },
    })
    .compile();
  const app = module.createNestApplication();
  configureApp(app);
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const path = `${base}/api/workspaces/${workspaceId}/tasks/${taskId}/move`;
    const headers = {
      Origin: 'http://localhost:3000',
      'Content-Type': 'application/json',
      Cookie: `forgeboard_session=${signSession(userId, secret)}`,
    };
    for (const body of [
      { columnId, beforeTaskId: null },
      { columnId },
      { columnId, beforeTaskId: anchorId },
    ]) {
      const response = await fetch(path, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 200);
      const [workspace, actor, task, dto] = calls.at(-1);
      assert.equal(workspace, workspaceId);
      assert.equal(actor, userId);
      assert.equal(task, taskId);
      assert.equal(dto.beforeTaskId, body.beforeTaskId);
    }
    for (const body of [
      { columnId, beforeTaskId: '' },
      { columnId, beforeTaskId: 'not-a-uuid' },
      { columnId, beforeTaskId: 0 },
      { columnId: null, beforeTaskId: null },
    ]) {
      assert.equal(
        (
          await fetch(path, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(body),
          })
        ).status,
        400,
      );
    }
    assert.equal(
      (
        await fetch(path.replace(workspaceId, anchorId), {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ columnId, beforeTaskId: null }),
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(path, {
          method: 'PATCH',
          headers: {
            Origin: headers.Origin,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ columnId, beforeTaskId: null }),
        })
      ).status,
      401,
    );
    assert.equal(
      calls.length,
      3,
      'invalid or unauthorized writes never reach the service',
    );
  } finally {
    await app.close();
    delete process.env.SESSION_SECRET;
  }
});

test('session signatures reject tampering and expiration', () => {
  const secret = 'a-test-only-secret-that-is-at-least-32-characters';
  const token = signSession('demo-user', secret, 1000);
  assert.equal(readSession(token, secret, 2000), 'demo-user');
  assert.equal(readSession(`${token}x`, secret, 2000), null);
  assert.equal(readSession(token, secret, 1000 + 8 * 3600 * 1000), null);
  assert.equal(readSession(token, 'another-key', 2000), null);
});

test('HTTP auth, tenant boundaries, DTO validation, origin checks, and project creation', async () => {
  process.env.SESSION_SECRET = 'test-only-secret-for-http-auth-validation-123';
  process.env.DEMO_AUTH_ENABLED = 'true';
  const workspaceId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const user = {
    id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    email: 'alex@forgeboard.demo',
    name: 'Alex',
  };
  let createdData;
  const prisma = {
    user: { findUnique: async () => user },
    workspaceMember: {
      findUnique: async ({ where }) =>
        where.workspaceId_userId.workspaceId === workspaceId
          ? { id: 'member' }
          : null,
    },
    project: {
      create: async ({ data }) => {
        createdData = data;
        return { id: 'new-project', ...data };
      },
    },
    activity: { create: async () => ({}) },
    $transaction: async (fn) => fn(prisma),
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  const app = module.createNestApplication();
  configureApp(app);
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const path = `${url}/api/workspaces/${workspaceId}/projects`;
    assert.equal((await fetch(path)).status, 401);
    assert.equal(
      (await fetch(`${url}/api/auth/demo`, { method: 'POST' })).status,
      403,
    );
    const login = await fetch(`${url}/api/auth/demo`, {
      method: 'POST',
      headers: { Origin: 'http://localhost:3000' },
    });
    assert.equal(login.status, 201);
    const setCookie = login.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    const headers = {
      Origin: 'http://localhost:3000',
      Cookie: setCookie.split(';')[0],
      'Content-Type': 'application/json',
    };
    const invalid = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: ' ', unknown: true }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).statusCode, 400);
    const nullName = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: null }),
    });
    assert.equal(nullName.status, 400);
    assert.equal(
      (
        await fetch(
          `${url}/api/workspaces/cccccccc-cccc-4ccc-accc-cccccccccccc/projects`,
          { headers },
        )
      ).status,
      404,
    );
    const created = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: '  Launch plan  ' }),
    });
    assert.equal(created.status, 201);
    assert.equal(createdData.name, 'Launch plan');
    assert.deepEqual(
      createdData.board.create.columns.create.map((c) => c.name),
      ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'],
    );
    assert.equal(createdData.board.create.columns.create[4].isDone, true);
  } finally {
    await app.close();
    delete process.env.SESSION_SECRET;
    delete process.env.DEMO_AUTH_ENABLED;
  }
});
