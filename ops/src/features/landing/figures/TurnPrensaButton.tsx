"use client";

/** Demo PAGAR: scrolls to the Prensa figure and turns its key (the real signing lives in /ops). */
export function TurnPrensaButton({ children }: { children: React.ReactNode }) {
  const turn = () => {
    const stage = document.querySelector<HTMLElement>('[data-fig="prensa"] .iso-stage');
    if (!stage) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    stage.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
    stage.focus({ preventScroll: true });
    stage.click();
  };
  return (
    <button type="button" className="vx-btn vx-btn--pay" onClick={turn}>
      {children}
    </button>
  );
}
