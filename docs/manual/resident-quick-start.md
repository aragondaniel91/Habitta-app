# Habitta — Guía rápida del residente

Estado: **Disponible hoy** con el Resident Portal de HAB-156.

Esta guía describe la experiencia de propietarios e inquilinos dentro de la misma aplicación web de Habitta. Los permisos reales siempre los determina el backend y las políticas RLS de Supabase; ocultar o mostrar una acción en la interfaz no reemplaza esas reglas.

## Inicio

Al entrar a `/app/dashboard`, un usuario que solo tenga roles de residente (`owner` y/o `tenant`) verá el dashboard de residente en lugar del dashboard administrativo.

El inicio reúne, según los permisos reales del usuario:

- saldo pendiente separado por moneda;
- próxima obligación pendiente;
- pagos recientes y su estado de revisión para propietarios/autorizados con acceso a pagos;
- anuncios importantes o urgentes dirigidos al usuario;
- solicitudes abiertas visibles para el usuario;
- votaciones actualmente abiertas;
- accesos rápidos únicamente a módulos que el rol puede abrir.

Habitta no mezcla USD, VES, EUR u otras monedas en un único total.

## Propietario

Un propietario puede usar la acción principal **Pagar / Registrar pago** cuando tenga acceso financiero a una unidad activa.

La información financiera mostrada está limitada a las unidades que el usuario puede consultar según sus relaciones activas y las políticas RLS. El dashboard no amplía esos permisos.

Flujo recomendado:

1. Revisa el saldo por moneda.
2. Revisa la próxima cuota pendiente.
3. Abre **Pagar / Registrar pago** para registrar un pago cuando corresponda.
4. Consulta el estado de los pagos recientes.
5. Usa **Estado de cuenta** para revisar el detalle de obligaciones.
6. Revisa anuncios, solicitudes y votaciones pendientes.

## Inquilino

Durante el piloto, un usuario cuyo único rol sea `tenant` es **operacionalmente de solo lectura**. Esta restricción está implementada en la base de datos y no se elimina desde el portal residente.

El inquilino puede consultar la información que corresponda a su ocupación activa, pero el dashboard no presenta rutas o acciones que el backend bloquearía. En particular:

- conserva acceso al estado de cuenta que RLS permita consultar para su ocupación activa;
- **Pagos y comprobantes no se ofrece a un tenant-only** mientras la política de pagos del piloto no le delegue ese acceso;
- el acceso a solicitudes se presenta como consulta;
- las futuras delegaciones granulares del propietario se implementarán en una fase posterior.

Finalizar la última ocupación activa del inquilino debe revocar el acceso delegado correspondiente según las reglas del backend.

## Anuncios

El inicio destaca únicamente anuncios publicados y vigentes con prioridad `important` o `urgent` que el usuario pueda leer. La audiencia y el acceso son resueltos por el backend.

## Solicitudes

El dashboard muestra únicamente solicitudes abiertas que la API devuelve al usuario. Se consideran abiertas las solicitudes que no estén `resolved`, `closed` o `cancelled`.

## Votaciones

El inicio muestra propuestas con estado `open` cuya fecha de cierre aún no haya pasado. Poder abrir una propuesta no implica poder emitir cualquier voto: elegibilidad, unidad y reglas de quórum se verifican en el flujo de gobernanza.

## Seguridad y aislamiento

El Resident Portal reutiliza los endpoints existentes. No introduce un backend separado ni permisos paralelos.

Principios:

- RLS es la autoridad de acceso;
- no se muestran datos simulados;
- las monedas permanecen separadas;
- las acciones administrativas no se exponen a residentes;
- las rutas que el backend negaría a `tenant-only` tampoco se presentan como accesibles en la interfaz;
- los usuarios con un rol administrativo adicional conservan la experiencia administrativa;
- un fallo parcial de un módulo no debe ocultar el resto del inicio residente.

## Planificado

No forma parte de HAB-156:

- delegación granular configurable por propietario para inquilinos;
- conectores de pago electrónico por banco/proveedor;
- aplicación móvil nativa para iOS y Android;
- capturas finales anotadas para el Help Center de lanzamiento.

Cuando esas funciones se publiquen, esta guía debe actualizarse en el mismo PR que cambie el flujo del residente.
