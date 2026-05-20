#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.12"
# dependencies = ["requests", "tqdm"]
# ///
"""
Build script: WikiDict SQLite → sorted JSON for the PWA.
Also pulls IPA/gender/inflections from kaikki.org for Bulgarian headwords.

Usage:
    uv run scripts/build_data.py

Downloads:
    bg-en.sqlite3 (~4.6 MB)   from WikiDict 2025-11
    en-bg.sqlite3 (~13.7 MB)  from WikiDict 2025-11
    kaikki-Bulgarian.jsonl (~120 MB) from kaikki.org  [bg-en: IPA/gender/inflections]
    ipa-en_US.txt (~3 MB)     from ipa-dict (en_US only; MIT)  [en-bg: IPA]
    kaikki-English.jsonl (~3 GB, streamed; only a small TSV is cached)
                              from kaikki.org  [en-bg: IPA fallback for loanwords]
    unimorph-eng.txt (~18 MB) from UniMorph/eng (CC BY-SA 3.0) [en-bg: irregular forms]

Outputs:
    public/data/bg-en.json   (entries + meta: IPA/gender/plural/aspect)
    public/data/en-bg.json   (entries + meta: IPA/irregular forms)

JSON format:
    {
      "version": "2025-11",
      "entries": [["written_rep", "trans_list", "sense_list", "pos"], ...],
      "meta": {
        "баба":  {"ipa":"[ˈba.ba]","gender":"f","pl":"баби"},
        "house": {"ipa":"/ˈhaʊs/"},
        "go":    {"ipa":"/ˈɡoʊ/","past":"went","pp":"gone"},
        ...
      }
    }
"""

import json
import os
import re
import sqlite3
import threading

import requests
from tqdm import tqdm

VERSION = "2025-11"
BASE_URL = f"https://download.wikdict.com/dictionaries/sqlite/2_{VERSION}"
KAIKKI_URL = (
    "https://kaikki.org/dictionary/Bulgarian/kaikki.org-dictionary-Bulgarian.jsonl"
)
KAIKKI_EN_URL = (
    "https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl"
)
# en_US only — en_UK (ipacards, GPL 3.0) is excluded for licence compatibility
IPA_EN_US = (
    "https://raw.githubusercontent.com/open-dict-data/ipa-dict/master/data/en_US.txt"
)
UNIMORPH_EN = "https://raw.githubusercontent.com/unimorph/eng/master/eng"
CACHE_DIR = os.path.join(os.path.dirname(__file__), ".cache")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")
DATASETS = ["bg-en", "en-bg"]

# Combining acute accent (stress mark used in both kaikki canonical forms
# and some WikiDict headwords)
ACUTE = "\u0301"

POS_MAP = {
    # Bulgarian POS labels (bg-en.sqlite3)
    "Съществително_нарицателно_име": "n",
    "Съществително_собствено_име": "prop.n",
    "Глагол": "v",
    "Прилагателно_име": "adj",
    "Наречие": "adv",
    "Предлог": "prep",
    "Частица": "part",
    "Числително_име": "num",
    # English POS labels (en-bg.sqlite3)
    "Noun": "n",
    "Proper_noun": "prop.n",
    "Verb": "v",
    "Adjective": "adj",
    "Adverb": "adv",
    "Preposition": "prep",
    "Prepositional_phrase": "prep",
    "Particle": "part",
    "Numeral": "num",
    "Number": "num",
    "Interjection": "interj",
    "Pronoun": "pron",
    "Conjunction": "conj",
    "Determiner": "det",
}


def strip_accent(s: str) -> str:
    return s.replace(ACUTE, "")


# WikiDict sometimes stores rank prefixes like "1:2" directly in trans_list
# (e.g. "1:2cab | 2:3car" instead of "cab | car").  Strip them per token.
_RANK_PREFIX = re.compile(r"^\d+:\d+")


def clean_trans(raw: str) -> str:
    """Remove WikiDict rank prefixes and return a clean ' | '-joined string."""
    tokens = [_RANK_PREFIX.sub("", t).strip() for t in raw.split(" | ")]
    return " | ".join(t for t in tokens if t)


def extract_pos(lexentry: str) -> str:
    if not lexentry:
        return ""
    parts = lexentry.split("__")
    if len(parts) >= 2:
        return POS_MAP.get(parts[1], "")
    return ""


# ── Downloading ───────────────────────────────────────────────────────────────

_DL_CONNECTIONS = int(
    os.environ.get("DL_CONNECTIONS", 10)
)  # override: DL_CONNECTIONS=20 uv run ...
_DL_READ_CHUNK = 1 << 17  # 128 KB per read() call


def _multi_download(url: str, tmp: str, total: int, bar: tqdm, n: int) -> None:
    """Parallel Range-based download using *n* connections."""
    chunk = (total + n - 1) // n
    ranges = [(i * chunk, min((i + 1) * chunk - 1, total - 1)) for i in range(n)]
    buffers: list[bytes | None] = [None] * n
    errors: list[Exception | None] = [None] * n
    lock = threading.Lock()

    def fetch(idx: int, start: int, end: int) -> None:
        try:
            buf = bytearray()
            with requests.get(
                url,
                headers={
                    "Range": f"bytes={start}-{end}",
                    # Disable transport compression: when the server returns
                    # Content-Encoding: gzip on a 206 Partial Content, urllib3
                    # tries to gzip-decode each range slice independently, which
                    # fails because only byte 0 of the file has a gzip header.
                    "Accept-Encoding": "identity",
                },
                stream=True,
                timeout=60,
            ) as r:
                r.raise_for_status()
                for data in r.iter_content(_DL_READ_CHUNK):
                    buf.extend(data)
                    with lock:
                        bar.update(len(data))
            buffers[idx] = bytes(buf)
        except Exception as exc:
            errors[idx] = exc

    threads = [
        threading.Thread(target=fetch, args=(i, s, e), daemon=True)
        for i, (s, e) in enumerate(ranges)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    failed = [(i, e) for i, e in enumerate(errors) if e is not None]
    if failed:
        raise RuntimeError(f"Chunk download(s) failed: {failed}")

    with open(tmp, "wb") as f:
        for buf in buffers:
            f.write(buf)  # type: ignore[arg-type]


def download_file(url: str, dest: str, label: str) -> str:
    if os.path.exists(dest):
        print(f"  [cache] {label} already downloaded")
        return dest

    os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
    tmp = dest + ".tmp"

    total = -1
    supports_ranges = False
    try:
        # Force identity encoding so content-length reflects the raw byte size
        # we'll be slicing with Range requests (not a gzipped transfer size).
        r = requests.head(url, headers={"Accept-Encoding": "identity"}, timeout=10)
        total = int(r.headers.get("content-length", -1))
        supports_ranges = r.headers.get("accept-ranges", "").lower() == "bytes"
    except Exception:
        pass

    try:
        with tqdm(
            total=total if total > 0 else None,
            unit="B",
            unit_scale=True,
            unit_divisor=1024,
            desc=label[:30],
            dynamic_ncols=True,
        ) as bar:
            if supports_ranges and total > 0:
                n = min(_DL_CONNECTIONS, max(1, total // (1 << 20)))
                _multi_download(url, tmp, total, bar, n)
            else:
                with requests.get(url, stream=True, timeout=60) as r:
                    r.raise_for_status()
                    with open(tmp, "wb") as f:
                        for chunk in r.iter_content(_DL_READ_CHUNK):
                            f.write(chunk)
                            bar.update(len(chunk))
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise

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
                    for gname, glabel in (
                        ("masculine", "m"),
                        ("feminine", "f"),
                        ("neuter", "n"),
                    ):
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


# ── English IPA (ipa-dict en_US only, MIT, ~3 MB) ────────────────────────────


def build_en_ipa_index() -> dict:
    """Download en_US IPA TSV and return {word: ipa_string}.

    Only en_US is used (cmudict-ipa, MIT).  en_UK (ipacards, GPL 3.0) is
    intentionally excluded to avoid copyleft propagation.
    """
    index: dict = {}
    path = download_file(
        IPA_EN_US, os.path.join(CACHE_DIR, "ipa-en_US.txt"), "ipa-en_US.txt (~3 MB)"
    )
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) == 2:
                word = parts[0].lower()
                if word not in index:
                    index[word] = parts[1].split(", ")[0]
    print(f"  [ipa-dict] {len(index):,} English words indexed (en_US)")
    return index


# ── English IPA fallback (kaikki English Wiktionary, ~3 GB streamed) ─────────


def build_en_kaikki_ipa_index() -> dict:
    """Stream the kaikki English JSONL → {word: ipa_string}.

    The full JSONL is ~3 GB, so we never persist it.  Stream-parse line by
    line, extracting only headword + first /…/ IPA (skipping rhymes/audio
    entries), and write a small derived TSV to .cache/ for reuse.
    Subsequent builds load the cached TSV directly.

    This is used only as a *fallback* to ipa-dict cmudict (which is the
    cleaner narrow transcription); kaikki fills holes for loanwords and
    proper nouns that cmudict misses, e.g. "chamois".
    """
    cache_tsv = os.path.join(CACHE_DIR, "kaikki-en-ipa.tsv")
    index: dict = {}

    if os.path.exists(cache_tsv):
        with open(cache_tsv, encoding="utf-8") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t", 1)
                if len(parts) == 2 and parts[0] not in index:
                    index[parts[0]] = parts[1]
        print(f"  [kaikki-en] {len(index):,} English IPA from cached TSV")
        return index

    print("  [kaikki-en] streaming kaikki English JSONL (~3 GB) …", flush=True)
    os.makedirs(CACHE_DIR, exist_ok=True)
    tmp = cache_tsv + ".tmp"
    bytes_seen = 0
    lines_seen = 0
    try:
        with requests.get(
            KAIKKI_EN_URL,
            headers={"Accept-Encoding": "identity"},
            stream=True,
            timeout=120,
        ) as r:
            r.raise_for_status()
            total = int(r.headers.get("content-length", 0))
            with open(tmp, "w", encoding="utf-8") as out, tqdm(
                total=total if total > 0 else None,
                unit="B",
                unit_scale=True,
                unit_divisor=1024,
                desc="kaikki-en stream",
                dynamic_ncols=True,
            ) as bar:
                for raw in r.iter_lines(decode_unicode=False, chunk_size=1 << 20):
                    if not raw:
                        continue
                    bar.update(len(raw) + 1)  # +1 for the stripped newline
                    bytes_seen += len(raw) + 1
                    lines_seen += 1
                    try:
                        e = json.loads(raw)
                    except Exception:
                        continue
                    word = e.get("word", "")
                    if not word:
                        continue
                    key = word.lower()
                    if key in index:
                        continue  # first-wins (matches cmudict behaviour)
                    for s in e.get("sounds", []):
                        ipa = s.get("ipa", "")
                        if ipa and "rhymes" not in s and "audio" not in s:
                            index[key] = ipa
                            out.write(f"{key}\t{ipa}\n")
                            break
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise

    os.rename(tmp, cache_tsv)
    print(
        f"  [kaikki-en] {len(index):,} English IPA extracted "
        f"from {lines_seen:,} JSONL lines ({bytes_seen / (1 << 30):.2f} GB streamed)"
    )
    return index


# ── English morphology (Unimorph + curated patch) ────────────────────────────

# Forms Unimorph omits — verified against Wiktionary
_EN_PATCH: dict = {
    # Irregular noun plurals
    "child": {"pl": "children"},
    "tooth": {"pl": "teeth"},
    "foot": {"pl": "feet"},
    "goose": {"pl": "geese"},
    "ox": {"pl": "oxen"},
    "leaf": {"pl": "leaves"},
    "life": {"pl": "lives"},
    "wife": {"pl": "wives"},
    "loaf": {"pl": "loaves"},
    "shelf": {"pl": "shelves"},
    "self": {"pl": "selves"},
    "person": {"pl": "people"},
    "woman": {"pl": "women"},
    "phenomenon": {"pl": "phenomena"},
    "criterion": {"pl": "criteria"},
    "datum": {"pl": "data"},
    "medium": {"pl": "media"},
    "analysis": {"pl": "analyses"},
    "basis": {"pl": "bases"},
    "thesis": {"pl": "theses"},
    "crisis": {"pl": "crises"},
    "radius": {"pl": "radii"},
    "fungus": {"pl": "fungi"},
    "cactus": {"pl": "cacti"},
    "index": {"pl": "indices"},
    "matrix": {"pl": "matrices"},
    "appendix": {"pl": "appendices"},
    # Irregular verbs: past tense / past participle
    "be": {"past": "was/were", "pp": "been"},
    "have": {"past": "had", "pp": "had"},
    "do": {"past": "did", "pp": "done"},
    "go": {"past": "went", "pp": "gone"},
    "become": {"past": "became", "pp": "become"},
    "come": {"past": "came", "pp": "come"},
    "overcome": {"past": "overcame", "pp": "overcome"},
    "run": {"past": "ran", "pp": "run"},
    "begin": {"past": "began", "pp": "begun"},
    "swim": {"past": "swam", "pp": "swum"},
    "drink": {"past": "drank", "pp": "drunk"},
    "ring": {"past": "rang", "pp": "rung"},
    "sing": {"past": "sang", "pp": "sung"},
    "spring": {"past": "sprang", "pp": "sprung"},
    "shrink": {"past": "shrank", "pp": "shrunk"},
    "see": {"past": "saw", "pp": "seen"},
    "write": {"past": "wrote", "pp": "written"},
    "speak": {"past": "spoke", "pp": "spoken"},
    "break": {"past": "broke", "pp": "broken"},
    "choose": {"past": "chose", "pp": "chosen"},
    "freeze": {"past": "froze", "pp": "frozen"},
    "steal": {"past": "stole", "pp": "stolen"},
    "take": {"past": "took", "pp": "taken"},
    "mistake": {"past": "mistook", "pp": "mistaken"},
    "undertake": {"past": "undertook", "pp": "undertaken"},
    "overtake": {"past": "overtook", "pp": "overtaken"},
    "shake": {"past": "shook", "pp": "shaken"},
    "wake": {"past": "woke", "pp": "woken"},
    "forsake": {"past": "forsook", "pp": "forsaken"},
    "drive": {"past": "drove", "pp": "driven"},
    "ride": {"past": "rode", "pp": "ridden"},
    "rise": {"past": "rose", "pp": "risen"},
    "arise": {"past": "arose", "pp": "arisen"},
    "fall": {"past": "fell", "pp": "fallen"},
    "eat": {"past": "ate", "pp": "eaten"},
    "fly": {"past": "flew", "pp": "flown"},
    "grow": {"past": "grew", "pp": "grown"},
    "throw": {"past": "threw", "pp": "thrown"},
    "blow": {"past": "blew", "pp": "blown"},
    "draw": {"past": "drew", "pp": "drawn"},
    "know": {"past": "knew", "pp": "known"},
    "swear": {"past": "swore", "pp": "sworn"},
    "wear": {"past": "wore", "pp": "worn"},
    "tear": {"past": "tore", "pp": "torn"},
    "weave": {"past": "wove", "pp": "woven"},
    "give": {"past": "gave", "pp": "given"},
    "forgive": {"past": "forgave", "pp": "forgiven"},
    "forbid": {"past": "forbade", "pp": "forbidden"},
    "forget": {"past": "forgot", "pp": "forgotten"},
    "get": {"past": "got", "pp": "gotten"},
    "undergo": {"past": "underwent", "pp": "undergone"},
    "bite": {"past": "bit", "pp": "bitten"},
    "hide": {"past": "hid", "pp": "hidden"},
    "make": {"past": "made", "pp": "made"},
    "think": {"past": "thought", "pp": "thought"},
    "bring": {"past": "brought", "pp": "brought"},
    "buy": {"past": "bought", "pp": "bought"},
    "catch": {"past": "caught", "pp": "caught"},
    "fight": {"past": "fought", "pp": "fought"},
    "seek": {"past": "sought", "pp": "sought"},
    "teach": {"past": "taught", "pp": "taught"},
    "feel": {"past": "felt", "pp": "felt"},
    "keep": {"past": "kept", "pp": "kept"},
    "sleep": {"past": "slept", "pp": "slept"},
    "sweep": {"past": "swept", "pp": "swept"},
    "weep": {"past": "wept", "pp": "wept"},
    "kneel": {"past": "knelt", "pp": "knelt"},
    "leap": {"past": "leapt", "pp": "leapt"},
    "leave": {"past": "left", "pp": "left"},
    "send": {"past": "sent", "pp": "sent"},
    "spend": {"past": "spent", "pp": "spent"},
    "lose": {"past": "lost", "pp": "lost"},
    "meet": {"past": "met", "pp": "met"},
    "say": {"past": "said", "pp": "said"},
    "pay": {"past": "paid", "pp": "paid"},
    "lay": {"past": "laid", "pp": "laid"},
    "stand": {"past": "stood", "pp": "stood"},
    "understand": {"past": "understood", "pp": "understood"},
    "withstand": {"past": "withstood", "pp": "withstood"},
    "hold": {"past": "held", "pp": "held"},
    "find": {"past": "found", "pp": "found"},
    "tell": {"past": "told", "pp": "told"},
    "sell": {"past": "sold", "pp": "sold"},
    "lead": {"past": "led", "pp": "led"},
    "feed": {"past": "fed", "pp": "fed"},
    "bleed": {"past": "bled", "pp": "bled"},
    "breed": {"past": "bred", "pp": "bred"},
    "speed": {"past": "sped", "pp": "sped"},
    "sit": {"past": "sat", "pp": "sat"},
    "spit": {"past": "spat", "pp": "spat"},
    "lie": {"past": "lay", "pp": "lain"},
    "hear": {"past": "heard", "pp": "heard"},
    "read": {"past": "read", "pp": "read"},
    "deal": {"past": "dealt", "pp": "dealt"},
    "mean": {"past": "meant", "pp": "meant"},
    "build": {"past": "built", "pp": "built"},
    "burn": {"past": "burnt", "pp": "burnt"},
    "learn": {"past": "learnt", "pp": "learnt"},
    "win": {"past": "won", "pp": "won"},
    "shoot": {"past": "shot", "pp": "shot"},
    "show": {"past": "showed", "pp": "shown"},
    "dig": {"past": "dug", "pp": "dug"},
    "hang": {"past": "hung", "pp": "hung"},
    "swing": {"past": "swung", "pp": "swung"},
    "cling": {"past": "clung", "pp": "clung"},
    "stick": {"past": "stuck", "pp": "stuck"},
    "strike": {"past": "struck", "pp": "struck"},
    "string": {"past": "strung", "pp": "strung"},
    "wring": {"past": "wrung", "pp": "wrung"},
    "fling": {"past": "flung", "pp": "flung"},
    "sling": {"past": "slung", "pp": "slung"},
    "slide": {"past": "slid", "pp": "slid"},
    "grind": {"past": "ground", "pp": "ground"},
    "bind": {"past": "bound", "pp": "bound"},
    "wind": {"past": "wound", "pp": "wound"},
    "shine": {"past": "shone", "pp": "shone"},
    # Irregular adjectives / adverbs
    "good": {"cmp": "better", "sup": "best"},
    "bad": {"cmp": "worse", "sup": "worst"},
    "far": {"cmp": "further", "sup": "furthest"},
    "little": {"cmp": "less", "sup": "least"},
    "much": {"cmp": "more", "sup": "most"},
    "many": {"cmp": "more", "sup": "most"},
    "well": {"cmp": "better", "sup": "best"},
    "badly": {"cmp": "worse", "sup": "worst"},
}

_UNIMORPH_NOISE = frozenset(
    {
        "countable",
        "uncountable",
        "plurale",
        "tantum",
        "singular",
        "plural",
        "only-singular",
        "only-plural",
        "invariable",
        "defective",
        "collective",
        "singulative",
        "irregular",
        "regular",
        "mixed",
        "weak",
        "strong",
    }
)


def _is_regular_plural(lemma: str, form: str) -> bool:
    l = lemma.lower()
    return form.lower() in (
        l + "s",
        l + "es",
        (l[:-1] + "ies") if l.endswith("y") else "",
    )


def _is_regular_past(lemma: str, form: str) -> bool:
    l, f = lemma.lower(), form.lower()
    return f in (
        l + "d",
        l + "ed",
        (l[:-1] + "d") if l.endswith("e") else "",
        (l[:-1] + "ied") if l.endswith("y") else "",
        # Consonant doubling: man→manned, ban→banned (but NOT run→ran)
        l + l[-1] + "ed",
        l + l[-1] + "d",
    )


def build_en_morph_index() -> dict:
    """Unimorph English (irregular forms only) merged with _EN_PATCH."""
    path = download_file(
        UNIMORPH_EN,
        os.path.join(CACHE_DIR, "unimorph-eng.txt"),
        "unimorph-eng.txt (~18 MB)",
    )
    index: dict = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) != 3:
                continue
            lemma, form, tags = parts[0].lower(), parts[1].lower(), parts[2]
            if form in _UNIMORPH_NOISE or " " in form or form == lemma:
                continue
            if tags == "N;PL" and not _is_regular_plural(lemma, form):
                index.setdefault(lemma, {})["pl"] = form
            elif tags == "V;PST" and not _is_regular_past(lemma, form):
                index.setdefault(lemma, {})["past"] = form
            elif tags == "V;V.PTCP;PST" and not _is_regular_past(lemma, form):
                index.setdefault(lemma, {})["pp"] = form
            elif tags == "ADJ;CMPR" and not form.startswith("more "):
                index.setdefault(lemma, {})["cmp"] = form
            elif tags == "ADJ;SPRL" and not form.startswith("most "):
                index.setdefault(lemma, {})["sup"] = form

    # Patch OVERRIDES Unimorph (curated > generated); Unimorph fills the rest
    for lemma, fields in _EN_PATCH.items():
        index[lemma] = dict(fields)  # full replace, not merge

    index = {k: v for k, v in index.items() if v}
    print(f"  [unimorph] {len(index):,} English words with irregular forms")
    return index


# ── WikiDict export ───────────────────────────────────────────────────────────


def export_dataset(name: str, kaikki_index: dict, en_ipa: dict, en_morph: dict) -> None:
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
        # WikiDict reverse-mapping can produce headwords like "1:2cab" or "2:3car"
        # (rank-prefixed sense references).  Strip the prefix so the entry is
        # reachable by binary search, just like clean_trans() does for translations.
        written_rep = _RANK_PREFIX.sub("", written_rep).strip()
        if not written_rep:
            continue
        pos = extract_pos(lexentry or "")
        trans = clean_trans(trans_list or "")
        sense = (all_senses or "").strip()
        if sense:
            seen: list = []
            for s in sense.split(" | "):
                s = s.strip()
                if s and s not in seen:
                    seen.append(s)
            sense = " | ".join(seen)
        entries.append([written_rep, trans, sense, pos])

    # Strip combining acute accent (U+0301, used as stress mark in BG headwords)
    # before sorting, so that fold() in search.ts (which does the same) finds
    # entries in the correct bin.  e.g. "ко́тка" must sort alongside "котка".
    entries.sort(key=lambda e: e[0].replace(ACUTE, "").casefold())

    # Build meta dict from kaikki (bg-en) or ipa-dict + unimorph (en-bg)
    meta: dict = {}
    if kaikki_index:
        for rep in {e[0] for e in entries}:
            key = strip_accent(rep).lower()
            if key in kaikki_index:
                meta[rep] = kaikki_index[key]
        print(f"  [kaikki]   {len(meta):,} headwords enriched with meta")
    elif en_ipa or en_morph:
        for rep in {e[0] for e in entries}:
            key = rep.lower()
            entry: dict = {}
            if key in en_ipa:
                entry["ipa"] = en_ipa[key]
            if key in en_morph:
                entry.update(en_morph[key])
            if entry:
                meta[rep] = entry
        print(f"  [ipa-dict] {len(meta):,} headwords enriched with IPA/morphology")

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

    os.makedirs(CACHE_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    # Bulgarian: kaikki (IPA, gender, inflections)
    print("--- kaikki (Bulgarian IPA / gender / inflections) ---")
    kaikki_path = download_file(
        KAIKKI_URL,
        os.path.join(CACHE_DIR, "kaikki-Bulgarian.jsonl"),
        "kaikki-Bulgarian.jsonl (~120 MB)",
    )
    kaikki_index = build_kaikki_index(kaikki_path)
    print()

    # English: ipa-dict en_US only (MIT) + kaikki English fallback (CC BY-SA)
    #          + Unimorph (irregular forms, ~18 MB)
    print("--- ipa-dict (English IPA, en_US only — MIT) ---")
    en_ipa = build_en_ipa_index()
    print()
    print("--- kaikki English (IPA fallback for loanwords/proper nouns) ---")
    en_ipa_kaikki = build_en_kaikki_ipa_index()
    # Merge: cmudict (en_ipa) takes priority (cleaner narrow transcription);
    # kaikki only fills holes.
    filled = 0
    for k, v in en_ipa_kaikki.items():
        if k not in en_ipa:
            en_ipa[k] = v
            filled += 1
    print(f"  [merge] {filled:,} headwords filled from kaikki; "
          f"{len(en_ipa):,} total English IPA entries")
    print()
    print("--- unimorph (English irregular plurals / verb forms / comparatives) ---")
    en_morph = build_en_morph_index()
    print()

    for name in DATASETS:
        print(f"--- {name} ---")
        export_dataset(
            name,
            kaikki_index if name == "bg-en" else {},
            en_ipa if name == "en-bg" else {},
            en_morph if name == "en-bg" else {},
        )
        print()

    print("Done. Files written to public/data/")


if __name__ == "__main__":
    main()
