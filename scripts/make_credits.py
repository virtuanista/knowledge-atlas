"""Genera CREDITS.md solo con las listas que aportaron fuentes al atlas (out/picked.json)."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOPIC_LABEL = {"ia": "IA y LLM", "algoritmos": "Algoritmos y estructuras de datos", "estandares": "Estándares web",
               "datasets": "Datasets abiertos", "juegos": "Juegos y game dev"}
picked = json.load(open(os.path.join(ROOT, "out/picked.json"), encoding="utf-8"))
info = {}
for t in TOPIC_LABEL:
    for l in open(os.path.join(ROOT, f"out/repos_{t}.tsv"), encoding="utf-8"):
        p = l.rstrip("\n").split("\t")
        if len(p) >= 3: info.setdefault(p[0], (p[2], p[1]))
lines = ["# Créditos y atribución", "",
         "Los enlaces, títulos y descripciones son de sus autores. Este proyecto solo los agrupa, clasifica y visualiza, y enlaza siempre a la fuente original.", ""]
for t, label in TOPIC_LABEL.items():
    lines += [f"## {label}", "", "| Lista (repo) | Licencia | Estrellas |", "|---|---|---|"]
    for r in picked[t]:
        lic, st = info.get(r, ("-", "-"))
        lines.append(f"| [{r}](https://github.com/{r}) | {lic} | {st} |")
    lines.append("")
open(os.path.join(ROOT, "CREDITS.md"), "w", encoding="utf-8").write("\n".join(lines))
print("lists credited:", sum(len(v) for v in picked.values()))
