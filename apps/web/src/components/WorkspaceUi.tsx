import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { Surface } from './ui';

type MetricTone = 'blue' | 'green' | 'neutral';

export function WorkspaceMetrics({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['ux-metrics', className].filter(Boolean).join(' ')} />;
}

export function WorkspaceMetricCard({
  icon,
  label,
  value,
  detail,
  tone = 'blue',
}: {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: MetricTone;
}) {
  return (
    <Surface className="ux-metric-card" data-tone={tone}>
      {icon ? <span className="ux-metric-card__icon">{icon}</span> : null}
      <div className="ux-metric-card__content">
        <span className="ux-metric-card__label">{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </Surface>
  );
}

type WorkspaceSectionProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export function WorkspaceSection({
  title,
  description,
  eyebrow,
  icon,
  actions,
  children,
  className,
  ...props
}: WorkspaceSectionProps) {
  return (
    <section {...props} className={['ux-section-card', className].filter(Boolean).join(' ')}>
      <header className="ux-section-card__header">
        <div className="ux-section-card__heading">
          {icon ? <span className="ux-section-card__icon">{icon}</span> : null}
          <div>
            {eyebrow ? <span className="ux-section-card__eyebrow">{eyebrow}</span> : null}
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="ux-section-card__actions">{actions}</div> : null}
      </header>
      {children ? <div className="ux-section-card__body">{children}</div> : null}
    </section>
  );
}

export function WorkspaceTabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={['ux-tabs', className].filter(Boolean).join(' ')}
      role={props.role ?? 'tablist'}
    />
  );
}

type WorkspaceTabProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function WorkspaceTab({ active = false, className, ...props }: WorkspaceTabProps) {
  return (
    <button
      {...props}
      aria-selected={active}
      className={['ux-tab', className].filter(Boolean).join(' ')}
      data-active={active || undefined}
      role="tab"
      type={props.type ?? 'button'}
    />
  );
}

export function InlineNotice({
  tone = 'info',
  title,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: 'info' | 'success' | 'error';
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      {...props}
      className={['ux-inline-notice', className].filter(Boolean).join(' ')}
      data-tone={tone}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <div>
        {title ? <strong>{title}</strong> : null}
        <p>{children}</p>
      </div>
    </div>
  );
}
