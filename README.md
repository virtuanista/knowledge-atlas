# Knowledge Atlas

Grafos fractales de fuentes técnicas, uno por tema. Mismo motor visual que [OSINT Atlas](https://github.com/virtuanista/osint-atlas): clusters → subclusters → puntos, con previews al acercar.

**Demo:** https://virtuanista.github.io/knowledge-atlas/

## Temas
| Grafo | Fuentes |
|---|---|
| IA y LLM | listas awesome de LLM, ML, agentes y RAG |
| Algoritmos y estructuras de datos | listas awesome de algoritmos, CS e interview prep |
| Estándares web | listas awesome de web standards y plataforma web |
| Datasets abiertos | listas awesome de datasets y datos abiertos |
| Juegos y game dev | listas awesome de game dev, motores y juegos |

## Cómo se construye
1. `scripts/discover.sh`: busca listas awesome por tema con `gh search repos`.
2. `scripts/extract.py`: baja los READMEs, extrae enlaces, dedupe y ranking por nº de listas que los citan. Excluye listas fuera de tema por nombre (seguridad, CSS, etc.).
3. `scripts/select_crawl.py`: toma el top por tema y lee `<title>` y meta description de cada URL.
4. `scripts/build_topics.py`: TF-IDF + k-means determinista. Los grupos de más de 110 nodos se reclusterizan con su propio TF-IDF (división fractal, hasta 3 niveles). Escribe `docs/data/<tema>.json`.

## Limitaciones
- Las fuentes vienen de listas comunitarias: pueden tener enlaces obsoletos o fuera de tema.
- Los nombres de clusters salen de las palabras más frecuentes de cada grupo; no son etiquetas curadas.
- Los enlaces muertos se marcan, no se eliminan.

## Uso
- Selector arriba a la izquierda para cambiar de grafo (`?g=ia`, `?g=algoritmos`, …).
- Rueda / pinch: zoom anclado al cursor. Doble clic: acercar. `+` / `-` / `0`.
- Clic en un punto: fija su tarjeta y el botón "abrir fuente" es un enlace nativo.
- Esc: suelta la selección. `/`: buscar.

## Créditos
Ver [CREDITS.md](CREDITS.md). Código bajo MIT; contenido de terceros bajo las licencias de sus autores.
