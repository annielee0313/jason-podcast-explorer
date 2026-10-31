#!/usr/bin/env python3
"""
Pull the two editable lists from the team's Notion page 「Jason好好聊」 into data/curation.json.

    NOTION_TOKEN=... python scripts/sync_notion.py   # run by the deploy and update workflows

Databases (property names exactly as below; IDs in data/notion.json, not secret):
  Jason 親選        集數 (title, e.g. "EP.249"), 順序, 推薦理由, 暫定
  每月最多人收聽     月份 (title, e.g. "2026-10"), 第1名, 第2名, 第3名, 來源, 備註

Every Jason 親選 row is on the site (delete a row to drop it). 每月最多人收聽 keeps one
row per month as a record; the site shows the latest month.

Safety: every row is checked (EP exists, numbers present). If any check fails, nothing is
written and the site keeps the last good lists. Without NOTION_TOKEN, or if Notion is down,
it does nothing. It always exits 0 so a typo in Notion never blocks a deploy; problems are printed.
"""
from __future__ import annotations

import json
import os
import re
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
        label = row.get("集數", "")
        if not label:
            continue  # blank row
        where = f"Jason 親選 「{label}」"
        m = re.search(r"\d+", label)
        ep = int(m.group()) if m else None
        if ep is None:
            problems.append(f"{where}: 集數 has no episode number")
        elif ep not in known:
            problems.append(f"{where}: EP.{ep} is not in the episode list")
        order = row.get("順序")
        picks.append({"ep": ep, "reason": row.get("推薦理由", ""),
                      "order": order if isinstance(order, (int, float)) else 999,
                      "tentative": bool(row.get("暫定"))})
    picks.sort(key=lambda p: (p["order"], -(p["ep"] or 0)))
    for i, p in enumerate(picks, start=1):
        p["order"] = i

    months = []
    for row in top_rows:
        month = row.get("月份", "")
        if not month:
            continue
        where = f"每月最多人收聽 「{month}」"
        if not re.fullmatch(r"\d{4}-\d{2}", month):
            problems.append(f"{where}: 月份 must look like 2026-10")
        eps = []
        for col in ("第1名", "第2名", "第3名"):
            ep = as_int(row.get(col), col, where, problems) if row.get(col) is not None else None
            if ep is not None and ep not in known:
                problems.append(f"{where}: {col} EP.{ep} is not in the episode list")
            if ep is not None:
                eps.append(ep)
        if not eps:
            problems.append(f"{where}: no episodes filled in")
        months.append({"month": month, "eps": eps, "source": row.get("來源", ""), "note": row.get("備註", "")})
    months.sort(key=lambda m: m["month"], reverse=True)
    latest = months[0] if months else None
    top = [{"rank": i, "ep": ep, "source": latest["source"], "period": latest["month"], "updated": ""}
           for i, ep in enumerate(latest["eps"], start=1)] if latest else []

    if problems:
        print("Notion NOT applied; the site keeps its last good lists. Fix these in Notion:")
        for p in problems:
            print("  -", p)
        return 0

    curation = json.loads(CURATION.read_text("utf-8"))
    if (curation.get("jasonPicks"), curation.get("mostListened"), curation.get("mostListenedByMonth")) == (picks, top, months):
        print("Notion lists unchanged")
        return 0
    curation["jasonPicks"] = picks
    curation["mostListened"] = top
    curation["mostListenedByMonth"] = months
    CURATION.write_text(json.dumps(curation, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Applied: {len(picks)} Jason picks; most listened from {len(months)} month(s), showing {latest and latest['month']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
