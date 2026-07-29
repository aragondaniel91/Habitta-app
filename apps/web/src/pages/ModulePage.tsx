import { Badge, EmptyState, Surface } from '../components/ui';
import { CheckCircleIcon } from '../components/icons';
import type { AppRoute } from '../navigation';

export function ModulePlaceholderPage({ route }: { route: AppRoute }) {
  const Icon = route.icon;

  return (
    <div className="page-stack">
      <Surface className="module-overview">
        <div className="module-overview__icon">
          <Icon size={24} />
        </div>
        <div className="module-overview__copy">
          <Badge tone="info">Estructura preparada</Badge>
          <h2>{route.title}</h2>
          <p>{route.description}</p>
        </div>
      </Surface>

      <Surface className="module-scope">
        <div className="section-heading">
          <div>
            <h2>Alcance previsto</h2>
            <p>
              Este módulo se implementará sobre los componentes y patrones definidos en este PR.
            </p>
          </div>
        </div>
        <div className="scope-list">
          {route.scope.map((item) => (
            <div className="scope-list__item" key={item}>
              <CheckCircleIcon size={18} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </Surface>

      <Surface>
        <EmptyState
          description="La navegación, permisos y estados visuales ya tienen una base estable. La lógica específica llegará en el PR correspondiente."
          icon={<Icon size={26} />}
          title={`${route.label} estará disponible próximamente`}
        />
      </Surface>
    </div>
  );
}
