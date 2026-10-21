#!/usr/bin/env python3
"""
Pull the two editable lists from the team's Google Sheet into data/curation.json.

    python scripts/sync_sheets.py            # used by the deploy workflow before every build

Tabs (headers in row 1, exactly as below):
  Jason親選    EP, 推薦理由, 順序, 顯示, 備註
  最多人收聽   排名, EP, 來源, 期間, 更新日期

Where the rows come from: each tab's "Publish to web → CSV" link in data/sheets.json.
If a link is empty, the local file in data/sheets/ is used instead (handy before the
sheet exists, and for testing).

Safety: every row is checked (EP exists, numbers are numbers, 顯示 is ✓/✗, …). If any
check fails, nothing is written and the site keeps the last good lists. The script
still exits 0 so a typo in the sheet never blocks a deploy; problems are printed.
"""
from __future__ import annotations

import csv
import io
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "data" / "sheets.json"
CURATION = ROOT / "data" / "curation.json"
EPISODES = ROOT / "data" / "episodes.json"
LOCAL = {"jasonPicksCsv": ROOT / "data" / "sheets" / "jason-picks.csv",
         "mostListenedCsv": ROOT / "data" / "sheets" / "most-listened.csv"}
YES = {"✓", "✔", "v", "V", "y", "Y", "yes", "是", "TRUE", "true", "1"}
NO = {"✗", "x", "X", "n", "N", "no", "否", "FALSE", "false", "0", ""}


def read_rows(key: str, url: str) -> list[dict]:
    if url:
        req = urllib.request.Request(url, headers={"User-Agent": "jason-podcast-explorer/0.1"})
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode("utf-8-sig")
    else:
        text = LOCAL[key].read_text("utf-8-sig")
    return [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in csv.DictReader(io.StringIO(text))]


def as_int(value: str, field: str, line: int, problems: list[str]) -> int | None:
    try:
        return int(value)
    except ValueError:
        problems.append(f"row {line}: {field} 「{value}」 is not a number")
        return None


def main() -> int:
    config = json.loads(CONFIG.read_text("utf-8"))
    known = {e["ep"] for e in json.loads(EPISODES.read_text("utf-8"))}
    problems: list[str] = []

    picks = []
    for i, row in enumerate(read_rows("jasonPicksCsv", config.get("jasonPicksCsv", "")), start=2):
        if not any(row.values()):
            continue
        ep = as_int(row.get("EP", ""), "EP", i, problems)
        order = as_int(row.get("順序", "") or str(i - 1), "順序", i, problems)
        shown = row.get("顯示", "✓")
        if shown not in YES | NO:
            problems.append(f"Jason親選 row {i}: 顯示 must be ✓ or ✗, got 「{shown}」")
        if ep is not None and ep not in known:
            problems.append(f"Jason親選 row {i}: EP.{ep} is not in the episode list")
        if ep is not None and order is not None and shown in YES:
            note = row.get("備註", "")
            picks.append({"ep": ep, "reason": row.get("推薦理由", ""), "order": order, "tentative": "暫定" in note})
    picks.sort(key=lambda p: p["order"])

    top = []
    for i, row in enumerate(read_rows("mostListenedCsv", config.get("mostListenedCsv", "")), start=2):
        if not any(row.values()):
            continue
        rank = as_int(row.get("排名", ""), "排名", i, problems)
        ep = as_int(row.get("EP", ""), "EP", i, problems)
        if ep is not None and ep not in known:
            problems.append(f"最多人收聽 row {i}: EP.{ep} is not in the episode list")
        if rank is not None and ep is not None:
            top.append({"rank": rank, "ep": ep, "source": row.get("來源", ""),
                        "period": row.get("期間", ""), "updated": row.get("更新日期", "")})
    top.sort(key=lambda t: t["rank"])

    if problems:
        print("Sheet NOT applied; the site keeps its last good lists. Fix these in the sheet:")
        for p in problems:
            print("  -", p)
        return 0

    curation = json.loads(CURATION.read_text("utf-8"))
    curation["jasonPicks"] = picks
    curation["mostListened"] = top
    curation.pop("mostReplayed", None)
    CURATION.write_text(json.dumps(curation, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Applied: {len(picks)} Jason picks, {len(top)} most-listened episodes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
