# Habitta — Arquitectura v0.2

## 1. Objetivo

Construir una plataforma SaaS multi-condominio estable, económica al inicio y capaz de crecer sin reconstrucción. La primera interfaz será web; la futura app móvil consumirá la misma API y reglas de negocio.

## 2. Arquitectura general

```text
Web React/Vite          Mobile React Native (fase 2)
        \                  /
         Cloudflare Workers API (Hono)
                    |
          Supabase PostgreSQL + Auth
                    |
      R2 documents / Queues / Resend
```

## 3. Monorepo previsto

```text
apps/
  web/
  marketing/
  api/
  mobile/
packages/
  domain/
  database/
  auth/
  permissions/
  accounting/
  payments/
  notifications/
  contracts/
  validation/
  shared-types/
  ui/
supabase/
  migrations/
  seed/
  tests/
docs/
```

## 4. Multi-tenancy

Jerarquía:

```text
Habitta
└── Empresa administradora
    ├── Condominio A
    └── Condominio B
```

Toda entidad operativa deberá estar asociada, según corresponda, a:

- `organization_id`
- `condominium_id`
- `created_by`
- `created_at`
- `updated_at`

El aislamiento se aplicará en dos capas:

1. Autorización en la API.
2. Row Level Security en PostgreSQL/Supabase.

## 5. Dominios

### Identidad y acceso

- Usuarios y perfiles
- Organizaciones
- Condominios
- Membresías
- Roles y permisos
- Invitaciones
- Auditoría

### Propiedades

- Torres o edificios
- Unidades
- Estacionamientos y depósitos
- Propietarios
- Inquilinos
- Ocupación histórica

### Cuentas por cobrar

- Períodos
- Cuotas
- Obligaciones
- Recargos
- Créditos
- Ajustes

### Pagos

- Métodos de pago
- Cuentas receptoras
- Pagos reportados
- Comprobantes
- Revisiones
- Aplicaciones del pago
- Recibos
- Reversos
- Tasas de cambio

### Cuentas por pagar y gastos

- Proveedores
- Categorías
- Facturas
- Aprobaciones
- Pagos a proveedores
- Documentos

### Tesorería

- Bancos
- Caja
- Movimientos
- Transferencias internas
- Compra y venta de divisas
- Comisiones
- Conciliaciones

### Comunicación

- Anuncios
- Solicitudes
- Mensajes de solicitud
- Adjuntos
- Notificaciones in-app
- Entregas de correo

### Gobierno comunitario

- Encuestas
- Opciones
- Elegibilidad
- Votos
- Quórum
- Propuestas de presupuesto
- Cotizaciones
- Documentos
- Seguimiento de ejecución

## 6. Reglas financieras no negociables

1. Una obligación y un pago son entidades distintas.
2. Un pago puede aplicarse a una o varias obligaciones.
3. Una obligación puede recibir pagos parciales.
4. Un pago pendiente no modifica el saldo definitivo.
5. Los pagos aprobados no se eliminan; se revierten mediante movimientos trazables.
6. La tasa de cambio queda congelada en la transacción.
7. Compra o venta de divisas es una transferencia entre cuentas, no ingreso o gasto operativo.
8. Toda operación sensible genera auditoría.
9. Los webhooks y consumidores de colas deben ser idempotentes.
10. La lógica financiera crítica vive en el backend, no en componentes de interfaz.

## 7. Archivos y comprobantes

- Se almacenarán en buckets privados de Cloudflare R2.
- La API emitirá URLs firmadas de corta duración.
- Los metadatos y relación con movimientos vivirán en PostgreSQL.
- No se expondrán rutas públicas permanentes.

## 8. Notificaciones

Patrón orientado a eventos:

```text
payment.reported
→ notificación in-app al administrador
→ correo al administrador
→ auditoría
```

```text
payment.approved
→ recibo
→ notificación in-app al residente
→ correo al residente
→ auditoría
```

Eventos iniciales:

- cuota publicada
- vencimiento próximo
- pago enviado
- pago aprobado o rechazado
- corrección solicitada
- recibo disponible
- anuncio
- solicitud o respuesta
- reporte financiero publicado
- propuesta o votación publicada

## 9. Entornos

- Local
- Staging
- Producción

No se usarán datos reales en local o staging. Los secretos se almacenarán fuera de GitHub.

## 10. Escalamiento

Inicio:

- Supabase Free
- Cloudflare según cuotas gratuitas y plan existente
- Resend Free

Crecimiento:

- Subir Supabase a Pro
- Aumentar capacidad de Cloudflare, R2, Queues y correo
- Mantener tablas, API, contratos y frontend sin migración de arquitectura
