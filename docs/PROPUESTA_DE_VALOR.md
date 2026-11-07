# VÉRTICE — Propuesta de valor

## El caso de negocio

Una empresa argentina que importa o exporta trabaja con proveedores de distintos
países — por ejemplo Brasil, Colombia, México y Bolivia. Cada mes recibe facturas en
distintas monedas, con diferentes importes, fechas, destinatarios y condiciones
comerciales. Hoy necesita revisar esas obligaciones, detectar errores, preparar
transferencias, conservar comprobantes y conciliar los movimientos a fin de mes.

Los comercios no pierden tiempo solo pagando. Pierden tiempo comprobando facturas,
detectando duplicados, investigando discrepancias, enviando comprobantes y
reconstruyendo qué pasó con cada operación. VÉRTICE automatiza ese ciclo — salvo la
autorización del dinero, que siempre queda en manos de una persona.

## Qué hace VÉRTICE

Un agente de IA investiga cada obligación: revisa facturas, detecta duplicados, errores
de tipeo, aumentos inusuales y excepciones comerciales. Aplica las políticas del
negocio y prepara un informe completo antes de pagar — nunca mueve dinero por su
cuenta. El comerciante revisa ese informe y autoriza el pago con su propia wallet. El
pago se ejecuta en una Twin Stablecoin y se verifica de forma independiente en la
cadena. Después, VÉRTICE distribuye los comprobantes, concilia las operaciones y
prepara el cierre.

**La IA administra. El comerciante autoriza. El proveedor verifica.**

Cada proveedor dispone de **VÉRTICE PROOF** para comprobar, sin confiar en el
comerciante ni en una captura de pantalla, que recibió exactamente el pago que le
correspondía: mismo monto, mismo destinatario, mismo contrato.

## Por qué Twin Stablecoins y no un pago tradicional

El valor no es solo mover un dólar on-chain por un canal más moderno. Las Twin
Stablecoins hacen que un saldo en moneda local sea programable:

- Un lote de pagos a varios proveedores puede liquidarse en una sola transacción
  atómica, con la referencia de cada factura registrada on-chain.
- Las reglas del comerciante (destinatarios aprobados, tope por lote) las aplica el
  contrato, no solo la app — así el contrato rechaza aunque el agente se equivoque.
- El proveedor verifica su cobro leyendo la cadena directamente, sin depender de la
  palabra del comerciante.
- Belo, que ya trabaja con la infraestructura de Twin, muestra que convertir y mover
  saldo entre monedas locales de la región es un problema ya resuelto del lado del
  usuario final — VÉRTICE resuelve la parte de atrás: la decisión de a quién pagar,
  cuánto y cuándo, y la prueba de que se pagó bien.

## Estado actual vs. visión multi-moneda

Lo construido y desplegado hoy usa **ARGt en Arbitrum One** — contrato, verificador y
una transacción real ejecutados (ver [`README.md`](../README.md)). La arquitectura no
está atada a un solo token: `PaymentBatch` recibe la dirección del token en el
despliegue, y el mismo patrón (allowlist, topes, anti-replay, verificación
`Transfer`+`PaymentExecuted`) aplica igual a cualquier otra Twin Stablecoin (BRAt,
COLt, MEXt, BOLt...) con su propio despliegue. El caso de una empresa pagando a
proveedores en varios países con varias Twin Stablecoins simultáneamente —el caso de
negocio de más arriba— es la dirección del producto, no algo ya construido en este
repositorio.

## La frase ancla

**La IA hace el trabajo. La persona autoriza. La evidencia permanece verificable.**
