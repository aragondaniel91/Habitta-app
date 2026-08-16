# Propiedad, estado de cuenta, solvencia y política cambiaria

**Estado:** disponible cuando HAB-186 esté integrado en `main`
**Audiencia:** administración, junta con permisos financieros y residentes con acceso a su unidad

Habitta trata a la **unidad** como la cuenta financiera permanente. Las personas pueden cambiar con el tiempo —por compraventa, sucesión, incorporación de copropietarios u otros cambios administrativos— sin mover ni reescribir la historia económica de la unidad.

## Transferencia de propiedad

La transferencia formal se realiza desde **Cuotas y cuentas por cobrar > Estado de cuenta y solvencia** sobre la vista actual de la unidad.

1. Selecciona la unidad.
2. Verifica los propietarios actuales y el estado financiero.
3. Elige **Transferir propiedad**.
4. Indica la fecha efectiva.
5. Selecciona el nuevo propietario o los nuevos copropietarios.
6. Si hay copropietarios, sus porcentajes deben sumar exactamente 100%.
7. Define un contacto principal.
8. Registra la referencia privada del documento de soporte y las notas administrativas necesarias.
9. Confirma la transferencia.

Habitta cierra las relaciones de propiedad anteriores y abre las nuevas relaciones en la misma transacción. También conserva una fotografía inmutable de los propietarios anteriores y nuevos.

### Qué no hace una transferencia

Una transferencia **no**:

- borra cargos anteriores;
- mueve cargos a una persona;
- elimina pagos;
- cambia saldos;
- reescribe movimientos del libro;
- convierte monedas;
- altera estados de cuenta históricos.

La cuenta, la deuda, los pagos y el ledger continúan asociados a la unidad.

### Acceso del propietario anterior

Cuando la relación de propiedad termina, el propietario anterior deja de tener acceso financiero a la unidad por esa relación. El nuevo propietario obtiene acceso cuando su relación vigente queda asociada a su usuario.

El historial detallado de transferencias es información administrativa. El estado de cuenta de un residente no expone documentos de identidad de propietarios anteriores.

## Estado de cuenta autoritativo

El estado de cuenta se construye desde el libro financiero de Habitta, no desde totales mantenidos manualmente en la interfaz.

Puede mostrar:

- saldo inicial por moneda;
- cargos y débitos;
- pagos, créditos y ajustes;
- saldo acumulado de cada movimiento;
- saldo al cierre por moneda;
- referencias internas al cargo, pago o asignación que originó el movimiento;
- propietario o propietarios vigentes en la fecha de cierre del estado.

### Monedas

USD, VES, EUR y cualquier otra moneda configurada se muestran **por separado**. Habitta no crea un “saldo total” mezclando monedas sin una conversión financiera explícita.

El estado puede descargarse como CSV y también imprimirse o guardarse como PDF desde el navegador.

## Solvencia

La solvencia se evalúa contra la cuenta financiera autoritativa de la unidad.

La administración puede configurar:

- **Saldo pendiente:** cualquier saldo positivo por moneda puede impedir la solvencia.
- **Saldo vencido:** solo se consideran obligaciones vencidas después del período de gracia configurado.
- **Días de gracia.**
- **Tolerancia por moneda.** La tolerancia se aplica independientemente a cada moneda.
- **Vigencia del certificado.**

Si una moneda excede la tolerancia permitida, Habitta rechaza la emisión de la solvencia.

### Certificado

Al emitir una solvencia, Habitta congela:

- la fecha de corte;
- el criterio utilizado;
- los saldos por moneda;
- los propietarios vigentes;
- la fecha de vigencia;
- un `verification_id` único.

El certificado emitido es inmutable. Cambiar posteriormente la política, registrar cargos o recibir pagos no reescribe el certificado histórico.

La verificación pública usa solamente metadatos mínimos: identificación de verificación, condominio, unidad, fecha de corte, fecha de emisión y vigencia. No expone saldos, cédulas, documentos de soporte ni fotografías de propietarios.

## Política de moneda para Venezuela

Habitta permite que cada condominio defina:

- moneda contable;
- monedas aceptadas;
- si la conversión está desactivada o permitida únicamente mediante tasas aprobadas;
- fuente sugerida de la tasa;
- antigüedad máxima aceptable de una tasa.

Para una operación típica en Venezuela, la administración puede configurar **VES** como moneda contable, aceptar **VES y USD** y usar **BCV** como fuente operativa. Estos valores son configurables: el modelo no depende de un proveedor ni de una API específica.

## Tasas aprobadas

Cuando la conversión entre monedas está habilitada, una asignación de pago en moneda distinta a la cuenta por cobrar debe coincidir con una tasa aprobada previamente.

Cada tasa conserva:

- moneda origen y destino;
- valor;
- fecha efectiva;
- fecha y hora observada;
- fuente;
- referencia de la fuente;
- usuario que la registró/aprobó.

Una nueva tasa puede sustituir a la anterior para operaciones futuras, pero la tasa anterior permanece en el historial.

### Regla de inmutabilidad cambiaria

Una transacción histórica conserva la tasa, fuente, fecha/hora y `exchange_rate_id` utilizados en ese momento. **La tasa de hoy nunca revaloriza silenciosamente un pago histórico.**

## Flujo recomendado de cierre de compraventa

Antes de registrar un cambio de propietario:

1. Consulta el estado de cuenta actual de la unidad.
2. Revisa los saldos por cada moneda.
3. Verifica si la unidad cumple el criterio de solvencia configurado.
4. Si corresponde, emite la constancia de solvencia antes de la transferencia.
5. Registra la transferencia con su fecha efectiva y soporte documental.
6. Verifica que el nuevo propietario aparezca como vigente.
7. Confirma que cargos, pagos y saldos históricos continúan exactamente en la misma unidad.

## Regla de seguridad

No uses una transferencia de propiedad para “limpiar” una deuda, ni una tasa de cambio para modificar el valor histórico de una operación. Si existe una corrección financiera real, debe registrarse mediante el mecanismo contable correspondiente para conservar trazabilidad.
