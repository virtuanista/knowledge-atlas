"""Clusteriza cada tema con TF-IDF + k-means determinista y escribe docs/data/<tema>.json."""
import json, os, re, math, collections
from urllib.parse import urlsplit
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOPIC_LABEL = {"ia": "IA y LLM", "algoritmos": "Algoritmos y estructuras de datos",
               "estandares": "Estándares web", "datasets": "Datasets abiertos", "juegos": "Juegos y game dev"}
NOISE_TOK = """img shields badge badges twitter linkedin link links github discord youtube medium telegram slack email
mailto docs readme build status npm pypi travis circleci codecov coverage license contents contributing contribute
table history format sponsor support donate paypal patreon buymeacoffee star stars fork forks issue issues pull
request requests contributors commits release releases version versions svg png jpg url image images logo
listed alt here click see more info page pages home website written other progress awesome blog entity wiki guide tutorial examples example list lists collection resources resource learn learning""".split()
SOCIAL = {"twitter.com","x.com","linkedin.com","discord.gg","discord.com","t.me","youtube.com","youtu.be","medium.com",
          "img.shields.io","shields.io","badge.fury.io","opencollective.com","patreon.com","ko-fi.com","buymeacoffee.com","paypal.me"}
STOP = set(NOISE_TOK) | set("""the and for with from your you are this that can use tool tools free online open source data
com www http https org net io app web site info more best list new all one get how not its via de la el los las
una para con por que del en y o a un es son al se como sus más mas todo todos entre sobre based also
""".split())
TOK = re.compile(r"[a-záéíóúñü0-9]{3,}")
sel = [s for s in json.load(open(os.path.join(ROOT, "out/selected.json"), encoding="utf-8"))
       if urlsplit(s["url"]).netloc.replace("www.", "") not in SOCIAL]
meta = {}
for l in open(os.path.join(ROOT, "out/meta.jsonl"), encoding="utf-8"):
    try: r = json.loads(l); meta[r["url"]] = r
    except Exception: pass
def toks(it):
    host = urlsplit(it["url"]).netloc.replace("www.", "")
    b = it["best"]
    txt = " ".join([" ".join(b.get("heads") or []), b.get("title", ""), b.get("desc", ""), host.replace(".", " ")]).lower()
    return [t for t in TOK.findall(txt) if t not in STOP and not t.isdigit()]
def dot(a, b):
    if len(a) > len(b): a, b = b, a
    return sum(x * b.get(t, 0.0) for t, x in a.items())
def centroid(vs, idx):
    c = collections.defaultdict(float)
    for i in idx:
        for t, x in vs[i].items(): c[t] += x
    n = math.sqrt(sum(x * x for x in c.values())) or 1.0
    return {t: x / n for t, x in c.items()}
def kmeans(vs, idx, k, iters=12):
    if len(idx) <= k: return {i: j for j, i in enumerate(idx)}, [vs[i] for i in idx]
    cen0 = centroid(vs, idx)
    order = sorted(idx, key=lambda i: -dot(vs[i], cen0))
    cents = [vs[order[0]]]
    while len(cents) < k:
        far = max(idx, key=lambda i: min(1 - dot(vs[i], c) for c in cents))
        cents.append(vs[far])
    assign = {}
    for _ in range(iters):
        assign = {i: max(range(k), key=lambda j: dot(vs[i], cents[j])) for i in idx}
        for j in range(k):
            mem = [i for i in idx if assign[i] == j]
            if mem: cents[j] = centroid(vs, mem)
        # clusters vacíos: reinicializar con el documento peor ajustado (evita colapso)
        for j in range(k):
            if any(assign[i] == j for i in idx): continue
            worst = min(idx, key=lambda i: max(dot(vs[i], cents[q]) for q in range(k)))
            cents[j] = vs[worst]
            assign[worst] = j
    return assign, cents
def names_from(cents):
    names = []
    for c in cents:
        top = sorted(c.items(), key=lambda kv: -kv[1])[:2]
        names.append(" · ".join(t.capitalize() for t, _ in top) or "Varios")
    seen = collections.Counter()
    out = []
    for nm in names:
        seen[nm] += 1
        out.append(nm if seen[nm] == 1 else f"{nm} {seen[nm]}")
    return out
os.makedirs(os.path.join(ROOT, "docs/data"), exist_ok=True)
index = []
for t in TOPIC_LABEL:
    items = [s for s in sel if s["topic"] == t]
    docs = [toks(it) for it in items]
    df = collections.Counter(w for d in docs for w in set(d)); N = len(docs)
    vocab = {w for w, c in df.items() if 2 <= c <= 0.3 * N}
    vs = []
    for d in docs:
        tf = collections.Counter(w for w in d if w in vocab)
        v = {w: (1 + math.log(c)) * math.log(N / df[w]) for w, c in tf.items()}
        n = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vs.append({w: x / n for w, x in v.items()})
    # división recursiva: cada grupo >110 se reclusteriza con su propio TF-IDF (fractal)
    def vec_local(idx):
        dfl = collections.Counter(w for i in idx for w in set(docs[i]))
        n_ = len(idx)
        voc_l = {w for w, c in dfl.items() if 2 <= c <= 0.5 * n_}
        out_ = {}
        for i in idx:
            tf = collections.Counter(w for w in docs[i] if w in voc_l)
            v = {w: (1 + math.log(c)) * math.log(n_ / dfl[w]) for w, c in tf.items()}
            nn = math.sqrt(sum(x * x for x in v.values())) or 1.0
            out_[i] = {w: x / nn for w, x in v.items()}
        return out_
    groups = []
    def rec(idx, depth):
        if len(idx) <= 110 or depth >= 3:
            groups.append(idx); return
        lv = vec_local(idx)
        k = max(2, min(6, round(len(idx) / 80)))
        asg, _ = kmeans(lv, idx, k)
        mem = collections.defaultdict(list)
        for i in idx: mem[asg[i]].append(i)
        for j in sorted(mem): rec(mem[j], depth + 1)
    rec(list(range(N)), 0)
    groups = [g for g in groups if g]
    # grupos de menos de 8 nodos se funden con el grupo más parecido (evita clusters de 1 elemento)
    big = [list(g) for g in groups if len(g) >= 8]
    small = [i for g in groups if len(g) < 8 for i in g]
    if big:
        bc = [centroid(vs, g) for g in big]
        for i in small:
            j = max(range(len(big)), key=lambda q: dot(vs[i], bc[q]))
            big[j].append(i)
        groups = big
    kc = len(groups)
    cnames = names_from([centroid(vec_local(g), g) for g in groups])
    clusters = {j: g for j, g in enumerate(groups)}
    subs = []; nodes = [None] * N; cl_list = []
    for j in range(kc):
        mem = clusters.get(j, [])
        if not mem: continue
        ks = max(1, min(8, round(len(mem) / 30)))
        sub_assign, sub_cents = kmeans(vs, mem, ks)
        snames = names_from(sub_cents) if sub_cents else []
        base = len(subs)
        for q, sn in enumerate(snames): subs.append({"c": len(cl_list), "n": sn})
        for i in mem:
            sidx = base + sub_assign.get(i, 0)
            it = items[i]; u = it["url"]; host = urlsplit(u).netloc; m = meta.get(u, {}); mm = m.get("meta", {}) or {}
            def clean(s, n):
                s = re.sub(r"\s+", " ", (s or "")).strip(); s = re.sub(r"^[\-–—:|•*\s]+", "", s)
                return (s[:n - 1].rsplit(" ", 1)[0] + "…") if len(s) > n else s
            title = clean(m.get("title") or mm.get("og:title") or it["best"].get("title") or host, 140)
            desc = clean(mm.get("description") or mm.get("og:description") or it["best"].get("desc"), 260)
            ok = bool(m.get("ok"))
            nodes[i] = {"u": u, "h": host, "t": title, "d": desc, "c": len(cl_list), "s": sidx,
                        "k": it["score"], "l": m.get("lang", "") if ok else "", "x": 1 if (m and not ok) else 0}
        cl_list.append(cnames[j])
    nodes = [n for n in nodes if n]
    keys = [f"c{i}" for i in range(len(cl_list))]
    data = {"topic": t, "title": TOPIC_LABEL[t], "labels": cl_list, "keys": keys, "subs": subs, "nodes": nodes,
            "stats": {"total": len(nodes), "clusters": len(cl_list), "subs": len(subs),
                      "live": sum(1 for n in nodes if n["x"] == 0 and n["l"] or n["x"] == 0)}}
    json.dump(data, open(os.path.join(ROOT, f"docs/data/{t}.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    index.append({"id": t, "title": TOPIC_LABEL[t], "nodes": len(nodes), "clusters": len(cl_list), "subs": len(subs)})
    print(t, index[-1])
json.dump(index, open(os.path.join(ROOT, "docs/data/index.json"), "w", encoding="utf-8"), ensure_ascii=False)
