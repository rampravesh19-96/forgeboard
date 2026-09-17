import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TasksService } from '../dist/tasks/tasks.service.js';

test('task creation rejects assignees outside the workspace before writing', async () => {
  let wrote = false;
  const tx = {
    column: {
      findFirstOrThrow: async () => ({
        boardId: 'board',
        board: { projectId: 'project', project: { archivedAt: null } },
      }),
      findFirst: async () => ({
        boardId: 'board',
        board: { project: { archivedAt: null } },
      }),
    },
    board: { update: async () => ({}) },
    workspaceMember: { count: async () => 0 },
    task: {
      create: async () => {
        wrote = true;
      },
    },
  };
  const service = new TasksService(
    { $transaction: (fn) => fn(tx) },
    { invalidate: async () => {} },
    { publish: async () => assert.fail('failed writes must not publish') },
  );
  await assert.rejects(
    service.create('workspace', 'actor', {
      title: 'Task',
      columnId: 'column',
      assigneeIds: ['foreign-member'],
    }),
    /Assignees must belong/,
  );
  assert.equal(wrote, false);
});

test('task creation rechecks archival after taking the board lock', async () => {
  let wrote = false;
  const tx = {
    column: {
      // The initial read can race with an archive transaction.
      findFirst: async () => ({
        boardId: 'board',
        board: { project: { archivedAt: null } },
      }),
      // PostgreSQL reads again after the shared board-row lock is acquired.
      findFirstOrThrow: async () => ({
        boardId: 'board',
        board: {
          projectId: 'project',
          project: { archivedAt: new Date('2026-01-01') },
        },
      }),
    },
    board: { update: async () => ({}) },
    task: {
      count: async () =>
        assert.fail('archived project must not count or write'),
      create: async () => {
        wrote = true;
      },
    },
  };
  const service = new TasksService(
    { $transaction: (fn) => fn(tx) },
    { invalidate: async () => assert.fail('failed write must not invalidate') },
    { publish: async () => assert.fail('failed write must not publish') },
  );
  await assert.rejects(
    service.create('workspace', 'actor', { title: 'Task', columnId: 'column' }),
    /Restore this project/,
  );
  assert.equal(wrote, false);
});

test('moving a task persists contiguous ordering and logs the move in one transaction', async () => {
  const tasks = [
    { id: 'a', columnId: 'todo', position: 0, title: 'A' },
    { id: 'b', columnId: 'todo', position: 1, title: 'B' },
    { id: 'c', columnId: 'done', position: 0, title: 'C' },
  ];
  let logs = 0;
  let invalidated = false;
  let locked = false;
  const tx = {
    column: {
      findFirstOrThrow: async () => ({
        boardId: 'board',
        board: { projectId: 'project', project: { archivedAt: null } },
      }),
      findFirst: async () => ({
        boardId: 'board',
        name: 'Done',
        board: { project: { archivedAt: null } },
      }),
    },
    board: {
      update: async () => {
        locked = true;
      },
    },
    task: {
      findUniqueOrThrow: async ({ where }) => ({
        ...tasks.find((t) => t.id === where.id),
      }),
      findMany: async ({ where }) =>
        tasks
          .filter((t) => t.columnId === where.columnId)
          .sort((a, b) => a.position - b.position)
          .map((t) => ({ id: t.id })),
      update: async ({ where, data }) => {
        assert.equal(locked, true);
        const task = tasks.find((t) => t.id === where.id);
        Object.assign(task, data);
        return { ...task };
      },
    },
    activity: {
      create: async ({ data }) => {
        assert.equal(data.kind, 'TASK_MOVED');
        logs++;
      },
    },
  };
  const service = new TasksService(
    { $transaction: (fn) => fn(tx) },
    {
      invalidate: async () => {
        invalidated = true;
      },
    },
    {
      publish: async (event) => {
        assert.equal(invalidated, true);
        assert.equal(event.kind, 'task.moved');
      },
    },
  );
  service.detail = async () => ({
    ...tasks[0],
    column: { boardId: 'board', board: { project: { id: 'project' } } },
  });
  await service.move('workspace', 'actor', 'a', {
    columnId: 'done',
    beforeTaskId: 'c',
  });
  assert.deepEqual(
    tasks.map((t) => [t.id, t.columnId, t.position]),
    [
      ['a', 'done', 0],
      ['b', 'todo', 0],
      ['c', 'done', 1],
    ],
  );
  assert.equal(logs, 1);
  assert.equal(invalidated, true);

  // The UI sends null when moving the first task down into the final slot.
  await service.move('workspace', 'actor', 'a', {
    columnId: 'done',
    beforeTaskId: null,
  });
  assert.deepEqual(
    tasks.map((t) => [t.id, t.columnId, t.position]),
    [
      ['a', 'done', 1],
      ['b', 'todo', 0],
      ['c', 'done', 0],
    ],
  );
  // Omission has the same append semantics, including a cross-column move.
  await service.move('workspace', 'actor', 'a', { columnId: 'todo' });
  assert.deepEqual(
    tasks.map((t) => [t.id, t.columnId, t.position]),
    [
      ['a', 'todo', 1],
      ['b', 'todo', 0],
      ['c', 'done', 0],
    ],
  );
  assert.equal(logs, 3);
});
