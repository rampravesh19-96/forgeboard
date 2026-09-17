import { test, expect } from '@playwright/test';

// Browser interaction contract tests; these fixtures never enter the running application.
test('fixture demo journey: create, edit, move, comment, activity, and mobile navigation', async ({
  page,
}, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  const user = {
    id: 'user',
    name: 'Alex Morgan',
    email: 'alex@forgeboard.demo',
    color: '#6366f1',
  };
  const workspace = {
    id: 'workspace',
    name: 'Acme Product Team',
    slug: 'demo',
    role: 'OWNER',
  };
  const member = { id: 'member', userId: user.id, user, role: 'OWNER' };
  const project = {
    id: 'project',
    workspaceId: workspace.id,
    name: 'Customer portal',
    description: 'A clearer customer experience.',
    color: '#6366f1',
    archivedAt: null,
    totalTasks: 1,
    completedTasks: 0,
  };
  let task = {
    id: 'task',
    title: 'Build account overview',
    description: 'Include empty and error states.',
    priority: 'HIGH',
    dueDate: '2026-09-18',
    position: 0,
    columnId: 'todo',
    assignees: [{ memberId: member.id, member }],
    _count: { comments: 0 },
  };
  const columns = [
    { id: 'todo', name: 'Todo', position: 0, isDone: false, tasks: [task] },
    {
      id: 'done',
      name: 'Done',
      position: 1,
      isDone: true,
      tasks: [] as (typeof task)[],
    },
  ];
  const comments: {
    id: string;
    body: string;
    authorId: string;
    author: typeof user;
    createdAt: string;
  }[] = [];
  let signedIn = false;
  const movements: { columnId: string; beforeTaskId?: string | null }[] = [];
  const activities: {
    id: string;
    taskId: string;
    kind: string;
    message: string;
    createdAt: string;
    actor: typeof user;
  }[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let data: unknown;
    if (path === '/api/auth/demo') {
      signedIn = true;
      data = { user };
    } else if (path === '/api/auth/session') {
      if (!signedIn) {
        await route.fulfill({
          status: 401,
          json: { message: 'Please sign in.' },
        });
        return;
      }
      data = { user, workspaces: [workspace] };
    } else if (path.endsWith('/dashboard'))
      data = {
        projects: [project],
        tasks: [
          {
            ...task,
            column: {
              ...columns.find((c) => c.id === task.columnId),
              board: { project },
            },
          },
        ],
        activities,
      };
    else if (path.endsWith('/members')) data = [member];
    else if (path.endsWith('/projects/project'))
      data = { ...project, board: { id: 'board', columns } };
    else if (path.endsWith('/tasks') && req.method() === 'POST') {
      const body = req.postDataJSON() as {
        title: string;
        description: string;
        priority: string;
        dueDate: string;
        columnId: string;
        assigneeIds: string[];
      };
      expect(body.assigneeIds).toEqual([member.id]);
      expect(body.dueDate).toBe('2026-09-23');
      task = {
        ...task,
        ...body,
        id: 'created-task',
        assignees: [{ memberId: member.id, member }],
        _count: { comments: 0 },
      };
      columns.find((c) => c.id === body.columnId)!.tasks.push(task);
      data = task;
    } else if (path.endsWith('/move')) {
      const body = req.postDataJSON() as {
        columnId: string;
        beforeTaskId?: string | null;
      };
      movements.push(body);
      for (const c of columns)
        c.tasks = c.tasks.filter((t) => t.id !== task.id);
      task.columnId = body.columnId;
      const destination = columns.find((c) => c.id === body.columnId)!;
      const index =
        body.beforeTaskId == null
          ? destination.tasks.length
          : destination.tasks.findIndex((t) => t.id === body.beforeTaskId);
      expect(index).toBeGreaterThanOrEqual(0);
      destination.tasks.splice(index, 0, task);
      for (const column of columns)
        column.tasks.forEach((t, position) => {
          t.position = position;
        });
      data = task;
    } else if (path.endsWith('/comments') && req.method() === 'POST') {
      comments.push({
        id: 'comment',
        body: (req.postDataJSON() as { body: string }).body,
        authorId: user.id,
        author: user,
        createdAt: new Date().toISOString(),
      });
      task._count.comments++;
      activities.push({
        id: 'activity',
        taskId: task.id,
        kind: 'COMMENT_ADDED',
        message: `commented on ${task.title}`,
        createdAt: new Date().toISOString(),
        actor: user,
      });
      data = comments[0];
    } else if (path.endsWith(`/tasks/${task.id}`)) {
      if (req.method() === 'PATCH') Object.assign(task, req.postDataJSON());
      data = {
        ...task,
        column: {
          ...columns.find((c) => c.id === task.columnId),
          board: { project, columns },
        },
        comments,
        activities,
      };
    } else {
      await route.fulfill({
        status: 404,
        json: { message: `Unmocked endpoint: ${path}` },
      });
      return;
    }
    await route.fulfill({ json: data });
  });
  await page.goto('/sign-in');
  await page.screenshot({ path: testInfo.outputPath('sign-in.png') });
  await page.getByRole('button', { name: 'Enter demo workspace' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Alex.' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('dashboard.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: /Customer portal/ }).click();
  await expect(
    page.getByRole('button', { name: 'Build account overview', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Add task', exact: true })
    .first()
    .click();
  await page
    .getByLabel('Task title', { exact: true })
    .fill('Verify account recovery');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Check the recovery flow on mobile.');
  await page.getByLabel('Due date', { exact: true }).fill('2026-09-23');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await page
    .getByRole('button', { name: 'Verify account recovery', exact: true })
    .click();
  await page
    .getByLabel('Task title', { exact: true })
    .fill('Verify account recovery on mobile');
  // A wrapping label includes option text; use the control's accessible name.
  const priority = page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Priority', exact: true });
  await priority.selectOption('URGENT');
  await expect(priority).toHaveValue('URGENT');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Task saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  const todo = page
    .locator('.kanban-column')
    .filter({ has: page.getByRole('heading', { name: 'Todo', exact: true }) });
  const title = 'Verify account recovery on mobile';
  await expect(todo.locator('.card-title')).toHaveText([
    'Build account overview',
    title,
  ]);
  await page
    .getByRole('button', { name: `Move ${title} up`, exact: true })
    .click();
  await expect(todo.locator('.card-title')).toHaveText([
    title,
    'Build account overview',
  ]);
  await page
    .getByRole('button', { name: `Move ${title} down`, exact: true })
    .click();
  await expect(todo.locator('.card-title')).toHaveText([
    'Build account overview',
    title,
  ]);
  // Wait for the persisted response/refetch, not just the optimistic order.
  await expect(
    page.getByRole('button', { name: `Move ${title} up`, exact: true }),
  ).toBeEnabled();
  expect(movements).toEqual([
    { columnId: 'todo', beforeTaskId: 'task' },
    { columnId: 'todo', beforeTaskId: null },
  ]);
  await page.reload();
  await expect(todo.locator('.card-title')).toHaveText([
    'Build account overview',
    title,
  ]);
  await page
    .getByLabel('Move Verify account recovery on mobile to status')
    .selectOption('done');
  await expect(
    page.getByLabel('Move Verify account recovery on mobile to status'),
  ).toHaveValue('done');
  await page
    .getByRole('button', {
      name: 'Verify account recovery on mobile',
      exact: true,
    })
    .click();
  await expect(priority).toHaveValue('URGENT');
  await expect(page.getByLabel('Due date', { exact: true })).toHaveValue(
    '2026-09-23',
  );
  await page.getByLabel('Comment', { exact: true }).fill('Ready for review.');
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(
    page.getByText('Ready for review.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.locator('.task-discussion')).toContainText(
    'commented on Verify account recovery on mobile',
  );
  await page.screenshot({ path: testInfo.outputPath('task-detail.png') });
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
  ).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('mobile-navigation.png') });
  expect(runtimeErrors).toEqual([]);
});

test('protected workspace redirects an unauthenticated visitor', async ({
  page,
}) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 401, json: { message: 'Please sign in.' } }),
  );
  await page.goto('/w/private');
  await expect(page).toHaveURL(/sign-in/);
});
