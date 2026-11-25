import subprocess, os, sys
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "readmes")
repos = [l.split("\t")[0] for l in open(os.path.join(ROOT, "out/repos.tsv"), encoding="utf-8") if l.strip()]
def fetch(full):
    safe = full.replace("/", "__")
    path = os.path.join(OUT, safe + ".md")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return "cached"
    r = subprocess.run(["gh", "api", f"repos/{full}/readme", "-H", "Accept: application/vnd.github.raw"],
                       capture_output=True, timeout=60)
    if r.returncode != 0 or not r.stdout:
        return "fail"
    with open(path, "wb") as f:
        f.write(r.stdout)
    return "ok"
with ThreadPoolExecutor(max_workers=12) as ex:
    res = list(ex.map(fetch, repos))
from collections import Counter
print(Counter(res), "total repos", len(repos))
