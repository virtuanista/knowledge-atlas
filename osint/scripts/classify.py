import json, os, re, collections
from urllib.parse import urlsplit
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sel = json.load(open(os.path.join(ROOT,"out/selected.json"),encoding="utf-8"))
# (id, label, regex over heads+title+desc+host+path)
CLUSTERS = [
 ("people",   "Personas y usernames",     r"username|user ?name|people|person|people search|\bpeople\b|alias|profile|find people|nick|username"),
 ("email",    "Email y brechas",          r"e-?mail|breach|leak|password|paste|hibp|haveibeenpwned|credential|data breach|pwned"),
 ("phone",    "Teléfono",                 r"phone|telephone|caller|sms|whatsapp|\bnumber lookup|mobile number"),
 ("domain",   "Dominios, DNS y certificados", r"domain|dns|whois|subdomain|ssl|certificate|\btls\b|ct log|passive dns|\bzone"),
 ("infra",    "IP, escaneo e infraestructura", r"\bip\b|shodan|censys|port scan|scanner|\bscan|infrastructure|recon|netblock|asn|bgp|\bhosting|network|zoomeye|fofa|greynoise|vulnerab|exposed"),
 ("geo",      "Geolocalización e imágenes", r"geoloc|geo ?locat|geospatial|\bgeo\b|satellite|\bmap|imagery|image|photo|exif|reverse image|street view|\bgis\b|webcam|camera|\bcctv|\bearth\b"),
 ("darkweb",  "Dark web y amenazas",      r"dark ?web|\btor\b|onion|i2p|threat|malware|\bioc|\bcti\b|threat intel|ransom|hacker forum|leak site|underground|apt\b|\bmisp"),
 ("social",   "Redes sociales",           r"social|twitter|\bx\b|telegram|instagram|facebook|tiktok|reddit|discord|youtube|linkedin|snapchat|mastodon|bluesky|pinterest|\bvk\b|whatsapp|threads|kick|twitch"),
 ("company",  "Empresas, registros y sanciones", r"compan|business|corporate|registry|registr|sanction|procurement|tender|regulat|financ|\bkyc\b|\baml\b|beneficial|shareholder|lei\b|patent|trademark|court|litigat"),
 ("crypto",   "Cripto y blockchain",      r"crypto|bitcoin|blockchain|ethereum|\beth\b|wallet|token|nft|defi|chainalysis|\bcoin"),
 ("docs",     "Documentos y metadatos",   r"document|metadata|\bpdf|file analysis|\bfile\b|forensic|ocr|archive file"),
 ("news",     "Noticias, medios y RSS",   r"news|media|journal|\brss\b|blog|newspaper|press|podcast|newsletter|magazine"),
 ("archive",  "Archivos web e historia",  r"archive|wayback|cache|historic|history|snapshot|web\.archive|timeline"),
 ("search",   "Buscadores y dorks",       r"search engine|dork|google|bing|yandex|duckduckgo|search|meta-?search|\bseek"),
 ("frame",    "Frameworks y plataformas", r"framework|platform|suite|all-?in-?one|toolkit|toolbox|\bcollection of tools|\bcms\b|\bapi\b|\bsaas\b|workbench"),
 ("learn",    "Formación, libros y CTF",  r"course|training|learn|book|tutorial|lab\b|ctf|guide|\bpdf book|cheat ?sheet|cheatsheet|certification|wiki|handbook|paper|research|article|blog post|writeup|write-?up|podcast|youtube channel|\bmooc|education"),
 ("code",     "Código, repos y paquetes", r"github|gitlab|repository|repo\b|pypi|npm|python|library|package|\bmodule|plugin|extension|addon|chrome|firefox|browser ext|script|tool\b"),
 ("transport","Vehículos, aviación y mar",   r"vehicle|car\b|aircraft|flight|aviation|\bship|maritime|vessel|marine|\bvin\b|plate|transport|\brail|\bdrone|\bweather|\bnautical"),
 ("gov",      "Gobierno, datos abiertos y leyes", r"government|gov\b|legal|law|open data|dataset|public record|public data|\bdata portal|census|statistic|\bgovernment|official|legislat|\bpolice|\bcourt"),
 ("community","Comunidades y foros",     r"forum|community|communities|slack|irc|mailing list|chat|board|subreddit|group"),
]
PAT = [(cid, lbl, re.compile(p, re.I)) for cid,lbl,p in CLUSTERS]
def classify(item):
    b = item["best"]; key = item["url"]
    host = urlsplit(key).netloc
    heads = " ".join(b.get("heads") or [])
    text_main = " ".join([heads, b.get("title",""), b.get("desc","")])
    # heading matches weigh more than description
    for cid,lbl,rx in PAT:
        if rx.search(heads): return cid
    for cid,lbl,rx in PAT:
        if rx.search(b.get("title","")): return cid
    for cid,lbl,rx in PAT:
        if rx.search(text_main + " " + host): return cid
    return "misc"
LBL = {c[0]:c[1] for c in CLUSTERS}; LBL["misc"]="Misceláneo"
out=[]
for it in sel:
    cid = classify(it)
    heads = it["best"].get("heads") or []
    sub = heads[-1] if heads else ""
    out.append({"url":it["url"],"score":it["score"],"cluster":cid,"sub":sub[:80],"title":it["best"].get("title",""),"desc":it["best"].get("desc",""),"sources":None,"heads":heads})
cnt = collections.Counter(o["cluster"] for o in out)
for k,v in cnt.most_common(): print(f"{k:10s} {v:5d}  {LBL[k]}")
json.dump({"labels":LBL,"items":out}, open(os.path.join(ROOT,"out/classified.json"),"w",encoding="utf-8"), ensure_ascii=False)
