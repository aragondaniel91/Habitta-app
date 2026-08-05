# Normalización de encabezados de módulos

La aplicación usa un encabezado contextual global para breadcrumb, ayuda e importación y mantiene el encabezado operativo propio de cada módulo.

## Regla

- El título y la descripción del shell permanecen disponibles para lectores de pantalla.
- Visualmente, cada módulo muestra una sola vez su título operativo.
- Ayuda e Importar datos permanecen en la barra contextual superior.
- Las acciones propias del módulo permanecen junto a su encabezado interno.

Esto evita duplicaciones como «Cuotas y cuentas por cobrar» y «Pagos y comprobantes» sin modificar la lógica de cada módulo.
