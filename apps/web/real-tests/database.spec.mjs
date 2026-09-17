import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const apiRequire = createRequire(resolve(process.cwd(), '../api/package.json'));
const { PrismaClient } = apiRequire('@prisma/client');
const { createClient } = apiRequire('redis');
test('real PostgreSQL demo journey and Redis cache invalidation', async ({
  page,
  context,
  browser,
}, testInfo) => {
  const db = new PrismaClient();
  const redis = createClient({
    url: process.env.REDIS_URL,
    socket: { reconnectStrategy: false },
  });
  redis.on('error', () => {});
  const errors = [];
  let peerContext;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 400)
      errors.push(
        `${response.request().method()} ${new URL(response.url()).pathname}: ${response.status()}`,
      );
  });
  try {
    const workspace = await db.workspace.findUniqueOrThrow({
      where: { slug: 'acme-product-demo' },
    });
    expect(
      await db.workspace.count({ where: { slug: 'design-lab-demo' } }),
    ).toBe(1);
    await redis.connect();
    expect(await redis.ping()).toBe('PONG');
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Enter demo workspace' }).click();
    await expect(
      page.getByRole('heading', { name: 'Welcome back, Alex.' }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/w/${workspace.id}$`));
    const cookie = (
      await context.cookies('http://localhost:3000/api/auth/session')
    ).find((c) => c.name === 'forgeboard_session');
    expect(cookie?.httpOnly).toBe(true);
    expect((await context.request.get('/api/auth/session')).ok()).toBe(true);
    const dashboardPath = `/api/workspaces/${workspace.id}/dashboard`;
    expect((await context.request.get(dashboardPath)).ok()).toBe(true);
    const cacheKey = `dashboard:${workspace.id}`;
    expect(await redis.ttl(cacheKey)).toBeGreaterThan(0);
    expect(await redis.ttl(cacheKey)).toBeLessThanOrEqual(20);
    await page.screenshot({
      path: testInfo.outputPath('dashboard.png'),
      fullPage: true,
    });
    await page.getByRole('link', { name: /Customer portal/ }).click();
    await expect(page.locator('.kanban-card').first()).toBeVisible();
    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await page
      .getByRole('button', { name: 'New project', exact: true })
      .click();
    const name = `E2E verification ${Date.now()}`;
    await page.getByLabel('Project name', { exact: true }).fill(name);
    await page
      .getByLabel('Description', { exact: true })
      .fill('Fictional demo records created by real database verification.');
    await page
      .getByRole('button', { name: 'Create project', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/w/${workspace.id}/projects/[0-9a-f-]+$`),
    );
    const projectId = new URL(page.url()).pathname.split('/').at(-1);
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { board: { include: { columns: true } } },
    });
    expect(project.name).toBe(name);
    const todoId = project.board.columns.find((c) => c.name === 'Todo').id;
    const doneId = project.board.columns.find((c) => c.name === 'Done').id;
    const column = (label) =>
      page.locator('.kanban-column').filter({
        has: page.getByRole('heading', { name: label, exact: true }),
      });
    for (const title of ['Verification task', 'Ordering anchor']) {
      await page
        .getByRole('button', { name: 'Add task', exact: true })
        .first()
        .click();
      await page.getByLabel('Task title', { exact: true }).fill(title);
      await page
        .getByRole('combobox', { name: 'Status', exact: true })
        .selectOption(todoId);
      await page
        .getByRole('button', { name: 'Create task', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: title, exact: true }),
      ).toBeVisible();
    }
    await page
      .getByRole('button', { name: 'Verification task', exact: true })
      .click();
    const title = 'Verified task edited';
    await page.getByLabel('Task title', { exact: true }).fill(title);
    await page
      .getByLabel('Description', { exact: true })
      .fill('Persisted description');
    await page
      .getByRole('combobox', { name: 'Priority', exact: true })
      .selectOption('URGENT');
    await page.getByLabel('Due date', { exact: true }).fill('2026-10-01');
    await page.getByRole('checkbox').first().check();
    // Populate cache immediately before mutation and verify that the API invalidates it.
    expect((await context.request.get(dashboardPath)).ok()).toBe(true);
    expect(await redis.exists(cacheKey)).toBe(1);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Task saved', { exact: true })).toBeVisible();
    expect(await redis.exists(cacheKey)).toBe(0);
    const freshDashboard = await context.request.get(dashboardPath);
    expect(
      (await freshDashboard.json()).tasks.some(
        (t) => t.title === title && t.priority === 'URGENT',
      ),
    ).toBe(true);
    expect(await redis.exists(cacheKey)).toBe(1);
    await page.getByRole('button', { name: 'Close dialog' }).click();
    const task = await db.task.findFirstOrThrow({
      where: { columnId: todoId, title },
    });
    const move = async (action) => {
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/tasks/${task.id}/move`) &&
          r.request().method() === 'PATCH',
      );
      await action();
      const result = await response;
      expect(result.ok()).toBe(true);
      return result.request().postDataJSON();
    };
    await move(() =>
      page.getByLabel(`Move ${title} to status`).selectOption(doneId),
    );
    await expect(column('Done').locator('.card-title')).toHaveText([title]);
    await move(() =>
      page.getByLabel(`Move ${title} to status`).selectOption(todoId),
    );
    await expect(column('Todo').locator('.card-title')).toHaveText([
      'Ordering anchor',
      title,
    ]);
    await move(() =>
      page
        .getByRole('button', { name: `Move ${title} up`, exact: true })
        .click(),
    );
    await expect(column('Todo').locator('.card-title')).toHaveText([
      title,
      'Ordering anchor',
    ]);
    expect(
      await move(() =>
        page
          .getByRole('button', { name: `Move ${title} down`, exact: true })
          .click(),
      ),
    ).toEqual({ columnId: todoId, beforeTaskId: null });
    await page.reload();
    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    await expect(column('Todo').locator('.card-title')).toHaveText([
      'Ordering anchor',
      title,
    ]);
    expect(
      (
        await db.task.findMany({
          where: { columnId: todoId },
          orderBy: { position: 'asc' },
        })
      ).map((t) => [t.title, t.position]),
    ).toEqual([
      ['Ordering anchor', 0],
      [title, 1],
    ]);
    const saved = await db.task.findUniqueOrThrow({
      where: { id: task.id },
      include: { assignees: true },
    });
    expect(saved.priority).toBe('URGENT');
    expect(saved.description).toBe('Persisted description');
    expect(saved.dueDate?.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(saved.assignees).toHaveLength(1);
    await page.getByRole('button', { name: title, exact: true }).click();
    await expect(
      page.getByRole('combobox', { name: 'Priority', exact: true }),
    ).toHaveValue('URGENT');
    // A separate browser context obtains its own HttpOnly session and socket.
    // Keep the same task dialog open so the realtime query invalidation must
    // refresh comments, not merely the project board behind the modal.
    peerContext = await browser.newContext();
    const peer = await peerContext.newPage();
    const peerErrors = [];
    peer.on('pageerror', (error) => peerErrors.push(error.message));
    peer.on('console', (message) => {
      if (message.type() === 'error') peerErrors.push(message.text());
    });
    await peer.goto('/sign-in');
    await peer.getByRole('button', { name: 'Enter demo workspace' }).click();
    await peer.goto(`/w/${workspace.id}/projects/${projectId}`);
    await expect(peer.getByText('Live', { exact: true })).toBeVisible();
    await peer.getByRole('button', { name: title, exact: true }).click();
    await expect(peer.getByText('Start the conversation')).toBeVisible();
    const comment = 'Real PostgreSQL verification comment.';
    await page.getByLabel('Comment', { exact: true }).fill(comment);
    await page.getByRole('button', { name: 'Post comment' }).click();
    await expect(page.getByText(comment, { exact: true })).toBeVisible();
    await expect(peer.getByText(comment, { exact: true })).toBeVisible();
    expect(peerErrors).toEqual([]);
    await page.reload();
    await page.getByRole('button', { name: title, exact: true }).click();
    await expect(page.getByText(comment, { exact: true })).toBeVisible();
    expect(
      await db.comment.count({ where: { taskId: task.id, body: comment } }),
    ).toBe(1);
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await expect(page.locator('.task-discussion')).toContainText('commented');
    const activities = await db.activity.findMany({
      where: { taskId: task.id },
    });
    expect(activities.map((a) => a.kind)).toEqual(
      expect.arrayContaining([
        'TASK_CREATED',
        'TASK_UPDATED',
        'TASK_MOVED',
        'COMMENT_ADDED',
      ]),
    );
    await page.screenshot({
      path: testInfo.outputPath('task-history.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await page.screenshot({
      path: testInfo.outputPath('board.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(
      page.getByRole('link', { name: 'My tasks', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('mobile.png'),
      fullPage: true,
    });
    expect(errors).toEqual([]);
    console.log(
      `Verified real PostgreSQL project ${projectId}; records retained as ${name}. Redis PONG, cache TTL and mutation invalidation verified.`,
    );
  } finally {
    await peerContext?.close();
    if (redis.isOpen) redis.destroy();
    await db.$disconnect();
  }
});
