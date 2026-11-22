import json, re, os, collections
from urllib.parse import urlsplit
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
recs = json.load(open(os.path.join(ROOT, "out/links_raw.json"), encoding="utf-8"))
GH_NONREPO = {"topics","search","orgs","sponsors","features","marketplace","settings","login","collections","trending",
              "explore","apps","about","issues","pulls","notifications","security","readme","blog","login","join","pricing",
              "enterprise","customer-stories","site","logout","codespaces","contact","users","new","organizations","stars"}
SOCIAL_ROOT = {"x.com","twitter.com","facebook.com","instagram.com","linkedin.com","youtube.com","vk.com","tiktok.com","reddit.com","medium.com"}
DROP_HOST = {"localhost","example.com","example.org","127.0.0.1","bit.ly","tinyurl.com","goo.gl","t.co"}
def keep(key):
    p = urlsplit(key); host = p.netloc; segs = [s for s in p.path.split("/") if s]
    if host in DROP_HOST or re.match(r"^\d+\.\d+\.\d+\.\d+$", host): return False
    if host == "github.com":
        return len(segs) >= 2 and segs[0].lower() not in GH_NONREPO
    if host in SOCIAL_ROOT and len(segs) == 0: return False
    if host == "raw.githubusercontent.com" or host == "gist.githubusercontent.com": return False
    if len(key) > 300: return False
    return True
score = collections.defaultdict(set)
best = {}
for r in recs:
    if not keep(r["key"]): continue
    score[r["key"]].add(r["src"])
    cur = best.get(r["key"])
    if cur is None or (len(r["desc"]) > len(cur["desc"])) or (not cur["title"] and r["title"]):
        best[r["key"]] = r
keys = sorted(score, key=lambda k: (-len(score[k]), k))
print("after filter unique:", len(keys))
json.dump({"keys":keys,"score":{k:len(score[k]) for k in keys},"best":{k:best[k] for k in keys}},
          open(os.path.join(ROOT,"out/curated_all.json"),"w",encoding="utf-8"), ensure_ascii=False)
print("ge2 sources:", sum(1 for k in keys if len(score[k])>=2), "ge3:", sum(1 for k in keys if len(score[k])>=3))
