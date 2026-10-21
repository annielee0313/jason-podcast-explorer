#!/usr/bin/env python3
"""
Choose the lines for the landing page's 抽一句 card, writing data/deck.json.

    python scripts/pick_deck.py --dry-run     # rule filter only: counts + cost estimate
    python scripts/pick_deck.py               # rule filter, then Claude picks per episode

Two steps:
A. Rules (free): keep show-note takeaways of 12–40 characters that are not interview
   questions (？, 請問, 您, 嗎, 呢) and carry no dated wording (疫情, a year, 今年, 最新…).
B. Claude reads each episode's remaining lines and picks 0–2 that work on their own:
   understandable without the episode, still true today, an insight rather than a
   heading like 「創立 X 的契機」. It only *selects* by index; the text written to
   deck.json is copied verbatim from episodes.json, never from the model.

Needs ANTHROPIC_API_KEY in .env. Re-running replaces deck.json; review the reasons there.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EPISODES_PATH = ROOT / "data" / "episodes.json"
DECK_PATH = ROOT / "data" / "deck.json"
MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")

QUESTION = re.compile(r"[？?]|請問|您|嗎|呢")
DATED = re.compile(r"疫情|(19|20)\d\d|今年|去年|明年|最新|近期|近年|目前")


def passes_rules(text: str) -> bool:
    n = len(text.replace(" ", ""))
    return 12 <= n <= 40 and not QUESTION.search(text) and not DATED.search(text)


PROMPT = """你在幫 Podcast《Jason好好聊》的網站挑選「隨手抽一句」卡片的句子。卡片會隨機顯示一句，下方標出集數與來賓，讓新聽眾被一句話吸引、點進去聽。

以下是第 {ep} 集（來賓：{guest}{org}；標題：{title}）節目說明裡的重點句，每句前面有編號：
{lines}

請從中挑 0–2 句最適合放上卡片的。好的句子：
- 單獨看也懂，不需要先聽過這集
- 是觀點、心法或洞察，而不是章節標題（例如「創立 X 的契機」「與 Y 合作」這種就不要）
- 現在讀起來仍然成立，沒有過時的時事
- 讀起來有一點意思，會讓人想知道後面怎麼說

都不適合就回傳空陣列。只能用上面的編號，不要改寫句子。"""

SCHEMA = {
    "type": "object",
    "properties": {
        "picks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "reason": {"type": "string", "description": "一句話說明為什麼適合（繁體中文）"},
                },
                "required": ["index", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["picks"],
    "additionalProperties": False,
}


def load_key() -> str | None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text("utf-8").splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"\'')
    return None


def pick(client, ep: dict, lines: list[str]) -> tuple[list[dict], tuple[int, int]]:
    prompt = PROMPT.format(
        ep=ep["ep"], guest=ep["guest"], org=f"（{ep['org']}）" if ep.get("org") else "", title=ep["title"],
        lines="\n".join(f"{i}. {t}" for i, t in enumerate(lines)),
    )
    msg = client.messages.create(
        model=MODEL, max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
    )
    if msg.stop_reason != "end_turn":
        raise RuntimeError(f"stop_reason={msg.stop_reason}")
    data = json.loads(next(b.text for b in msg.content if b.type == "text"))
    seen, out = set(), []
    for p in data["picks"]:
        i = p["index"]
        if 0 <= i < len(lines) and i not in seen:  # ignore out-of-range or repeated indices
            seen.add(i)
            out.append({"ep": ep["ep"], "text": lines[i], "reason": p["reason"]})
    return out[:2], (msg.usage.input_tokens, msg.usage.output_tokens)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    episodes = json.loads(EPISODES_PATH.read_text("utf-8"))
    candidates = {e["ep"]: [t for t in e.get("takeaways", []) if passes_rules(t)] for e in episodes}
    candidates = {k: v for k, v in candidates.items() if v}
    total = sum(len(e.get("takeaways", [])) for e in episodes)
    n_lines = sum(len(v) for v in candidates.values())
    est = len(candidates) * (650 * 4 + 150 * 20) / 1e6
    print(f"A (rules): {n_lines} of {total} lines left, from {len(candidates)} episodes · B est. ~US${est:.2f} with {MODEL}")
    if args.dry_run:
        return 0

    key = load_key()
    if not key:
        print("ANTHROPIC_API_KEY missing: add it to .env (scripts/set_api_key.sh)", file=sys.stderr)
        return 1
    import anthropic
    client = anthropic.Anthropic(api_key=key, max_retries=4)

    by_ep = {e["ep"]: e for e in episodes}
    picks: list[dict] = []
    failed: list[str] = []
    tin = tout = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(pick, client, by_ep[n], lines): n for n, lines in candidates.items()}
        for f in as_completed(futures):
            n = futures[f]
            try:
                got, (i, o) = f.result()
            except Exception as exc:
                failed.append(f"EP.{n}: {exc}")
                continue
            tin += i
            tout += o
            picks.extend(got)
            print(f"  EP.{n:>3} {len(got)} picked" + "".join(f"\n        「{p['text']}」" for p in got))

    picks.sort(key=lambda p: -p["ep"])
    DECK_PATH.write_text(json.dumps({
        "_note": "Lines for 抽一句. Verbatim show-note takeaways: rule-filtered, then selected (not rewritten) by "
                 f"{MODEL} via scripts/pick_deck.py. Delete a line here to veto it.",
        "lines": picks,
    }, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"\n{len(picks)} lines from {len({p['ep'] for p in picks})} episodes · failed {len(failed)} · "
          f"{tin:,} in / {tout:,} out ≈ US${(tin * 4 + tout * 20) / 1e6:.2f}")
    for line in failed:
        print("  failed", line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
