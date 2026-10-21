#!/usr/bin/env python3
"""
Tag untagged episodes with themes and an industry, using Claude, against the
fixed taxonomies in data/themes.json and data/facets.json.

    python scripts/tag_episodes.py --dry-run      # count + cost estimate, no API calls
    python scripts/tag_episodes.py --limit 5      # try a few first
    python scripts/tag_episodes.py                # every episode with themes == []
    python scripts/tag_episodes.py --industry-only  # after extending facets.json: fill industry == null only

Needs ANTHROPIC_API_KEY in .env (never in code or chat).

What it writes
- data/episodes.json: `themes` (1–2 ids) and `industry` (an id, or null) for
  episodes that had no themes. Episodes that already have themes are never touched,
  so hand-curated tags survive.
- data/tag_report.json: every suggestion with a one-line reason and confidence,
  plus guests that fit no industry and the label Claude would propose for them.
  The taxonomy is fixed: a new industry is a proposal for the team, not a write.

Input is only what the feed gives us (title, guest line, verbatim show-note
takeaways). Episodes without takeaways are tagged from the title alone and
marked low confidence in the report.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EPISODES_PATH = ROOT / "data" / "episodes.json"
THEMES_PATH = ROOT / "data" / "themes.json"
FACETS_PATH = ROOT / "data" / "facets.json"
REPORT_PATH = ROOT / "data" / "tag_report.json"
MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")
OTHER = "other"

PROMPT = """你在幫 Podcast《Jason好好聊》（主持人：傑思‧愛德威創辦人楊佳燊 Jason，商業訪談節目）整理單集分類。

主題（themes，選 1–2 個這集最核心的；只選真的貼切的，一個就夠時不要硬湊第二個）：
{themes}

來賓產業（industry，依來賓本人所在的產業判斷；作者依書的主題歸類）：
{industries}
- {other}: 以上都不適合。此時在 industry_proposal 寫一個 2–6 字的產業名稱建議（例如「金融／投資」）；其他情況 industry_proposal 留空字串。

只根據下面的資料判斷，不要補充資料裡沒有的事實。

單集資料
標題：{title}
來賓：{guest}{org}
節目說明重點：
{takeaways}"""


def load_key() -> str | None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return os.environ["ANTHROPIC_API_KEY"]
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text("utf-8").splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"\'')
    return None


def schema(theme_ids: list[str], industry_ids: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "themes": {"type": "array", "items": {"type": "string", "enum": theme_ids}},
            "industry": {"type": "string", "enum": industry_ids + [OTHER]},
            "industry_proposal": {"type": "string"},
            "reason": {"type": "string", "description": "一句話說明為什麼這樣分類（繁體中文）"},
            "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        },
        "required": ["themes", "industry", "industry_proposal", "reason", "confidence"],
        "additionalProperties": False,
    }


def suggest(client, ep: dict, ctx: dict) -> dict:
    prompt = PROMPT.format(
        themes=ctx["themes"], industries=ctx["industries"], other=OTHER,
        title=ep["title"], guest=ep["guest"], org=f"（{ep['org']}）" if ep.get("org") else "",
        takeaways="\n".join(f"- {t}" for t in ep.get("takeaways", [])) or "（這集沒有節目說明，只能依標題判斷）",
    )
    msg = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": ctx["schema"]}},
    )
    if msg.stop_reason != "end_turn":
        raise RuntimeError(f"stop_reason={msg.stop_reason}")
    data = json.loads(next(b.text for b in msg.content if b.type == "text"))
    themes = list(dict.fromkeys(data["themes"]))[:2]  # de-dupe, cap at 2
    if not themes:
        raise RuntimeError("no theme returned")
    data["themes"] = themes
    if not ep.get("takeaways"):
        data["confidence"] = "low"
    data["usage"] = (msg.usage.input_tokens, msg.usage.output_tokens)
    return data


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=0, help="only the newest N untagged episodes")
    ap.add_argument("--eps", type=int, nargs="*", default=[], help="specific untagged episodes")
    ap.add_argument("--industry-only", action="store_true",
                    help="re-ask only episodes with industry == null and write only their industry (themes untouched)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    themes = json.loads(THEMES_PATH.read_text("utf-8"))
    industries = json.loads(FACETS_PATH.read_text("utf-8"))["industries"]
    ctx = {
        "themes": "\n".join(f"- {t['id']}: {t['name']}" for t in themes),
        "industries": "\n".join(f"- {i['id']}: {i['name']}" for i in industries),
        "schema": schema([t["id"] for t in themes], [i["id"] for i in industries]),
    }
    episodes = json.loads(EPISODES_PATH.read_text("utf-8"))
    pending = (lambda e: e.get("industry") is None) if args.industry_only else (lambda e: not e.get("themes"))
    targets = sorted((e for e in episodes if pending(e)), key=lambda e: -e["ep"])
    if args.eps:
        targets = [e for e in targets if e["ep"] in set(args.eps)]
    if args.limit:
        targets = targets[: args.limit]

    # Rough: ~900 input + ~150 output tokens per episode at $4 / $20 per MTok (Opus 5.5).
    est = len(targets) * (900 * 4 + 150 * 20) / 1e6
    print(f"{len(targets)} {'episodes without an industry' if args.industry_only else 'untagged episodes'} · {MODEL} · est. ~US${est:.2f}")
    if args.dry_run or not targets:
        return 0

    key = load_key()
    if not key:
        print("ANTHROPIC_API_KEY missing: add ANTHROPIC_API_KEY=sk-ant-... to .env", file=sys.stderr)
        return 1
    import anthropic
    client = anthropic.Anthropic(api_key=key, max_retries=4)

    results: dict[int, dict] = {}
    failed: list[str] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(suggest, client, e, ctx): e for e in targets}
        for f in as_completed(futures):
            ep = futures[f]
            try:
                s = f.result()
            except Exception as exc:  # keep going; report at the end
                failed.append(f"EP.{ep['ep']}: {exc}")
                continue
            results[ep["ep"]] = s
            ind = s["industry"] if s["industry"] != OTHER else f"? {s['industry_proposal']}"
            print(f"  EP.{ep['ep']:>3} {'+'.join(s['themes']):<18} {ind:<14} {s['confidence']}")

    by_ep = {e["ep"]: e for e in episodes}
    for n, s in results.items():
        if not args.industry_only:
            by_ep[n]["themes"] = s["themes"]
        by_ep[n]["industry"] = None if s["industry"] == OTHER else s["industry"]
    EPISODES_PATH.write_text(json.dumps(episodes, ensure_ascii=False, indent=2) + "\n", "utf-8")

    report = json.loads(REPORT_PATH.read_text("utf-8")) if REPORT_PATH.exists() else {"episodes": {}}
    for n, s in results.items():
        e = by_ep[n]
        if args.industry_only and str(n) in report["episodes"]:
            report["episodes"][str(n)].update({k: s[k] for k in ("industry", "industry_proposal")})
            report["episodes"][str(n)]["industry_reason"] = s["reason"]
            continue
        report["episodes"][str(n)] = {
            "guest": e["guest"], "org": e["org"], "title": e["title"], "model": MODEL,
            **{k: s[k] for k in ("themes", "industry", "industry_proposal", "reason", "confidence")},
        }
    proposals: dict[str, list[int]] = {}
    for n, r in report["episodes"].items():
        if r["industry"] == OTHER and r["industry_proposal"]:
            proposals.setdefault(r["industry_proposal"], []).append(int(n))
    report["industryProposals"] = dict(sorted(proposals.items(), key=lambda kv: -len(kv[1])))
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", "utf-8")

    tin = sum(s["usage"][0] for s in results.values())
    tout = sum(s["usage"][1] for s in results.values())
    print(f"\nTagged {len(results)} · failed {len(failed)} · {tin:,} in / {tout:,} out tokens "
          f"≈ US${(tin * 4 + tout * 20) / 1e6:.2f}")
    for line in failed:
        print("  failed", line)
    if proposals:
        print("Guests outside the industry list (proposals, not applied):")
        for label, eps in report["industryProposals"].items():
            print(f"  {label}: {len(eps)} 集")
    print(f"Review {REPORT_PATH.relative_to(ROOT)}; low-confidence rows first.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
