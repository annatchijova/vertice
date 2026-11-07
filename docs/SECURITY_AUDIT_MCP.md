# Red team del MCP de VÉRTICE

**Fecha:** 2026-11-07  
**Base:** `main` @ `7b7bf5e`  
**Método:** Red-Team Auditing + Abductive Engineering.  
**Alcance:** `mcp_server.py` y la frontera agente → MCP → RPC → verificador.

## Respuesta corta: ¿el agente tiene sandbox?

No por efecto de este repositorio.

`FastMCP` proporciona transporte stdio y registro de herramientas; no crea un sandbox de
sistema operativo. El proceso Python hereda el usuario, directorio, entorno, red y
permisos de archivos del proceso que lo lanza. El MCP no contiene una clave privada ni
herramientas de firma, deploy, `approve` o `payBatch`; eso limita la autoridad financiera,
pero no equivale a aislamiento.

Si existe sandbox real, debe venir del runtime de Claude, SSH, contenedor o VM y debe
verificarse allí. No está definido por `requirements.txt`, `FastMCP` ni la tabla de
herramientas.

## Threat model

### Atacante considerado

- Controla una factura, fixture JSON o texto que el LLM lee.
- Puede influir en la configuración del proceso o en el RPC usado.
- Puede enviar entradas grandes o ambiguas a las herramientas MCP.
- No tiene una clave privada dentro del MCP actual.
- No puede modificar el bytecode desplegado.

### No asumimos

- Que un RPC público autentique por sí mismo la identidad de la red.
- Que un receipt recién minado tenga finality suficiente.
- Que el contenido de una factura sea una instrucción autorizada.
- Que el host SSH proporcione sandbox, filesystem allowlist o egress controlado.

## Leyenda

- **CODE FACT:** observable directamente en el código.
- **PLAUSIBLE HYPOTHESIS:** mecanismo posible aún no inducido.
- **CONFIRMED BY INDUCTION:** predicción ejecutada y observada.
- **FALSIFIED:** la predicción no ocurrió.

## Resumen

| ID | Severidad | Nivel | Categoría | Hallazgo |
|---|---|---|---|---|
| MCP-001 | Alta fuera de un runtime aislado | CODE FACT | Boundary | El repositorio no implementa sandbox de sistema operativo. |
| MCP-002 | Media | CONFIRMED BY INDUCTION | Integridad de red | `verify_payment` no comprueba `eth_chainId`. |
| MCP-003 | Media | CONFIRMED BY INDUCTION | Finality | `verify_payment` acepta un receipt sin confirmaciones observadas. |
| MCP-004 | Media | CONFIRMED BY INDUCTION | Corrección | En batches múltiples solo conserva el último evento de cada tipo. |
| MCP-005 | Baja/Media | CODE FACT | Disponibilidad | No hay límites de tamaño para fixtures, arrays o campos. |
| MCP-006 | Media condicional | CODE FACT | Prompt injection | El contenido de facturas llega a la capa agente como datos no estructurados. |

## MCP-001 — No hay sandbox del proceso

**Observación:** `mcp_server.py` usa `FastMCP`, `urllib`, `Path` y `os`, pero no configura
seccomp, namespaces, chroot, contenedor, usuario dedicado, filesystem allowlist ni egress
policy.

**Deducción:** si el proceso se lanza con acceso a secretos u otros repositorios, una
dependencia comprometida o una futura herramienta con un bug operaría con esos permisos.

**Inducción:** no se ejecutó un escape porque el repositorio no declara un sandbox que pueda
probarse. Esto es CODE FACT sobre el repositorio, no una afirmación sobre el runtime de
Claude.

**Recomendación:** usuario dedicado, entorno mínimo, filesystem read-only salvo un
directorio explícito, sin secretos de firma y egress limitado al RPC.

## MCP-002 — La verificación no ata el resultado a la red consultada

**Observación:** `verify_payment` devuelve `chainId: 42161`, pero solo llama a
`eth_getTransactionReceipt`; no llama a `eth_chainId` ni compara la respuesta con
`CHAIN_ID`.

**Predicción:** un RPC que devuelva un receipt con logs compatibles producirá `VERIFIED`
sin demostrar que el endpoint sea Arbitrum.

**Inducción:** se reemplazó `_rpc` en memoria por un stub que devolvió un receipt compatible
y una respuesta de chain no usada. Resultado: `verdict: VERIFIED`.

**Recomendación:** llamar a `eth_chainId` dentro de `verify_payment` y devolver
`INSUFFICIENT_EVIDENCE` si no es exactamente `42161`.

## MCP-003 — Finality documentada pero no implementada

**Observación:** el MCP no consulta `eth_blockNumber`, no calcula confirmaciones y no tiene
una política mínima. Acepta cualquier receipt con `status == 1`.

**Predicción:** un receipt en el bloque `1`, sin confirmaciones, será `VERIFIED` si sus
logs coinciden.

**Inducción:** se usó el mismo stub con `blockNumber: 0x1` y sin confirmaciones.
Resultado: `verdict: VERIFIED`.

**Recomendación:** calcular `observedConfirmations`, exigir una política explícita y
devolver `INSUFFICIENT_EVIDENCE` antes del umbral.

## MCP-004 — Selección incorrecta en batches múltiples

**Observación:** el bucle sobrescribe `transfer` y `payment` cada vez que encuentra un
evento compatible.

**Predicción:** si el claim corresponde al primer pago de un batch y el segundo tiene otro
destinatario, importe o `invoiceRef`, el MCP devolverá `NOT_VERIFIED` aunque el primer par
sea correcto.

**Inducción:** un receipt sintético con dos pares produjo `NOT_VERIFIED` y devolvió los
datos del segundo par.

**Recomendación:** indexar por `(runId, invoiceRef)` y rechazar cero o múltiples pares
compatibles como `INSUFFICIENT_EVIDENCE`.

## MCP-005 — Entradas sin límites

**Observación:** `list_invoices` lee el JSON completo y `create_payment_proposal` procesa
un array sin límite de elementos ni longitud de strings.

**Nivel:** CODE FACT; no se ejecutó una prueba de agotamiento.

**Recomendación:** limitar tamaño de archivo, número de facturas y longitud de cada campo
antes de parsear o devolver datos al LLM.

## MCP-006 — Prompt injection desde facturas

**Observación:** `list_invoices` devuelve objetos JSON arbitrarios. El servidor los trata
como datos, pero la capa agente podría interpretar campos textuales como instrucciones.

**Nivel:** CODE FACT sobre el flujo de datos; PLAUSIBLE HYPOTHESIS sobre explotación,
porque depende de las herramientas conectadas al agente.

**Recomendación:** marcar campos como `UNTRUSTED_DATA`, separar estructura de narrativa y
hacer que el motor determinístico reciba solo datos normalizados. El texto nunca puede
autorizar una wallet o cambiar una allowlist.

## Vectores descartados

| Vector | Resultado | Evidencia |
|---|---|---|
| El MCP firma por sí mismo | FALSIFIED | No hay signer, wallet, clave ni herramienta de escritura. |
| Receipt ausente convertido en éxito | FALSIFIED | `None` produce `INSUFFICIENT_EVIDENCE`. |
| Receipt revertido convertido en éxito | FALSIFIED | `status != 1` produce `NOT_VERIFIED`. |
| Escape de sandbox | NO EJECUTADO | El repositorio no declara sandbox; depende del runtime externo. |

## Prioridad

1. Comprobar `eth_chainId` dentro de cada verificación.
2. Implementar finality explícita.
3. Indexar eventos por identidad y rechazar ambigüedad.
4. Añadir límites de entrada.
5. Aislar el proceso MCP en el host real.
6. Formalizar el contrato anti-prompt-injection de facturas.

## Estado honesto

- Contratos Foundry: 41 tests exitosos en la ejecución previa.
- MCP: importación y herramientas locales verificadas.
- RPC real: el endpoint público probado devolvió HTTP 403; no se afirma verificación live
  contra Arbitrum desde esa prueba.
- No se enviaron transacciones durante este red-team.
