import { Badge, EmptyState, Surface } from '../components/ui';
import { CheckCircleIcon } from '../components/icons';
import type { AppRoute } from '../navigation';

export function DashboardFoundationPage() {
  return (
    <div className="page-stack">
      <Surface className="dashboard-intro">
        <div>
          <Badge tone="success">Base visual lista</Badge>
          <h2>La operación del condominio, con claridad.</h2>
          <p>
            Este espacio recibirá los indicadores financieros reales en el PR 3. Por ahora valida la
            jerarquía, el ritmo visual y la navegación del producto.
          </p>
        </div>
        <div className="dashboard-intro__status" aria-label="Estado del sistema visual">
          <CheckCircleIcon size={22} />
          <span>Design system activo</span>
        </div>
      </Surface>

      <section className="metric-grid" aria-label="Vista previa de indicadores">
        {['Por cobrar', 'Pagos por revisar', 'Unidades activas'].map((label) => (
          <Surface className="metric" key={label}>
            <span>{label}</span>
            <strong>—</strong>
            <small>Datos disponibles en una próxima fase</small>
          </Surface>
        ))}
      </section>

      <Surface className="table-surface">
        <div className="section-heading">
          <div>
            <h2>Actividad reciente</h2>
            <p>Los movimientos reales se conectarán sin alterar el historial financiero existente.</p>
          </div>
          <Badge tone="info">Preparado</Badge>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Actividad</th>
                <th>Referencia</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4}>
                  <div className="table-empty">Aún no hay actividad para mostrar en esta vista.</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Surface>
    </div>
  );
}

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
            <p>Este módulo se implementará sobre los componentes y patrones definidos en este PR.</p>
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
