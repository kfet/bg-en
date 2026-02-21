#!/usr/bin/env python3
"""
Build script: WikiDict SQLite → sorted JSON for the PWA.

Usage:
    python3 scripts/build_data.py

Downloads:
    bg-en.sqlite3 (~4.6 MB) from WikiDict 2025-11 release
    en-bg.sqlite3 (~13.7 MB) from WikiDict 2025-11 release

Outputs:
    public/data/bg-en.json   (~4 MB uncompressed, ~530 KB gzipped)
    public/data/en-bg.json   (~11 MB uncompressed, ~2.9 MB gzipped)

JSON format:
    {
      "version": "2025-11",
      "entries": [
        ["written_rep", "trans_list", "sense_list", "pos"],
        ...
      ]
    }

    - entries sorted by written_rep (locale-aware, case-insensitive)
    - trans_list: translations joined by " | "
    - sense_list: senses/glosses joined by " | ", may be empty string
    - pos: "n" | "prop.n" | "v" | "adj" | "adv" | "prep" | "part" | "num" | ""
"""

import sqlite3
import json
import urllib.request
import os
import sys

VERSION = "2025-11"
BASE_URL = f"https://download.wikdict.com/dictionaries/sqlite/2_{VERSION}"
CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")

DATASETS = ["bg-en", "en-bg"]

POS_MAP = {
    "Съществително_нарицателно_име": "n",
    "Съществително_собствено_име":   "prop.n",
    "Глагол":                        "v",
    "Прилагателно_име":              "adj",
    "Наречие":                       "adv",
    "Предлог":                       "prep",
    "Частица":                       "part",
    "Числително_име":                "num",
}


def extract_pos(lexentry: str) -> str:
    if not lexentry:
        return ""
    parts = lexentry.split("__")
    if len(parts) >= 2:
        return POS_MAP.get(parts[1], "")
    return ""


def download(name: str) -> str:
    os.makedirs(CACHE_DIR, exist_ok=True)
    dest = os.path.join(CACHE_DIR, f"{name}.sqlite3")
    if os.path.exists(dest):
        print(f"  [cache] {name}.sqlite3 already downloaded")
        return dest
    url = f"{BASE_URL}/{name}.sqlite3"
    print(f"  [download] {url} ...", flush=True)
    tmp = dest + ".tmp"
    def progress(count, block, total):
        pct = min(100, int(count * block * 100 / total))
        print(f"\r    {pct}%", end="", flush=True)
    urllib.request.urlretrieve(url, tmp, reporthook=progress)
    print()
    os.rename(tmp, dest)
    print(f"  [ok] saved to {dest}")
    return dest


def export_dataset(name: str) -> None:
    db_path = download(name)
    print(f"  [export] reading {name}.sqlite3 ...")

    con = sqlite3.connect(db_path)

    # Use translation_grouped view, group further to collapse duplicate
    # (written_rep, trans_list) pairs that differ only in lexentry/POS.
    # Take the lexentry with the highest score to determine POS.
    rows = con.execute("""
        SELECT
            written_rep,
            trans_list,
            group_concat(sense_list, ' | ') AS all_senses,
            lexentry,
            MAX(score) AS top_score
        FROM translation_grouped
        WHERE written_rep IS NOT NULL AND written_rep != ''
        GROUP BY written_rep, trans_list
        ORDER BY written_rep
    """).fetchall()
    con.close()

    entries = []
    for written_rep, trans_list, all_senses, lexentry, _score in rows:
        pos = extract_pos(lexentry or "")
        trans = (trans_list or "").strip()
        sense = (all_senses or "").strip()
        # Deduplicate repeated senses from group_concat
        if sense:
            seen = []
            for s in sense.split(" | "):
                s = s.strip()
                if s and s not in seen:
                    seen.append(s)
            sense = " | ".join(seen)
        entries.append([written_rep, trans, sense, pos])

    # Sort case-insensitively. Python's default Unicode sort is good enough
    # for both Cyrillic and Latin; locale-based sort requires system locale.
    entries.sort(key=lambda e: e[0].casefold())

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{name}.json")
    payload = {"version": VERSION, "entries": entries}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(out_path) // 1024
    print(f"  [ok] {len(entries)} entries → {out_path} ({size_kb} KB)")


def main():
    print(f"Building dictionary data (WikiDict {VERSION})\n")
    for name in DATASETS:
        print(f"--- {name} ---")
        export_dataset(name)
        print()
    print("Done. Files written to public/data/")


if __name__ == "__main__":
    main()
