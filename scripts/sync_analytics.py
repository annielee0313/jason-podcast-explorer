#!/usr/bin/env python3
"""
Copy yesterday's site numbers from GA4 and Microsoft Clarity into the Notion table 網站數據
(on the page 「Jason好好聊」), one row per day. Run daily by .github/workflows/analytics.yml.

    python scripts/sync_analytics.py

Secrets (GitHub Actions; never in the repo):
  NOTION_ANALYTICS_TOKEN  Notion connection allowed to read + insert + update on the page
  GA4_SERVICE_ACCOUNT     JSON key of a Google Cloud service account with Viewer access to the property
  CLARITY_API_TOKEN       Clarity → Settings → Data Export token
Not secret, in data/notion.json: "analytics" (data source ID), "ga4Property" (numeric property ID).

GA4 numbers settle over 24–48 h, so the last 3 days are re-read and their rows updated.
Clarity's export API only covers the last 24 h (10 calls a day), so it fills yesterday only.
Any source that is missing or failing is skipped; the others are still written. Numbers go to
Notion only, never into this public repo.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "data" / "notion.json").read_text("utf-8"))
NOTION = "https://api.notion.com/v1"
NOTION_VERSION = "2025-09-03"
TAIPEI = timezone(timedelta(hours=8))
WEEKDAY = "一二三四五六日"
EVENTS = {"listen_click": "收聽點擊", "company_click": "公司點擊", "chat_ask": "小幫手提問", "video_play": "影片播放"}


def http(url: str, token: str, method: str = "GET", body: dict | None = None, extra: dict | None = None) -> dict:
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", **(extra or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"{}")


# ---------- GA4 ----------

def ga4_days(days: list[date]) -> dict[str, dict]:
    raw = os.environ.get("GA4_SERVICE_ACCOUNT")
    prop = CONFIG.get("ga4Property")
    if not raw or not prop:
        print("GA4 skipped: GA4_SERVICE_ACCOUNT secret or ga4Property not set")
        return {}
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (DateRange, Dimension, Filter, FilterExpression,
                                                    Metric, OrderBy, RunReportRequest)
    from google.oauth2 import service_account

    client = BetaAnalyticsDataClient(credentials=service_account.Credentials.from_service_account_info(
        json.loads(raw), scopes=["https://www.googleapis.com/auth/analytics.readonly"]))
    span = [DateRange(start_date=min(days).isoformat(), end_date=max(days).isoformat())]

    def report(dims: list[str], metrics: list[str], filt: FilterExpression | None = None, order: str | None = None, limit: int = 0):
        req = RunReportRequest(property=f"properties/{prop}", date_ranges=span,
                               dimensions=[Dimension(name=d) for d in dims], metrics=[Metric(name=m) for m in metrics],
                               dimension_filter=filt, limit=limit or 10000,
                               order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name=order), desc=True)] if order else [])
        for row in client.run_report(req).rows:
            yield [v.value for v in row.dimension_values], [v.value for v in row.metric_values]

    out: dict[str, dict] = {d.isoformat(): {} for d in days}
    key = lambda yyyymmdd: f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:]}"

    for (d,), (users, views, secs) in report(["date"], ["activeUsers", "screenPageViews", "averageSessionDuration"]):
        out.setdefault(key(d), {}).update({"訪客": int(users), "瀏覽次數": int(views), "平均停留秒數": round(float(secs))})

    events = FilterExpression(filter=Filter(field_name="eventName", in_list_filter=Filter.InListFilter(values=list(EVENTS))))
    for row in out.values():
        row.update({name: 0 for name in EVENTS.values()})
    for (d, name), (count,) in report(["date", "eventName"], ["eventCount"], events):
        out.setdefault(key(d), {})[EVENTS[name]] = int(count)

    sources: dict[str, list[str]] = {}
    for (d, src), (n,) in report(["date", "sessionSourceMedium"], ["sessions"], order="sessions"):
        sources.setdefault(key(d), []).append(f"{src} {n}")
    pages = FilterExpression(filter=Filter(field_name="pagePath", string_filter=Filter.StringFilter(
        match_type=Filter.StringFilter.MatchType.CONTAINS, value="/episode/")))
    top: dict[str, list[str]] = {}
    for (d, path), (n,) in report(["date", "pagePath"], ["screenPageViews"], pages, order="screenPageViews"):
        m = re.search(r"/episode/(\d+)", path)
        if m:
            top.setdefault(key(d), []).append(f"EP.{m.group(1)} {n}")
    for k, row in out.items():
        row["主要來源"] = "、".join(sources.get(k, [])[:3])
        row["熱門集數"] = "、".join(top.get(k, [])[:3])
    return out


# ---------- Clarity ----------

def clarity_yesterday() -> dict:
    token = os.environ.get("CLARITY_API_TOKEN")
    if not token:
        print("Clarity skipped: CLARITY_API_TOKEN secret not set")
        return {}
    data = http("https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1", token)
    metrics = {m.get("metricName"): (m.get("information") or [{}])[0] for m in data}
    pct = lambda v: round(float(v)) if v not in (None, "") else None
    row = {
        "Clarity 工作階段": int(metrics.get("Traffic", {}).get("totalSessionCount") or 0),
        "平均捲動深度%": pct(metrics.get("ScrollDepth", {}).get("averageScrollDepth")),
        "無效點擊%": pct(metrics.get("DeadClickCount", {}).get("sessionsWithMetricPercentage")),
        "憤怒點擊%": pct(metrics.get("RageClickCount", {}).get("sessionsWithMetricPercentage")),
    }
    if not metrics.get("Traffic"):
        print("Clarity: unexpected response, metrics seen:", list(metrics))
    return {k: v for k, v in row.items() if v is not None}


# ---------- Notion ----------

def notion_props(day: str, values: dict) -> dict:
    d = date.fromisoformat(day)
    props = {"日期": {"title": [{"text": {"content": f"{day}（{WEEKDAY[d.weekday()]}）"}}]}, "日": {"date": {"start": day}}}
    for name, v in values.items():
        props[name] = {"rich_text": [{"text": {"content": v}}]} if isinstance(v, str) else {"number": v}
    return props


def write(token: str, rows: dict[str, dict]) -> None:
    ds = CONFIG["analytics"]
    extra = {"Notion-Version": NOTION_VERSION}
    for day, values in sorted(rows.items()):
        if not values:
            continue
        found = http(f"{NOTION}/data_sources/{ds}/query", token, "POST", extra=extra, body={
            "filter": {"property": "日", "date": {"equals": day}}, "page_size": 1})["results"]
        props = notion_props(day, values)
        if found:
            http(f"{NOTION}/pages/{found[0]['id']}", token, "PATCH", {"properties": props}, extra)
            print(f"{day}: updated ({', '.join(values)})")
        else:
            http(f"{NOTION}/pages", token, "POST", {"parent": {"type": "data_source_id", "data_source_id": ds},
                                                   "properties": props}, extra)
            print(f"{day}: added ({', '.join(values)})")


def main() -> int:
    token = os.environ.get("NOTION_ANALYTICS_TOKEN")
    if not token:
        print("NOTION_ANALYTICS_TOKEN not set: nothing to write to")
        return 0
    today = datetime.now(TAIPEI).date()
    days = [today - timedelta(days=n) for n in (3, 2, 1)]
    rows: dict[str, dict] = {d.isoformat(): {} for d in days}
    try:
        for k, v in ga4_days(days).items():
            rows.setdefault(k, {}).update(v)
    except Exception as err:  # one source failing must not block the other
        print(f"GA4 failed: {err}")
    try:
        rows[(today - timedelta(days=1)).isoformat()].update(clarity_yesterday())
    except (urllib.error.URLError, ValueError) as err:
        print(f"Clarity failed: {err}")
    try:
        write(token, rows)
    except urllib.error.HTTPError as err:
        print(f"Notion failed: {err} {err.read()[:300]!r}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
