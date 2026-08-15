import { Drawer } from '../../components/Drawer';
import { Button } from '../../components/ui';

type Props = {
  onClose: () => void;
  onOrdinary: () => void;
  onExtraordinary: () => void;
  onOneOff: () => void;
};

const optionStyle = {
  display: 'grid',
  gap: '7px',
  border: '1px solid var(--border-subtle)',
  borderRadius: '14px',
  padding: '14px',
} as const;

export function ChargeCreationChooser({
  onClose,
  onOrdinary,
  onExtraordinary,
  onOneOff,
}: Props) {
  return (
    <Drawer eyebrow="Cuentas por cobrar" onClose={onClose} prefix="receivables" title="Nueva cuota">
      <div style={{ display: 'grid', gap: '12px' }}>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
          Elige el tipo de obligación que vas a registrar. Habitta te muestra el flujo correcto sin
          exponer operaciones contables internas.
        </p>

        <section style={optionStyle}>
          <div>
            <strong>Ordinaria recurrente</strong>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.45, margin: '4px 0 0' }}>
              Administración, vigilancia, limpieza y otros gastos comunes que se repiten cada mes.
            </p>
          </div>
          <Button onClick={onOrdinary}>Configurar cuota ordinaria</Button>
        </section>

        <section style={optionStyle}>
          <div>
            <strong>Extraordinaria</strong>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.45, margin: '4px 0 0' }}>
              Derramas, proyectos o gastos excepcionales que deben distribuirse entre varias
              unidades con trazabilidad de lote.
            </p>
          </div>
          <Button onClick={onExtraordinary} variant="secondary">
            Crear cuota extraordinaria
          </Button>
        </section>

        <section style={optionStyle}>
          <div>
            <strong>Cargo puntual</strong>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.45, margin: '4px 0 0' }}>
              Un cargo individual o no recurrente para una unidad específica.
            </p>
          </div>
          <Button onClick={onOneOff} variant="secondary">
            Crear cargo puntual
          </Button>
        </section>
      </div>
    </Drawer>
  );
}
