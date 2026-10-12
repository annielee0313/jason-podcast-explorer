#!/usr/bin/env python3
"""
Suggest themes + a career-arc line for episodes, against the fixed taxonomy in data/themes.json.

    export ANTHROPIC_API_KEY=...
    python scripts/tag_episodes.py            # only episodes with themes == []
    python scripts/tag_episodes.py --all      # re-suggest everything (writes to a review file, not in place)

Untagged episodes are updated in place. With --all, suggestions go to
data/tag_suggestions.json so a human can review before merging.
Requires: pip install anthropic
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EPISODES_PATH = ROOT / "data" / "episodes.json"
THEMES_PATH = ROOT / "data" / "themes.json"
SUGGESTIONS_PATH = ROOT / "data" / "tag_suggestions.json"
MODEL = os.environ.get("CLAUDE_MODEL", "claude-sonnet-5-5")

PROMPT = """你在幫 Podcast《Jason好好聊》整理單集標籤。

主題分類（只能從這裡選，選 1–2 個最核心的）：
{taxonomy}

單集資料：
標題：{title}
來賓：{guest}（{org}）
本集重點：
{takeaways}

只回傳 JSON，不要其他文字：
{{"themes": ["<theme id>", ...], "arc": "<來賓的職涯轉折，格式「A → B」，沒有明顯轉折就 null>", "industry": "<產業，2–6 字>", "role": "<創辦人 | 二代接班 | 專業經理人 | 作者 | 醫師 | 其他>"}}"""


def suggest(client, ep: dict, taxonomy: str, valid: set[str]) -> dict:
    msg = client.messages.create(
        model=MODEL,
        max_tokens=300,
        messages=[{"role": "user", "content": PROMPT.format(
            taxonomy=taxonomy, title=ep["title"], guest=ep["guest"], org=ep["org"],
            takeaways="\n".join(f"- {t}" for t in ep.get("takeaways", [])) or "（無）",
        )}],
    )
    text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()
    text = text[text.find("{"): text.rfind("}") + 1]
    data = json.loads(text)
    data["themes"] = [t for t in data.get("themes", []) if t in valid][:2]
    return data


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="suggest for every episode; write to data/tag_suggestions.json")
    args = ap.parse_args()

    try:
        import anthropic
    except ImportError:
        print("pip install anthropic", file=sys.stderr)
        return 1

    themes = json.loads(THEMES_PATH.read_text("utf-8"))
    valid = {t["id"] for t in themes}
    taxonomy = "\n".join(f"- {t['id']}: {t['name']}" for t in themes)
    episodes = json.loads(EPISODES_PATH.read_text("utf-8"))
    client = anthropic.Anthropic()

    targets = episodes if args.all else [e for e in episodes if not e.get("themes")]
    print(f"Tagging {len(targets)} episodes with {MODEL}…")
    suggestions = {}
    for ep in targets:
        try:
            s = suggest(client, ep, taxonomy, valid)
        except Exception as exc:  # keep going; report at the end
            print(f"  EP.{ep['ep']}: failed ({exc})")
            continue
        suggestions[str(ep["ep"])] = s
        print(f"  EP.{ep['ep']}: {s['themes']} · {s.get('arc')}")
        if not args.all:
            ep["themes"] = s["themes"]
            if not ep.get("arc"):
                ep["arc"] = s.get("arc")
            ep["industry"] = s.get("industry")
            ep["role"] = s.get("role")

    if args.all:
        SUGGESTIONS_PATH.write_text(json.dumps(suggestions, ensure_ascii=False, indent=2) + "\n", "utf-8")
        print(f"Review {SUGGESTIONS_PATH.relative_to(ROOT)} before merging.")
    else:
        EPISODES_PATH.write_text(json.dumps(episodes, ensure_ascii=False, indent=2) + "\n", "utf-8")
        print("Updated data/episodes.json — spot-check the new tags.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
