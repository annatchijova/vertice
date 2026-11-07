# VÉRTICE — Entrega (versión larga)

## Problema

Una empresa que importa o exporta trabaja con proveedores de distintos países —
Brasil, Colombia, México, Bolivia— y recibe facturas en distintas monedas, con
diferentes importes, fechas, destinatarios y condiciones comerciales. Cada período
necesita revisar esas obligaciones, detectar errores, preparar los pagos, conservar
comprobantes y conciliar los movimientos.

El costo real no es el pago en sí: es todo lo que lo rodea. Los comercios pierden
tiempo comprobando facturas, detectando duplicados, investigando discrepancias,
enviando comprobantes y reconstruyendo a fin de mes qué pasó con cada operación. Ese
trabajo es manual, repetitivo, y cada error (una factura duplicada que se paga dos
veces, un destinatario mal tipeado) sale caro y es difícil de detectar a tiempo.

## Solución

VÉRTICE es un agente de IA que administra el ciclo completo de pago a proveedores,
salvo la autorización del dinero:

1. **Investiga** cada factura: detecta duplicados por ID, destinatarios no aprobados,
   y errores de tipeo en la dirección de pago (comparando contra el registro de
   proveedores aprobados, no solo contra una lista plana).
2. **Prepara** un lote de pago determinístico — qué entra, qué queda excluido, y por
   qué — sin ejecutar nada todavía.
3. **El comerciante autoriza** con su propia wallet. Por debajo de un umbral y con todo
   en regla, un executor acotado paga por política; por encima del umbral, o ante
   cualquier excepción, el pago se detiene y pide firma humana.
4. El pago se ejecuta on-chain en una Twin Stablecoin, vía un contrato `PaymentBatch`
   que nunca custodia fondos: tira de la wallet que firma, no retiene plata propia.
5. **VÉRTICE PROOF** verifica el pago de forma independiente, leyendo dos eventos
   separados de la cadena (el `Transfer` real del token y el `PaymentExecuted` propio
   del contrato) y contrastándolos entre sí — nunca confía en uno solo. Da un veredicto
   de tres estados: `VERIFIED`, `NOT_VERIFIED`, o `INSUFFICIENT_EVIDENCE` cuando la
   evidencia no alcanza.
6. VÉRTICE arma el cierre del período: totales por moneda y camino de ejecución, CSV
   exportable, y un comprobante por pago listo para enviar por mail.

**La IA hace el trabajo. La persona autoriza. La evidencia permanece verificable.**

## Diferenciación

Lo que hace distinto a VÉRTICE no es "blockchain" como feature: es dónde vive cada
decisión.

- **El modelo de lenguaje nunca tiene una herramienta para mover fondos.** No existe
  un `approve` ni un `payBatch` en su caja de herramientas (ver `mcp_server.py`, 100%
  read-only). Esto no es una política de producto que se pueda relajar después: es
  una ausencia de código.
- **El contrato aplica los límites, no solo la app.** Destinatarios aprobados, tope
  por pago, tope por lote — viven en `PaymentBatch.sol` y se ejecutan on-chain. Si el
  agente se equivoca o alguien intenta forzar algo por fuera del flujo normal, el
  contrato revierte la transacción.
- **El proveedor no tiene que confiar en el comerciante.** Con `VÉRTICE PROOF` lee la
  cadena directamente — no un PDF, no una captura de WhatsApp. Es el mismo principio
  que llevó a portar la lógica de verificación de un proyecto forense previo de la
  autora (Veridra) en vez de inventar un verificador ad hoc.
- **Nada se promete sin evidencia.** Cada afirmación de este documento tiene un hash de
  transacción, una dirección de contrato, o un test detrás — no una captura de
  pantalla de un mockup. Ver `TECHNICAL_README.md` para el estado exacto, moneda por
  moneda, de qué es real y qué es visión.

## Distribución

El primer cliente objetivo es la pyme regional que ya paga proveedores en varios
países y para quien la conciliación manual es un costo visible, no abstracto —
estudios contables que gestionan pagos para varios clientes multiplican ese costo y
son un canal natural de adopción temprana.

El canal más directo es el propio ecosistema de Twin Finance: comercios que ya
operan con Twin Stablecoins, y las apps de consumo (como Belo) que ya resuelven la
conversión entre monedas locales para el usuario final — VÉRTICE resuelve la mitad
que falta, del lado del negocio: a quién pagarle, cuánto, cuándo, y la prueba de que
se pagó bien. No hace falta convencer a nadie de "usar cripto": el que ya está en el
ecosistema Twin tiene el riel de pago resuelto; VÉRTICE agrega la capa de decisión y
verificación encima.

## Modelo de negocio

Hipótesis a validar, no tracción probada:

- Suscripción mensual por política, preparación de lotes y conciliación.
- Fee opcional por lote de pago ejecutado o verificado (alineado con el volumen real
  que procesa el comerciante, no con una licencia fija).
- A futuro, scoring de crédito para el proveedor basado en su historial de pagos
  verificados on-chain — un proveedor con pagos `VERIFIED` recurrentes tiene una señal
  de solvencia que hoy no existe en ningún lado, portable entre comercios.

## Por qué blockchain, y por qué Twin Stablecoins puntualmente

La pregunta correcta no es "¿por qué blockchain?" en abstracto, sino qué problema
concreto resuelve acá que un sistema de pagos tradicional no resuelve:

- **Un lote de pagos a varios proveedores se liquida en una sola transacción atómica**,
  con la referencia de cada factura registrada on-chain en el mismo evento del pago.
  No hay forma de que "se pierda" la relación entre el pago y la factura que lo
  originó, porque esa relación está en el log de la transacción, no en una base de
  datos aparte que se puede desincronizar.
- **Las reglas de negocio las aplica el contrato, no la aplicación.** Un bug en el
  frontend, un agente de IA que se equivoca, o alguien que intenta forzar un pago por
  fuera del flujo normal — el contrato rechaza igual, porque el allowlist y los topes
  están en su propio estado, no en una validación del lado del cliente.
- **La verificación es de terceros, no de cortesía.** Cualquiera con el hash de la
  transacción puede reconstruir el hecho desde la cadena, sin API key, sin cuenta, sin
  pedirle permiso al comerciante. Eso es estructuralmente distinto a un comprobante en
  PDF que el comerciante podría, en teoría, fabricar.

Usamos Twin Stablecoins específicamente porque son dinero en moneda local, no un dólar
genérico disfrazado de innovación: un lote puede liquidar obligaciones en ARGt, BRAt,
o cualquier otra moneda de la familia Twin, cada una representando el valor real que
el proveedor espera cobrar en su propia moneda. Esto es lo que hace que "moneda local
programable" sea una propiedad real del producto y no una frase de marketing: el
mismo contrato `PaymentBatch`, mismo bytecode, corre igual para ARGt que para BRAt —
lo probamos desplegando ambos en Arbitrum mainnet, no solo argumentándolo.

## La facilidad con Belo

Una parte del equipo necesitaba fondear la wallet de pruebas con ARGt y, después,
BRAt, para poder ejecutar transacciones reales (no simuladas) durante el desarrollo.
El camino terminó siendo sorprendentemente corto: Belo, que ya opera sobre la
infraestructura de Twin, permite convertir pesos a ARGt y retirarlo directamente a una
dirección externa en Arbitrum, sin pasos intermedios ni fricción de onboarding cripto
tradicional (sin exchange aparte, sin puente manual, sin esperar a un tercero). En
minutos el equipo tuvo ARGt real en una wallet propia y pudo ejecutar la primera
transacción real del producto.

Esto no es un detalle anecdótico: es evidencia de que el "último tramo" del problema
que VÉRTICE ataca —mover valor real en moneda local, de forma simple, entre un
usuario y una wallet de aplicación— ya está resuelto del lado del consumidor por
productos como Belo. VÉRTICE no tiene que resolver ese tramo: lo hereda, y se enfoca
en la parte que falta, que es la decisión de negocio y la verificación, no el riel de
pago en sí.

---

Repo: https://github.com/annatchijova/vertice · Technical README:
https://github.com/annatchijova/vertice/blob/main/TECHNICAL_README.md · Demo:
https://vertice-ops.vercel.app · Verificador: https://vertice-proof.vercel.app
