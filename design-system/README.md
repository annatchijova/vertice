# VÉRTICE

VÉRTICE paga facturas de proveedores en ARGt. El agente lee las facturas y arma el lote, una persona firma con **PAGAR** y la cadena verifica cada pago con chequeos deterministas. Después el agente envía los comprobantes y cierra el período.

El producto tiene dos experiencias en una sola app Next.js:

- **/ops**: el panel del comercio. Claro y editorial.
- **/proof**: el portal donde el proveedor verifica su pago. Un escritorio negro con una hoja de papel encima.

Las dos comparten los tokens de este sistema. La paleta sale de **twin.finance**, la stablecoin del track: neutros en blanco y negro, títulos en serif, bordes en vez de sombras y un naranja "renacer" que aparece muy poco.

## Principios

1. **La tinta y los veredictos son iguales en todas partes.** Un VERIFIED en /ops y un VERIFIED en /proof usan el mismo verde. Eso hace que se lean como un solo producto.
2. **El naranja es la firma.** El gradiente `brand-2` → `brand` aparece solo en el logo y en el botón PAGAR. Lo único naranja además de eso es el paso activo del timeline y el anillo de foco.
3. **El color fuerte es para el veredicto.** En /proof no hay gradientes ni brillos, y el sello es lo único con color sobre la hoja.
4. **Bordes, no sombras.** Las cards se separan con 1px de `line`. La sombra queda para lo que flota: hover, menús y la hoja.
5. **El estado se reconoce por la forma, no solo por el color.** El badge PENDING tiene un aro vacío, ABSTAIN tiene borde punteado y el sello rota. Así se entiende sin distinguir colores.

## Color

Hay dos temas. `light` es /ops y el tema por defecto. `dark` es el escritorio de /proof.

| Rol | Tokens | Origen |
| --- | --- | --- |
| Fondos | `canvas` · `surface` · `sunken` | Twin `#f2f2f2` / blanco / `#e5e5e5`; en dark, negro / `#121212` / `#222` |
| Bordes | `line` · `line-strong` | Twin `#e5e5e5` / `#ccc` |
| Tinta | `ink-900` · `ink-700` · `ink-500` · `ink-400` | Escala de grises de Twin (`#121212` → `#999`) |
| Invertido | `inverse` · `on-inverse` | La pill negra/blanca del "Open App" de Twin |
| Marca | `brand-2` `#ff6600` → `brand` `#ff3300`, `brand-tint`, `on-brand` | Naranja renacer de Twin |
| Editorial | `gold-1` · `gold-2` | Gradiente dorado de Twin. Para slides y la portada, nunca para estados |
| Veredictos | `verified` · `failed` · `insufficient` · `pending` (+ `-bg`) | Propios de VÉRTICE |
| Hoja | `paper` | Siempre clara |

**Por qué estos veredictos.** NOT VERIFIED usa carmesí (`#b42318`). Tiene la mitad de luminancia que el naranja de marca, así que no se confunde con PAGAR. INSUFFICIENT EVIDENCE usa un ocre emparentado con el dorado de Twin, en vez del ámbar clásico que chocaría con el naranja. En el tema dark los veredictos se aclaran para mantener el contraste.

**Contraste (WCAG).** Todo par de texto pasa 4.5:1 en los dos temas. Los más justos:

- `ink-500` sobre `sunken` claro: 4.56:1.
- `pending` sobre `pending-bg`: 4.99:1.
- `on-brand` (negro) sobre `brand`: 5.73:1. El blanco daría 3.67:1, por eso PAGAR lleva texto negro.

`ink-400` y `line-strong` no son para texto.

## Tipografía

Twin usa LT Superior, una familia comercial con versiones serif, sans y mono. Acá se reemplaza con equivalentes libres de Google Fonts que mantienen el mismo reparto de roles:

| Rol | Familia | Uso |
| --- | --- | --- |
| `serif` | Source Serif 4 (400) | Títulos, montos y nombres de proveedor. Tracking negativo (-0.02 a -0.04em) como en Twin |
| `sans` | Geist | Texto, botones y labels en mayúsculas con +0.08em |
| `mono` | Geist Mono | Hashes, CUIT, bloques, unidades (ARGt) y contadores, siempre con cifras tabulares |

Escala: `display` 64 · `h1` 44 · `h2` 32 · `h3` 24 · `amount` 40 · `body-lg` 18 · `body` 16 · `title` 16/500 · `small` 14 · `label` 12 · `mono` 14 · `mono-sm` 12.

## Espaciado, radios y sombras

- **Espaciado:** `space-N` = N × 4px (4, 8, 12, 16, 24, 32, 48, 64, 96). Coincide con la escala por defecto de Tailwind: `p-6` = `space-6` = 24px.
- **Radios:** `radius-sm` 6 (badges cuadrados, filas de check), `radius-md` 12 (cards, notas), `radius-lg` 20 (modal), `radius-pill` (botones, pills, botón ícono).
- **Sombras:** `shadow-none` por defecto, `shadow-lift` en hover y menús, `shadow-paper` para lo que flota sobre el escritorio.

## Componentes

Son clases CSS con prefijo `vx-`, definidas en `components/bundle.css`. No hay JS: cada pantalla las aplica sobre su propio markup o desde componentes de React.

| Componente | Clase raíz | Dónde |
| --- | --- | --- |
| Button | `vx-btn` (`--pay`, `--primary`, `--ghost`, `--sm`), `vx-icon-btn` | ambas |
| Card | `vx-card`, `vx-note` | /ops |
| Amount | `vx-amount` | ambas |
| StatusBadge | `vx-badge--{pending,verified,not-verified,insufficient}` | ambas |
| FilterPill | `vx-pills` > `vx-pill[aria-pressed]` | /ops |
| VerdictStamp | `vx-stamp--{verified,not-verified,insufficient}` | /proof |
| CheckRow | `vx-checks` > `vx-check--{pass,fail,abstain}` | /proof |
| Timeline | `vx-timeline` > `vx-step--{done,active,todo}` | /ops |
| PaperSheet | `vx-desk` > `vx-paper[data-theme="light"]` | /proof |

Los estados del dominio corresponden 1:1 con las clases: `PENDING` → `pending`, `VERIFIED` → `verified`, `NOT_VERIFIED` → `not-verified`, `INSUFFICIENT_EVIDENCE` → `insufficient`. Los chequeos `PASS`, `FAIL` y `ABSTAIN` usan `pass`, `fail` y `abstain`.

## Voz

- La UI está en castellano rioplatense con voseo ("Revisalos y firmá").
- Los estados van en inglés, igual que los devuelve la API.
- Los montos usan formato argentino (`1.250.000,00`) seguidos de `ARGt` en mono.
- Fechas en `dd/mm`, con hora en 24 h.

## Logo

Todavía no hay logo (es la tarea 5). Mientras tanto se usa la palabra "Vértice" en serif junto a un triángulo con el gradiente de marca. Ese triángulo es el único otro lugar donde aparece el gradiente.

## Uso en el repo

La fuente única es `design-system/tokens.json`. El comando `python design-system/build.py` genera `tokens.css` (variables CSS por tema) y `tailwind.preset.js` (colores, fuentes, radios y sombras apuntando a esas variables). Los componentes están en `design-system/components.css`.

En Next.js:

1. Importar `tokens.css` y `components.css` en `app/globals.css`.
2. Cargar Geist, Geist Mono y Source Serif 4 con `next/font`.
3. Agregar `presets: [require('./design-system/tailwind.preset.js')]` en `tailwind.config`.
4. Poner `data-theme="light"` en el layout de /ops y `data-theme="dark"` en el de /proof.
