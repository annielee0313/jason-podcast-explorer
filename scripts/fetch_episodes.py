#!/usr/bin/env python3
"""
Pull episodes from the show's RSS feed into data/episodes.json.

    python scripts/fetch_episodes.py --limit 50
    python scripts/fetch_episodes.py --from-file feed.xml --limit 50   # if your network blocks the feed

What it does
- Parses each <item>: EP number, title hook (text before ➡️), date, duration,
  the 來賓 line (guest + org), the ☑️ takeaways, and the audio URL.
- MERGES into the existing data/episodes.json: hand-curated fields
  (themes, arc, highlight, highlightIsSummary, industry) are never overwritten.
  New episodes get themes=[] — run scripts/tag_episodes.py next.
- Writes data/audio_urls.json (EP -> mp3 URL) for scripts/transcribe.py.

Standard library only. The guest/org split is heuristic: review new rows.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path

FEED_URL = "https://feeds.soundon.fm/podcasts/f1f2a53d-d42a-4752-a768-00a32b1ac9c5.xml"
APPLE_SHOW_ID = "1532218131"
ROOT = Path(__file__).resolve().parent.parent
EPISODES_PATH = ROOT / "data" / "episodes.json"
AUDIO_PATH = ROOT / "data" / "audio_urls.json"
ABOUT_PATH = ROOT / "data" / "about.json"

NS = {
    "itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd",
    "content": "http://purl.org/rss/1.0/modules/content/",
}
CURATED_FIELDS = ("themes", "arc", "highlight", "highlightIsSummary", "appleUrl", "industry")


def fetch_feed(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "jason-podcast-explorer/0.1"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def strip_html(s: str) -> str:
    s = re.sub(r"<br\s*/?>|</p>|</li>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s).replace("\r", "")


def parse_duration(raw: str | None) -> int | None:
    if not raw:
        return None
    raw = raw.strip()
    if raw.isdigit():
        return int(raw)
    parts = [int(p) for p in raw.split(":") if p.isdigit()]
    total = 0
    for p in parts:
        total = total * 60 + p
    return total or None


def space_cjk_latin(name: str) -> str:
    """'陳子龍Brian' -> '陳子龍 Brian'"""
    return re.sub(r"([一-鿿])([A-Za-z])", r"\1 \2", name).strip()


def split_guest(line: str) -> tuple[str, str]:
    """'SUPER 8 Studio 創辦人暨執行長 陳子龍Brian' -> ('陳子龍 Brian', 'SUPER 8 Studio 創辦人暨執行長').
    Heuristic: the last whitespace-separated token is the name (+ an optional
    following Latin token like 'Fox' in '蕭上農 Fox')."""
    tokens = line.split()
    if not tokens:
        return "", ""
    if len(tokens) >= 2 and re.fullmatch(r"[A-Za-z]+", tokens[-1]) and re.search(r"[一-鿿]", tokens[-2]):
        name, org_tokens = f"{tokens[-2]} {tokens[-1]}", tokens[:-2]
    else:
        name, org_tokens = tokens[-1], tokens[:-1]
    return space_cjk_latin(name), " ".join(org_tokens)


def parse_item(item: ET.Element) -> dict | None:
    title = (item.findtext("title") or "").strip()
    m = re.search(r"EP\.?\s*(\d+)", title)
    if not m:
        return None  # trailers / specials without an EP number
    ep = int(m.group(1))
    hook = title.split("➡️")[0].strip()
    # Older episodes (EP.1–147) are titled 「EP.n 職稱 姓名｜標題」: keep only the part after ｜,
    # since EP number, guest and org are shown separately on the site.
    old_style = re.match(r"^\s*EP\.?\s*\d+\s.*?[｜|](.+)$", hook)
    if old_style:
        hook = old_style.group(1).strip()

    desc_raw = item.findtext("content:encoded", namespaces=NS) or item.findtext("description") or ""
    desc = strip_html(desc_raw)

    guest, org = "", ""
    gm = re.search(r"來賓[:：]\s*(.+)", desc)
    if gm:
        guest, org = split_guest(gm.group(1).strip())

    takeaways = [
        re.sub(r"^☑️\s*", "", line).strip().rstrip("。！!")
        for line in desc.splitlines()
        if line.strip().startswith("☑️")
    ]

    pub = item.findtext("pubDate")
    date = parsedate_to_datetime(pub).date().isoformat() if pub else ""
    enclosure = item.find("enclosure")

    return {
        "ep": ep,
        "date": date,
        "durationSec": parse_duration(item.findtext("itunes:duration", namespaces=NS)),
        "title": hook,
        "guest": guest,
        "org": org,
        "takeaways": takeaways,
        "_audio": enclosure.get("url") if enclosure is not None else None,
    }


def default_highlight(takeaways: list[str]) -> str:
    if not takeaways:
        return ""
    first = takeaways[0]
    return first.split("：", 1)[1] if "：" in first else first


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=50, help="keep the N most recent episodes (default 50)")
    ap.add_argument("--from-file", type=Path, help="parse a saved feed XML instead of downloading")
    ap.add_argument("--url", default=FEED_URL)
    args = ap.parse_args()

    xml_bytes = args.from_file.read_bytes() if args.from_file else fetch_feed(args.url)
    channel = ET.fromstring(xml_bytes).find("channel")
    if channel is None:
        print("No <channel> in feed", file=sys.stderr)
        return 1

    parsed = [p for p in (parse_item(i) for i in channel.findall("item")) if p]
    parsed.sort(key=lambda p: p["ep"], reverse=True)
    # The site's headline count (「249 場對話」) follows the newest episode number in the feed.
    if parsed:
        about = json.loads(ABOUT_PATH.read_text("utf-8"))
        about.setdefault("stats", {})["episodes"] = parsed[0]["ep"]
        ABOUT_PATH.write_text(json.dumps(about, ensure_ascii=False, indent=2) + "\n", "utf-8")
    parsed = parsed[: args.limit]

    existing = {e["ep"]: e for e in json.loads(EPISODES_PATH.read_text("utf-8"))} if EPISODES_PATH.exists() else {}
    audio = json.loads(AUDIO_PATH.read_text("utf-8")) if AUDIO_PATH.exists() else {}

    merged, added, updated = [], 0, 0
    for p in parsed:
        audio_url = p.pop("_audio")
        if audio_url:
            audio[str(p["ep"])] = audio_url
        old = existing.get(p["ep"])
        row = {**p}
        if old:
            updated += 1
            for f in CURATED_FIELDS:
                if f in old:
                    row[f] = old[f]
            # keep hand-entered guest/org if the parser came back empty
            for f in ("guest", "org"):
                if not row[f] and old.get(f):
                    row[f] = old[f]
            # the feed's takeaways replace any placeholder/summary
            if row["takeaways"] and old.get("highlightIsSummary"):
                row["highlight"] = default_highlight(row["takeaways"])
                row["highlightIsSummary"] = False
        else:
            added += 1
            row.update(themes=[], arc=None, industry=None, highlight=default_highlight(p["takeaways"]), highlightIsSummary=False)
        row.setdefault("appleUrl", None)
        merged.append(row)

    # keep any older hand-curated rows that fell outside --limit
    kept_eps = {r["ep"] for r in merged}
    merged += [e for ep, e in existing.items() if ep not in kept_eps]
    merged.sort(key=lambda r: r["ep"], reverse=True)

    # drop null appleUrl so the JSON stays tidy
    for r in merged:
        if r.get("appleUrl") is None:
            r.pop("appleUrl", None)

    EPISODES_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", "utf-8")
    AUDIO_PATH.write_text(json.dumps(audio, ensure_ascii=False, indent=2, sort_keys=True) + "\n", "utf-8")
    untagged = sum(1 for r in merged if not r.get("themes"))
    print(f"{len(merged)} episodes written ({added} new, {updated} updated). {untagged} need themes → run scripts/tag_episodes.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
