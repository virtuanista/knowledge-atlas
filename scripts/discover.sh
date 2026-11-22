#!/usr/bin/env bash
# Discover OSINT list repos on GitHub. Output: out/repos.tsv
mkdir -p out
: > out/raw_search.jsonl
for q in "awesome osint" "osint tools" "osint resources" "osint framework" "awesome osint tools" "osint list" "osint toolkit" "osint links" "osint bookmarks" "awesome osint list" "osint sources" "osint github" "awesome osint resources" "osint cheatsheet" "osint directory" "osint collection" "awesome recon" "awesome threat intelligence" "awesome social media osint" "awesome geolocation osint" "awesome darkweb osint" "awesome cyber investigation" "awesome OSINT tools curated"; do
  gh search repos "$q" --sort stars --limit 40 --json fullName,stargazersCount,description,license,url >> out/raw_search.jsonl 2>/dev/null
  echo >> out/raw_search.jsonl
done
