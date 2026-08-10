import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

// The shell owns the breadcrumb and its own controls; the page owns the words and the actions that
// belong to its module. Both render through this one component so a module never has to restate
// the heading hierarchy, and adding a module never means editing a global stylesheet again.
export type PageChrome = {
  breadcrumb: string;
  actions?: ReactNode;
};

const PageChromeContext = createContext<PageChrome | null>(null);

export const PageChromeProvider = PageChromeContext.Provider;

type Props = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: Props) {
  const chrome = useContext(PageChromeContext);
  const hasActions = Boolean(actions) || Boolean(chrome?.actions);

  return (
    <header className="page-header">
      <div className="page-header__copy">
        <nav aria-label="Ruta actual" className="breadcrumbs">
          <span>Habitta</span>
          <span aria-hidden="true">/</span>
          <strong>{chrome?.breadcrumb ?? title}</strong>
        </nav>
        {eyebrow ? <span className="page-header__eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {hasActions ? (
        <div className="page-header__actions">
          {actions}
          {chrome?.actions}
        </div>
      ) : null}
    </header>
  );
}
