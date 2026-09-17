'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  GripVertical,
  LayoutDashboard,
  MessageSquare,
  Pencil,
  Plus,
  Search,
} from 'lucide-react';
import type { ProjectDetail, Task } from '@forgeboard/types';
import { api, dateLabel, keys } from '@/lib/api';
import { PageHeader, useWorkspace } from './app-shell';
import { Avatar, ErrorState, Loading, PriorityBadge, Progress } from './ui';
import { ProjectForm } from './projects';
import { CreateTaskDialog, TaskDialog } from './task-dialog';

export function BoardView({ projectId }: { projectId: string }) {
  const { workspace, notify, session } = useWorkspace();
  const client = useQueryClient();
  const params = useSearchParams();
  const router = useRouter();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [createColumn, setCreateColumn] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [filter, setFilter] = useState('');
  const [mine, setMine] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<string | null>(null);
  const queryKey = keys.project(workspace.id, projectId);
  const query = useQuery({
    queryKey,
    queryFn: () =>
      api<ProjectDetail>(`/workspaces/${workspace.id}/projects/${projectId}`),
  });
  const move = useMutation({
    mutationFn: ({
      id,
      columnId,
      beforeTaskId,
    }: {
      id: string;
      columnId: string;
      beforeTaskId?: string | null;
    }) =>
      api(`/workspaces/${workspace.id}/tasks/${id}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ columnId, beforeTaskId }),
      }),
    onMutate: async ({ id, columnId, beforeTaskId }) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<ProjectDetail>(queryKey);
      if (previous) {
        const next = structuredClone(previous);
        const task = next.board.columns
          .flatMap((c) => c.tasks)
          .find((t) => t.id === id);
        const destination = next.board.columns.find((c) => c.id === columnId);
        if (task && destination) {
          for (const column of next.board.columns)
            column.tasks = column.tasks.filter((t) => t.id !== id);
          task.columnId = columnId;
          const index = beforeTaskId
            ? destination.tasks.findIndex((t) => t.id === beforeTaskId)
            : destination.tasks.length;
          destination.tasks.splice(
            index < 0 ? destination.tasks.length : index,
            0,
            task,
          );
          client.setQueryData(queryKey, next);
        }
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) client.setQueryData(queryKey, context.previous);
      notify(error.message);
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: keys.workspace(workspace.id) }),
  });
  const archive = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspace.id}/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: !query.data?.archivedAt }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: keys.workspace(workspace.id),
      });
      notify(query.data?.archivedAt ? 'Project restored' : 'Project archived');
    },
    onError: (error) => notify(error.message),
  });
  if (query.isPending) return <Loading label="Loading project board…" />;
  if (query.error)
    return (
      <ErrorState error={query.error} retry={() => void query.refetch()} />
    );
  const project = query.data;
  const columns = project.board.columns;
  const allTasks = columns.flatMap((c) => c.tasks);
  const completed = columns
    .filter((c) => c.isDone)
    .reduce((n, c) => n + c.tasks.length, 0);
  const archived = Boolean(project.archivedAt);
  const drop = (id: string, columnId: string, beforeTaskId?: string) => {
    setDragging(null);
    setDropColumn(null);
    if (id && id !== beforeTaskId && !move.isPending && !archived)
      move.mutate({ id, columnId, beforeTaskId });
  };
  const closeTask = () => {
    setTaskId(null);
    if (params.has('task'))
      router.replace(`/w/${workspace.id}/projects/${project.id}`);
  };
  const card = (
    task: Task,
    columnId: string,
    index: number,
    columnTasks: Task[],
  ) => (
    <article
      key={task.id}
      className={`kanban-card ${dragging === task.id ? 'dragging' : ''}`}
      draggable={!archived && !move.isPending}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(task.id);
      }}
      onDragEnd={() => {
        setDragging(null);
        setDropColumn(null);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        drop(e.dataTransfer.getData('text/plain'), columnId, task.id);
      }}
    >
      <div className="card-meta">
        <span>FB-{task.id.slice(0, 5).toUpperCase()}</span>
        <GripVertical size={14} />
      </div>
      <button className="card-title" onClick={() => setTaskId(task.id)}>
        {task.title}
      </button>
      <PriorityBadge priority={task.priority} />
      <div className="card-bottom">
        <div>
          {task.dueDate && (
            <span>
              <CalendarDays size={12} />
              {dateLabel(task.dueDate)}
            </span>
          )}
          {task._count.comments > 0 && (
            <span>
              <MessageSquare size={12} />
              {task._count.comments}
            </span>
          )}
        </div>
        <div className="avatar-stack">
          {task.assignees.slice(0, 3).map((a) => (
            <Avatar key={a.memberId} user={a.member.user} small />
          ))}
        </div>
      </div>
      <div className="card-controls">
        <select
          aria-label={`Move ${task.title} to status`}
          value={columnId}
          disabled={archived || move.isPending}
          onChange={(e) =>
            move.mutate({ id: task.id, columnId: e.target.value })
          }
        >
          {columns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          aria-label={`Move ${task.title} up`}
          disabled={archived || move.isPending || index === 0}
          onClick={() =>
            move.mutate({
              id: task.id,
              columnId,
              beforeTaskId: columnTasks[index - 1]?.id,
            })
          }
        >
          <ArrowUp size={13} />
        </button>
        <button
          aria-label={`Move ${task.title} down`}
          disabled={
            archived || move.isPending || index === columnTasks.length - 1
          }
          onClick={() =>
            move.mutate({
              id: task.id,
              columnId,
              beforeTaskId: columnTasks[index + 2]?.id ?? null,
            })
          }
        >
          <ArrowDown size={13} />
        </button>
      </div>
    </article>
  );
  return (
    <>
      <PageHeader
        eyebrow="PROJECT WORKSPACE"
        title={project.name}
        subtitle={
          project.description ||
          'A shared space to plan, prioritize, and make progress.'
        }
        action={
          <div className="header-buttons">
            <button className="button secondary" onClick={() => setEdit(true)}>
              <Pencil size={15} />
              Edit project
            </button>
            <button
              className="icon-button bordered"
              aria-label={archived ? 'Restore project' : 'Archive project'}
              disabled={archive.isPending}
              onClick={() => {
                if (
                  archived ||
                  window.confirm(
                    'Archive this project? Tasks will become read-only until you restore it.',
                  )
                )
                  archive.mutate();
              }}
            >
              <Archive size={17} />
            </button>
          </div>
        }
      />
      {archived && (
        <div className="notice">
          This project is archived.{' '}
          <button onClick={() => archive.mutate()} disabled={archive.isPending}>
            Restore project
          </button>{' '}
          to resume work.
        </div>
      )}
      <div className="board-toolbar">
        <div className="board-tab">
          <LayoutDashboard size={17} />
          Board<span className="count">{allTasks.length}</span>
        </div>
        <div className="board-completion">
          <span>
            {completed}/{allTasks.length} complete
          </span>
          <Progress complete={completed} total={allTasks.length} />
        </div>
        <div className="board-tools">
          <label className="search-field compact">
            <Search size={15} />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tasks…"
              aria-label="Filter tasks"
            />
          </label>
          <button
            className={`button secondary ${mine ? 'selected' : ''}`}
            aria-pressed={mine}
            onClick={() => setMine(!mine)}
          >
            Only mine
          </button>
          <button
            className="button"
            disabled={archived}
            onClick={() => setCreateColumn(columns[0]?.id ?? null)}
          >
            <Plus size={16} />
            Add task
          </button>
        </div>
      </div>
      <div className="board-hint">
        <span>
          Drag cards to move or reorder. Use card controls on touch or keyboard.
        </span>
        <span role="status">
          {move.isPending ? 'Saving board…' : 'Changes persist automatically'}
        </span>
      </div>
      <div className="kanban-board">
        {columns.map((column, i) => {
          const visible = column.tasks.filter(
            (t) =>
              t.title.toLowerCase().includes(filter.toLowerCase()) &&
              (!mine ||
                t.assignees.some((a) => a.member.userId === session.user.id)),
          );
          return (
            <section
              key={column.id}
              className={`kanban-column ${dropColumn === column.id ? 'drop-active' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragging) setDropColumn(column.id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(e.dataTransfer.getData('text/plain'), column.id);
              }}
            >
              <div className="column-heading">
                <i className={`status-dot status-${i}`} />
                <h2>{column.name}</h2>
                <span className="count">{visible.length}</span>
                <button
                  className="icon-button"
                  disabled={archived}
                  aria-label={`Add task to ${column.name}`}
                  onClick={() => setCreateColumn(column.id)}
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="column-cards">
                {visible.map((t) =>
                  card(t, column.id, column.tasks.indexOf(t), column.tasks),
                )}
                {!visible.length && (
                  <div className="column-empty">
                    {filter || mine
                      ? 'No matching tasks'
                      : 'A little room for what’s next'}
                  </div>
                )}
              </div>
              <button
                className="add-card"
                disabled={archived}
                onClick={() => setCreateColumn(column.id)}
              >
                <Plus size={15} />
                Add task
              </button>
            </section>
          );
        })}
      </div>
      {createColumn && (
        <CreateTaskDialog
          columns={columns}
          columnId={createColumn}
          onClose={() => setCreateColumn(null)}
        />
      )}{' '}
      {(taskId || params.get('task')) && (
        <TaskDialog
          key={taskId ?? params.get('task')}
          taskId={(taskId ?? params.get('task'))!}
          onClose={closeTask}
        />
      )}{' '}
      {edit && <ProjectForm project={project} onClose={() => setEdit(false)} />}
    </>
  );
}
