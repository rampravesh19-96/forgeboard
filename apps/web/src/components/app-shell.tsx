'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CheckSquare,
  ChevronDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { Dashboard, Session, Workspace } from '@forgeboard/types';
import { api, ApiError, keys } from '@/lib/api';
import { Avatar, ErrorState, Loading, Modal } from './ui';

interface WorkspaceContext {
  session: Session;
  workspace: Workspace;
  notify: (message: string) => void;
}
const Context = createContext<WorkspaceContext | null>(null);
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error('Workspace context missing');
  return value;
}
function SearchDialog({
  workspaceId,
  close,
}: {
  workspaceId: string;
  close: () => void;
}) {
  const [term, setTerm] = useState('');
  const { data, isPending, error } = useQuery({
    queryKey: keys.dashboard(workspaceId),
    queryFn: () => api<Dashboard>(`/workspaces/${workspaceId}/dashboard`),
  });
  const needle = term.trim().toLowerCase();
  const projects =
    data?.projects
      .filter((p) => p.name.toLowerCase().includes(needle))
      .slice(0, 5) ?? [];
  const tasks =
    data?.tasks
      .filter((t) => t.title.toLowerCase().includes(needle))
      .slice(0, 8) ?? [];
  return (
    <Modal title="Search workspace" onClose={close}>
      <div className="modal-body">
        <label className="search-field">
          <Search size={18} />
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Find projects and tasks…"
            aria-label="Search projects and tasks"
          />
        </label>
        {isPending ? (
          <Loading />
        ) : error ? (
          <ErrorState error={error} />
        ) : (
          <div className="search-results">
            <p className="eyebrow">Projects</p>
            {projects.map((p) => (
              <Link
                key={p.id}
                onClick={close}
                href={`/w/${workspaceId}/projects/${p.id}`}
              >
                <FolderKanban size={16} />
                {p.name}
                <ArrowUpRight size={14} />
              </Link>
            ))}
            <p className="eyebrow">Tasks</p>
            {tasks.map((t) => (
              <Link
                key={t.id}
                onClick={close}
                href={`/w/${workspaceId}/projects/${t.column.board.project.id}?task=${t.id}`}
              >
                <CheckSquare size={16} />
                <span>
                  {t.title}
                  <small>{t.column.board.project.name}</small>
                </span>
              </Link>
            ))}
            {!tasks.length && !projects.length && (
              <p className="muted">No results. Try a different title.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
export function AppShell({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const client = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const [toast, setToast] = useState('');
  const session = useQuery({
    queryKey: keys.session,
    queryFn: () => api<Session>('/auth/session'),
    retry: false,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (session.error instanceof ApiError && session.error.status === 401)
      router.replace('/sign-in');
  }, [session.error, router]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  if (session.isPending) return <Loading />;
  if (session.error)
    return (
      <ErrorState error={session.error} retry={() => void session.refetch()} />
    );
  const workspace = session.data.workspaces.find((w) => w.id === workspaceId);
  if (!workspace)
    return (
      <ErrorState
        error={
          new Error(
            'You do not have access to this workspace. Return to the sign-in page to choose your demo workspace.',
          )
        }
      />
    );
  const base = `/w/${workspace.id}`;
  const nav = [
    { href: base, label: 'Overview', icon: LayoutDashboard },
    { href: `${base}/projects`, label: 'Projects', icon: FolderKanban },
    { href: `${base}/my-tasks`, label: 'My tasks', icon: CheckSquare },
  ];
  const title = pathname.includes('/projects/')
    ? 'Project board'
    : pathname.endsWith('/projects')
      ? 'Projects'
      : pathname.endsWith('/my-tasks')
        ? 'My tasks'
        : 'Overview';
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
      client.clear();
      router.replace('/sign-in');
    } catch (error) {
      setToast((error as Error).message);
    }
  };
  return (
    <Context.Provider
      value={{ session: session.data, workspace, notify: setToast }}
    >
      <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
        {mobileOpen && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
          <Link href={base} className="brand">
            <span className="brand-mark">F</span>
            <span className="sidebar-label">
              ForgeBoard<span className="brand-dot">.</span>
            </span>
          </Link>
          <label className="workspace-picker">
            <span className="workspace-icon">{workspace.name[0]}</span>
            <select
              aria-label="Switch workspace"
              value={workspace.id}
              onChange={(e) => {
                setMobileOpen(false);
                router.push(`/w/${e.target.value}`);
              }}
            >
              {session.data.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <p className="nav-caption sidebar-label">WORKSPACE</p>
          <nav>
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                title={label}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`nav-item ${(href === base ? pathname === href : pathname.startsWith(href)) ? 'active' : ''}`}
              >
                <Icon size={19} />
                <span className="sidebar-label">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="sidebar-note sidebar-label">
            <span className="demo-dot" />
            Demo workspace
            <p>
              Fictional data. Real interactions.
              <br />
              Explore, create, and make it yours.
            </p>
          </div>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <PanelLeftClose size={18} />
            <span className="sidebar-label">Collapse sidebar</span>
          </button>
          <div className="sidebar-profile">
            <Avatar user={session.data.user} />
            <div className="sidebar-label">
              <strong>{session.data.user.name}</strong>
              <small>Demo account</small>
            </div>
          </div>
        </aside>
        <div className="app-main">
          <header className="topbar">
            <div className="breadcrumbs">
              <button
                className="icon-button mobile-toggle"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Open navigation"
              >
                <Menu size={20} />
              </button>
              <span className="workspace-crumb">
                Workspace <span>/</span>
              </span>
              <strong>{title}</strong>
            </div>
            <div className="topbar-actions">
              <button
                className="search-trigger"
                onClick={() => setSearch(true)}
              >
                <Search size={16} />
                <span>Search anything…</span>
                <kbd>⌕</kbd>
              </button>
              <span className="demo-label">Demo</span>
              <details className="user-menu">
                <summary aria-label="User menu">
                  <Avatar user={session.data.user} small />
                </summary>
                <div>
                  <strong>{session.data.user.name}</strong>
                  <small>{session.data.user.email}</small>
                  <button onClick={() => void logout()}>
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </details>
            </div>
          </header>
          <main className="page-content" key={workspaceId}>
            {children}
          </main>
          <footer className="app-footer">
            <span>ForgeBoard · Interactive portfolio demo</span>
            <span>All people and workspace content are fictional.</span>
          </footer>
        </div>
        {search && (
          <SearchDialog
            workspaceId={workspace.id}
            close={() => setSearch(false)}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
            <button
              onClick={() => setToast('')}
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </Context.Provider>
  );
}
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
export function NewProjectLink() {
  const { workspace } = useWorkspace();
  return (
    <Link href={`/w/${workspace.id}/projects?create=true`} className="button">
      <Plus size={16} />
      New project
    </Link>
  );
}
