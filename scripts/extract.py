"""Por tema: elige repos-lista, baja READMEs, extrae enlaces, dedupe y ranking por nº de listas que los citan."""
import json, os, re, subprocess, collections, glob
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit, parse_qsl, urlencode
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RD = os.path.join(ROOT, "readmes"); os.makedirs(RD, exist_ok=True)
LISTY = re.compile(r"awesome|list|curated|collection|resources|directory|catalog|dataset|roadmap|cheat|links", re.I)
TOPICS = ["ia", "algoritmos", "estandares", "datasets", "juegos"]
# listas fuera de tema por tema (seguridad/CSS/hacking no son parte de estos grafos)
SEC = r"security|hack|pentest|penetration|ctf|bug.?bounty|exploit|malware|csirt|threat|osint|recon|red.?team|cyber|vulnerab|ssrf|xss|sqli|injection"
OFFTOPIC = {"ia": re.compile(r"css|frontend|hacking|cve", re.I),
            "algoritmos": re.compile(r"css|frontend|" + SEC + r"|design|ui-|react|vue|angular", re.I),
            "estandares": re.compile(r"" + SEC + r"|hacking|pentest|bounty|ctf", re.I),
            "datasets": re.compile(r"" + SEC + r"|hacking", re.I),
            "juegos": re.compile(r"" + SEC + r"|hacking|browser.?security", re.I)}
NOISE_HOST = {"img.shields.io", "shields.io", "badge.fury.io", "camo.githubusercontent.com", "opencollective.com", "github.com/sponsors"}
GH_NON = {"topics","search","orgs","sponsors","features","marketplace","settings","login","collections","trending","explore","apps","about","issues","pulls","notifications","security","readme","blog","join","pricing","enterprise","site","contact","users","new","organizations","stars"}
TRACK = re.compile(r"^(utm_|ref$|ref_|source$|fbclid|gclid|mc_cid|mc_eid|si$|feature$)", re.I)
BAD_EXT = re.compile(r"\.(png|jpe?g|gif|svg|webp|ico|css|js|mp4|zip|tar|gz)(\?|$)", re.I)
def norm(u):
    try: p = urlsplit(u.strip().strip("<>").rstrip(".,;)\"'"))
    except ValueError: return None
    host = (p.hostname or "").lower()
    if host.startswith("www."): host = host[4:]
    if not host or "." not in host or host in NOISE_HOST: return None
    if re.match(r"^\d+\.\d+\.\d+\.\d+$", host): return None
    if BAD_EXT.search(p.path): return None
    segs = [s for s in p.path.split("/") if s]
    if host == "github.com":
        if len(segs) < 2 or segs[0].lower() in GH_NON: return None
    if host in {"x.com","twitter.com","facebook.com","instagram.com","linkedin.com","youtube.com","reddit.com","medium.com"} and not segs: return None
    q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if not TRACK.match(k)]
    key = "https://%s%s%s" % (host, p.path.rstrip("/"), ("?" + urlencode(q)) if q else "")
    return key if len(key) <= 300 else None
LINK = re.compile(r"\[([^\]]{1,200})\]\((https?://[^\s)]+)(?:\s+\"[^\"]*\")?\)")
HREF = re.compile(r"<a[^>]+href=[\"'](https?://[^\"']+)[\"']", re.I)
BARE = re.compile(r"(?<![\(\"'<])(https?://[^\s<>\)\]\"']+)")
HEAD = re.compile(r"^(#{1,6})\s+(.*)$")
def fetch(full):
    path = os.path.join(RD, full.replace("/", "__") + ".md")
    if os.path.exists(path) and os.path.getsize(path) > 0: return "cached"
    r = subprocess.run(["gh", "api", f"repos/{full}/readme", "-H", "Accept: application/vnd.github.raw"], capture_output=True, timeout=60)
    if r.returncode != 0 or not r.stdout: return "fail"
    open(path, "wb").write(r.stdout); return "ok"
recs = []; picked = {}
for t in TOPICS:
    rows = [l.rstrip("\n").split("\t") for l in open(os.path.join(ROOT, f"out/repos_{t}.tsv"), encoding="utf-8") if l.strip()]
    sel = [r[0] for r in rows if (LISTY.search(r[0].split("/")[1]) or LISTY.search(r[3] if len(r) > 3 else ""))
           and not OFFTOPIC[t].search(r[0] + " " + (r[3] if len(r) > 3 else ""))][:45]
    picked[t] = sel
allrepos = sorted({r for v in picked.values() for r in v})
with ThreadPoolExecutor(max_workers=12) as ex: print(collections.Counter(ex.map(fetch, allrepos)), "repos", len(allrepos))
for t in TOPICS:
    for full in picked[t]:
        p = os.path.join(RD, full.replace("/", "__") + ".md")
        if not os.path.exists(p): continue
        heads = []; in_code = False
        for line in open(p, encoding="utf-8", errors="ignore").read().splitlines():
            if line.strip().startswith("```"): in_code = not in_code; continue
            if in_code: continue
            m = HEAD.match(line)
            if m:
                lvl = len(m.group(1)); title = re.sub(r"<[^>]+>|\[|\]|\(.*?\)|[*_`#]", "", m.group(2)).strip()
                heads = heads[:lvl - 1] + [title]; continue
            found = [(lt, u) for lt, u in LINK.findall(line)] + [("", u) for u in HREF.findall(line)]
            found += [("", u) for u in BARE.findall(line) if not any(u == x[1] for x in found)]
            for lt, u in found:
                k = norm(u)
                if not k: continue
                desc = ""
                mm = re.search(re.escape(u) + r"\)?\s*[-–—:|]*\s*(.*)$", line)
                if mm: desc = re.sub(r"<[^>]+>|[*_`]", "", mm.group(1)).strip()[:300]
                recs.append({"topic": t, "src": full, "heads": [h for h in heads if h][:4], "title": re.sub(r"[*_`<>]", "", lt).strip()[:200], "desc": desc, "key": k})
score = collections.defaultdict(set); best = {}
for r in recs:
    score[(r["topic"], r["key"])].add(r["src"])
    cur = best.get((r["topic"], r["key"]))
    if cur is None or len(r["desc"]) > len(cur["desc"]) or (not cur["title"] and r["title"]): best[(r["topic"], r["key"])] = r
out = {}
for t in TOPICS:
    keys = sorted([k for (tt, k) in score if tt == t], key=lambda k: (-len(score[(t, k)]), k))
    out[t] = [{"url": k, "score": len(score[(t, k)]), "best": best[(t, k)]} for k in keys]
    print(t, "unique", len(keys), "lists", len(picked[t]))
json.dump(out, open(os.path.join(ROOT, "out/candidates.json"), "w", encoding="utf-8"), ensure_ascii=False)
json.dump(picked, open(os.path.join(ROOT, "out/picked.json"), "w", encoding="utf-8"), ensure_ascii=False)
