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
- Red objetivo: **Arbitrum One** (chain ID `42161`).
- Dirección del contrato ARGt en Arbitrum: `0x59863989d080b22476db95656d0c3cc18be92214`
  (fuente: [stablecoins.twin.finance](https://stablecoins.twin.finance/)).
- Dirección del contrato `PaymentBatch`: pendiente de despliegue; se publicará aquí
  junto con el hash de la primera transacción real ejecutada por el producto.

Arbitrum se eligió por ser la red donde Twin Finance tiene liquidez y resto de
infraestructura activa para ARGt (pool en Curve, vault en Morpho) al momento de este
desarrollo. Avalanche no tiene un despliegue de ARGt publicado por Twin Finance.

## Estructura del repositorio

```
vertice/
├── src/
│   ├── PaymentBatch.sol            # paga un lote a destinatarios aprobados, sin custodiar fondos
│   ├── PaymentVerifier.sol         # compara un claim contra evidencia de Transfer + PaymentExecuted
│   └── PaymentReceiptRegistry.sol  # publica el veredicto como un recibo portable e idempotente
├── test/           # tests unitarios, de invariantes, fuzz y adversariales (Foundry)
├── script/         # scripts de despliegue
└── lib/            # dependencias (forge-std, OpenZeppelin) como git submodules
```

`PaymentVerifier` y `PaymentReceiptRegistry` están portados de
[Veridra](https://github.com/annatchijova/veridra) (proyecto previo de la autora, mismo
patrón VERIFIED / NOT_VERIFIED / INSUFFICIENT_EVIDENCE con veredicto dominado por
cualquier chequeo en FAIL), adaptados de transferencias nativas a eventos ERC-20. El
chequeo `ORDER_BINDING_CHECK` aplica directamente una lección de un bug ya corregido en
Veridra: nunca confiar en un hecho reclamado sin re-derivarlo de forma independiente
desde la evidencia cruda — acá, el evento propio `PaymentExecuted` de `PaymentBatch` se
contrasta siempre contra el evento `Transfer` real del token, nunca se da por válido en
soledad.

## Desarrollo

Requiere [Foundry](https://book.getfoundry.sh/).

```shell
forge build
forge test
```

## Estado actual

Proyecto en etapa inicial (P0). Hechos: `PaymentBatch` (allowlist de destinatarios, tope
por lote, protección contra reuso de `runId`, sin custodia de fondos) y el verificador
determinístico `PaymentVerifier` + `PaymentReceiptRegistry` (nivel de garantía
`RPC_ATTESTED`, como en Veridra). 41/41 tests pasan, incluyendo fuzzing y un test
adversarial de reentrancy. Pendiente: despliegue en Arbitrum, backend/API, servidor MCP
y frontend.

## Licencia

Apache License 2.0. Ver [`LICENSE`](./LICENSE).
