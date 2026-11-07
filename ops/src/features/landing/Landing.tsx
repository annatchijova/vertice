import Link from "next/link";
import { INVOICES } from "@/data/invoices";
import { formatAmount, formatBlock, formatDateTimeLong } from "@/domain/format";
import { AUTO_EXECUTION_THRESHOLD } from "@/domain/policy";
import { DEPLOYMENTS, addressUrl, txUrl } from "@/infrastructure/chain/contracts";
import { Logo } from "@/components/Logo";
import { AnatomyFigure } from "./figures/AnatomyFigure";
import { HeroFigure } from "./figures/HeroFigure";
import { MiniOps } from "./MiniOps";
import "./generated/figures.css";
import "./landing.css";

const STEPS = [
  ["Ingesta", "ia"], ["Investigación", "ia"], ["Preflight", "ia"],
  ["Pagar", "you"],
  ["Verificación", "chain"], ["Postpago", "chain"], ["Cierre", "chain"],
] as const;

function firstPayment() {
  const inv = INVOICES.find((i) => i.id === "andina-1042");
  if (!inv?.executed) throw new Error("landing: andina-1042 must carry the real executed tx");
  return { ...inv, executed: inv.executed };
}
const FIRST = firstPayment();
const TX = FIRST.executed;
const ARGT = DEPLOYMENTS.ARGt;
const AUTO = formatAmount(AUTO_EXECUTION_THRESHOLD).replace(/,00$/, "");

const Ext = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
  <a className={className} href={href} target="_blank" rel="noopener noreferrer">{children}</a>
);

const FAQ: [string, React.ReactNode][] = [
  ["¿La IA puede mover plata?", <p key="a">No. El agente solo tiene herramientas de lectura: facturas, política, token y estado de la red. Firmar, enviar o guardar una clave privada no están en su caja de herramientas.</p>],
  ["¿Cuándo se paga sin que firmes?", <p key="a">Hasta {AUTO} ARGt por factura, si el proveedor está aprobado y todo coincide, paga la wallet operativa por política. Arriba de eso firmás vos. Más de 1.000 por pago o 2.000 por lote, el contrato lo rechaza.</p>],
  ["¿Qué pasa si cambia la dirección de un proveedor?", <p key="a">Solo se paga a direcciones aprobadas en el contrato. Una dirección distinta frena la factura, y lo frenado nunca se paga solo.</p>],
  ["¿Cómo verifica el proveedor que le pagaron?", <p key="a">Pega el hash en <Link href="/proof">PROOF</Link>. El verificador compara lo que dice el comprobante con el Transfer real de ARGt: 10 chequeos y un veredicto. No necesita cuenta ni confiar en el comercio.</p>],
  ["¿Qué contratos usa?", (
    <ul key="a" className="lp-faq__list">
      <li>PaymentBatch <Ext className="lp-mono" href={addressUrl(ARGT.batch)}>{ARGT.batch}</Ext></li>
      <li>PaymentReceiptRegistry <Ext className="lp-mono" href={addressUrl(ARGT.registry)}>{ARGT.registry}</Ext></li>
      <li>ARGt (Twin) <Ext className="lp-mono" href={addressUrl(ARGT.token)}>{ARGT.token}</Ext></li>
      <li>PaymentVerifier <span className="lp-muted">implementado y probado, sin despliegue propio todavía</span></li>
    </ul>
  )],
];

export function Landing() {
  return (
    <div className="lp" id="inicio">
      <header className="lp-band" data-theme="dark">
        <div className="lp-wrap">
          <nav className="lp-nav" aria-label="Principal">
            <Logo className="lp-logo" />
            <ul className="lp-nav__links">
              <li><a href="#como">Cómo funciona</a></li>
              <li><a href="#prueba">Prueba</a></li>
              <li><a href="#preguntas">Preguntas</a></li>
            </ul>
            <div className="lp-nav__cta">
              <Link className="lp-pill lp-pill--line lp-pill--sm" href="/proof">Verificar un pago</Link>
              <Link className="lp-pill lp-pill--solid lp-pill--sm" href="/ops">Abrir OPS</Link>
            </div>
          </nav>
          <div className="lp-hero">
            <div className="lp-hero__text">
              <span className="lp-eyebrow">Vértice · pagos a proveedores en ARGt</span>
              <h1>Pagale a todos tus proveedores en minutos.</h1>
              <p className="lp-hero__lede">La IA investiga. El código decide. Vos firmás. La cadena deja la prueba.</p>
              <div className="lp-hero__ctas">
                <Link className="lp-pill lp-pill--solid" href="/ops">Abrir OPS</Link>
                <Link className="lp-pill lp-pill--line" href="/proof">Verificar un pago</Link>
              </div>
            </div>
            <HeroFigure />
          </div>
          <div className="lp-strip-wrap" role="region" aria-label="Los siete pasos" tabIndex={0}>
            <ol className="lp-strip">
              {STEPS.map(([name, who], i) => (
                <li key={name} className={`lp-strip__s lp-strip__s--${who}`}>
                  <span className="lp-strip__n">{i + 1}</span>
                  <span className="lp-strip__name">{name}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-wrap lp-statement" aria-label="El problema">
          <p>
            Hoy pagar a un proveedor es tipear una dirección, rezar que no esté repetida{" "}
            <span>y mandar una captura como prueba.</span>
          </p>
        </section>

        <div className="lp-wrap" id="como">
          <section className="lp-chapter" id="ops" aria-labelledby="ch1-h">
            <div className="lp-chapter__text">
              <span className="lp-tag">Pasos 1 a 3 · OPS</span>
              <h2 id="ch1-h">La IA prepara el lote.</h2>
              <p>Lee las facturas, busca duplicados y direcciones que no coinciden. Código fijo decide qué se paga y qué se frena, con el motivo a la vista.</p>
              <ol className="lp-chapter__steps">
                <li><b>1</b>Ingesta<span>lee facturas y política</span></li>
                <li><b>2</b>Investigación<span>duplicados, direcciones, montos</span></li>
                <li><b>3</b>Preflight<span>qué entra y por qué</span></li>
              </ol>
              <Link className="lp-chapter__link" href="/ops">Abrir el panel OPS →</Link>
            </div>
            <div className="lp-chapter__visual"><MiniOps /></div>
          </section>

          <section className="lp-chapter lp-chapter--rev" aria-labelledby="ch2-h">
            <div className="lp-chapter__text">
              <span className="lp-tag">Paso 4 · vos</span>
              <h2 id="ch2-h">Vos firmás.</h2>
              <p>Dos firmas con tu wallet: approve y payBatch. La IA no tiene la llave, y el contrato rechaza lo que se sale de las reglas.</p>
              <p className="lp-chapter__rule">auto hasta {AUTO} ARGt · tu firma hasta 1.000 · tope de 2.000 por lote</p>
            </div>
            <div className="lp-chapter__visual"><AnatomyFigure name="prensa" /></div>
          </section>

          <section className="lp-chapter" aria-labelledby="ch3-h">
            <div className="lp-chapter__text">
              <span className="lp-tag">Pasos 5 a 7 · PROOF</span>
              <h2 id="ch3-h">La cadena deja la prueba.</h2>
              <p>El verificador no le cree al comprobante: lo compara con el Transfer real. El proveedor recibe un link y lo comprueba solo.</p>
              <ol className="lp-chapter__steps">
                <li><b>5</b>Verificación<span>10 chequeos, un veredicto</span></li>
                <li><b>6</b>Postpago<span>comprobante con link a PROOF</span></li>
                <li><b>7</b>Cierre<span>libro, pendientes y CSV</span></li>
              </ol>
              <Link className="lp-chapter__link" href="/proof">Verificar un pago en PROOF →</Link>
            </div>
            <div className="lp-chapter__visual"><AnatomyFigure name="comparador" /></div>
          </section>
        </div>

        <section className="lp-band" data-theme="dark" id="prueba" aria-labelledby="prueba-h">
          <div className="lp-wrap lp-proofband">
            <span className="lp-tag">Pago real · Arbitrum One</span>
            <h2 id="prueba-h">El primer pago ya está en la cadena.</h2>
            <ul className="lp-facts">
              <li><b>{formatAmount(FIRST.amount)} {FIRST.currency}</b></li>
              <li>bloque {formatBlock(TX.blockNumber)}</li>
              <li>{formatDateTimeLong(TX.timestamp)}</li>
              <li>VERIFIED</li>
            </ul>
            <div className="lp-proofband__ctas">
              <Link className="lp-pill lp-pill--solid" href={`/proof/${TX.txHash}`}>Verificarlo en PROOF</Link>
              <Ext className="lp-pill lp-pill--line" href={txUrl(TX.txHash)}>Ver en Arbiscan</Ext>
            </div>
          </div>
        </section>

        <section className="lp-wrap lp-faq" id="preguntas" aria-labelledby="faq-h">
          <h2 id="faq-h">Preguntas</h2>
          <div className="lp-faq__items">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}</summary>
                <div className="lp-faq__a">{a}</div>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="lp-wrap lp-foot">
        <Logo className="lp-logo" />
        <small>HackaTwin 2026 · Track Stablecoins · Equipo Mixto E</small>
      </footer>
    </div>
  );
}
