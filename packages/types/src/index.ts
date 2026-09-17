/** API liveness only; does not assert database or Redis readiness. */
export interface HealthResponse {
  status: 'ok';
  service: 'forgeboard-api';
}

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
}
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'MEMBER';
}
export interface Session {
  user: User;
  workspaces: Workspace[];
}
export interface Member {
  id: string;
  userId: string;
  user: User;
  role: 'OWNER' | 'MEMBER';
}
export interface Activity {
  id: string;
  taskId: string | null;
  kind: string;
  message: string;
  createdAt: string;
  actor: User;
}
export interface Comment {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  author: User;
}
export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  position: number;
  columnId: string;
  assignees: { memberId: string; member: Member }[];
  _count: { comments: number };
}
export interface Column {
  id: string;
  name: string;
  position: number;
  isDone: boolean;
  tasks: Task[];
}
export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  color: string;
  archivedAt: string | null;
  totalTasks: number;
  completedTasks: number;
}
export interface ProjectDetail extends Project {
  board: { id: string; columns: Column[] };
}
export interface TaskContext extends Task {
  column: Column & { board: { project: Project; columns: Column[] } };
}
export interface TaskDetail extends TaskContext {
  comments: Comment[];
  activities: Activity[];
}
export interface Dashboard {
  projects: Project[];
  tasks: TaskContext[];
  activities: Activity[];
}
