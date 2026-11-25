"""Construye docs/data/atlas.json desde out/classified2.json (clusters + subclusters refinados)."""
import json, os, re, collections
from urllib.parse import urlsplit
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
c2 = json.load(open(os.path.join(ROOT, "out/classified2.json"), encoding="utf-8"))
meta = {}
for l in open(os.path.join(ROOT, "out/meta.jsonl"), encoding="utf-8"):
    try:
        r = json.loads(l); meta[r["url"]] = r
    except Exception:
        pass
ORDER = c2["order"]; LBL = c2["labels"]
cidx = {c: i for i, c in enumerate(ORDER)}
def clean(s, n):
    s = re.sub(r"\s+", " ", (s or "")).strip()
    s = re.sub(r"^[\-–—:|•*\s]+", "", s)
    if len(s) > n: s = s[:n-1].rsplit(" ", 1)[0] + "…"
    return s
subs = []; subidx = {}
for it in c2["items"]:
    key = (it["cluster2"], it["sub2"])
    if key not in subidx:
        subidx[key] = len(subs); subs.append({"c": cidx[it["cluster2"]], "n": it["sub2"]})
nodes = []; live = dead = 0
for it in c2["items"]:
    u = it["url"]; host = urlsplit(u).netloc; m = meta.get(u, {}); mm = m.get("meta", {}) or {}
    title = clean(m.get("title") or mm.get("og:title") or mm.get("twitter:title") or it["title"] or host, 140)
    desc = clean(mm.get("description") or mm.get("og:description") or mm.get("twitter:description") or it["desc"], 260)
    ok = bool(m.get("ok")); live += ok; dead += (not ok and bool(m))
    nodes.append({"u": u, "h": host, "t": title, "d": desc, "c": cidx[it["cluster2"]],
                  "s": subidx[(it["cluster2"], it["sub2"])], "k": it["score"],
                  "l": m.get("lang", "") if ok else "", "x": 1 if (m and not ok) else 0})
data = {"labels": [LBL[c] for c in ORDER], "keys": ORDER, "subs": subs, "nodes": nodes,
        "stats": {"total": len(nodes), "crawled": len(meta), "live": live, "dead": dead}}
json.dump(data, open(os.path.join(ROOT, "docs/data/atlas.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("nodes", len(nodes), "clusters", len(ORDER), "subs", len(subs), data["stats"])
