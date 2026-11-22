import json, os, re, socket, ssl, ipaddress
import urllib.request
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlsplit
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = {"ia": 600, "algoritmos": 500, "estandares": 400, "datasets": 500, "juegos": 500}
cand = json.load(open(os.path.join(ROOT, "out/candidates.json"), encoding="utf-8"))
sel = []
for t, n in N.items():
    for c in cand[t][:n]:
        sel.append({"topic": t, "url": c["url"], "score": c["score"], "best": c["best"]})
json.dump(sel, open(os.path.join(ROOT, "out/selected.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("selected", len(sel), {t: sum(1 for s in sel if s["topic"] == t) for t in N})
OUT = os.path.join(ROOT, "out/meta.jsonl")
done = set()
if os.path.exists(OUT):
    for l in open(OUT, encoding="utf-8"):
        try: done.add(json.loads(l)["url"])
        except Exception: pass
todo = sorted({s["url"] for s in sel} - done)
class M(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True); s.m = {}; s.in_title = False; s.title = ""; s.lang = ""
    def handle_starttag(s, tag, a):
        a = dict((k.lower(), (v or "")) for k, v in a)
        if tag == "html" and a.get("lang"): s.lang = a["lang"][:12]
        if tag == "title": s.in_title = True
        if tag == "meta":
            k = (a.get("property") or a.get("name") or "").lower()
            if k in ("description", "og:title", "og:description", "og:site_name", "og:image", "twitter:title", "twitter:description") and k not in s.m and a.get("content"):
                s.m[k] = a["content"][:500]
    def handle_endtag(s, tag):
        if tag == "title": s.in_title = False
    def handle_data(s, d):
        if s.in_title and len(s.title) < 300: s.title += d
def private_host(host):
    if host in ("localhost",) or host.endswith(".local"): return True
    try:
        for fam, _, _, _, sa in socket.getaddrinfo(host, None):
            ip = ipaddress.ip_address(sa[0].split("%")[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved: return True
    except Exception: return False
    return False
ctx = ssl.create_default_context()
def fetch(url):
    rec = {"url": url, "ok": False, "status": 0, "final": "", "title": "", "meta": {}, "lang": ""}
    host = urlsplit(url).hostname or ""
    if private_host(host): rec["status"] = -2; return rec
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; KnowledgeAtlasBot/1.0; +metadata-index)", "Accept": "text/html,*/*;q=0.5"})
        with urllib.request.urlopen(req, timeout=7, context=ctx) as r:
            rec["status"] = r.status; rec["final"] = r.geturl()[:400]
            ctype = r.headers.get("Content-Type", "")
            if "html" not in ctype and "xml" not in ctype and ctype: return rec
            txt = r.read(200_000).decode(re.search(r"charset=([\w-]+)", ctype or "").group(1) if re.search(r"charset=", ctype or "") else "utf-8", errors="replace")
            p = M(); p.feed(txt)
            rec.update(title=p.title.strip()[:200], meta=p.m, lang=p.lang, ok=True)
    except Exception as e:
        rec["status"] = rec["status"] or -1; rec["err"] = type(e).__name__
    return rec
n = 0
with open(OUT, "a", encoding="utf-8") as f, ThreadPoolExecutor(max_workers=48) as ex:
    futs = [ex.submit(fetch, u) for u in todo]
    for fu in as_completed(futs):
        f.write(json.dumps(fu.result(), ensure_ascii=False) + "\n"); f.flush(); n += 1
        if n % 250 == 0: print("progress", n, flush=True)
print("DONE", n, flush=True)
