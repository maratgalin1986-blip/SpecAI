import type { HTMLAttributes } from 'react';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const classes = ['rounded-lg border border-slate-200 bg-white p-4 shadow-sm', className]
    .filter(Boolean)
    .join(' ');

  return <div className={classes} {...props} />;
}
