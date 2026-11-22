#!/usr/bin/env bash
# Descubre listas awesome por tema. Salida: out/raw_<tema>.jsonl
mkdir -p out
declare -A Q
Q[ia]="awesome llm|awesome machine learning|awesome ai agents|awesome generative ai|awesome deep learning|awesome llm apps|awesome ai tools|awesome rag"
Q[algoritmos]="awesome algorithms|awesome data structures|awesome computer science|awesome competitive programming|awesome algorithm|awesome cs"
Q[estandares]="awesome web standards|awesome rfc|awesome w3c|awesome web platform|awesome http|awesome web security"
Q[datasets]="awesome public datasets|awesome datasets|awesome open data|awesome government data|awesome data sources"
Q[juegos]="awesome gamedev|awesome game development|awesome game engines|awesome indie games|awesome game"
for t in "${!Q[@]}"; do
  : > out/raw_$t.jsonl
  IFS='|' read -ra QS <<< "${Q[$t]}"
  for q in "${QS[@]}"; do
    gh search repos "$q" --sort stars --limit 30 --json fullName,stargazersCount,description,license >> out/raw_$t.jsonl 2>/dev/null
    echo >> out/raw_$t.jsonl
  done
done
