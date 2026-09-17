'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Layers3, LoaderCircle } from 'lucide-react';
import type { Session } from '@forgeboard/types';
import { api, keys } from '@/lib/api';

export default function SignIn() {
  const router = useRouter();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signIn = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/auth/demo', { method: 'POST' });
      const session = await api<Session>('/auth/session');
      if (!session.workspaces[0])
        throw new Error('No demo workspace found. Run the seed command.');
      client.clear();
      client.setQueryData(keys.session, session);
      router.push(`/w/${session.workspaces[0].id}`);
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="signin">
      <section className="signin-story">
        <div className="brand">
          <span className="brand-mark">F</span>ForgeBoard.
        </div>
        <div>
          <p className="eyebrow">A little less friction. A lot more focus.</p>
          <h1>
            Your team’s work,
            <br />
            in a good place.
          </h1>
          <p>
            A shared home for projects, priorities, and the conversations that
            move them forward.
          </p>
          <div className="signin-preview">
            <div>
              <span className="preview-dot" />
              Customer portal<span className="preview-badge">In progress</span>
            </div>
            <div className="preview-columns">
              {['Todo', 'In progress', 'Done'].map((name, i) => (
                <div key={name}>
                  <small>{name}</small>
                  {[0, 1].map((n) => (
                    <span className="preview-card" key={n}>
                      <span style={{ width: `${60 + i * 8}%` }} />
                      <span style={{ width: '40%' }} />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <small>
          A working product demo, built with Next.js, NestJS, and PostgreSQL.
        </small>
      </section>
      <section className="signin-form">
        <div className="signin-inner">
          <span className="signin-icon">
            <Layers3 size={28} />
          </span>
          <p className="eyebrow">WELCOME TO FORGEBOARD</p>
          <h2>See work come together.</h2>
          <p>
            Step into a populated workspace and explore the product as Alex
            Morgan.
          </p>
          <div className="demo-account">
            <span className="avatar">AM</span>
            <div>
              <strong>Alex Morgan</strong>
              <small>Demo workspace owner</small>
            </div>
            <span className="demo-label">Demo</span>
          </div>
          <button
            className="button signin-button"
            disabled={busy}
            onClick={() => void signIn()}
          >
            {busy ? (
              <>
                <LoaderCircle className="animate-spin" size={17} />
                Signing in…
              </>
            ) : (
              <>
                Enter demo workspace
                <ArrowRight size={17} />
              </>
            )}
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <ul className="signin-checks">
            <li>
              <Check size={15} />
              Populated projects and Kanban boards
            </li>
            <li>
              <Check size={15} />
              Create tasks, move work, and add comments
            </li>
            <li>
              <Check size={15} />
              No registration or external account required
            </li>
          </ul>
          <p className="signin-disclaimer">
            This is a shared demo with fictional people and projects. Changes
            are persisted and visible to other demo visitors. Please don’t enter
            sensitive information.
          </p>
        </div>
      </section>
    </main>
  );
}
