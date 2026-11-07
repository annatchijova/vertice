# VÉRTICE — Technical README

Alcance completo, sin suavizar para una audiencia general. Para la narrativa de
producto ver [`README.md`](README.md); para la propuesta de valor y el caso de negocio,
[`docs/PROPUESTA_DE_VALOR.md`](docs/PROPUESTA_DE_VALOR.md).

## Estado de despliegue por moneda — la distinción exacta

Esto es lo que hay que decir con precisión si el jurado pregunta "¿funciona con varias
monedas?". Hay dos niveles distintos de "real" y no son lo mismo:

| | ARGt | BRAt |
|---|---|---|
| `PaymentBatch` desplegado en Arbitrum One mainnet | ✅ [`0x21Bf…3965`](https://arbiscan.io/address/0x21Bf9822877502Ea7e5C2F973c0E335174763965) | ✅ [`0xb665…47cA`](https://arbiscan.io/address/0xb6653422431C5419Df650d38D3B90C29f3a947cA) |
| `PaymentReceiptRegistry` desplegado | ✅ [`0xc07e…87D9`](https://arbiscan.io/address/0xc07e0a1854676AaA05F769D6f21db89F9B9487D9) | ✅ [`0xE727…45C7`](https://arbiscan.io/address/0xE7271FbcC7f22a21485331D4581f6A8C7f6745C7) |
| Proveedor demo aprobado (`setApprovedRecipient`, tx real) | ✅ | ✅ |
| MCP reconoce la moneda (`CURRENCIES` en `mcp_server.py`) | ✅ | ✅ |
| **Transacción de pago real ejecutada (`payBatch`)** | ✅ [`0x704fb8b5…cabfc`](https://arbiscan.io/tx/0x704fb8b5c104bf4e6f1b8f33140ca6079c53516741e0fe99d45b745c005cabfc) | ❌ — sin fondos en BRAt, no se ejecutó |
| `verify_payment` corrido en vivo contra una transacción real | ✅ VERIFIED, reconfirmado | ❌ — no hay transacción que verificar |

**Ambas filas del medio para arriba están verificables por cualquiera en Arbiscan, sin
pedirle nada a nadie.** Lo único que falta en BRAt es la transacción de pago en sí —
necesita BRAt real en la wallet del agente, y no se consiguió a tiempo. No es una
limitación de arquitectura (el mismo contrato, mismo bytecode, corre igual para
cualquier Twin Stablecoin con su propio despliegue) — es una limitación de fondeo.

Frase para usar tal cual si preguntan: *"Desplegamos el mismo contrato para una segunda
moneda, BRAt, en mainnet — verificable en Arbiscan. No llegamos a ejecutar un pago real
en BRAt porque no conseguimos fondos en esa moneda a tiempo. La transacción real de
punta a punta que sí tenemos es en ARGt."*

## Arquitectura de contratos

- **`src/PaymentBatch.sol`** — paga un lote a destinatarios de una allowlist gestionada
  por el owner, sin custodiar fondos (`transferFrom` desde quien llama). Invariantes:
  token fijo al desplegar; `runId` no puede reusarse (marcado antes de cualquier
  transferencia — a prueba de reentrancy, verificado con un token malicioso en los
  tests); tope por pago y por lote; reversión atómica si cualquier pago del lote falla.
- **`src/PaymentVerifier.sol`** — librería pura, portada de
  [Veridra](https://github.com/annatchijova/veridra)'s `PaymentAdjudicator.sol`.
  Compara un `Claim` contra `Evidence` y devuelve `VERIFIED` / `NOT_VERIFIED` /
  `INSUFFICIENT_EVIDENCE`, con cualquier chequeo en `FAIL` dominando el veredicto y los
  campos no afirmados en `ABSTAIN`. `ORDER_BINDING_CHECK` es siempre obligatorio (nunca
  `ABSTAIN`): el evento propio `PaymentExecuted` del contrato se contrasta siempre
  contra el `Transfer` real del token — aplica directamente la lección del bug ya
  corregido en Veridra de confiar en un hecho reclamado sin re-derivarlo.
- **`src/PaymentReceiptRegistry.sol`** — publica el veredicto como recibo portable e
  idempotente, a nivel de garantía `RPC_ATTESTED` (como en Veridra; no se implementa su
  escalera de pruebas Merkle-Patricia más fuerte, fuera de alcance para P0).

41/41 tests de Foundry pasan, incluyendo fuzzing y el test adversarial de reentrancy
(`forge test` desde la raíz del repo).

## MCP (`mcp_server.py`)

Documentación completa de las herramientas, configuración y límites en
[`docs/MCP.md`](docs/MCP.md). Inventario de herramientas, qué se reutilizó de qué
proyecto previo, y qué se decidió dejar explícitamente afuera en
[`docs/TOOLS.md`](docs/TOOLS.md).

Puntos que no están en esos documentos:

- `get_business_policy`, `create_payment_proposal` y `verify_payment` toman un parámetro
  opcional `currency` (default `"ARGt"`). Agregar una moneda nueva es una entrada más en
  el diccionario `CURRENCIES` — no hay lógica condicional por moneda en el resto del
  archivo.
- `VERTICE_POLICY_JSON` (topes, destinatarios aprobados) hoy es **una sola política
  compartida entre todas las monedas configuradas**. Si un negocio necesita topes
  distintos por país/proveedor, eso es trabajo pendiente, no algo ya resuelto.

## Red-team y hardening del MCP

Auditoría adversarial completa, con hallazgos CONFIRMED BY INDUCTION y las correcciones
aplicadas el mismo día, en [`docs/SECURITY_AUDIT_MCP.md`](docs/SECURITY_AUDIT_MCP.md).
Resumen de lo cerrado: `verify_payment` ata el resultado a `eth_chainId` real, exige
`MIN_CONFIRMATIONS` (12 por defecto — un *bound*, no una prueba, de finalidad), rechaza
un lote con pares `(PaymentExecuted, Transfer)` ambiguos en vez de quedarse con "el
último evento", y exige que la transacción haya sido enviada directamente al
`PaymentBatch` configurado. Límites de tamaño de entrada (`MAX_INVOICES`,
`MAX_FIELD_LENGTH`, `MAX_RPC_RESPONSE_BYTES`, etc.) acotan disponibilidad. El proceso
puede correr aislado con `scripts/run_mcp_sandboxed.sh` (bubblewrap, fail-closed: sin
`bwrap` instalado, no arranca).

**Abierto, sin corregir:** el MCP no implementa aislamiento de sistema operativo por sí
mismo fuera de ese script opcional (MCP-001 en el audit); el contenido de una factura
llega a la capa del agente como datos no estructurados, sin un marcador explícito de
"no confiable" (MCP-006). Ninguno de los dos bloquea la demo — no hay ninguna
herramienta que firme, apruebe ni envíe fondos.

## Detección de errores de tipeo en el destinatario

Dos implementaciones independientes, con alcance distinto — no confundirlas:

- **`mcp_server.py` → `create_payment_proposal`**: si un destinatario no aprobado
  difiere de **exactamente una** dirección de la allowlist en 1-2 caracteres, lo excluye
  como `POSSIBLE_TYPO` con un campo `typoSuggestion` (`suggestedRecipient`,
  `differingPositions`) en vez del genérico `RECIPIENT_NOT_APPROVED`. Nunca autocorrige:
  sigue `EXCLUDED`, la persona decide. Si dos o más direcciones aprobadas están igual de
  cerca, no sugiere nada (ambiguo). Cubierto por
  `test_typo_in_recipient_is_suggested_not_auto_corrected` en `test_mcp_server.py`.
- **`ops/src/domain/preflight.ts` → `typoDiff`**: compara la dirección de la factura
  contra la `registeredAddress` conocida de ese proveedor puntual (dato del fixture de
  facturas), no contra toda la allowlist. Es la pieza que ya se ve en el dashboard OPS.

Ninguna de las dos "corrige" nada por su cuenta — las dos solo señalan el caso para que
una persona lo revise, siguiendo el mismo principio del resto del producto.

## Qué no prometer (límites reales, no retórica)

- El caso de una empresa pagando simultáneamente a Brasil, Colombia, México y Bolivia es
  la dirección del producto, no algo construido. Hoy hay dos monedas con contrato
  desplegado (ARGt, BRAt) y una sola con una transacción de pago real ejecutada (ARGt).
- `VÉRTICE OPS` (`ops/`) está desplegado pero usa **datos mock** (facturas de ejemplo),
  salvo las lecturas on-chain reales que sí hace en vivo (topes, allowlist, saldo,
  pagos ya ejecutados). El botón PAGAR sí firma una transacción real con tu wallet.
- El cierre SÍ está implementado: `/ops/cierre` (`ops/src/features/closing/`) arma
  totales por moneda y camino (auto / firma / excepción), exporta un **CSV real**
  (`downloadCsv`/`toCsv`, botón en la vista) y genera un **link `mailto:`** por
  comprobante (`mailtoFor`) que abre el cliente de mail del comerciante con el
  comprobante ya armado — no envía el mail solo, la persona sigue apretando "enviar",
  mismo principio de autoría humana que el resto del producto. Lo que no existe es un
  cierre contable/fiscal formal (asientos, libro IVA, etc.) — esto es un cierre
  operativo, no reemplaza obligaciones contables.
- El nivel de garantía de `VÉRTICE PROOF` y de `verify_payment` es `RPC_ATTESTED`: una
  sola fuente RPC, consistente internamente, pero no probada criptográficamente de
  forma independiente. Decirlo así, no como "verificación trustless".

## Reproducir el estado de este documento

```shell
forge test                                    # 41/41, contratos
python3 -m unittest test_mcp_server.py -v     # 4/4, MCP
```

Para repetir la verificación en vivo contra la transacción real de ARGt, ver el ejemplo
en [`docs/MCP.md`](docs/MCP.md) y pasarle el hash
`0x704fb8b5c104bf4e6f1b8f33140ca6079c53516741e0fe99d45b745c005cabfc` a `verify_payment`.
