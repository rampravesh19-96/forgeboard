import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../dist/app.js';

test('health is served under /api and supports the configured browser origin', async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const url = await app.getUrl();
    const response = await fetch(`${url}/api/health`, {
      headers: { Origin: 'http://localhost:3000' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok',
      service: 'forgeboard-api',
    });
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      'http://localhost:3000',
    );
    assert.equal((await fetch(`${url}/health`)).status, 404);
  } finally {
    await app.close();
  }
});
