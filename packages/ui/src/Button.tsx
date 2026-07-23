import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-amber-600 text-white hover:bg-amber-700',
  secondary: 'bg-slate-800 text-white hover:bg-slate-900',
  ghost: 'bg-transparent text-slate-800 hover:bg-slate-100',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  const classes = [
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
    'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
