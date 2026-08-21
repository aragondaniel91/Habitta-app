import type { HTMLAttributes, ReactNode } from 'react';

type FormSectionProps = HTMLAttributes<HTMLElement> & {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

/** A small structural heading for administrative form groups. */
export function FormSection({
  title,
  description,
  eyebrow,
  actions,
  children,
  className,
  ...props
}: FormSectionProps) {
  return (
    <section {...props} className={['form-section', className].filter(Boolean).join(' ')}>
      <header className="form-section__heading">
        <div>
          {eyebrow ? <span className="form-section__eyebrow">{eyebrow}</span> : null}
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="form-section__actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

type FormGridProps = HTMLAttributes<HTMLDivElement> & {
  columns?: 1 | 2 | 3;
  children: ReactNode;
};

/** A responsive grid. Direct children can opt into a wider cell with data-span="full". */
export function FormGrid({ columns = 2, className, children, ...props }: FormGridProps) {
  return (
    <div
      {...props}
      className={['form-grid', className].filter(Boolean).join(' ')}
      data-columns={columns}
    >
      {children}
    </div>
  );
}

type FormActionsProps = HTMLAttributes<HTMLElement> & {
  sticky?: boolean;
  align?: 'start' | 'end';
  children: ReactNode;
};

/** A predictable footer for form actions; its labels and domain behavior stay local to each form. */
export function FormActions({
  sticky = false,
  align = 'end',
  className,
  children,
  ...props
}: FormActionsProps) {
  return (
    <footer
      {...props}
      className={['form-actions', className].filter(Boolean).join(' ')}
      data-align={align}
      data-sticky={sticky || undefined}
    >
      {children}
    </footer>
  );
}
