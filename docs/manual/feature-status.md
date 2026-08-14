# Habitta — Estado de funcionalidades

Corte: **14 de agosto de 2026**.

Este documento evita mezclar funcionalidades existentes con roadmap. “Disponible hoy” significa que el módulo/flujo existe en `main`; no significa que haya alcanzado su última versión comercial.

## Disponible hoy

| Área | Capacidades disponibles |
|---|---|
| Autenticación | Inicio de sesión, recuperación de contraseña, sesiones de Supabase y onboarding administrativo. |
| Condominios | Contexto de organización/condominio y selector para usuarios con acceso a más de uno. |
| Dashboard administrativo | Resumen operativo/financiero para roles administrativos y de junta según permisos. |
| Resident Portal | Dashboard separado para owner/tenant, saldo por moneda, próxima obligación, anuncios, solicitudes y votaciones visibles; owner autorizado puede acceder a pagos. |
| Unidades y edificios | Estructura física, unidades, torres/edificios y relaciones operativas existentes. |
| Personas | Propietarios, inquilinos/contactos y relaciones con unidades. |
| Equipo y accesos | Invitaciones administrativas y roles. Las invitaciones administrativas son correo transaccional real con controles de autorización/rate limit/auditoría. |
| Cuotas / cuentas por cobrar | Conceptos, obligaciones, saldos, aging/resúmenes e importación de saldos iniciales según los flujos actuales. |
| Pagos | Registro, comprobantes, estados de revisión, aprobación/rechazo/corrección y recibos según permisos. |
| Gastos | Ledger/flujo de gastos, categorías/proveedores y soporte documental según las capacidades actuales. |
| Tesorería | Cuentas bancarias/caja, movimientos, transferencias y conciliación según los flujos actuales. |
| Mantenimiento | Activos, planes recurrentes, órdenes de trabajo e historial técnico. |
| Solicitudes | Casos/requerimientos, categorías, prioridades, estados, comentarios/eventos y adjuntos según visibilidad. |
| Anuncios | Borrador/programación/publicación/archivo, audiencia, prioridad, confirmación y adjuntos. |
| Gobernanza | Propuestas, opciones, documentos, elegibilidad, quórum, votos y resultados disponibles en el workspace actual. |
| Comunidad | Vista/composición comunitaria y accesos relacionados disponibles actualmente. |
| Reportes | Reportes financieros/comunitarios expuestos por la aplicación actual, manteniendo monedas separadas. |
| Configuración | Preferencias y configuración visible del condominio/usuario según rol. |
| Notificaciones | Notificaciones in-app/email para eventos implementados, con controles productivos y límites de volumen existentes. |
| Documentos privados | Carga/descarga protegida reutilizada por varios módulos; no es todavía un gestor documental comunitario completo. |
| Seguridad de datos | RBAC/RLS por condominio, controles tenant del piloto, rate limiting de escrituras sensibles y observabilidad de errores financieros implementada. |
| Recuperación | Backup/restore endurecido para Auth y validación de invariantes financieras según la evidencia cerrada en HAB-153. |

## Disponible con límites explícitos

### Tenant del piloto

`tenant-only` está ligado a una ocupación activa y permanece operacionalmente read-only. No recibe acceso implícito de propietario ni acceso a Pagos. Las delegaciones granulares configurables por el propietario son futuras.

### Resident Portal

Owner y tenant usan un inicio simplificado, pero cada tarjeta/fuente sigue dependiendo de las filas permitidas por RLS. Un módulo no disponible para el rol no debe inferirse como habilitado porque aparezca en este manual.

### Preview de desarrollo

El código para adjuntar `preview.mihabitta.com`, corregir su CNAME y validar HTTPS está integrado. Sin embargo, la última evidencia del workflow canónico llega al dominio y obtiene HTTP 403. Hasta identificar si proviene de Cloudflare Access/WAF o de una configuración no intencional, el dominio preview no debe declararse saludable para invitaciones piloto.

### Documentos

Existen adjuntos privados dentro de módulos. Todavía no equivale al gestor documental comunitario completo con carpetas/versionado/retención transversal descrito en el roadmap.

## Planificado / pendiente de completar

| Área | Estado del roadmap |
|---|---|
| Delegación granular de tenant | Permisos configurables por propietario/módulo/acción después del piloto. |
| Payment Connector Hub | Adaptadores configurables por condominio para bancos/Pago Móvil y otros proveedores soportados; manual upload permanece como fallback. |
| Captura financiera asistida por AI | Extracción segura desde comprobantes para sugerir campos, siempre con revisión humana y sin auto-aprobación. |
| Asambleas | Programación, agenda, asistencia, snapshot de quórum, actas y resoluciones. |
| Gestor documental comunitario | Carpetas/categorías/versionado/permisos/retención y enlaces transversales. |
| Audit log visible al administrador | Vista de acciones administrativas con filtros, retención/export y protección de datos sensibles. |
| Integration/outbox foundation ampliada | Outbox, webhooks firmados, reintentos/DLQ y health de integraciones de terceros. |
| Help Center dentro de la app | Navegación de ayuda basada en esta fuente canónica, evitando contenido duplicado. |
| Capturas/recorridos anotados | Se incorporarán cerca del piloto/lanzamiento cuando la UI sea suficientemente estable. |
| Apps móviles nativas | Aplicaciones para iOS y Android sobre la misma API/backend, con experiencia accesible y push notifications. |

## Regla de actualización

Cuando una capacidad pasa de Planificado a Disponible hoy:

1. el código debe estar integrado en `main`;
2. los gates requeridos deben haber pasado;
3. este archivo y la guía correspondiente deben actualizarse en el mismo PR o en el PR de documentación inmediatamente vinculado;
4. una limitación de seguridad/RLS nunca debe ocultarse para hacer que el producto parezca más completo.
