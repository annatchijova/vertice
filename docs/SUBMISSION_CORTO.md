# VÉRTICE — Entrega (versión corta)

## Problema

Una empresa que importa o exporta trabaja con proveedores de distintos países y recibe
facturas en distintas monedas, montos y condiciones. Cada período pierde tiempo no
pagando, sino comprobando facturas, detectando duplicados y errores, investigando
discrepancias, mandando comprobantes y reconstruyendo a fin de mes qué pasó con cada
operación.

## Solución

VÉRTICE es un agente de IA que investiga cada factura, detecta duplicados, errores de
tipeo y excepciones, y prepara un lote de pago. El comerciante solo autoriza con su
wallet. El pago se ejecuta en Twin Stablecoins (ARGt en producción, arquitectura lista
para BRAt y el resto) y se verifica de forma independiente en Arbitrum. Cada proveedor
puede comprobar su cobro en **VÉRTICE PROOF** sin confiar en el comerciante.

**La IA investiga. El código decide. El humano firma. La cadena deja la prueba.**

## Diferenciación

No es un sistema de pagos tradicional con un paso blockchain pegado encima: el contrato
aplica los límites (destinatarios aprobados, topes) aunque el agente se equivoque, y el
proveedor verifica el pago leyendo la cadena, no un comprobante que el comerciante le
pasó. El modelo de lenguaje nunca firma ni tiene una herramienta para mover fondos — es
una invariante del diseño, no una promesa.

## Distribución

Primeros usuarios: pymes de la región que ya pagan proveedores internacionales y
necesitan reducir el trabajo manual de conciliación. Canal natural: el propio
ecosistema de Twin Finance (comercios que ya usan Twin Stablecoins o apps como Belo) y
estudios contables que gestionan pagos para varios clientes.

## Modelo de negocio

Hipótesis a validar: suscripción mensual por política y conciliación, fee opcional por
lote de pago ejecutado o verificado, y a futuro scoring de crédito basado en historial
de pagos verificados on-chain.

---

Repo: https://github.com/annatchijova/vertice · Demo: https://vertice-ops.vercel.app ·
Verificador: https://vertice-proof.vercel.app
