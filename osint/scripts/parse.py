import os, re, json, sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RD = os.path.join(ROOT, "readmes")
TRACK = re.compile(r"^(utm_|ref$|ref_|source$|fbclid|gclid|mc_cid|mc_eid|si$|feature$)", re.I)
SKIP_HOST = {"img.shields.io","shields.io","badge.fury.io","camo.githubusercontent.com","twitter.com/intent","opencollective.com"}
BAD_EXT = re.compile(r"\.(png|jpe?g|gif|svg|webp|ico|css|js)(\?|$)", re.I)
def norm(u):
    u = u.strip().strip("<>").rstrip(".,;)\"'")
    if not re.match(r"^https?://", u, re.I):
        return None
    try:
        p = urlsplit(u)
        host_chk = p.hostname
    except ValueError:
        return None
    host = p.netloc.lower().split("@")[-1].split(":")[0]
    if host.startswith("www."): host = host[4:]
    if not host or "." not in host: return None
    if BAD_EXT.search(p.path): return None
    if any(host == h or host.endswith("."+h) for h in SKIP_HOST): return None
    q = [(k,v) for k,v in parse_qsl(p.query, keep_blank_values=True) if not TRACK.match(k)]
    path = p.path.rstrip("/") or ""
    return ("https", host, path, urlencode(q))
LINK = re.compile(r"\[([^\]]{1,200})\]\((https?://[^\s)]+)(?:\s+\"[^\"]*\")?\)")
HREF = re.compile(r"<a[^>]+href=[\"'](https?://[^\"']+)[\"']", re.I)
BARE = re.compile(r"(?<![\(\"'<])(https?://[^\s<>\)\]\"']+)")
HEAD = re.compile(r"^(#{1,6})\s+(.*)$")
recs = []
for fn in sorted(os.listdir(RD)):
    src = fn[:-3].replace("__", "/")
    heads = []
    text = open(os.path.join(RD, fn), encoding="utf-8", errors="ignore").read()
    in_code = False
    for line in text.splitlines():
        if line.strip().startswith("```"):
            in_code = not in_code; continue
        if in_code: continue
        m = HEAD.match(line)
        if m:
            lvl = len(m.group(1)); title = re.sub(r"<[^>]+>|\[|\]|\(.*?\)|[*_`#]", "", m.group(2)).strip()
            heads = heads[:lvl-1] + [title]
            continue
        found = []
        for lt, u in LINK.findall(line):
            found.append((lt, u))
        for u in HREF.findall(line):
            found.append(("", u))
        for u in BARE.findall(line):
            if not any(u == x[1] for x in found): found.append(("", u))
        # description: text after the link on same line
        for lt, u in found:
            n = norm(u)
            if not n: continue
            desc = ""
            mm = re.search(re.escape(u) + r"\)?\s*[-–—:|]*\s*(.*)$", line)
            if mm: desc = re.sub(r"<[^>]+>|[*_`]", "", mm.group(1)).strip()[:300]
            title = re.sub(r"[*_`<>]", "", lt).strip()[:200]
            recs.append({"src": src, "heads": [h for h in heads if h][:4],
                         "title": title, "desc": desc, "raw": u.strip(),
                         "key": "https://%s%s%s" % (n[1], n[2], ("?"+n[3]) if n[3] else "")})
json.dump(recs, open(os.path.join(ROOT,"out/links_raw.json"),"w",encoding="utf-8"), ensure_ascii=False)
uniq = {}
for r in recs:
    uniq.setdefault(r["key"], r)
print("raw links:", len(recs), "unique:", len(uniq), "sources:", len({r["src"] for r in recs}))
