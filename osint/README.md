# Grafo OSINT

Tubería del grafo OSINT de [Knowledge Atlas](../README.md): 3.500 fuentes en 21 clusters y 100 subclusters. Las rutas de `out/` y `scripts/` son relativas a esta carpeta.

## Cómo funciona

- **Cosecha:** README de ~430 repos OSINT/awesome descubiertos con `gh search` (`scripts/discover.sh`, `scripts/fetch_readmes.py`).
- **Parseo y dedupe:** `scripts/parse.py` (enlaces Markdown/HTML/bare, normalización de host/path, sin `utm_*`), `scripts/curate.py` (filtro de ruido, ranking por nº de listas que la citan), `scripts/select.py` (top 3.500).
- **Clusters:** `scripts/classify.py` (reglas por heading → título → descripción) y luego `scripts/refine_clusters.py` (TF-IDF + centroides + k-means por cluster). `scripts/build_data2.py` genera el JSON final.
- **Metadatos:** `scripts/crawl.py` hornea `<title>`, meta description y `og:*` de cada URL (2.527 vivas; 973 marcadas como sin respuesta).
- **Datos:** `scripts/build_data2.py` → `docs/data/osint.json`.
- **Render:** `docs/app.js`. Layout determinista (espiral de Vogel + relajación de círculos) en tres niveles: cluster → subcluster → átomo. Cada átomo es un splat gaussiano aditivo; al enfocarlo aparece la tarjeta de preview con blur animado. Canvas 2D, sin dependencias externas.

## Reproducir

```bash
cd osint
python scripts/discover.sh                       # requiere gh autenticado
python scripts/fetch_readmes.py
python scripts/parse.py && python scripts/curate.py && python scripts/select.py
python scripts/crawl.py
python scripts/classify.py && python scripts/refine_clusters.py
python scripts/build_data2.py && python scripts/make_og.py
```

Después, ejecuta `python scripts/build_topics.py` en la raíz para actualizar el índice.

## Créditos

Ver [CREDITS.md](CREDITS.md).
