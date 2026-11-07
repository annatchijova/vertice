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

Lo construido hoy ya cubre dos Twin Stablecoins en Arbitrum One: **ARGt** (contrato,
verificador, MCP y una transacción real pagada a un proveedor) y **BRAt** (mismo
contrato `PaymentBatch`, mismo `PaymentVerifier`, mismo MCP — con su propio despliegue y
dirección de token; ver [`README.md`](../README.md) para las direcciones). Esto no es
solo el argumento de que "la arquitectura generaliza": es la misma arquitectura
funcionando dos veces, con dos tokens distintos, sin cambiar una línea del contrato.

Lo que todavía es visión, no construido: el caso completo de una empresa pagando a
proveedores de Brasil, Colombia, México y Bolivia *en simultáneo*, con políticas,
excepciones y conciliación por país — eso requiere más monedas desplegadas (COLt, MEXt,
BOLt siguen el mismo patrón), más fondos de prueba, y la lógica de negocio que hoy vive
en el MCP ampliada para manejar varias políticas a la vez. El camino está probado; la
cobertura completa de los cuatro países, no.

## La frase ancla

**La IA hace el trabajo. La persona autoriza. La evidencia permanece verificable.**
