# Habitta — Registro de auditoría administrativa

Estado: **Disponible para administradores de condominio.**

El Registro de auditoría consolida en una sola vista eventos administrativos que Habitta ya conserva en sus módulos. No crea una segunda historia editable: normaliza fuentes existentes y las muestra en modo **read-only**.

## Dónde encontrarlo

Los administradores de condominio pueden abrir **Sistema → Auditoría**.

La opción no aparece para propietarios, inquilinos, junta, contadores u otros roles operativos. La navegación es solo una ayuda visual: la autorización definitiva se valida otra vez en el servidor y la base de datos antes de devolver eventos.

## Qué módulos aparecen

El feed actual puede incluir eventos de:

- Pagos;
- Gastos;
- Tesorería;
- Mantenimiento;
- Gobernanza / propuestas;
- Asambleas.

Cada fila conserva como mínimo fecha/hora, módulo, acción, tipo e ID de entidad, actor cuando existe, severidad y un resumen normalizado.

## Filtros

El workspace permite aplicar filtros server-side por:

- módulo;
- severidad (`Info` o `Advertencia`);
- tipo de entidad;
- Actor ID;
- fecha/hora inicial;
- fecha/hora final.

Los filtros se aplican antes de paginar. Esto es importante: una búsqueda de advertencias no filtra solamente las 50 filas que ya están en el navegador, sino el feed autorizado completo antes de devolver la página solicitada.

El Actor ID debe ser un UUID válido. Desde una fila puedes seleccionar el identificador del actor para colocarlo en el filtro y luego aplicar la búsqueda.

## Paginación

Habitta solicita hasta 50 eventos por página en este workspace. **Anterior** y **Siguiente** avanzan usando el orden estable definido por el servidor.

Que una página contenga menos de 50 filas significa que no hay una página siguiente para ese conjunto de filtros.

## Severidad

- **Info** identifica actividad administrativa normal.
- **Advertencia** identifica eventos que requieren mayor atención, por ejemplo rechazos, reversos, cancelaciones o estados equivalentes según el módulo.

La severidad no reemplaza la lógica específica de cada módulo; es una clasificación común para facilitar revisión y filtrado.

## Metadata segura

Algunas fuentes pueden mostrar un bloque **Metadata segura**. La UI solo representa el objeto ya sanitizado por el read model del servidor.

Habitta no debe devolver en este feed:

- tokens o credenciales;
- contraseñas;
- contenido privado de comprobantes;
- cuerpos privados de mensajes;
- razones internas no allowlisted;
- configuración secreta;
- metadata arbitraria de las tablas fuente.

Si una fuente no tiene campos expresamente aprobados para auditoría, su metadata se muestra vacía.

## Seguridad e inmutabilidad

- El workspace no ofrece crear, editar ni borrar eventos.
- El navegador no escribe directamente en las tablas de auditoría o eventos fuente.
- El endpoint es únicamente de lectura.
- El aislamiento por condominio se valida server-side.
- La metadata sensible se elimina antes de llegar al navegador.
- La vista no altera la inmutabilidad de los historiales de Pagos, Gastos, Tesorería, Mantenimiento, Gobernanza o Asambleas.

## Exportación y retención

La vista y filtros administrativos están disponibles actualmente. La exportación formal del feed y controles adicionales de retención pertenecen a un incremento posterior y no deben presentarse todavía como funcionalidades disponibles.
