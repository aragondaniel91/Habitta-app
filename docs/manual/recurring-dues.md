# Cuotas ordinarias recurrentes

**Estado:** disponible cuando HAB-185 esté integrado en `main`  
**Audiencia:** administración y junta con permisos financieros

Habitta separa la configuración de una cuota ordinaria de la publicación de deuda. Crear un plan recurrente no carga dinero a ninguna unidad. Cada período debe pasar por una revisión explícita antes de entrar a la cartera.

## Elegir el tipo correcto de cuota

Desde **Cuotas y cuentas por cobrar > Nueva cuota**:

- **Ordinaria recurrente:** gastos comunes que se repiten periódicamente, por ejemplo administración, vigilancia, limpieza o mantenimiento ordinario.
- **Extraordinaria:** derramas, proyectos u obligaciones excepcionales distribuidas entre varias unidades.
- **Cargo puntual:** obligación no recurrente para una unidad específica.

## Ámbitos financieros

Un ámbito indica qué unidades participan en un gasto sin confundir la estructura física del condominio con la contabilidad.

- **Todo el condominio:** participan todas las unidades activas.
- **Un edificio:** participan las unidades activas de ese edificio.
- **Grupo personalizado:** participan únicamente las unidades seleccionadas.

Un edificio o una unidad de otro condominio nunca puede formar parte del ámbito.

## Crear una cuota ordinaria

1. Crea o selecciona el ámbito financiero.
2. Selecciona el concepto de cargo.
3. Define el nombre del plan, moneda, fecha de inicio y días de emisión/vencimiento.
4. Selecciona la forma de distribución:
   - **Por alícuota / participación:** el monto ingresado es el presupuesto total del período. Habitta lo distribuye proporcionalmente usando la alícuota vigente de cada unidad incluida.
   - **Monto fijo por unidad:** cada unidad incluida recibe exactamente el monto indicado.
5. Guarda el plan.

La base de datos crea de forma idempotente el primer período en estado **Programada**. Esto todavía no crea deuda.

## Ciclo mensual

El flujo operativo es:

`Programada -> Por aprobar -> Publicada`

### Programada

El período existe, pero todavía usa información viva del condominio. Al seleccionar **Preparar para revisión**, Habitta calcula las unidades participantes y congela el reparto de ese mes.

### Por aprobar

El reparto queda guardado como una fotografía del período. Cambiar posteriormente una alícuota o una relación de unidad no modifica un mes ya preparado.

Antes de publicar, revisa:

- unidades incluidas;
- alícuota usada cuando corresponda;
- monto asignado a cada unidad;
- total y moneda;
- fecha de vencimiento.

Todavía no existe una cuenta por cobrar nueva en esta etapa.

### Publicada

**Aprobar y publicar** crea los cargos mediante el libro financiero inmutable existente. El período queda histórico y no se puede reprecificar modificando el plan o las alícuotas actuales.

Cuando un período cambia correctamente a **Publicada**, la base de datos deja programado el mes siguiente si el plan continúa activo y no alcanzó su fecha final. Esa programación automática nunca publica dinero por sí sola.

## Alícuotas

Para una distribución por participación, las unidades incluidas deben tener una alícuota válida antes de preparar el período. Habitta calcula el reparto en el servidor y reconcilia los centavos de forma determinística para que la suma de las unidades coincida exactamente con el presupuesto solicitado.

## Monedas

Cada plan y cada período conserva una moneda concreta. Habitta no suma USD, VES u otras monedas como si fueran equivalentes. La política de tasas de cambio y conversión pertenece a un flujo financiero explícito; no se aplica silenciosamente al crear cuotas.

## Recuperación operativa

La programación normal ocurre automáticamente al crear el plan y después de publicar cada período. La acción **Programar siguiente período** permanece disponible para un administrador autorizado como mecanismo explícito de recuperación o planificación anticipada. La generación es idempotente: el mismo plan no puede tener dos ocurrencias para el mismo mes.

## Regla de seguridad

Ningún cron, trigger de programación ni apertura de la pantalla puede publicar una deuda automáticamente. La publicación siempre requiere autorización y una acción humana separada sobre un período previamente preparado.
