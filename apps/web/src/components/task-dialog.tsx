'use client';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import type { Column, Member, Priority, TaskDetail } from '@forgeboard/types';
import { api, dateLabel, keys } from '@/lib/api';
import { useWorkspace } from './app-shell';
import { Avatar, ErrorState, Loading, Modal } from './ui';

interface TaskInput {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  assigneeIds: string[];
}
function TaskForm({
  task,
  columns,
  defaultColumnId,
  onClose,
}: {
  task?: TaskDetail;
  columns: Column[];
  defaultColumnId?: string;
  onClose?: () => void;
}) {
  const { workspace, notify } = useWorkspace();
  const client = useQueryClient();
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<Priority>(
    task?.priority ?? 'MEDIUM',
  );
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? '');
  const [assigneeIds, setAssigneeIds] = useState(
    task?.assignees.map((a) => a.memberId) ?? [],
  );
  const [columnId, setColumnId] = useState(
    task?.columnId ?? defaultColumnId ?? columns[0]?.id ?? '',
  );
  const members = useQuery({
    queryKey: keys.members(workspace.id),
    queryFn: () => api<Member[]>(`/workspaces/${workspace.id}/members`),
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const data: TaskInput = {
        title: title.trim(),
        description,
        priority,
        dueDate: dueDate || null,
        assigneeIds,
      };
      const path = `/workspaces/${workspace.id}/tasks`;
      if (task) {
        await api(`${path}/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
        if (columnId !== task.columnId)
          await api(`${path}/${task.id}/move`, {
            method: 'PATCH',
            body: JSON.stringify({ columnId }),
          });
      } else
        await api(path, {
          method: 'POST',
          body: JSON.stringify({ ...data, columnId }),
        });
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: keys.workspace(workspace.id),
      });
      notify(task ? 'Task saved' : 'Task created');
      onClose?.();
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: keys.workspace(workspace.id) });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };
  const archived = Boolean(task?.column.board.project.archivedAt);
  return (
    <form onSubmit={submit} className="form-stack">
      <fieldset
        disabled={mutation.isPending || archived}
        className="task-fields"
      >
        <label>
          Task title
          <input
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to happen?"
          />
        </label>
        <label>
          Description
          <textarea
            rows={5}
            maxLength={10000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add context, acceptance criteria, or useful links…"
          />
        </label>
        <div className="form-grid">
          <label>
            Status
            <select
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
            >
              {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                <option key={p} value={p}>
                  {p[0]}
                  {p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
        </div>
        <fieldset>
          <legend>Assignees</legend>
          {members.isPending ? (
            <p className="muted">Loading teammates…</p>
          ) : members.error ? (
            <p role="alert" className="form-error">
              {members.error.message}
            </p>
          ) : (
            <div className="assignee-options">
              {members.data?.map((m) => (
                <label
                  key={m.id}
                  className={assigneeIds.includes(m.id) ? 'selected' : ''}
                >
                  <input
                    type="checkbox"
                    checked={assigneeIds.includes(m.id)}
                    onChange={(e) =>
                      setAssigneeIds(
                        e.target.checked
                          ? [...assigneeIds, m.id]
                          : assigneeIds.filter((id) => id !== m.id),
                      )
                    }
                  />
                  <Avatar user={m.user} small />
                  {m.user.name.split(' ')[0]}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      </fieldset>
      {mutation.error && (
        <p className="form-error" role="alert">
          {mutation.error.message}
        </p>
      )}
      <div className="form-actions">
        {archived ? (
          <p className="muted">Restore this project to edit tasks.</p>
        ) : (
          <button
            className="button"
            disabled={
              mutation.isPending || members.isPending || Boolean(members.error)
            }
          >
            {mutation.isPending
              ? 'Saving…'
              : task
                ? 'Save changes'
                : 'Create task'}
          </button>
        )}
      </div>
    </form>
  );
}
export function CreateTaskDialog({
  columns,
  columnId,
  onClose,
}: {
  columns: Column[];
  columnId?: string;
  onClose: () => void;
}) {
  return (
    <Modal title="Create task" onClose={onClose}>
      <div className="modal-body">
        <TaskForm
          columns={columns}
          defaultColumnId={columnId}
          onClose={onClose}
        />
      </div>
    </Modal>
  );
}

export function TaskDialog({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const { workspace, session, notify } = useWorkspace();
  const client = useQueryClient();
  const [comment, setComment] = useState('');
  const [tab, setTab] = useState<'comments' | 'activity'>('comments');
  const path = `/workspaces/${workspace.id}/tasks/${taskId}`;
  const query = useQuery({
    queryKey: keys.task(workspace.id, taskId),
    queryFn: () => api<TaskDetail>(path),
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: keys.workspace(workspace.id) });
  };
  const addComment = useMutation({
    mutationFn: () =>
      api(`${path}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: comment.trim() }),
      }),
    onSuccess: async () => {
      setComment('');
      await refresh();
      notify('Comment added');
    },
  });
  const deleteComment = useMutation({
    mutationFn: (id: string) =>
      api(`${path}/comments/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api(path, { method: 'DELETE' }),
    onSuccess: async () => {
      onClose();
      await refresh();
      notify('Task deleted');
    },
  });
  const task = query.data;
  return (
    <Modal
      title={
        task
          ? `${task.column.board.project.name} / Task details`
          : 'Task details'
      }
      onClose={onClose}
      wide
    >
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        task && (
          <div className="task-detail-grid">
            <div className="task-detail-main">
              <p className="task-reference">
                FB-{task.id.slice(0, 6).toUpperCase()}
              </p>
              <TaskForm
                key={task.id}
                task={task}
                columns={task.column.board.columns}
              />
              <div className="task-danger">
                <span>Changes are saved to this shared demo.</span>
                <button
                  className="text-danger"
                  disabled={
                    remove.isPending ||
                    Boolean(task.column.board.project.archivedAt)
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        'Delete this task and its comments? This cannot be undone.',
                      )
                    )
                      remove.mutate();
                  }}
                >
                  <Trash2 size={14} />
                  Delete task
                </button>
              </div>
              {remove.error && (
                <p className="form-error">{remove.error.message}</p>
              )}
            </div>
            <aside className="task-discussion">
              <div className="tabs">
                <button
                  className={tab === 'comments' ? 'active' : ''}
                  onClick={() => setTab('comments')}
                >
                  Comments <span className="count">{task.comments.length}</span>
                </button>
                <button
                  className={tab === 'activity' ? 'active' : ''}
                  onClick={() => setTab('activity')}
                >
                  Activity
                </button>
              </div>
              {tab === 'comments' ? (
                <>
                  <div className="comments">
                    {task.comments.map((c) => (
                      <article key={c.id} className="comment">
                        <div>
                          <Avatar user={c.author} small />
                          <strong>{c.author.name.split(' ')[0]}</strong>
                          <time>{dateLabel(c.createdAt)}</time>
                          {c.authorId === session.user.id &&
                            !task.column.board.project.archivedAt && (
                              <button
                                className="icon-button"
                                aria-label="Delete your comment"
                                disabled={deleteComment.isPending}
                                onClick={() => deleteComment.mutate(c.id)}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                        </div>
                        <p>{c.body}</p>
                      </article>
                    ))}
                    {!task.comments.length && (
                      <div className="discussion-empty">
                        <MessageSquare size={25} />
                        <h3>Start the conversation</h3>
                        <p>Share context or ask your team a question.</p>
                      </div>
                    )}
                  </div>
                  <form
                    className="comment-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      addComment.mutate();
                    }}
                  >
                    <label className="sr-only" htmlFor="comment-body">
                      Comment
                    </label>
                    <textarea
                      id="comment-body"
                      required
                      maxLength={4000}
                      placeholder="Write a comment…"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      disabled={Boolean(task.column.board.project.archivedAt)}
                    />
                    <button
                      className="button"
                      disabled={
                        addComment.isPending ||
                        !comment.trim() ||
                        Boolean(task.column.board.project.archivedAt)
                      }
                    >
                      <Send size={14} />
                      {addComment.isPending ? 'Posting…' : 'Post comment'}
                    </button>
                  </form>
                  {(addComment.error || deleteComment.error) && (
                    <p className="form-error" role="alert">
                      {(addComment.error || deleteComment.error)?.message}
                    </p>
                  )}
                </>
              ) : (
                <div className="activity-list">
                  {task.activities.map((a) => (
                    <div className="activity-item" key={a.id}>
                      <Avatar user={a.actor} small />
                      <div>
                        <p>
                          <strong>{a.actor.name.split(' ')[0]}</strong>{' '}
                          {a.message}
                        </p>
                        <time>{dateLabel(a.createdAt)}</time>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>
        )
      )}
    </Modal>
  );
}
