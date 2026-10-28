# SII — resultados y límites de pruebas de interrupción

Archivo de pruebas: `scripts/sii/issuance-faults.test.mjs`.

Ejecutar desde la raíz del repositorio con Node 22+:

```sh
node --test scripts/sii/issuance-orchestrator.test.mjs scripts/sii/issuance-faults.test.mjs
```

## Cobertura de simulación

- Dos workers sobre la misma operación con adaptador CAS simulado.
- Timeout posterior a una posible recepción por SII.
- Respuesta de envío no confirmada.
- Interrupción después de persistir `submitting`.
- Interrupción después de persistir `signed`.
- Interrupción después de persistir `submitted`.

**No son pruebas de PostgreSQL**. El adaptador de memoria realiza una comparación de estados sin bloqueo real ni transacciones, por lo que el resultado no certifica exclusión entre conexiones, aislamiento, durabilidad ni recuperación tras reiniciar un servidor. El código no envía al SII.

## Bloqueantes para cerrar este hito

1. Ejecutar los tests Node y conservar evidencia del resultado.
2. Levantar PostgreSQL aislado y aplicar las migraciones revisadas. No usar la base de producción.
3. Dos conexiones reales, mismo `business_id/sale_id`: un único folio y un único documento.
4. Dos ventas concurrentes, mismo CAF: folios distintos, sin saltos inesperados por colisiones.
5. Caída de proceso entre `store`, `signed`, `submitting` y recepción SII; reiniciar workers y comprobar que no se reenvía a ciegas.
6. Comprobar `digest` en pgcrypto, privilegios efectivos, triggers de inmutabilidad y bloqueo de SQL directo.
7. Resolver casos de `signed` con XML ya almacenado pero sin envío, y `submitting` con resultado desconocido mediante un protocolo de conciliación verificable.

No habilitar emisión real ni cambiar Mercado Pago.
