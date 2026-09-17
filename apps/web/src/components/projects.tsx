'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, FolderKanban, Plus, Search } from 'lucide-react';
import type { Project } from '@forgeboard/types';
import { api, keys } from '@/lib/api';
import { PageHeader, useWorkspace } from './app-shell';
import { EmptyState, ErrorState, Loading, Modal, Progress } from './ui';

export function ProjectCard({
  project,
  workspaceId,
}: {
  project: Project;
  workspaceId: string;
}) {
  return (
    <Link
      className="project-card"
      href={`/w/${workspaceId}/projects/${project.id}`}
    >
      <div className="project-card-top">
        <span
          className="project-icon"
          style={{ background: `${project.color}14`, color: project.color }}
        >
          <FolderKanban size={21} />
        </span>
        <span className="subtle-badge">
          {project.archivedAt ? 'Archived' : 'Active'}
        </span>
        <ArrowUpRight size={17} />
      </div>
      <h3>{project.name}</h3>
      <p>
        {project.description ||
          'Your next project starts here. Add tasks to put your plan in motion.'}
      </p>
      <div className="project-progress">
        <span>Progress</span>
        <strong>
          {project.totalTasks
            ? Math.round((project.completedTasks / project.totalTasks) * 100)
            : 0}
          %
        </strong>
      </div>
      <Progress complete={project.completedTasks} total={project.totalTasks} />
      <div className="project-card-footer">
        <span>
          {project.completedTasks} of {project.totalTasks} tasks complete
        </span>
        <span>Open board →</span>
      </div>
    </Link>
  );
}

export function ProjectForm({
  project,
  onClose,
}: {
  project?: Project;
  onClose: () => void;
}) {
  const { workspace, notify } = useWorkspace();
  const client = useQueryClient();
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState(project?.color ?? '#6366f1');
  const mutation = useMutation({
    mutationFn: () =>
      api<Project>(
        `/workspaces/${workspace.id}/projects${project ? `/${project.id}` : ''}`,
        {
          method: project ? 'PATCH' : 'POST',
          body: JSON.stringify({ name: name.trim(), description, color }),
        },
      ),
    onSuccess: async (result) => {
      await client.invalidateQueries({
        queryKey: keys.workspace(workspace.id),
      });
      notify(project ? 'Project updated' : 'Project created');
      onClose();
      if (!project) router.push(`/w/${workspace.id}/projects/${result.id}`);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };
  return (
    <Modal
      title={project ? 'Edit project' : 'Create a project'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="modal-body form-stack">
        <p className="muted">
          Give your team a shared space to turn plans into progress.
        </p>
        <label>
          Project name
          <input
            autoFocus
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Customer portal"
          />
        </label>
        <label>
          Description
          <textarea
            rows={4}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project working toward?"
          />
        </label>
        <fieldset>
          <legend>Project color</legend>
          <div className="color-options">
            {['#6366f1', '#3a9b83', '#c48a3a', '#db6b7b', '#6b8ec9'].map(
              (c) => (
                <button
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  className={color === c ? 'selected' : ''}
                  key={c}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ),
            )}
          </div>
        </fieldset>
        {mutation.error && (
          <p className="form-error" role="alert">
            {mutation.error.message}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={mutation.isPending}>
            {mutation.isPending
              ? 'Saving…'
              : project
                ? 'Save changes'
                : 'Create project'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ProjectsView() {
  const { workspace } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('');
  const [archived, setArchived] = useState(false);
  const query = useQuery({
    queryKey: keys.projects(workspace.id),
    queryFn: () => api<Project[]>(`/workspaces/${workspace.id}/projects`),
  });
  const visible =
    query.data?.filter(
      (p) =>
        Boolean(p.archivedAt) === archived &&
        p.name.toLowerCase().includes(filter.toLowerCase()),
    ) ?? [];
  const close = () => {
    setCreating(false);
    if (params.has('create')) router.replace(`/w/${workspace.id}/projects`);
  };
  return (
    <>
      <PageHeader
        eyebrow="MAKE SPACE FOR GOOD WORK"
        title="Projects"
        subtitle="The big picture, with all the details close by."
        action={
          <button className="button" onClick={() => setCreating(true)}>
            <Plus size={16} />
            New project
          </button>
        }
      />
      <div className="view-toolbar">
        <div className="tabs">
          <button
            className={!archived ? 'active' : ''}
            onClick={() => setArchived(false)}
          >
            Active projects
          </button>
          <button
            className={archived ? 'active' : ''}
            onClick={() => setArchived(true)}
          >
            Archived
          </button>
        </div>
        <label className="search-field compact">
          <Search size={16} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter projects…"
            aria-label="Filter projects"
          />
        </label>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : !visible.length ? (
        <EmptyState
          title={
            filter
              ? 'No matching projects'
              : archived
                ? 'No archived projects'
                : 'A fresh start'
          }
          text={
            filter
              ? 'Try a different project name.'
              : 'Create a project to start organizing your team’s work.'
          }
        />
      ) : (
        <div className="project-grid">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} workspaceId={workspace.id} />
          ))}
        </div>
      )}
      {(creating || params.get('create') === 'true') && (
        <ProjectForm onClose={close} />
      )}
    </>
  );
}
