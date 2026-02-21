#!/usr/bin/env python3
"""
Build script: WikiDict SQLite → sorted JSON for the PWA.
Also pulls IPA/gender/inflections from kaikki.org for Bulgarian headwords.

Usage:
    python3 scripts/build_data.py

Downloads:
    bg-en.sqlite3 (~4.6 MB)   from WikiDict 2025-11
    en-bg.sqlite3 (~13.7 MB)  from WikiDict 2025-11
    kaikki-Bulgarian.jsonl (~120 MB) from kaikki.org  [for bg-en only]

Outputs:
    public/data/bg-en.json   (entries + meta: IPA/gender/plural/aspect)
    public/data/en-bg.json   (entries only)

JSON format:
    {
      "version": "2025-11",
      "entries": [["written_rep", "trans_list", "sense_list", "pos"], ...],
      "meta": {                          <- bg-en only
        "баба":  {"ipa":"[ˈba.ba]","gender":"f","pl":"баби"},
        "ходя":  {"ipa":"[ˈxodʲɐ]","aspect":"impf","paired":"отида"},
        ...
      }
    }
"""

import sqlite3
import json
import urllib.request
import os

VERSION     = "2025-11"
BASE_URL    = f"https://download.wikdict.com/dictionaries/sqlite/2_{VERSION}"
KAIKKI_URL  = "https://kaikki.org/dictionary/Bulgarian/kaikki.org-dictionary-Bulgarian.jsonl"
IPA_EN_US   = "https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt"
IPA_EN_UK   = "https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_UK.txt"
CACHE_DIR   = os.path.join(os.path.dirname(__file__), ".cache")
OUT_DIR     = os.path.join(os.path.dirname(__file__), "..", "public", "data")
DATASETS    = ["bg-en", "en-bg"]

# Combining acute accent (stress mark used in both kaikki canonical forms
# and some WikiDict headwords)
ACUTE = "\u0301"

POS_MAP = {
    # Bulgarian POS labels (bg-en.sqlite3)
    "Съществително_нарицателно_име": "n",
    "Съществително_собствено_име":   "prop.n",
    "Глагол":                        "v",
    "Прилагателно_име":              "adj",
    "Наречие":                       "adv",
    "Предлог":                       "prep",
    "Частица":                       "part",
    "Числително_име":                "num",
    # English POS labels (en-bg.sqlite3)
    "Noun":                          "n",
    "Proper_noun":                   "prop.n",
    "Verb":                          "v",
    "Adjective":                     "adj",
    "Adverb":                        "adv",
    "Preposition":                   "prep",
    "Prepositional_phrase":          "prep",
    "Particle":                      "part",
    "Numeral":                       "num",
    "Number":                        "num",
    "Interjection":                  "interj",
    "Pronoun":                       "pron",
    "Conjunction":                   "conj",
    "Determiner":                    "det",
}


def strip_accent(s: str) -> str:
    return s.replace(ACUTE, "")


def extract_pos(lexentry: str) -> str:
    if not lexentry:
        return ""
    parts = lexentry.split("__")
    if len(parts) >= 2:
        return POS_MAP.get(parts[1], "")
    return ""


# ── Downloading ───────────────────────────────────────────────────────────────

def download_file(url: str, dest: str, label: str) -> str:
    if os.path.exists(dest):
        print(f"  [cache] {label} already downloaded")
        return dest
    print(f"  [download] {label} ...", flush=True)
    tmp = dest + ".tmp"
    last: list = [-1]
    def progress(count, block, total):
        if total > 0:
            pct = min(100, int(count * block * 100 / total))
            if pct != last[0] and pct % 10 == 0:
                print(f"    {pct}%", flush=True)
                last[0] = pct
    urllib.request.urlretrieve(url, tmp, reporthook=progress)
    os.rename(tmp, dest)
    return dest


# ── Kaikki index ──────────────────────────────────────────────────────────────

def build_kaikki_index(jsonl_path: str) -> dict:
    """Parse kaikki Bulgarian JSONL → {word: {ipa?, gender?, pl?, aspect?, paired?}}"""
    print("  [kaikki] building pronunciation/inflection index …", flush=True)
    index: dict = {}
    with open(jsonl_path, encoding="utf-8") as f:
        for line in f:
            try:
                e = json.loads(line)
            except Exception:
                continue

            word = e.get("word", "").lower()
            if not word:
                continue

            meta: dict = {}

            # IPA — first entry that is not rhymes/audio
            for s in e.get("sounds", []):
                ipa = s.get("ipa", "")
                if ipa and "rhymes" not in s and "audio" not in s:
                    meta["ipa"] = ipa
                    break

            # Gender — from canonical form tags
            for frm in e.get("forms", []):
                tags = frm.get("tags", [])
                if "canonical" in tags:
                    for gname, glabel in (("masculine", "m"), ("feminine", "f"), ("neuter", "n")):
                        if gname in tags:
                            meta["gender"] = glabel
                    break  # only inspect first canonical

            # Plural indefinite (nouns)
            if e.get("pos") == "noun":
                for frm in e.get("forms", []):
                    tags = frm.get("tags", [])
                    if "plural" in tags and "indefinite" in tags:
                        pl = strip_accent(frm.get("form", ""))
                        if pl:
                            meta["pl"] = pl
                        break

            # Aspect + paired form (verbs)
            if e.get("pos") == "verb":
                for ht in e.get("head_templates", []):
                    args = ht.get("args", {})
                    aspect = args.get("2", "")
                    if aspect in ("impf", "pf"):
                        meta["aspect"] = aspect
                        paired_key = "pf" if aspect == "impf" else "impf"
                        paired = strip_accent(args.get(paired_key, ""))
                        if paired:
                            meta["paired"] = paired
                        break

            if not meta:
                continue

            # Merge: multiple kaikki entries for same word fill in missing fields
            if word in index:
                for k, v in meta.items():
                    if k not in index[word]:
                        index[word][k] = v
            else:
                index[word] = meta

    print(f"  [kaikki] {len(index):,} words indexed")
    return index


# ── English IPA (ipa-dict, US+UK, ~5 MB total) ───────────────────────────────

def build_en_ipa_index() -> dict:
    """Download en_US + en_UK IPA TSV files and return {word: ipa_string}."""
    index: dict = {}
    for label, url, fname in [
        ("en_US", IPA_EN_US, "ipa-en_US.txt"),
        ("en_UK", IPA_EN_UK, "ipa-en_UK.txt"),
    ]:
        path = download_file(url, os.path.join(CACHE_DIR, fname), f"{fname} (~3 MB)")
        with open(path, encoding="utf-8") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t")
                if len(parts) == 2:
                    word = parts[0].lower()
                    if word not in index:          # US preferred, UK fills gaps
                        index[word] = parts[1].split(", ")[0]
    print(f"  [ipa-dict] {len(index):,} English words indexed")
    return index


# ── WikiDict export ───────────────────────────────────────────────────────────

def export_dataset(name: str, kaikki_index: dict, en_ipa: dict) -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)
    db_path = download_file(
        f"{BASE_URL}/{name}.sqlite3",
        os.path.join(CACHE_DIR, f"{name}.sqlite3"),
        f"{name}.sqlite3",
    )
    print(f"  [export] reading {name}.sqlite3 …")

    con = sqlite3.connect(db_path)
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
        ORDER BY written_rep, top_score DESC
    """).fetchall()
    con.close()

    entries = []
    for written_rep, trans_list, all_senses, lexentry, _score in rows:
        pos   = extract_pos(lexentry or "")
        trans = (trans_list  or "").strip()
        sense = (all_senses  or "").strip()
        if sense:
            seen: list = []
            for s in sense.split(" | "):
                s = s.strip()
                if s and s not in seen:
                    seen.append(s)
            sense = " | ".join(seen)
        entries.append([written_rep, trans, sense, pos])

    entries.sort(key=lambda e: e[0].casefold())

    # Build meta dict from kaikki (bg-en) or ipa-dict (en-bg)
    meta: dict = {}
    if kaikki_index:
        for rep in {e[0] for e in entries}:
            key = strip_accent(rep).lower()
            if key in kaikki_index:
                meta[rep] = kaikki_index[key]
        print(f"  [kaikki]   {len(meta):,} headwords enriched with meta")
    elif en_ipa:
        for rep in {e[0] for e in entries}:
            ipa = en_ipa.get(rep.lower())
            if ipa:
                meta[rep] = {"ipa": ipa}
        print(f"  [ipa-dict] {len(meta):,} headwords enriched with IPA")

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{name}.json")
    payload: dict = {"version": VERSION, "entries": entries}
    if meta:
        payload["meta"] = meta
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(out_path) // 1024
    print(f"  [ok] {len(entries):,} entries → {out_path} ({size_kb:,} KB)")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"Building dictionary data (WikiDict {VERSION})\n")

    # Bulgarian: kaikki (IPA, gender, inflections)
    print("--- kaikki (Bulgarian IPA / gender / inflections) ---")
    kaikki_path = download_file(
        KAIKKI_URL,
        os.path.join(CACHE_DIR, "kaikki-Bulgarian.jsonl"),
        "kaikki-Bulgarian.jsonl (~120 MB)",
    )
    kaikki_index = build_kaikki_index(kaikki_path)
    print()

    # English: ipa-dict (IPA only, ~5 MB total)
    print("--- ipa-dict (English IPA, US + UK) ---")
    en_ipa = build_en_ipa_index()
    print()

    for name in DATASETS:
        print(f"--- {name} ---")
        export_dataset(
            name,
            kaikki_index if name == "bg-en" else {},
            en_ipa      if name == "en-bg" else {},
        )
        print()

    print("Done. Files written to public/data/")


if __name__ == "__main__":
    main()
