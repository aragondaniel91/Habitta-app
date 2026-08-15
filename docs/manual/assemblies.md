# Habitta — Asambleas, actas y resoluciones

Estado: **Disponible hoy dentro del workspace de Gobernanza.**

Esta guía documenta el flujo oficial de asambleas y las reglas que la interfaz respeta. La fundación server-side de HAB-169 y el workspace de HAB-171 trabajan sobre el mismo módulo de Gobernanza; Propuestas/Votaciones y Asambleas/Actas son vistas del mismo espacio, no aplicaciones separadas.

## Dónde encontrarlo

Abre **Gobernanza** y usa el selector superior:

- **Propuestas y votaciones** mantiene el flujo comunitario existente.
- **Asambleas y actas** abre el workspace formal de reuniones.

Los residentes y miembros de junta solo ven la información permitida por sus roles y RLS. Las acciones de gestión aparecen únicamente para roles autorizados para administrar gobernanza.

## Crear una asamblea

Desde **Asambleas y actas**, un administrador autorizado puede seleccionar **Nueva asamblea** y definir:

- título y descripción;
- fecha y hora;
- ubicación;
- base de elegibilidad: un voto por unidad o un voto por propietario;
- porcentaje de quórum requerido.

La nueva asamblea se crea como **Borrador**. Crear el registro desde la interfaz no escribe directamente en las tablas: la operación pasa por la API autenticada y las funciones server-side correspondientes.

## Ciclo de vida

Una asamblea sigue un flujo controlado:

1. **Borrador** — se define título, fecha, ubicación, base de votación, quórum y agenda.
2. **Programada** — la agenda todavía puede completarse antes del inicio.
3. **En curso** — al iniciar, Habitta captura una fotografía inmutable de las unidades o propietarios elegibles.
4. **Completada** — se cierra la reunión; pueden publicarse el acta y las resoluciones finales.
5. **Cancelada** — solo puede cancelarse antes de iniciar.

En la vista de detalle, las acciones disponibles cambian según el estado. La interfaz no cambia estados escribiendo directamente en las tablas. Cada transición pasa por funciones server-side con autorización y control de versión.

Si otra sesión actualizó la reunión antes que tú, el backend rechaza una transición que use una versión antigua en lugar de sobrescribir silenciosamente el cambio más reciente.

## Agenda

Mientras la asamblea está en **Borrador** o **Programada**, los administradores autorizados pueden agregar puntos desde el panel **Agenda**.

La agenda puede incluir temas libres y, cuando corresponda, enlazar una propuesta comunitaria existente. El orden es determinista.

Una vez iniciada la asamblea, la agenda queda congelada. Esto evita modificar retroactivamente qué asuntos formaban parte de la reunión.

## Iniciar la reunión y congelar elegibilidad

La acción **Iniciar y congelar elegibilidad** cambia una asamblea programada a **En curso** y crea el snapshot de elegibilidad utilizado durante toda esa reunión.

La asamblea puede usar:

- **un voto por unidad**; o
- **un voto por propietario**.

Cambios posteriores de propietarios, unidades o relaciones no modifican ese snapshot.

## Asistencia y quórum en vivo

Durante una asamblea **En curso**, los administradores autorizados disponen del panel **Asistencia y quórum**.

Cada registro de asistencia se realiza contra una entidad del snapshot congelado. Habitta muestra:

- asistentes presentes;
- total elegible;
- porcentaje actual;
- porcentaje requerido;
- estado **Quórum alcanzado** o **Quórum pendiente**.

El cálculo proviene del servidor; la UI no calcula una población de elegibilidad alternativa ni permite registrar asistentes fuera del snapshot.

## Completar la asamblea

Cuando la sesión formal termina, selecciona **Completar asamblea**. Una reunión completada ya no acepta nuevas marcas de asistencia ni modificaciones de agenda.

Completar una asamblea no publica automáticamente el acta o las resoluciones: esas publicaciones son acciones explícitas y auditables.

## Acta

El acta puede redactarse mientras la asamblea está **En curso** o **Completada**.

Usa **Guardar borrador** para conservar cambios sin publicarlos. Habitta usa control optimista de versión para impedir que una edición antigua sobrescriba cambios recientes.

Después de completar la asamblea y guardar un acta válida, puede seleccionarse **Publicar acta**.

Después de publicar el acta:

- queda inmutable;
- el editor queda deshabilitado en la interfaz;
- no puede modificarse por la API de gestión;
- su publicación conserva usuario y fecha.

## Resoluciones

Las resoluciones pueden registrarse durante una asamblea **En curso** o **Completada** y pueden vincularse a un punto de agenda o propuesta cuando aplique.

La vista de detalle separa claramente resoluciones en borrador de resoluciones publicadas. Una resolución todavía no publicada ofrece la acción **Publicar resolución** únicamente a roles autorizados.

Una resolución publicada queda inmutable.

## Lectura para residentes

Las reuniones, agenda y resoluciones publicadas que un residente pueda consultar dependen de las políticas RLS del condominio y de su relación activa. La UI nunca amplía esos permisos por mostrar la vista de Asambleas.

Los detalles administrativos de elegibilidad, asistencia y quórum operativo se solicitan solamente cuando el usuario posee permisos de gestión de gobernanza.

## Seguridad y trazabilidad

- RLS limita lecturas al condominio autorizado.
- Solo roles con permiso de gestión de gobernanza pueden crear/transicionar reuniones, registrar asistencia o publicar actas/resoluciones.
- El navegador no recibe autoridad para saltarse lifecycle, snapshot, quórum o reglas de publicación.
- Las escrituras sensibles pasan por la API autenticada y RPCs server-side.
- Cada acción importante genera evidencia en `assembly_events` y forma parte de la trazabilidad administrativa.
- Actas y resoluciones publicadas son inmutables.

## Conflictos de edición

Si otra sesión modificó una asamblea desde que fue abierta, Habitta rechaza la operación con conflicto de versión. Recarga los datos antes de repetir la acción; nunca debe intentarse sobrescribir manualmente el estado más reciente.

## No incluido todavía

No forman parte del workspace actual:

- firma electrónica de actas;
- streaming/videoconferencia integrada;
- representación legal/proxy avanzada con documentos de poder;
- reglas legales específicas por país más allá de la configuración general de elegibilidad/quórum;
- exportación certificada avanzada a formatos regulatorios.
