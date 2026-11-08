# VÉRTICE

![Logo VÉRTICE](ops/src/app/icon.svg)

**[Technical README](TECHNICAL_README.md)** — arquitectura, invariantes, estado exacto
de despliegue por moneda, límites conocidos.
**Entrega:** [versión corta](docs/SUBMISSION_CORTO.md) ·
[versión larga](docs/SUBMISSION_LARGO.md) — problema, solución, diferenciación,
distribución, modelo de negocio.

> La IA investiga. El código decide. El humano firma. La cadena deja la prueba.

VÉRTICE es un operador de pagos a proveedores que automatiza todo el trabajo de revisión y
preparación de un lote de pagos en una stablecoin de moneda local, pero nunca le da a un
modelo de lenguaje la capacidad de mover fondos.

## El problema

Una empresa que importa o exporta trabaja con proveedores de distintos países y recibe
facturas en distintas monedas, con diferentes importes, fechas, destinatarios y
condiciones comerciales. Cada período necesita revisar esas obligaciones, detectar
errores, preparar los pagos, conservar comprobantes y conciliar los movimientos. Los
comercios no pierden tiempo solo pagando: pierden tiempo comprobando facturas,
detectando duplicados, investigando discrepancias, enviando comprobantes y
reconstruyendo a fin de mes qué pasó con cada operación. El negocio necesita que una
parte de ese trabajo se automatice sin entregarle a una IA control irrestricto sobre el
dinero.

La propuesta de valor completa, incluyendo el caso de negocio y la relación entre lo que
está construido hoy (ARGt en Arbitrum) y la visión multi-moneda, está en
[`docs/PROPUESTA_DE_VALOR.md`](docs/PROPUESTA_DE_VALOR.md).

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

## Arquitectura

```mermaid
flowchart TD
    A[Facturas y política] --> B[MCP read-only]
    B --> C[Motor determinístico]
    C --> D{Umbral de política}
    D -->|Excepción o monto alto| E[Humano revisa y firma con wallet]
    D -->|Lote permitido| F[Intento de pago validado]
    E --> G[PaymentBatch]
    F --> G
    G --> H[Transfer de la moneda + PaymentExecuted]
    H --> I[PaymentVerifier]
    I --> J[PaymentReceiptRegistry]
    I --> K[Receipt portable: VERIFIED / NOT_VERIFIED / INSUFFICIENT_EVIDENCE]
    L[LLM] -. solo investiga y explica .-> B
    L -. nunca firma ni envía .-> E
```

El MCP actual es deliberadamente read-only: prepara propuestas y lee la cadena, pero no
tiene clave privada ni herramientas para `approve`, `payBatch`, deploy o firma.

## Red y token

- Red: **Arbitrum One** (chain ID `42161`) para todas las monedas.
- Cada Twin Stablecoin tiene su propio despliegue de `PaymentBatch` (el token queda fijo
  al desplegar el contrato); `PaymentReceiptRegistry` puede compartirse entre monedas,
  ya que cada `Claim` ya indica a qué `PaymentBatch` corresponde.

| Moneda | Token ARGt/BRAt | `PaymentBatch` | `PaymentReceiptRegistry` |
|---|---|---|---|
| **ARGt** (peso argentino) | [`0x5986…e214`](https://arbiscan.io/address/0x59863989d080b22476db95656d0c3cc18be92214) | [`0x21Bf…3965`](https://arbiscan.io/address/0x21Bf9822877502Ea7e5C2F973c0E335174763965) | [`0xc07e…87D9`](https://arbiscan.io/address/0xc07e0a1854676AaA05F769D6f21db89F9B9487D9) |
| **BRAt** (real brasileño) | [`0xc4ed…4df8`](https://arbiscan.io/address/0xc4ed6aba5373d78e160f4df39e011f078be54df8) | [`0xb665…47cA`](https://arbiscan.io/address/0xb6653422431C5419Df650d38D3B90C29f3a947cA) | [`0xE727…45C7`](https://arbiscan.io/address/0xE7271FbcC7f22a21485331D4581f6A8C7f6745C7) |

(Direcciones de token fuente: [stablecoins.twin.finance](https://stablecoins.twin.finance/).)

Arbitrum se eligió por ser la red donde Twin Finance tiene liquidez y resto de
infraestructura activa para estas monedas (pools en Curve, vaults en Morpho) al momento
de este desarrollo. Avalanche no tiene un despliegue de Twin Stablecoins publicado por
Twin Finance.

### Transacciones reales

- ARGt — 500 ARGt a un proveedor aprobado:
  [`0x704fb8b5…cabfc`](https://arbiscan.io/tx/0x704fb8b5c104bf4e6f1b8f33140ca6079c53516741e0fe99d45b745c005cabfc)

  Valores para pegar en [VÉRTICE PROOF](https://vertice-proof.vercel.app) y reproducir el
  veredicto `VERIFIED` con los 9 checks en PASS:

  ```
  Hash de la transacción: 0x704fb8b5c104bf4e6f1b8f33140ca6079c53516741e0fe99d45b745c005cabfc
  Destinatario:           0x981dce900787aed11e8e4489860907d2892f70ed
  Monto en unidades base: 500000000000000000000
  Dirección del token:    0x59863989d080b22476db95656d0c3cc18be92214
  Pagador:                0xa6b2df351332db16c43630e8290fd893e9c71513
  Run ID:                 0xcb7429a0bd1c93f0077be87ec03347c0dc647ed59a372b2f731f4fadf53c5cd6
  Referencia de factura:  0x99c5fad1f0657ed78631a52dbb63d20e4344e99aa4a17545075add66b6ed52b4
  ```
- BRAt: contrato desplegado, transacción de pago pendiente de fondos reales — ver la
  distinción exacta (qué es verificable hoy vs. qué falta) en
  [`TECHNICAL_README.md`](TECHNICAL_README.md#estado-de-despliegue-por-moneda--la-distinción-exacta).

## Estructura del repositorio

```
vertice/
├── src/
│   ├── PaymentBatch.sol            # paga un lote a destinatarios aprobados, sin custodiar fondos
│   ├── PaymentVerifier.sol         # compara un claim contra evidencia de Transfer + PaymentExecuted
│   └── PaymentReceiptRegistry.sol  # publica el veredicto como un recibo portable e idempotente
├── test/           # tests unitarios, de invariantes, fuzz y adversariales (Foundry)
├── script/         # scripts de despliegue
├── web/            # VÉRTICE PROOF: portal de verificación (Vite + TS, sin wallet, sin framework)
├── ops/            # VÉRTICE OPS: panel del comercio (Next.js, datos mock, paga de verdad con tu wallet)
├── mcp_server.py   # MCP read-only: política, preflight, verificación — sin clave privada
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

## Apps en vivo

| App | URL | Datos | Qué muestra |
|---|---|---|---|
| **VÉRTICE PROOF** | https://vertice-proof.vercel.app | Reales | Verificador independiente (Vite), leé en vivo contra Arbitrum. |
| **VÉRTICE OPS** | https://vertice-ops.vercel.app | Mock (facturas de ejemplo) | El panel del comercio: preflight, PAGAR firma de verdad con tu wallet. |
| **PROOF dentro de OPS** | https://vertice-ops.vercel.app/proof/`<hash>` | Reales | Segundo verificador, dentro del Next.js de OPS: mismo veredicto, además consulta `PaymentReceiptRegistry` y desambigua lotes con varios pagos. |

Hay dos implementaciones independientes del mismo verificador (misma lógica, portadas
por separado de `PaymentVerifier.sol`) — si alguna vez dan veredictos distintos para la
misma transacción, eso en sí es una alarma a investigar, no algo a ignorar. OPS linkea a
PROOF como el verificador principal en su header. Si tenés que elegir un solo link para
mostrar algo verificable sin depender de nada mock, es PROOF.

## VÉRTICE PROOF

**En vivo: https://vertice-proof.vercel.app**

`web/` es el portal de verificación: se pega un hash de transacción (y, opcionalmente, lo
que el proveedor afirma haber cobrado) y muestra VERIFIED / NOT_VERIFIED /
INSUFFICIENT_EVIDENCE comparando el evento `PaymentExecuted` del contrato contra el
`Transfer` real de ARGt — nunca uno solo. Es de solo lectura (sin wallet, sin firma) y está
portado del frontend de [Veridra](https://github.com/annatchijova/veridra) (Vite + TypeScript
sin framework), retemado con la paleta de Twin Finance y recableado a Arbitrum en vez de
Monad.

## Desarrollo

Contratos, requiere [Foundry](https://book.getfoundry.sh/):

```shell
forge build
forge test
```

`PROOF`, requiere Node 20+:

```shell
cd web
npm install
npm run dev
```

### Herramientas MCP disponibles

El agente puede investigar, preparar y verificar pagos mediante estas herramientas. Todas
son read-only respecto de la cadena y ninguna puede firmar o enviar fondos.

| Herramienta | Función | Puede mover fondos |
|---|---|---:|
| `get_chain_status` | Consulta chain ID y último bloque de Arbitrum | No |
| `get_business_policy` | Lee límites, token y destinatarios permitidos | No |
| `get_token_config` | Expone las direcciones configuradas de ARGt y contratos | No |
| `list_invoices` | Lee un fixture JSON opcional de facturas | No |
| `create_payment_proposal` | Aplica allowlist, duplicados y límites sin enviar transacciones | No |
| `read_payment_status` | Lee un receipt real desde RPC | No |
| `verify_payment` | Contrasta `Transfer` de ARGt con `PaymentExecuted` | No |

La especificación completa, configuración y límites de autoridad están en
[`docs/MCP.md`](docs/MCP.md). El inventario de herramientas y patrones reutilizados de
VELO, MNEME, RAVEN, ZAYNOR y FORGE está en [`docs/TOOLS.md`](docs/TOOLS.md).


## Authors

VÉRTICE was created by Anna Tchijova and developed
with substantial frontend contributions from
[https://github.com/martinbogado].

See [AUTHORS.md](AUTHORS.md) for detailed credits.


## Licencia

Apache License 2.0. Ver [`LICENSE`](./LICENSE).
