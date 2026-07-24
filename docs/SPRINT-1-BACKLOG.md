# Habitta — Sprint 1

## Objetivo

Completar la base definitiva del producto y el primer ciclo vertical financiero:

> Crear cuota → notificar → reportar pago → adjuntar comprobante → revisar → aprobar o rechazar → aplicar pago → emitir recibo → notificar.

## P0 — Fundación

### HAB-001 Monorepo
- pnpm workspaces
- Turborepo
- TypeScript estricto
- ESLint y Prettier
- Vitest
- Playwright
- GitHub Actions

### HAB-002 Aplicaciones
- `apps/web`: React + Vite
- `apps/api`: Hono + Cloudflare Workers
- `apps/marketing`: Astro reservado o inicial mínimo
- `apps/mobile`: reservado para fase 2

### HAB-003 Supabase
- Configuración local
- Migraciones versionadas
- Seed de desarrollo
- Tipos generados
- Documentación de entornos

### HAB-004 Multi-tenancy
- organizaciones
- condominios
- membresías
- aislamiento por organización y condominio
- pruebas RLS

### HAB-005 Autenticación
- login
- logout
- recuperación
- invitaciones
- perfil
- rutas protegidas

### HAB-006 Roles y permisos
- administrador
- contador
- asistente
- revisor de pagos
- junta
- propietario
- inquilino
- permisos granulares server-side

## P0 — Operación del condominio

### HAB-007 Propiedades
- torres
- unidades
- propietarios
- inquilinos
- múltiples propiedades
- historial de ocupación

### HAB-008 Importación desde Excel
- plantilla
- carga
- previsualización
- validación
- duplicados
- errores por fila
- confirmación

### HAB-009 Métodos y cuentas de pago
- transferencia VES
- pago móvil
- Zelle
- efectivo USD/VES
- transferencia internacional
- instrucciones
- comprobante requerido

### HAB-010 Cuotas
- períodos
- cuotas ordinarias
- cuotas extraordinarias
- generación por unidad
- moneda base
- saldos iniciales

### HAB-011 Reportar pago
- selección de cuotas
- pago parcial
- moneda
- tasa
- referencia
- comprobante privado en R2
- estado pendiente

### HAB-012 Revisión de pago
- bandeja administrativa
- aprobar
- rechazar
- solicitar corrección
- aplicación del pago
- auditoría

### HAB-013 Recibo y notificaciones
- recibo
- notificación in-app
- correo por pago reportado
- correo por aprobación o rechazo
- historial de entregas

## Criterios de salida

1. Dos condominios no pueden acceder a datos entre sí.
2. Un propietario solo ve sus propiedades.
3. Un inquilino solo ve lo autorizado.
4. Un pago pendiente no altera el saldo definitivo.
5. Se soportan pagos parciales.
6. Un pago aprobado genera aplicación, movimiento, recibo y auditoría.
7. Un rechazo conserva el historial.
8. Los comprobantes son privados.
9. Los eventos financieros generan notificaciones in-app y correo.
10. La misma API queda preparada para la futura app móvil.
