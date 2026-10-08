import type { ReactNode } from 'react';
import { APP_ROUTES, type AppRoute } from '../../navigation';
import { MODULE_HELP, type ModuleHelpContent, type ModuleHelpTopicId } from './module-help';
import { getModuleHelpContent } from './module-help-ui';
import './module-help-guide.css';

export type ResolvedModuleHelpTopic = {
  route: AppRoute;
  content: ModuleHelpContent;
};

/** Resolves a canonical topic id to its single current application route and adapted guide. */
export function resolveModuleHelpTopic(topicId: ModuleHelpTopicId): ResolvedModuleHelpTopic {
  const matchingRoutes = APP_ROUTES.filter((route) => MODULE_HELP[route.key].topicId === topicId);

  if (matchingRoutes.length !== 1) {
    throw new Error(`Expected exactly one help route for topic: ${topicId}`);
  }

  const route = matchingRoutes[0];
  if (!route) throw new Error(`Missing help route for topic: ${topicId}`);

  const matchingHelp = Object.values(MODULE_HELP).filter((content) => content.topicId === topicId);
  if (matchingHelp.length !== 1) {
    throw new Error(`Expected exactly one help entry for topic: ${topicId}`);
  }

  const content = matchingHelp[0];
  if (!content) throw new Error(`Missing help entry for topic: ${topicId}`);

  return { route, content: getModuleHelpContent(route.key, content) };
}

type HelpCenterPageProps = {
  topicId: ModuleHelpTopicId;
  onBack: () => void;
};

function GuideList({ children }: { children: readonly string[] }) {
  return (
    <ul>
      {children.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function GuideSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function HelpCenterPage({ topicId, onBack }: HelpCenterPageProps) {
  const { content, route } = resolveModuleHelpTopic(topicId);

  return (
    <main aria-labelledby="help-center-title" className="module-help-guide">
      <header>
        <button onClick={onBack} type="button">
          Back
        </button>
        <span>Centro de ayuda</span>
        <h1 id="help-center-title">{route.title}</h1>
        <p>{route.label}</p>
      </header>

      <section className="module-help-purpose">
        <h2>Para qué sirve</h2>
        <p>{content.purpose}</p>
      </section>

      <GuideSection title="Qué puedes hacer">
        <GuideList>{content.actions}</GuideList>
      </GuideSection>

      <section className="module-help-walkthrough">
        <h2>Paso a paso</h2>
        <p className="module-help-section-intro">
          Sigue estos pasos en orden. Los nombres coinciden con los controles de Habitta.
        </p>
        <ol>
          {content.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="module-help-checklist" data-tone="warning">
        <h2>Antes de confirmar</h2>
        <GuideList>{content.beforeConfirm}</GuideList>
      </section>

      <section className="module-help-checklist" data-tone="success">
        <h2>Qué debe pasar después</h2>
        <GuideList>{content.result}</GuideList>
      </section>

      {content.troubleshooting?.length ? (
        <section className="module-help-checklist" data-tone="info">
          <h2>Si algo no sale como esperas</h2>
          <GuideList>{content.troubleshooting}</GuideList>
        </section>
      ) : null}

      <GuideSection title="Recomendaciones">
        <GuideList>{content.tips}</GuideList>
      </GuideSection>

      <section className="module-help-permissions">
        <h2>Permisos</h2>
        <p>{content.permissions}</p>
      </section>

      <footer>
        <button onClick={onBack} type="button">
          Volver
        </button>
      </footer>
    </main>
  );
}
