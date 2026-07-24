# Habitta

Habitta es una plataforma SaaS multi-condominio diseñada inicialmente para Venezuela. Centraliza administración, cuotas, pagos multimoneda, comprobantes, gastos, transparencia, notificaciones, solicitudes, encuestas, votaciones y propuestas de presupuesto.

## Estado del proyecto

El proyecto se encuentra en fase de arquitectura y preparación del primer release web.

## Estrategia de lanzamiento

1. Aplicación web responsiva para administradores, propietarios e inquilinos.
2. Piloto con un condominio real.
3. Beta comercial multi-condominio.
4. Aplicaciones Android y iPhone consumiendo la misma API.

## Arquitectura aprobada

- Frontend web: React + Vite + TypeScript
- API: Hono sobre Cloudflare Workers
- Base de datos: PostgreSQL en Supabase Free
- Autenticación: Supabase Auth
- Archivos privados: Cloudflare R2
- Procesos asíncronos: Cloudflare Queues
- Correo transaccional: Resend Free
- Sitio comercial: Astro
- App móvil futura: React Native + Expo

La infraestructura comenzará en planes gratuitos y se ampliará cuando Habitta tenga uso real o clientes, sin reconstruir la aplicación.

## Documentación

Consulta la carpeta `docs/` para el alcance funcional, arquitectura y backlog inicial.

## Seguridad

Nunca subas al repositorio claves privadas, contraseñas, tokens, claves `service_role` ni secretos de webhooks. Usa `.env.local` para desarrollo y secretos administrados por Cloudflare en los entornos desplegados.
