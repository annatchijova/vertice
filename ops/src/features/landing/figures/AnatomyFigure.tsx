"use client";

import { useEffect, useRef } from "react";
import { COMPARADOR_HTML, PRENSA_HTML, runFigure } from "../generated/figures";

const HTML = { comparador: COMPARADOR_HTML, prensa: PRENSA_HTML } as const;

/** Isometric anatomy figure: server-rendered SVG fragment, live script attached on mount. */
export function AnatomyFigure({ name }: { name: keyof typeof HTML }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current?.querySelector<HTMLElement>(`[data-fig="${name}"]`);
    if (!host || host.dataset.live) return; // StrictMode runs effects twice on the same DOM
    host.dataset.live = "1";
    runFigure(name, host);
  }, [name]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: HTML[name] }} />;
}
