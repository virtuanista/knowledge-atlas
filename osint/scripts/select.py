import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(ROOT,"out/curated_all.json"),encoding="utf-8"))
N = 3500
sel = d["keys"][:N]
json.dump([{"url":k,"score":d["score"][k],"best":d["best"][k]} for k in sel],
          open(os.path.join(ROOT,"out/selected.json"),"w",encoding="utf-8"), ensure_ascii=False)
print("selected", len(sel), "min score", d["score"][sel[-1]])
