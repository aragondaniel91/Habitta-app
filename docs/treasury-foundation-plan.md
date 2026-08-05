# Tesorería — base funcional

## Objetivo

Completar el circuito financiero sin mezclar monedas ni alterar la lógica existente de cuotas, pagos o gastos.

## Fase inicial

- cuentas bancarias y cajas por condominio;
- moneda fija por cuenta;
- saldos derivados de movimientos, nunca editados directamente;
- ingresos, egresos, comisiones, ajustes y transferencias internas;
- transferencias con dos movimientos enlazados y trazables;
- conciliación simple contra estados de cuenta;
- cierres mensuales y diferencias pendientes;
- RBAC/RLS, auditoría e idempotencia;
- dashboard y listado responsive;
- exportación CSV por cuenta y período.

## Reglas

1. No sumar monedas diferentes.
2. Una transferencia no es ingreso ni gasto operativo.
3. Un movimiento confirmado no se elimina; se revierte.
4. La conciliación no modifica el libro: solo enlaza y clasifica.
5. Toda mutación sensible ocurre en backend y genera auditoría.
6. Gastos y pagos podrán enlazarse a movimientos sin duplicar registros.

## Entrega propuesta

1. Migración, permisos y RPC transaccionales.
2. API y pruebas.
3. Navegación y workspace administrativo.
4. Revisión visual y release controlado.
