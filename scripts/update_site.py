#!/usr/bin/env python3
"""
Check for new episodes and new YouTube videos; update the data when there are any.
Run by .github/workflows/update.yml on a schedule (Fridays every 30 min, otherwise every 6 h).

    python scripts/update_site.py

1. Import the SoundOn feed (scripts/fetch_episodes.py). New episodes get:
   - themes + industry from Claude (scripts/tag_episodes.py; needs ANTHROPIC_API_KEY),
   - 抽一句 candidates for just those episodes (scripts/pick_deck.py --eps …).
2. Link new YouTube uploads by their EP number (scripts/fetch_youtube.py).
Audio and video are independent: the video usually follows the audio by a few days.

Writes a one-line summary to $GITHUB_OUTPUT (`message`, empty when nothing changed) so the
workflow can commit and redeploy only when something is new. Never fails the job over a
single step: an untagged episode still appears in lists and can be tagged on the next run.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EPISODES = ROOT / "data" / "episodes.json"
CURATION = ROOT / "data" / "curation.json"


def run(*args: str) -> bool:
    print(f"$ {' '.join(args)}", flush=True)
    return subprocess.run([sys.executable, *args], cwd=ROOT).returncode == 0


def snapshot() -> dict[int, dict]:
    return {e["ep"]: e for e in json.loads(EPISODES.read_text("utf-8"))}


def main() -> int:
    before = snapshot()
    run("scripts/fetch_episodes.py")
    after = snapshot()
    new_eps = sorted(set(after) - set(before))

    if new_eps:
        if os.environ.get("ANTHROPIC_API_KEY"):
            run("scripts/tag_episodes.py", "--eps", *map(str, new_eps))
            run("scripts/pick_deck.py", "--eps", *map(str, new_eps))
        else:
            print("ANTHROPIC_API_KEY not set: new episodes stay untagged until the next run with a key")

    run("scripts/fetch_youtube.py")
    curation_before = CURATION.read_text("utf-8")
    run("scripts/sync_notion.py")
    lists_changed = CURATION.read_text("utf-8") != curation_before
    final = snapshot()
    new_videos = sorted(ep for ep, e in final.items() if e.get("youtubeId") and not before.get(ep, {}).get("youtubeId"))

    parts = []
    if new_eps:
        parts.append("Add " + ", ".join(f"EP.{n}" for n in new_eps))
    if new_videos:
        parts.append("link video " + ", ".join(f"EP.{n}" for n in new_videos))
    if lists_changed:
        parts.append("update Jason 親選 / 最多人收聽 from Notion")
    # Real content changes only (tracked files; ignores local-only folders like data/clips).
    changed = subprocess.run(["git", "status", "--porcelain", "--untracked-files=no", "data"],
                             cwd=ROOT, capture_output=True, text=True).stdout.strip()
    if changed and not parts:
        parts.append("Refresh episode data from the feed")
    message = "; ".join(parts) if changed else ""
    print(message or "Nothing new.")

    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"message={message}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
