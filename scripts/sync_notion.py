#!/usr/bin/env python3
"""
Pull the two editable lists from the team's Notion page 「Jason好好聊」 into data/curation.json.

    NOTION_TOKEN=... python scripts/sync_notion.py   # run by the deploy and update workflows

Databases (property names exactly as below; IDs in data/notion.json, not secret):
  Jason 親選    標題, EP, 順序, 顯示, 推薦理由, 暫定, 備註
  最多人收聽     標題, 排名, EP, 顯示, 來源, 期間, 更新日期

Only rows with 顯示 checked go on the site. 標題 is for the editors; the site uses EP.

Safety: every row is checked (EP exists, numbers present). If any check fails, nothing is
written and the site keeps the last good lists. Without NOTION_TOKEN, or if Notion is down,
it does nothing. It always exits 0 so a typo in Notion never blocks a deploy; problems are printed.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "data" / "notion.json"
CURATION = ROOT / "data" / "curation.json"
EPISODES = ROOT / "data" / "episodes.json"
API = "https://api.notion.com/v1"
VERSION = "2025-09-03"


def query(token: str, data_source: str) -> list[dict]:
    rows, cursor = [], None
    while True:
        body = {"page_size": 100, **({"start_cursor": cursor} if cursor else {})}
        req = urllib.request.Request(
            f"{API}/data_sources/{data_source}/query", data=json.dumps(body).encode(), method="POST",
            headers={"Authorization": f"Bearer {token}", "Notion-Version": VERSION, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            page = json.loads(r.read())
        rows += [flatten(p["properties"]) for p in page["results"]]
        if not page.get("has_more"):
            return rows
        cursor = page["next_cursor"]


def flatten(props: dict) -> dict:
    """Notion property objects → plain values (text, number, bool, date string)."""
    out = {}
    for name, p in props.items():
        kind = p["type"]
        v = p.get(kind)
        if kind in ("title", "rich_text"):
            out[name] = "".join(t["plain_text"] for t in v).strip()
        elif kind == "select":
            out[name] = v["name"] if v else ""
        elif kind == "date":
            out[name] = v["start"][:10] if v else ""
        else:  # number, checkbox
            out[name] = v
    return out


def as_int(value, field: str, where: str, problems: list[str]) -> int | None:
    if isinstance(value, (int, float)) and float(value).is_integer():
        return int(value)
    problems.append(f"{where}: {field} is empty or not a whole number")
    return None


def main() -> int:
    token = os.environ.get("NOTION_TOKEN")
    if not token:
        print("NOTION_TOKEN not set: keeping the current Jason 親選 / 最多人收聽 lists")
        return 0
    config = json.loads(CONFIG.read_text("utf-8"))
    known = {e["ep"] for e in json.loads(EPISODES.read_text("utf-8"))}
    try:
        pick_rows = query(token, config["jasonPicks"])
        top_rows = query(token, config["mostListened"])
    except (urllib.error.URLError, KeyError, ValueError) as err:
        print(f"Notion not reachable ({err}): keeping the current lists")
        return 0

    problems: list[str] = []
    picks = []
    for row in pick_rows:
        if not row.get("顯示"):
            continue
        where = f"Jason 親選 「{row.get('標題') or '(no title)'}」"
        ep = as_int(row.get("EP"), "EP", where, problems)
        if ep is not None and ep not in known:
            problems.append(f"{where}: EP.{ep} is not in the episode list")
        order = row.get("順序")
        picks.append({"ep": ep, "reason": row.get("推薦理由", ""),
                      "order": int(order) if isinstance(order, (int, float)) else 999,
                      "tentative": bool(row.get("暫定"))})
    picks.sort(key=lambda p: (p["order"], -(p["ep"] or 0)))
    for i, p in enumerate(picks, start=1):
        p["order"] = i

    top = []
    for row in top_rows:
        if not row.get("顯示"):
            continue
        where = f"最多人收聽 「{row.get('標題') or '(no title)'}」"
        rank = as_int(row.get("排名"), "排名", where, problems)
        ep = as_int(row.get("EP"), "EP", where, problems)
        if ep is not None and ep not in known:
            problems.append(f"{where}: EP.{ep} is not in the episode list")
        top.append({"rank": rank, "ep": ep, "source": row.get("來源", ""),
                    "period": row.get("期間", ""), "updated": row.get("更新日期", "")})
    top.sort(key=lambda t: t["rank"] or 0)

    if problems:
        print("Notion NOT applied; the site keeps its last good lists. Fix these in Notion:")
        for p in problems:
            print("  -", p)
        return 0

    curation = json.loads(CURATION.read_text("utf-8"))
    if curation.get("jasonPicks") == picks and curation.get("mostListened") == top:
        print("Notion lists unchanged")
        return 0
    curation["jasonPicks"] = picks
    curation["mostListened"] = top
    CURATION.write_text(json.dumps(curation, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Applied: {len(picks)} Jason picks, {len(top)} most-listened episodes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
