import { parseUnits } from "viem";

/**
 * Política del comercio (off-chain). El umbral de auto-ejecución es una decisión de producto;
 * los topes duros (1.000 por pago / 2.000 por lote) viven en el contrato y se leen on-chain.
 *
 *   monto ≤ 500            → Auto · por política
 *   500 < monto ≤ tope     → Requiere tu firma (PAGAR)
 *   monto > tope on-chain  → Excepción (el contrato lo rechazaría: ExceedsPerPaymentCap)
 *   cualquier excepción    → nunca se paga sola
 */
export const AUTO_EXECUTION_THRESHOLD = parseUnits("500", 18);

/** Alerta de precio si el monto supera el promedio de los últimos 3 meses en más de 15%. */
export const PRICE_ALERT_PCT = 15;
