"use client";

import { useEffect, useRef } from "react";
import { runHero } from "../generated/hero";

/** Hairline "lote": the day's invoices in a tray; the one waiting for your signature stands up. */
export function HeroFigure() {
  const stage = useRef<HTMLDivElement>(null);
  const read = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!stage.current || !read.current) return;
    return runHero(stage.current, read.current);
  }, []);

  return (
    <figure className="lp-hero__fig">
      <span className="lp-hero__read lp-mono" ref={read} aria-live="polite" />
      <div className="lp-hero__stage" ref={stage} data-hairline-theme="dark" />
      <figcaption className="lp-hero__cap">
        El lote del día. Se para la factura que espera tu firma; pasá el cursor por las otras.
      </figcaption>
    </figure>
  );
}
