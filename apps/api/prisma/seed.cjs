const { PrismaClient } = require('@prisma/client');
const { createHash } = require('node:crypto');
const prisma = new PrismaClient();
const id = (key) => {
  const hex = createHash('sha256')
    .update(`forgeboard-demo:${key}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const base = new Date(process.env.DEMO_SEED_DATE || '2026-09-16T09:00:00.000Z');
if (Number.isNaN(base.getTime()))
  throw new Error('DEMO_SEED_DATE must be a valid ISO date.');
const day = (offset) => new Date(base.getTime() + offset * 86400000);
const people = [
  ['alex', 'Alex Morgan', '#6366f1'],
  ['maya', 'Maya Chen', '#e58d51'],
  ['jordan', 'Jordan Lee', '#3a9b83'],
  ['sam', 'Sam Rivera', '#b16ac7'],
];
const columns = ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'];
const projects = [
  {
    key: 'launch',
    name: 'Customer portal',
    description:
      'A clearer, faster self-service experience. Bring account management, billing visibility, and support into one focused product.',
    color: '#6366f1',
    tasks: [
      ['Map the account recovery journey', 0, 'MEDIUM', 8, 1],
      ['Explore notification preferences', 0, 'LOW', 12, 3],
      ['Write empty-state content', 1, 'MEDIUM', 4, 0],
      ['Define mobile navigation patterns', 1, 'HIGH', 3, 1],
      ['Add request validation to profile API', 1, 'HIGH', 2, 2],
      ['Build the account overview page', 2, 'HIGH', 1, 0],
      ['Implement accessible form controls', 2, 'HIGH', 2, 1],
      ['Review session expiry handling', 2, 'URGENT', -1, 2],
      ['Check keyboard navigation', 3, 'HIGH', 0, 3],
      ['Review API error responses', 3, 'MEDIUM', 1, 0],
      ['Define portal information architecture', 4, 'MEDIUM', -4, 1],
      ['Set up the application shell', 4, 'HIGH', -3, 0],
      ['Document endpoint conventions', 4, 'MEDIUM', -2, 2],
    ],
  },
  {
    key: 'system',
    name: 'Design system',
    description:
      'Shared foundations for a consistent, accessible interface. Document tokens, components, and practical usage guidelines.',
    color: '#3a9b83',
    tasks: [
      ['Audit existing color contrast', 0, 'MEDIUM', 6, 3],
      ['Document content guidelines', 1, 'LOW', 7, 0],
      ['Create status badge variants', 1, 'MEDIUM', 3, 1],
      ['Refine table density options', 2, 'MEDIUM', 2, 1],
      ['Build the dialog focus pattern', 2, 'HIGH', 1, 3],
      ['Review spacing tokens', 3, 'LOW', 2, 0],
      ['Publish typography scale', 4, 'MEDIUM', -2, 1],
      ['Define semantic colors', 4, 'HIGH', -3, 3],
    ],
  },
  {
    key: 'research',
    name: 'Discovery sprint',
    description:
      'Organize research questions and synthesize findings for the next iteration. All entries are fictional demo content.',
    color: '#c48a3a',
    tasks: [
      ['Draft usability study plan', 1, 'HIGH', 5, 0],
      ['Collect onboarding questions', 2, 'MEDIUM', 3, 1],
      ['Organize research repository', 4, 'LOW', -1, 2],
    ],
  },
];

async function main() {
  for (const [index, slug] of [
    'acme-product-demo',
    'design-lab-demo',
  ].entries()) {
    if (await prisma.workspace.findUnique({ where: { slug } })) {
      console.log(`Demo workspace ${slug} already exists; preserving edits.`);
      continue;
    }
    await prisma.$transaction(
      async (tx) => {
        for (const [key, name, color] of people)
          await tx.user.upsert({
            where: { email: `${key}@forgeboard.demo` },
            update: {},
            create: {
              id: id(key),
              email: `${key}@forgeboard.demo`,
              name,
              color,
              createdAt: day(-14),
            },
          });
        const workspaceId = id(slug);
        await tx.workspace.create({
          data: {
            id: workspaceId,
            slug,
            name: index === 0 ? 'Acme Product Team' : 'Design Lab',
            createdAt: day(-12 + index),
          },
        });
        for (const [key] of people)
          await tx.workspaceMember.create({
            data: {
              id: id(`${slug}-${key}`),
              workspaceId,
              userId: id(key),
              role: key === 'alex' ? 'OWNER' : 'MEMBER',
              createdAt: day(-10),
            },
          });
        for (const project of index === 0
          ? projects.slice(0, 2)
          : projects.slice(2)) {
          const projectId = id(project.key);
          await tx.project.create({
            data: {
              id: projectId,
              workspaceId,
              name: project.name,
              description: project.description,
              color: project.color,
              createdAt: day(-9),
              board: {
                create: {
                  id: id(`${project.key}-board`),
                  columns: {
                    create: columns.map((name, position) => ({
                      id: id(`${project.key}-${position}`),
                      name,
                      position,
                      isDone: position === 4,
                    })),
                  },
                },
              },
            },
          });
          const positions = [0, 0, 0, 0, 0];
          for (const [
            n,
            [title, column, priority, due, person],
          ] of project.tasks.entries()) {
            const taskId = id(`${project.key}-task-${n}`);
            const key = people[person][0];
            await tx.task.create({
              data: {
                id: taskId,
                columnId: id(`${project.key}-${column}`),
                title,
                description: `Deliver ${title.toLowerCase()} for ${project.name.toLowerCase()}.\n\nAcceptance criteria\n• Review the approach with the team.\n• Cover loading, empty, and error states where relevant.\n• Document decisions and verify keyboard accessibility.`,
                priority,
                dueDate: day(due),
                position: positions[column]++,
                createdAt: day(-6),
                assignees: { create: { memberId: id(`${slug}-${key}`) } },
              },
            });
            await tx.activity.create({
              data: {
                id: id(`${taskId}-created`),
                workspaceId,
                taskId,
                actorId: id(key),
                kind: 'TASK_CREATED',
                message: `created “${title}”`,
                createdAt: new Date(day(-2).getTime() + n * 1800000),
              },
            });
            if (column === 2 || column === 3) {
              await tx.comment.create({
                data: {
                  id: id(`${taskId}-comment`),
                  taskId,
                  authorId: id('maya'),
                  body: 'The approach looks good. Please include the narrow-screen layout and a keyboard-only check before moving this to Done.',
                  createdAt: new Date(day(-1).getTime() + n * 600000),
                },
              });
              await tx.activity.create({
                data: {
                  id: id(`${taskId}-commented`),
                  workspaceId,
                  taskId,
                  actorId: id('maya'),
                  kind: 'COMMENT_ADDED',
                  message: `commented on “${title}”`,
                  createdAt: new Date(day(-1).getTime() + n * 600000),
                },
              });
            }
          }
        }
      },
      { timeout: 30000 },
    );
    console.log(`Seeded fictional workspace: ${slug}`);
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
