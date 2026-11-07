"""Genera tokens.css y tailwind.preset.js a partir de tokens.json (fuente única).

Uso: python design-system/build.py
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
tokens = json.loads((HERE / "tokens.json").read_text(encoding="utf-8"))

themes = [t["id"] for t in tokens["color"]["themes"]]
first = themes[0]


def resolve(value, theme):
    if isinstance(value, str):
        return value if theme == first else None
    return value.get(theme) if theme != first else value.get(first)


def css_value(v):
    m = re.fullmatch(r"\{(.+)\}", v)
    return f"var(--{m.group(1)})" if m else v


themed = tokens["color"]["tokens"] + tokens.get("shadow", {}).get("tokens", [])
blocks = []
for theme in themes:
    sel = f':root, [data-theme="{theme}"]' if theme == first else f'[data-theme="{theme}"]'
    lines = []
    for t in themed:
        v = resolve(t["value"], theme)
        if v is not None:
            lines.append(f"  --{t['name']}: {css_value(v)};")
    if theme != first:
        lines.append("  color-scheme: dark;")
    blocks.append(sel + " {\n" + "\n".join(lines) + "\n}")

static = []
for fam in ("spacing", "radius"):
    for t in tokens[fam]["tokens"]:
        static.append(f"  --{t['name']}: {t['value']};")
for key, stack in tokens["type"]["families"].items():
    static.append(f"  --font-{key}: {stack};")
blocks.append(":root {\n" + "\n".join(static) + "\n}")

for group in tokens["type"]["groups"]:
    for s in group["styles"]:
        fam = s.get("family", group["family"])
        props = [f"font-family: var(--font-{fam})", f"font-size: {s['fontSize']}",
                 f"line-height: {s['lineHeight']}", f"font-weight: {s['fontWeight']}"]
        if "letterSpacing" in s:
            props.append(f"letter-spacing: {s['letterSpacing']}")
        if s["name"] == "label":
            props.append("text-transform: uppercase")
        if s["name"] in ("amount", "mono", "mono-sm"):
            props.append("font-variant-numeric: tabular-nums")
        blocks.append(f".t-{s['name']} {{ " + "; ".join(props) + "; }")

header = f"/* {tokens['name']} — generado desde tokens.json por build.py. No editar a mano. */\n"
(HERE / "tokens.css").write_text(header + "\n\n".join(blocks) + "\n", encoding="utf-8")

# Tailwind preset: los colores apuntan a las variables, así el tema cambia con data-theme.
colors = {t["name"]: f"var(--{t['name']})" for t in tokens["color"]["tokens"]}
preset = {
    "theme": {
        "extend": {
            "colors": colors,
            "fontFamily": {k: [f"var(--font-{k})"] for k in tokens["type"]["families"]},
            # spacing: no se extiende; space-N = N×4px coincide con la escala por defecto de Tailwind (p-4 = 16px).
            "borderRadius": {t["name"].replace("radius-", ""): f"var(--{t['name']})" for t in tokens["radius"]["tokens"]},
            "boxShadow": {t["name"].replace("shadow-", ""): f"var(--{t['name']})" for t in tokens["shadow"]["tokens"]},
            "fontSize": {
                s["name"]: [s["fontSize"], {"lineHeight": str(s["lineHeight"]), "letterSpacing": s.get("letterSpacing", "0"), "fontWeight": str(s["fontWeight"])}]
                for g in tokens["type"]["groups"] for s in g["styles"]
            },
        }
    }
}
(HERE / "tailwind.preset.js").write_text(
    "/* VÉRTICE — generado desde tokens.json por build.py. Uso: presets: [require('./design-system/tailwind.preset.js')] */\n"
    "module.exports = " + json.dumps(preset, indent=2, ensure_ascii=False) + ";\n",
    encoding="utf-8",
)
print("tokens.css y tailwind.preset.js generados")
