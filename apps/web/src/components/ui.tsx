import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { ArrowRightIcon } from './icons';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={['button', className].filter(Boolean).join(' ')}
      data-size={size}
      data-variant={variant}
    />
  );
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'success' | 'info' | 'warning';
};

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span {...props} className={['badge', className].filter(Boolean).join(' ')} data-tone={tone} />
  );
}

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['surface', className].filter(Boolean).join(' ')} />;
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {error ? <span className="field__error">{error}</span> : null}
      {!error && hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={['select', className].filter(Boolean).join(' ')} />;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button onClick={onAction} variant="secondary">
          {actionLabel}
          <ArrowRightIcon size={17} />
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={['skeleton', className].filter(Boolean).join(' ')} />;
}
