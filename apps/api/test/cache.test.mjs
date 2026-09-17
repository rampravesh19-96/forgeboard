import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CacheService } from '../dist/cache/cache.service.js';
import { WorkspacesService } from '../dist/workspaces/workspaces.service.js';

test('dashboard reads PostgreSQL provider when Redis is unavailable', async () => {
  const previous = process.env.REDIS_URL;
  // A separate refused connection; never stop or reconfigure a running Redis.
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  const cache = new CacheService();
  let reads = 0;
  const service = new WorkspacesService(
    {
      task: {
        findMany: async () => {
          reads++;
          return [{ id: 'database-task' }];
        },
      },
      activity: { findMany: async () => [] },
    },
    cache,
    { list: async () => [{ id: 'database-project', archivedAt: null }] },
  );
  try {
    const result = await service.dashboard('workspace');
    assert.equal(result.tasks[0].id, 'database-task');
    await cache.invalidate('workspace');
    await service.dashboard('workspace');
    assert.equal(reads, 2);
  } finally {
    await cache.onModuleDestroy();
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
  }
});
