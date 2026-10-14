import { Drawer } from '../../components/Drawer';
import { Button, Surface } from '../../components/ui';
import './charge-creation-chooser.css';

type Props = {
  onClose: () => void;
  onOrdinary: () => void;
  onExtraordinary: () => void;
  onOneOff: () => void;
  onInstallmentPlan: () => void;
  onAgreement: () => void;
};

export function ChargeCreationChooser({
  onClose,
  onOrdinary,
  onExtraordinary,
  onOneOff,
  onInstallmentPlan,
  onAgreement,
}: Props) {
  return (
    <Drawer eyebrow="Cuentas por cobrar" onClose={onClose} prefix="receivables" title="Nueva cuota">
      <div className="charge-creation-chooser">
        <p className="charge-creation-chooser__intro">
          Elige el tipo de obligación que vas a registrar. Habitta te lleva al flujo correcto sin
          mezclar cuotas recurrentes, derramas extraordinarias y cargos individuales.
        </p>

        <Surface className="charge-creation-option" data-kind="ordinary">
          <div className="charge-creation-option__copy">
            <span>Operación recurrente</span>
            <strong>Ordinaria recurrente</strong>
            <p>
              Administración, vigilancia, limpieza y otros gastos comunes que se repiten cada mes.
            </p>
          </div>
          <Button onClick={onOrdinary}>Configurar cuota ordinaria</Button>
        </Surface>

        <Surface className="charge-creation-option" data-kind="extraordinary">
          <div className="charge-creation-option__copy">
            <span>Operación extraordinaria</span>
            <strong>Extraordinaria de una sola vez</strong>
            <p>
              Derramas, proyectos o gastos excepcionales distribuidos entre varias unidades. Se
              publica como un lote único y no sustituye un plan de cuotas recurrentes.
            </p>
          </div>
          <Button onClick={onExtraordinary} variant="secondary">
            Crear lote extraordinario
          </Button>
        </Surface>

        <Surface className="charge-creation-option" data-kind="one-off">
          <div className="charge-creation-option__copy">
            <span>Operación individual</span>
            <strong>Cargo puntual</strong>
            <p>Un cargo individual o no recurrente para una unidad específica.</p>
          </div>
          <Button onClick={onOneOff} variant="secondary">
            Crear cargo puntual
          </Button>
        </Surface>

        <Surface className="charge-creation-option" data-kind="installment-plan">
          <div className="charge-creation-option__copy">
            <span>Operación extraordinaria</span>
            <strong>Extraordinaria con plan de cuotas</strong>
            <p>
              Publica un único cargo original por unidad y propone un calendario de pago; no
              registra pagos ni duplica la deuda.
            </p>
          </div>
          <Button onClick={onInstallmentPlan} variant="secondary">
            Crear con plan de cuotas
          </Button>
        </Surface>

        <Surface className="charge-creation-option" data-kind="agreement">
          <div className="charge-creation-option__copy">
            <span>Calendario de pago</span>
            <strong>Proponer acuerdo para un cargo existente</strong>
            <p>
              Divide únicamente el saldo vigente de un cargo original. No crea una cuota nueva ni
              registra un pago.
            </p>
          </div>
          <Button onClick={onAgreement} variant="secondary">
            Abrir acuerdos de pago
          </Button>
        </Surface>
      </div>
    </Drawer>
  );
}
