"""Refina clusters y subclusters con TF-IDF + centroides (k-means determinista).
Semilla: clasificación por reglas (classify.py). Salida: out/classified2.json"""
import json, os, re, math, collections
from urllib.parse import urlsplit
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cls = json.load(open(os.path.join(ROOT, "out/classified.json"), encoding="utf-8"))
LBL = dict(cls["labels"]); LBL["community"] = "Comunicación, privacidad y productividad"
ORDER = ["people","email","phone","domain","infra","geo","darkweb","social","company","crypto","docs","news",
         "archive","search","frame","learn","code","transport","gov","community"]
STOP = set("""the and for with from your you are this that can use tool tools free online open source data
com www http https org net io app web site info more best list new all one get how not its via及 de la el los las
una para con por que del en y o a un es son al se como sus más mas todo todos entre sobre based also
""".split())
TOK = re.compile(r"[a-záéíóúñü0-9]{3,}")
def toks(it):
    host = urlsplit(it["url"]).netloc.replace("www.", "")
    txt = " ".join([" ".join(it.get("heads") or []), it.get("title",""), it.get("desc",""), host.replace(".", " ")]).lower()
    return [t for t in TOK.findall(txt) if t not in STOP and not t.isdigit()]
docs = [toks(it) for it in cls["items"]]
df = collections.Counter(t for d in docs for t in set(d))
N = len(docs)
vocab = {t for t, c in df.items() if 2 <= c <= 0.25 * N}
vecs = []
for d in docs:
    tf = collections.Counter(t for t in d if t in vocab)
    v = {t: (1 + math.log(c)) * math.log(N / df[t]) for t, c in tf.items()}
    n = math.sqrt(sum(x * x for x in v.values())) or 1.0
    vecs.append({t: x / n for t, x in v.items()})
def dot(a, b):
    if len(a) > len(b): a, b = b, a
    return sum(x * b.get(t, 0.0) for t, x in a.items())
def centroid(idx):
    c = collections.defaultdict(float)
    for i in idx:
        for t, x in vecs[i].items(): c[t] += x
    n = math.sqrt(sum(x * x for x in c.values())) or 1.0
    return {t: x / n for t, x in c.items()}
# semillas: items con etiqueta de reglas
ci = {c: i for i, c in enumerate(ORDER)}
seed = [ci.get(it["cluster"], -1) for it in cls["items"]]
label = list(seed)
for it_round in range(6):
    cents = {}
    for c in range(len(ORDER)):
        idx = [i for i, s in enumerate(label) if s == c]
        if idx: cents[c] = centroid(idx)
    new = []
    for i, v in enumerate(vecs):
        best, bs = -1, 0.0
        for c, cen in cents.items():
            s = dot(v, cen) + (0.08 if seed[i] == c else 0.0)   # prior de reglas
            if s > bs: best, bs = c, s
        new.append(best if bs >= 0.03 else -1)
    changed = sum(1 for a, b in zip(new, label) if a != b)
    label = new
    print("round", it_round, "changed", changed)
# subclusters: k-means dentro de cada cluster
out_items = []
subsizes = {}
for c in range(len(ORDER)):
    idx = [i for i, s in enumerate(label) if s == c]
    if not idx: continue
    k = max(2, min(12, round(len(idx) / 35)))
    # init determinista: el más central primero, luego el más lejano
    cen0 = centroid(idx)
    order = sorted(idx, key=lambda i: -dot(vecs[i], cen0))
    cents = [vecs[order[0]]]
    while len(cents) < k:
        far = max(idx, key=lambda i: min(1 - dot(vecs[i], cc) for cc in cents))
        cents.append(vecs[far])
    assign = {}
    for _ in range(10):
        assign = {i: max(range(k), key=lambda j: dot(vecs[i], cents[j])) for i in idx}
        for j in range(k):
            members = [i for i in idx if assign[i] == j]
            if members: cents[j] = centroid(members)
    names = []
    for j in range(k):
        top = sorted(cents[j].items(), key=lambda kv: -kv[1])[:2]
        nm = " · ".join(t.capitalize() for t, _ in top) or "varios"
        names.append(nm)
    seen = collections.Counter()
    for j in range(k):
        seen[names[j]] += 1
        if seen[names[j]] > 1: names[j] = f"{names[j]} {seen[names[j]]}"
    for i in idx:
        cls["items"][i]["cluster2"] = ORDER[c]
        cls["items"][i]["sub2"] = names[assign[i]]
    subsizes[ORDER[c]] = k
for i, s in enumerate(label):
    if s == -1:
        cls["items"][i]["cluster2"] = "misc"
        cls["items"][i]["sub2"] = "Sin clasificar"
cnt = collections.Counter(it["cluster2"] for it in cls["items"])
for c, v in cnt.most_common(): print(f"{c:10s} {v:5d}  subs={subsizes.get(c,'-')}")
json.dump({"labels": LBL, "order": ORDER + ["misc"], "items": cls["items"]},
          open(os.path.join(ROOT, "out/classified2.json"), "w", encoding="utf-8"), ensure_ascii=False)
