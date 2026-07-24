# Habitta — Decisiones aprobadas

**Última actualización:** 23 de julio de 2026

## Producto

Habitta será una plataforma SaaS multi-condominio para administradoras, condominios, propietarios e inquilinos. La primera entrega será una aplicación web responsiva para PC, tablet y teléfono. Las aplicaciones Android y iPhone se construirán en una segunda etapa usando la misma API y base de datos.

## Principios

- No construir un prototipo desechable.
- Mantener desde el inicio arquitectura multi-condominio.
- Reducir el error humano mediante validaciones y cálculos automáticos.
- Mantener trazabilidad financiera y auditoría.
- Cada condominio configura sus propias cuentas nacionales e internacionales.
- Habitta no custodiará fondos en la primera etapa.
- Las notificaciones por correo e in-app forman parte del primer release.
- La IA asistirá, pero no aprobará pagos ni modificará saldos por sí sola.

## Infraestructura inicial

- Cloudflare para frontend, API, R2, Queues, seguridad y despliegue.
- Supabase Free para PostgreSQL y autenticación.
- Resend Free para correo transaccional.
- GitHub para código, migraciones, documentación y CI.

La infraestructura comenzará gratuita. Los planes se ampliarán cuando Habitta tenga clientes o uso real, sin cambiar arquitectura ni reescribir la aplicación.

## Stack

- Aplicación web: React + Vite + TypeScript
- API: Hono sobre Cloudflare Workers
- Website comercial: Astro
- Base de datos: PostgreSQL en Supabase
- Autenticación: Supabase Auth
- Documentos privados: Cloudflare R2
- Procesos asíncronos: Cloudflare Queues
- Correo: Resend
- Aplicación móvil futura: React Native + Expo

## Módulos prioritarios

1. Empresas administradoras y condominios
2. Torres, unidades, propietarios e inquilinos
3. Roles y permisos granulares
4. Importación desde Excel
5. Cuotas y cuentas por cobrar
6. Pagos multimoneda y comprobantes
7. Aprobación, rechazo, ajustes y recibos
8. Gastos y cuentas por pagar
9. Bancos, caja y conciliación
10. Reportes y transparencia
11. Notificaciones in-app y correo
12. Solicitudes y anuncios
13. Encuestas, votaciones y propuestas de presupuesto
14. Auditoría

## Branding

- Nombre: Habitta
- Dirección visual: estilo de Vecora
- Paleta y concepto de logo: inspirados en la alternativa CondoGest aprobada
