export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message = (data as { message?: string | string[] } | null)?.message;
    throw new ApiError(
      Array.isArray(message)
        ? message.join('. ')
        : (message ?? 'Unable to reach the API. Please try again.'),
      response.status,
    );
  }
  return data as T;
}
export const keys = {
  session: ['session'] as const,
  workspace: (id: string) => ['workspace', id] as const,
  dashboard: (id: string) => ['workspace', id, 'dashboard'] as const,
  projects: (id: string) => ['workspace', id, 'projects'] as const,
  project: (id: string, projectId: string) =>
    ['workspace', id, 'project', projectId] as const,
  members: (id: string) => ['workspace', id, 'members'] as const,
  task: (id: string, taskId: string) =>
    ['workspace', id, 'task', taskId] as const,
};
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
export const initials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('');
