# VÉRTICE

> La IA investiga. El código decide. El humano firma. La cadena deja la prueba.

VÉRTICE es un operador de pagos a proveedores que automatiza todo el trabajo de revisión y
preparación de un lote de pagos en una stablecoin de moneda local, pero nunca le da a un
modelo de lenguaje la capacidad de mover fondos.

## El problema

Una pyme que paga a varios proveedores en moneda local enfrenta el mismo trabajo manual
cada período: facturas en formatos distintos, direcciones de proveedores que cambian o se
tipean mal, facturas duplicadas fáciles de pasar por alto, pagos sin un comprobante
portable y verificable, y la necesidad de repetir los mismos controles en cada lote. El
negocio necesita que una parte de ese trabajo se automatice sin entregarle a una IA
control irrestricto sobre el dinero.

## Qué es VÉRTICE

VÉRTICE recibe un lote de facturas de proveedores y una política del negocio (direcciones
aprobadas, token y red permitidos, tope por pago, tope por lote, umbral de ejecución
automática). A partir de ahí:

1. Lee y normaliza las facturas.
2. Detecta duplicados, errores de destinatario, montos anómalos y excepciones.
3. Produce un informe previo (preflight) determinístico.
4. Separa cada pago en dos caminos según la política: por debajo del umbral, puede
   ejecutarse de forma automática; por encima del umbral, o ante cualquier excepción, el
   sistema se detiene y exige que una persona revise y firme con su wallet.
5. Deja un registro on-chain del lote y la referencia de cada factura.
6. Verifica la transacción resultante de forma independiente y genera un comprobante
   portable.

## Principio de diseño

**La IA no tiene una herramienta para mover dinero.** El modelo puede investigar,
proponer y explicar un resultado ya sellado, pero no puede elegir un destinatario,
alterar un monto, saltear un umbral ni convertir una verificación incompleta en una
aprobación. El veredicto de cada pago lo produce código determinístico que lee la cadena,
nunca el modelo. El contrato aplica los límites de la política (lista de destinatarios
permitidos, tope por lote) de modo que, aunque el agente se equivoque, el contrato
rechaza la operación.

## Red y token

- Token: **ARGt** (Twin Stablecoin, peso argentino on-chain).
- Red objetivo: **Avalanche**.
- Dirección del contrato del token y del contrato `PaymentBatch`: pendiente de
  confirmación con los mentores de Twin Finance y de publicación aquí una vez
  desplegado.

Este repositorio se actualizará con la dirección exacta del par (chain ID, dirección de
contrato) y con el hash de cada transacción real ejecutada por el producto en cuanto
existan.

## Estado actual

Proyecto en etapa inicial (P0). Todavía no hay contratos desplegados ni backend
publicado en este repositorio. El primer hito es el contrato `PaymentBatch`
(allowlist de destinatarios, tope por lote, protección contra reuso de `runId`) junto
con el verificador determinístico de eventos `Transfer` y `PaymentExecuted`.

## Licencia

Apache License 2.0. Ver [`LICENSE`](./LICENSE).
