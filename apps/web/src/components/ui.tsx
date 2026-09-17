'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, X, LoaderCircle, Inbox } from 'lucide-react';
import type { Priority, User } from '@forgeboard/types';
import { initials } from '@/lib/api';

export function Avatar({
  user,
  small = false,
}: {
  user: User;
  small?: boolean;
}) {
  return (
    <span
      title={user.name}
      className={`avatar ${small ? 'avatar-sm' : ''}`}
      style={{ background: `${user.color}18`, color: user.color }}
    >
      {initials(user.name)}
    </span>
  );
}
export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`priority priority-${priority.toLowerCase()}`}>
      <span aria-hidden="true">
        {priority === 'URGENT'
          ? '!'
          : priority === 'HIGH'
            ? '↑'
            : priority === 'LOW'
              ? '↓'
              : '−'}
      </span>
      {priority.toLowerCase()}
    </span>
  );
}
export function Loading({
  label = 'Loading your workspace…',
}: {
  label?: string;
}) {
  return (
    <div className="state" role="status">
      <LoaderCircle className="animate-spin" size={22} />
      <p>{label}</p>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className="state" role="alert">
      <AlertCircle size={25} />
      <h2>We couldn’t load this view</h2>
      <p>{error.message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="state">
      <Inbox size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Progress({
  complete,
  total,
}: {
  complete: number;
  total: number;
}) {
  const value = total ? Math.round((complete / total) * 100) : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Completed tasks"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
