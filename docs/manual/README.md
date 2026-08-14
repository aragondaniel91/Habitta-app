# Habitta — Manual de usuario

**Versión:** 0.3  
**Estado:** fuente canónica dentro del repositorio  
**Última actualización:** 14 de agosto de 2026

Este directorio es la fuente de verdad del contenido de ayuda para administradores, junta, propietarios e inquilinos. Las pantallas de ayuda dentro de Habitta pueden resumir este contenido, pero no deben mantener una segunda versión contradictoria del manual.

## Cómo usar este manual

- Si estás configurando un condominio por primera vez, comienza con [Guía rápida del administrador](./admin-quick-start.md).
- Si eres propietario o inquilino, comienza con [Guía rápida del residente](./resident-quick-start.md).
- Para asambleas, actas, quórum y resoluciones, consulta [Asambleas](./assemblies.md).
- Para saber qué existe hoy y qué todavía pertenece al roadmap, consulta [Estado de funcionalidades](./feature-status.md).

## Regla de documentación

Todo PR que cambie materialmente un flujo visible para el usuario debe actualizar la sección correspondiente de este manual en el mismo cambio. No se debe describir como disponible una función que todavía no esté integrada en `main`.

## Principios que aplican a todo Habitta

### Acceso por rol

La interfaz adapta módulos y acciones al rol del usuario. La seguridad real se aplica en API/PostgreSQL mediante autorización y RLS; ocultar un botón no concede ni revoca permisos por sí solo.

### Aislamiento por condominio

Los datos de un condominio no deben aparecer en otro. Un usuario con acceso a varios condominios cambia de contexto desde el selector de la aplicación y cada consulta permanece limitada al condominio seleccionado.

### Monedas separadas

Habitta no suma ni convierte automáticamente USD, VES, EUR u otras monedas en un único total. Saldos, cargos, pagos, gastos, tesorería y reportes conservan su moneda original salvo que un flujo financiero explícito registre una conversión/tasa permitida.

### Historial y trazabilidad

Las operaciones financieras y de gobernanza deben conservar historial. Correcciones sensibles usan estados, ajustes o reversos en lugar de borrar evidencia ya finalizada.

### Documentos privados

Comprobantes, facturas y otros archivos privados usan rutas protegidas. No deben exponerse como URLs públicas permanentes ni incluir secretos en el navegador.

## Mapa del manual

| Área | Documentación | Estado |
|---|---|---|
| Primer acceso y onboarding | [Administrador](./admin-quick-start.md) | Disponible hoy |
| Inicio del residente | [Residente](./resident-quick-start.md) | Disponible hoy |
| Asambleas, actas y resoluciones | [Asambleas](./assemblies.md) | Backend disponible; UI HAB-171 en implementación |
| Estado de módulos y roadmap visible | [Estado de funcionalidades](./feature-status.md) | Disponible hoy |
| Capturas anotadas por flujo | Pendiente de incorporación cerca del piloto/lanzamiento | Planificado |
| Help Center navegable dentro de la app | Debe consumir/reutilizar esta fuente de verdad | Planificado |

## Convención de estados

- **Disponible hoy:** existe en `main` y forma parte de la aplicación actual, aunque pueda seguir recibiendo mejoras.
- **Parcial:** existe una base usable, pero una capacidad importante documentada en el roadmap todavía no está completa.
- **Planificado:** no debe presentarse al usuario como funcionalidad disponible.

## Alcance de esta versión

La versión 0.3 documenta la estructura funcional actual de la aplicación web, onboarding administrativo, Resident Portal y la fundación de asambleas/actas/resoluciones. Las capturas reales/anotadas se añadirán cuando la UI del piloto esté suficientemente estable para no mantener imágenes obsoletas en cada iteración.
