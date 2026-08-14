# Habitta — Asambleas, actas y resoluciones

Estado: **Backend disponible hoy; workspace de gestión en implementación (HAB-171).**

Esta guía documenta el flujo oficial de asambleas y las reglas que la interfaz debe respetar. El backend de HAB-169 ya está integrado en `main`; HAB-171 conecta esas capacidades al workspace de Gobernanza.

## Ciclo de vida

Una asamblea sigue un flujo controlado:

1. **Borrador** — se define título, fecha, ubicación, base de votación, quórum y agenda.
2. **Programada** — la agenda todavía puede completarse antes del inicio.
3. **En curso** — al iniciar, Habitta captura una fotografía inmutable de las unidades o propietarios elegibles.
4. **Completada** — se cierra la reunión; pueden publicarse el acta y las resoluciones finales.
5. **Cancelada** — solo puede cancelarse antes de iniciar.

La interfaz no cambia estados escribiendo directamente en las tablas. Cada transición pasa por funciones server-side con autorización y control de versión.

## Agenda

La agenda puede incluir temas libres y, cuando corresponda, enlazar una propuesta comunitaria existente. El orden es determinista.

Una vez iniciada la asamblea, la agenda queda congelada. Esto evita modificar retroactivamente qué asuntos formaban parte de la reunión.

## Elegibilidad y quórum

La asamblea puede usar:

- **un voto por unidad**; o
- **un voto por propietario**.

Al iniciar la reunión se captura un snapshot de elegibilidad. Cambios posteriores de propietarios, unidades o relaciones no modifican ese snapshot.

La asistencia se registra únicamente contra entidades incluidas en ese snapshot. Habitta calcula el porcentaje de asistencia y lo compara con el quórum configurado usando los datos congelados de la reunión.

## Acta

El acta puede redactarse mientras la asamblea está en curso o completada. Habitta usa control optimista de versión para impedir que una edición antigua sobrescriba cambios recientes.

Después de publicar el acta:

- queda inmutable;
- no puede editarse desde la interfaz;
- su publicación conserva usuario y fecha.

## Resoluciones

Las resoluciones pueden crearse durante una asamblea en curso o completada y pueden enlazarse a un punto de agenda o propuesta.

Solo se publican después de completar la asamblea. Una resolución publicada queda inmutable.

## Seguridad

- RLS limita lecturas al condominio autorizado.
- Solo roles con permiso de gestión de gobernanza pueden iniciar/cerrar reuniones, registrar asistencia o publicar actas/resoluciones.
- Residentes solo reciben las lecturas que las políticas RLS permiten.
- El navegador no recibe autoridad para saltarse lifecycle, snapshot, quórum o reglas de publicación.
- Cada acción importante genera evidencia en `assembly_events`.

## Conflictos de edición

Si otra sesión modificó una asamblea desde que fue abierta, Habitta rechaza la operación con conflicto de versión. La interfaz debe recargar los datos antes de repetir la acción; nunca debe sobrescribir silenciosamente el estado más reciente.

## Planificado después de HAB-171

No forman parte de este incremento:

- firma electrónica de actas;
- streaming/videoconferencia integrada;
- representación legal/proxy avanzada con documentos de poder;
- reglas legales específicas por país más allá de la configuración general de elegibilidad/quórum;
- exportación certificada avanzada a formatos regulatorios.
