import type { ComponentPropsWithoutRef } from 'react';

export function Card({
  className = '',
  ...props
}: ComponentPropsWithoutRef<'section'>) {
  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-6 ${className}`}
      {...props}
    />
  );
}
