'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  FolderKanban,
  ListTodo,
} from 'lucide-react';
import type { Dashboard, TaskContext, Activity } from '@forgeboard/types';
import { api, dateLabel, keys } from '@/lib/api';
import { NewProjectLink, PageHeader, useWorkspace } from './app-shell';
import { Avatar, EmptyState, ErrorState, Loading, PriorityBadge } from './ui';
import { ProjectCard } from './projects';
import { TaskDialog } from './task-dialog';

export function ActivityList({ activities }: { activities: Activity[] }) {
  return (
    <div className="activity-list">
      {activities.length ? (
        activities.map((a) => (
          <div className="activity-item" key={a.id}>
            <Avatar user={a.actor} small />
            <div>
              <p>
                <strong>{a.actor.name.split(' ')[0]}</strong> {a.message}
              </p>
              <time dateTime={a.createdAt}>
                {dateLabel(a.createdAt)} ·{' '}
                {new Date(a.createdAt).toLocaleTimeString('en', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </div>
          </div>
        ))
      ) : (
        <p className="muted empty-inline">
          Activity will appear as your team works.
        </p>
      )}
    </div>
  );
}
export function TaskRows({
  tasks,
  open,
}: {
  tasks: TaskContext[];
  open: (id: string) => void;
}) {
  return (
    <div className="task-table">
      {tasks.length ? (
        tasks.map((t) => (
          <button className="task-row" key={t.id} onClick={() => open(t.id)}>
            <span className={`task-check ${t.column.isDone ? 'done' : ''}`}>
              {t.column.isDone ? (
                <CheckCircle2 size={17} />
              ) : (
                <Circle size={17} />
              )}
            </span>
            <span className="task-row-title">
              <strong>{t.title}</strong>
              <small>{t.column.board.project.name}</small>
            </span>
            <span className="task-row-status">{t.column.name}</span>
            <PriorityBadge priority={t.priority} />
            <span className="task-row-date">
              {t.dueDate ? dateLabel(t.dueDate) : 'No date'}
            </span>
          </button>
        ))
      ) : (
        <EmptyState
          title="You’re all caught up"
          text="Assigned tasks and upcoming work will appear here."
        />
      )}
    </div>
  );
}

export function DashboardView({ onlyMine = false }: { onlyMine?: boolean }) {
  const { workspace, session } = useWorkspace();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const query = useQuery({
    queryKey: keys.dashboard(workspace.id),
    queryFn: () => api<Dashboard>(`/workspaces/${workspace.id}/dashboard`),
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const { projects, tasks, activities } = query.data;
  const mine = tasks.filter((t) =>
    t.assignees.some((a) => a.member.userId === session.user.id),
  );
  const complete = tasks.filter((t) => t.column.isDone).length;
  const due = tasks.filter((t) => !t.column.isDone && t.dueDate).slice(0, 5);
  const statuses = ['Backlog', 'Todo', 'In Progress', 'Review', 'Done'].map(
    (name) => ({
      name,
      count: tasks.filter((t) => t.column.name === name).length,
    }),
  );
  return (
    <>
      <PageHeader
        eyebrow={
          onlyMine ? 'YOUR PERSONAL WORKLIST' : workspace.name.toUpperCase()
        }
        title={
          onlyMine
            ? 'My tasks'
            : `Welcome back, ${session.user.name.split(' ')[0]}.`
        }
        subtitle={
          onlyMine
            ? 'A little clarity on what needs your attention.'
            : 'Here’s where things stand. Let’s move something forward.'
        }
        action={<NewProjectLink />}
      />
      {onlyMine ? (
        <section className="panel">
          <div className="panel-heading">
            <h2>
              Assigned to you <span className="count">{mine.length}</span>
            </h2>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
              />
              Include completed
            </label>
          </div>
          <TaskRows
            tasks={mine.filter((t) => showCompleted || !t.column.isDone)}
            open={setTaskId}
          />
        </section>
      ) : (
        <>
          <div className="stat-grid">
            {[
              {
                label: 'Active projects',
                value: projects.length,
                icon: FolderKanban,
                detail: 'Across this workspace',
                color: 'violet',
              },
              {
                label: 'Open tasks',
                value: tasks.length - complete,
                icon: ListTodo,
                detail: 'From backlog to review',
                color: 'blue',
              },
              {
                label: 'Completed',
                value: complete,
                icon: CheckCircle2,
                detail: `${tasks.length ? Math.round((complete / tasks.length) * 100) : 0}% of all tasks`,
                color: 'green',
              },
              {
                label: 'Assigned to you',
                value: mine.filter((t) => !t.column.isDone).length,
                icon: Clock3,
                detail: 'Ready for your attention',
                color: 'amber',
              },
            ].map(({ label, value, icon: Icon, detail, color }) => (
              <div className="stat-card" key={label}>
                <div>
                  <span>{label}</span>
                  <Icon className={color} size={18} />
                </div>
                <strong>{value}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </div>
          <div className="section-heading">
            <h2>
              Your projects <span className="count">{projects.length}</span>
            </h2>
            <Link href={`/w/${workspace.id}/projects`}>
              View all projects <ArrowRight size={15} />
            </Link>
          </div>
          <div className="project-grid dashboard-projects">
            {projects.slice(0, 3).map((p) => (
              <ProjectCard key={p.id} project={p} workspaceId={workspace.id} />
            ))}
            {!projects.length && (
              <EmptyState
                title="Your next project starts here"
                text="Create a project and add your first task."
              />
            )}
          </div>
          <div className="dashboard-grid">
            <div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>On your radar</h2>
                  <Link href={`/w/${workspace.id}/my-tasks`}>
                    My tasks <ArrowRight size={14} />
                  </Link>
                </div>
                <TaskRows
                  tasks={mine.filter((t) => !t.column.isDone).slice(0, 5)}
                  open={setTaskId}
                />
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Upcoming & overdue</h2>
                  <Clock3 size={17} />
                </div>
                <TaskRows tasks={due} open={setTaskId} />
              </section>
            </div>
            <div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Work in motion</h2>
                  <span className="muted">{tasks.length} tasks</span>
                </div>
                <div className="status-chart">
                  {statuses.map((s, i) => (
                    <div key={s.name}>
                      <span>
                        <i className={`status-dot status-${i}`} />
                        {s.name}
                      </span>
                      <div className="status-bar">
                        <span
                          className={`status-${i}`}
                          style={{
                            width: `${tasks.length ? (s.count / tasks.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <strong>{s.count}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Recent activity</h2>
                  <span className="live-label">Workspace feed</span>
                </div>
                <ActivityList activities={activities.slice(0, 6)} />
              </section>
            </div>
          </div>
        </>
      )}
      {taskId && <TaskDialog taskId={taskId} onClose={() => setTaskId(null)} />}
    </>
  );
}
