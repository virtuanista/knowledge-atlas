import json, os, re, collections
from urllib.parse import urlsplit
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cls = json.load(open(os.path.join(ROOT,"out/classified.json"),encoding="utf-8"))
meta = {}
p = os.path.join(ROOT,"out/meta.jsonl")
for l in open(p,encoding="utf-8"):
    try: r = json.loads(l); meta[r["url"]] = r
    except Exception: pass
ORDER = ["people","email","phone","domain","infra","geo","darkweb","social","company","crypto","docs","news",
         "archive","search","frame","learn","code","transport","gov","community","misc"]
LBL = cls["labels"]
cidx = {c:i for i,c in enumerate(ORDER)}
def clean(s, n):
    s = re.sub(r"\s+"," ", (s or "")).strip()
    s = re.sub(r"^[\-–—:|•*\s]+", "", s)
    if len(s) > n: s = s[:n-1].rsplit(" ",1)[0] + "…"
    return s
def norm_sub(s):
    s = re.sub(r"[*_`<>\[\]]", "", s or "").strip(" :-–—")
    return clean(s, 60) or "varios"
# sub grouping: per cluster, keep subs with >=4 items (max 14), rest -> "varios"
bycl = collections.defaultdict(list)
for it in cls["items"]: bycl[it["cluster"]].append(it)
sub_of = {}
for c, items in bycl.items():
    cnt = collections.Counter(norm_sub(i["sub"]) for i in items)
    keep = [s for s,n in cnt.most_common(14) if n >= 4 and s != "varios"]
    for it in items:
        s = norm_sub(it["sub"])
        sub_of[it["url"]] = s if s in keep else "varios"
subs = []; subidx = {}
for c in ORDER:
    names = sorted({sub_of[i["url"]] for i in bycl.get(c,[])}, key=lambda s:(s=="varios", s))
    for n in names:
        subidx[(c,n)] = len(subs); subs.append({"c": cidx[c], "n": n})
nodes = []
live = dead = 0
for it in cls["items"]:
    u = it["url"]; host = urlsplit(u).netloc; m = meta.get(u, {})
    mm = m.get("meta", {}) or {}
    title = clean(m.get("title") or mm.get("og:title") or mm.get("twitter:title") or it["title"] or host, 140)
    desc = clean(mm.get("description") or mm.get("og:description") or mm.get("twitter:description") or it["desc"], 260)
    ok = bool(m.get("ok")); live += ok; dead += (not ok and bool(m))
    nodes.append({"u": u, "h": host, "t": title, "d": desc, "c": cidx[it["cluster"]],
                  "s": subidx[(it["cluster"], sub_of[u])], "k": it["score"], "l": m.get("lang","") if ok else "",
                  "x": 1 if (m and not ok) else 0})
data = {"labels":[LBL[c] for c in ORDER], "keys":ORDER, "subs":subs, "nodes":nodes,
        "stats":{"total":len(nodes),"crawled":len(meta),"live":live,"dead":dead}}
os.makedirs(os.path.join(ROOT,"docs/data"), exist_ok=True)
json.dump(data, open(os.path.join(ROOT,"docs/data/atlas.json"),"w",encoding="utf-8"), ensure_ascii=False, separators=(",",":"))
print("nodes", len(nodes), "clusters", len(ORDER), "subs", len(subs), data["stats"])
print("bytes", os.path.getsize(os.path.join(ROOT,"docs/data/atlas.json")))
