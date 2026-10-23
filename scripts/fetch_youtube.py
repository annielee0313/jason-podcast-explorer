#!/usr/bin/env python3
"""
Match the show's YouTube videos to episodes and store each video's ID as `youtubeId`
in data/episodes.json, so episode pages can embed the full interview.

    python scripts/fetch_youtube.py            # public channel feed: the latest 15 videos
    YOUTUBE_API_KEY=... python scripts/fetch_youtube.py --all   # whole channel (one-time backfill)

Matching: full episodes are titled 「【Jason好好聊】專訪 …｜Podcast EP247 完整採訪」; the EP
number in the title links the video to the episode. Titles without an EP number (shorts,
trailers) are skipped. Only metadata (ID, title, date) is read; nothing is downloaded.

Merge, don't overwrite: an episode that already has a youtubeId keeps it (fix a wrong
match by editing episodes.json by hand). Runs before every deploy (no key needed there).
--all needs a YouTube Data API v3 key in the environment or in .env as YOUTUBE_API_KEY.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EPISODES_PATH = ROOT / "data" / "episodes.json"
CHANNEL_ID = "UC5kR8PlAjkLa2IIJKNE_c4Q"  # youtube.com/@Jasonstalkshow
FEED = f"https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}"
EP_IN_TITLE = re.compile(r"EP\s*\.?\s*(\d{1,4})", re.I)
NS = {"atom": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "jason-podcast-explorer/0.1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def from_feed() -> list[tuple[str, str]]:
    root = ET.fromstring(get(FEED))
    return [(e.findtext("yt:videoId", namespaces=NS) or "", e.findtext("atom:title", namespaces=NS) or "")
            for e in root.findall("atom:entry", NS)]


def api_key() -> str | None:
    if os.environ.get("YOUTUBE_API_KEY"):
        return os.environ["YOUTUBE_API_KEY"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text("utf-8").splitlines():
            if line.startswith("YOUTUBE_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"\'')
    return None


def from_api(key: str, limit: int = 0) -> list[tuple[str, str]]:
    """Uploads, newest first, via the channel's uploads playlist (UU + channel ID without 'UC').
    limit=0 reads them all."""
    playlist = "UU" + CHANNEL_ID[2:]
    out: list[tuple[str, str]] = []
    token = ""
    while True:
        q = {"part": "snippet", "playlistId": playlist, "maxResults": "50", "key": key}
        if token:
            q["pageToken"] = token
        data = json.loads(get("https://www.googleapis.com/youtube/v3/playlistItems?" + urllib.parse.urlencode(q)))
        for item in data.get("items", []):
            sn = item["snippet"]
            out.append((sn["resourceId"]["videoId"], sn["title"]))
        token = data.get("nextPageToken", "")
        if not token or (limit and len(out) >= limit):
            return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true", help="list the whole channel with the YouTube Data API")
    args = ap.parse_args()

    key = api_key()
    if args.all and not key:
        print("--all needs YOUTUBE_API_KEY (in the environment or .env)", file=sys.stderr)
        return 1
    try:
        if args.all:
            videos = from_api(key)
        else:
            try:
                videos = from_feed()
            except Exception as exc:
                # The public feed has been flaky (404s); fall back to the official API when we have a key.
                if not key:
                    raise
                print(f"Feed failed ({exc}); using the YouTube Data API")
                videos = from_api(key, limit=50)
    except Exception as exc:  # never block a deploy over YouTube being unreachable
        print(f"YouTube not reachable ({exc}); keeping existing video links")
        return 0

    episodes = json.loads(EPISODES_PATH.read_text("utf-8"))
    by_ep = {e["ep"]: e for e in episodes}
    added, skipped = [], 0
    for vid, title in videos:
        m = EP_IN_TITLE.search(title)
        if not vid or not m:
            skipped += 1
            continue
        e = by_ep.get(int(m.group(1)))
        if e and not e.get("youtubeId"):
            e["youtubeId"] = vid
            added.append(e["ep"])

    if added:
        EPISODES_PATH.write_text(json.dumps(episodes, ensure_ascii=False, indent=2) + "\n", "utf-8")
    total = sum(1 for e in episodes if e.get("youtubeId"))
    print(f"{len(videos)} videos read, {skipped} without an EP number; linked {len(added)} new "
          f"({', '.join(f'EP.{n}' for n in sorted(added)) or '—'}); {total} episodes have a video")
    return 0


if __name__ == "__main__":
    sys.exit(main())
