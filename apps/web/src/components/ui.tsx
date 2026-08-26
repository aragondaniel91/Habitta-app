import { useEffect, useId, useRef, useState } from 'react';
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

type InfoHintProps = {
  /** Names what the hint explains. It is the button's accessible name, so write it as a topic. */
  label: string;
  children: ReactNode;
  tone?: 'info' | 'warning';
  className?: string;
};

/**
 * Explanatory copy that used to sit permanently under a heading, moved behind a small marker.
 *
 * The text is still there for whoever needs it and gone for whoever does not. It opens on hover
 * and on focus for pointer and keyboard, and toggles on click so it also works on touch, where
 * there is no hover at all.
 */
export function InfoHint({ label, children, tone = 'info', className }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!pinned) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPinned(false);
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pinned]);

  return (
    <span
      className={['info-hint', className].filter(Boolean).join(' ')}
      onBlur={() => {
        if (!pinned) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
      ref={containerRef}
    >
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={label}
        className="info-hint__marker"
        data-tone={tone}
        onClick={() => {
          const next = !pinned;
          setPinned(next);
          setOpen(next || open);
          if (!next) setOpen(false);
        }}
        type="button"
      >
        <span aria-hidden="true">{tone === 'warning' ? '!' : '?'}</span>
      </button>
      <span className="info-hint__panel" data-open={open} id={panelId} role="tooltip">
        {children}
      </span>
    </span>
  );
}

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['surface', className].filter(Boolean).join(' ')} />;
}

export function Field({
  label,
  hint,
  error,
  required = false,
  className,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={['field', className].filter(Boolean).join(' ')}
      data-invalid={Boolean(error) || undefined}
    >
      <span className="field__label">
        {label}
        {required ? (
          <span aria-hidden="true" className="field__required">
            {' '}
            *
          </span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
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
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
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

/**
 * Shown inside the shell while a module's chunk arrives. It mirrors the shape every module opens
 * with — a header and a row of cards — so the layout does not jump once the real page renders.
 */
export function ModuleLoading() {
  return (
    <div aria-busy="true" aria-label="Cargando módulo" className="module-loading">
      <Skeleton className="skeleton--title" />
      <div className="module-loading__grid">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="skeleton--card" key={index} />
        ))}
      </div>
    </div>
  );
}
