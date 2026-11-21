#!/usr/bin/env python3
"""
Weekly site report for 《Jason好好聊》: drafted into Notion, approved by a person, then emailed.
Run by .github/workflows/weekly-report.yml.

    python scripts/weekly_report.py draft          # Monday 07:00 Taipei: new 週報 page, status 草稿
    python scripts/weekly_report.py send           # Monday 10:00–18:00: sends pages marked 已核准
    python scripts/weekly_report.py test [--page ID] [--out file.html]
                                                   # newest page (or ID) to GMAIL_USER only; --out writes HTML, no mail

Flow: draft reads last week (Mon–Sun, Taipei) from GA4, the 網站數據 rows (Clarity) and the ticked
items in 工作與內容, asks Claude for a 2–3 sentence summary, and creates the 週報 page. Edit it in
Notion, set 狀態 to 已核准, and the next send run mails exactly what the page says (the grey
callout at the top is the reviewer's note and is never sent; empty sections are dropped) to every
ticked row in 收件人, one copy each, then sets 狀態 to 已寄出. Nothing is sent without 已核准.

Secrets (GitHub Actions; never in the repo):
  NOTION_ANALYTICS_TOKEN  connection with read + insert + update on the page 「Jason好好聊」
  GA4_SERVICE_ACCOUNT     (draft) service account JSON with Viewer on the GA4 property
  ANTHROPIC_API_KEY       (draft, optional) the summary; without it the draft says 摘要待補
  GMAIL_USER              the sending Gmail address (also gets the "draft ready" note and test sends)
  GMAIL_APP_PASSWORD      a Gmail app password (Google account → Security → App passwords)
  REPLY_TO                optional; replies go here (defaults to GMAIL_USER)
Numbers live in Notion and in the sent mail only, never in this public repo.
"""
from __future__ import annotations

import html
import json
import os
import re
import smtplib
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from email.header import Header
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / "data" / "notion.json").read_text("utf-8"))
TEMPLATE = re.sub(r"(?s)<!--.*?-->\n?", "", (ROOT / "scripts" / "weekly_report" / "template.html").read_text("utf-8"))
NOTION = "https://api.notion.com/v1"
NOTION_VERSION = "2025-09-03"
TAIPEI = timezone(timedelta(hours=8))
MODEL = "claude-opus-5-5"
AI_SOURCES = r".*(chatgpt|openai|perplexity|copilot|gemini|bard|claude|anthropic|deepseek|grok).*"
# KPI tiles: Notion column (Chinese part) → label in the mail
KPIS = [("訪客", "訪客（每日加總）"), ("瀏覽", "頁面瀏覽"), ("收聽點擊", "收聽點擊"),
        ("小幫手提問", "小幫手提問"), ("搜尋流量", "搜尋帶來的造訪"), ("AI", "AI 帶來的造訪")]
DRAFT, APPROVED, SENT = "草稿", "已核准", "已寄出"
INK, MUTED, LINK, WASH, GROUND = "#1e2b33", "#565c6a", "#0e7c86", "#d8f1f3", "#f2f5f6"


# ---------- Notion ----------

def notion(path: str, method: str = "GET", body: dict | None = None) -> dict:
    req = urllib.request.Request(f"{NOTION}{path}", method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {os.environ['NOTION_ANALYTICS_TOKEN']}",
                                          "Notion-Version": NOTION_VERSION, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as err:
        raise SystemExit(f"Notion {method} {path} failed: {err.code} {err.read()[:400]!r}")


def columns(ds: str) -> dict[str, str]:
    """Chinese part of each column name → its full bilingual name ("訪客" → "訪客 Visitors")."""
    out = {}
    for full in notion(f"/data_sources/{ds}")["properties"]:
        out[full] = full
        out.setdefault(full.split(" ", 1)[0], full)
    return out


def query(ds: str, body: dict | None = None) -> list[dict]:
    rows, cursor = [], None
    while True:
        page = notion(f"/data_sources/{ds}/query", "POST",
                      {"page_size": 100, **(body or {}), **({"start_cursor": cursor} if cursor else {})})
        rows += page["results"]
        if not page.get("has_more"):
            return rows
        cursor = page["next_cursor"]


def value(page: dict, col: str):
    p = page["properties"].get(col) or {}
    kind = p.get("type")
    v = p.get(kind)
    if kind in ("title", "rich_text"):
        return "".join(t["plain_text"] for t in v).strip()
    if kind == "select":
        return v["name"] if v else ""
    if kind == "multi_select":
        return [o["name"] for o in v]
    if kind == "date":
        return v["start"][:10] if v else ""
    return v  # number, checkbox, email, url


def children(block_id: str) -> list[dict]:
    out, cursor = [], None
    while True:
        page = notion(f"/blocks/{block_id}/children?page_size=100" + (f"&start_cursor={cursor}" if cursor else ""))
        out += page["results"]
        if not page.get("has_more"):
            return out
        cursor = page["next_cursor"]


def text(s: str, **style) -> dict:
    return {"type": "text", "text": {"content": s}, "annotations": style} if style else {"type": "text", "text": {"content": s}}


def block(kind: str, *rich: dict, **extra) -> dict:
    return {"object": "block", "type": kind, kind: {"rich_text": list(rich), **extra}}


# ---------- dates ----------

def last_week(today: date) -> tuple[date, date, date]:
    """(Monday, Sunday) of the week before `today`'s week, and the Monday the report goes out."""
    this_monday = today - timedelta(days=today.weekday())
    start = this_monday - timedelta(days=7)
    return start, start + timedelta(days=6), this_monday


def span(a: date, b: date) -> str:
    return f"{a.month}/{a.day}–{b.month}/{b.day}"


# ---------- GA4 ----------

def ga4_week(start: date, end: date) -> dict:
    raw, prop = os.environ.get("GA4_SERVICE_ACCOUNT"), CONFIG.get("ga4Property")
    if not raw or not prop:
        print("GA4 skipped: GA4_SERVICE_ACCOUNT or ga4Property not set")
        return {}
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (DateRange, Dimension, Filter, FilterExpression,
                                                    Metric, OrderBy, RunReportRequest)
    from google.oauth2 import service_account

    client = BetaAnalyticsDataClient(credentials=service_account.Credentials.from_service_account_info(
        json.loads(raw), scopes=["https://www.googleapis.com/auth/analytics.readonly"]))

    def report(dims, metrics, filt=None, order=None, limit=0):
        req = RunReportRequest(property=f"properties/{prop}",
                               date_ranges=[DateRange(start_date=start.isoformat(), end_date=end.isoformat())],
                               dimensions=[Dimension(name=d) for d in dims], metrics=[Metric(name=m) for m in metrics],
                               dimension_filter=filt, limit=limit or 10000,
                               order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name=order), desc=True)] if order else [])
        return [([v.value for v in r.dimension_values], [v.value for v in r.metric_values]) for r in client.run_report(req).rows]

    def equals(field, val):
        return FilterExpression(filter=Filter(field_name=field, string_filter=Filter.StringFilter(value=val)))

    out = {"訪客": 0, "瀏覽": 0}
    for _, (users, views) in report(["date"], ["activeUsers", "screenPageViews"]):
        out["訪客"] += int(users)   # daily visitors summed, same as the first report and 網站數據
        out["瀏覽"] += int(views)
    events = dict((d[0], int(m[0])) for d, m in report(["eventName"], ["eventCount"], FilterExpression(
        filter=Filter(field_name="eventName", in_list_filter=Filter.InListFilter(values=["listen_click", "chat_ask", "company_click"])))))
    out["收聽點擊"] = events.get("listen_click", 0)
    out["小幫手提問"] = events.get("chat_ask", 0)
    out["公司點擊"] = events.get("company_click", 0)
    out["搜尋流量"] = sum(int(m[0]) for _, m in report(["sessionDefaultChannelGroup"], ["sessions"], equals("sessionDefaultChannelGroup", "Organic Search")))
    ai = FilterExpression(filter=Filter(field_name="sessionSource", string_filter=Filter.StringFilter(
        match_type=Filter.StringFilter.MatchType.FULL_REGEXP, value=AI_SOURCES, case_sensitive=False)))
    out["AI"] = sum(int(m[0]) for _, m in report(["sessionSource"], ["sessions"], ai))
    out["主要來源"] = [f"{d[0]} {m[0]}" for d, m in report(["sessionSourceMedium"], ["sessions"], order="sessions", limit=3)]
    pages = FilterExpression(filter=Filter(field_name="pagePath", string_filter=Filter.StringFilter(
        match_type=Filter.StringFilter.MatchType.CONTAINS, value="/episode/")))
    top = {}
    for (path,), (n,) in report(["pagePath"], ["screenPageViews"], pages, order="screenPageViews", limit=20):
        m = re.search(r"/episode/(\d+)", path)
        if m:
            top[f"EP.{m.group(1)}"] = top.get(f"EP.{m.group(1)}", 0) + int(n)
    out["熱門集數"] = [k for k, _ in sorted(top.items(), key=lambda kv: -kv[1])[:3]]
    return out


def clarity_week(start: date, end: date) -> dict:
    """Clarity has no history API; sum the daily rows sync_analytics.py wrote to 網站數據."""
    ds = CONFIG["analytics"]
    col = columns(ds)
    rows = query(ds, {"filter": {"and": [{"property": col["日"], "date": {"on_or_after": start.isoformat()}},
                                         {"property": col["日"], "date": {"on_or_before": end.isoformat()}}]}})
    sess_col = next((c for c in set(col.values()) if c.startswith("Clarity 工作階段")), None)
    sessions = [value(r, sess_col) for r in rows] if sess_col else []
    scroll = [value(r, col["平均捲動深度%"]) for r in rows] if "平均捲動深度%" in col else []
    sessions, scroll = [v for v in sessions if v is not None], [v for v in scroll if v is not None]
    return {"Clarity 工作階段": sum(sessions)} | ({"平均捲動深度%": round(sum(scroll) / len(scroll))} if scroll else {})


# ---------- work items ----------

def work_items(start: date, end: date) -> tuple[list[str], list[str]]:
    """Ticked 進週報 items: done within the week → 完成; to do / doing → 接下來."""
    ds = CONFIG["work"]
    col = columns(ds)
    done, upcoming = [], []
    for r in query(ds, {"filter": {"property": col["進週報"], "checkbox": {"equals": True}}}):
        item, status, day = value(r, col["項目"]), value(r, col["狀態"]), value(r, col["日期"])
        if not item:
            continue
        note = value(r, col["備註"]) if "備註" in col else ""
        line = f"{item}：{note}" if note else item
        if status.startswith("完成") and day and start.isoformat() <= day <= end.isoformat():
            done.append(line)
        elif status.startswith(("待辦", "進行中")):
            upcoming.append(line + ("（進行中）" if status.startswith("進行中") else ""))
    return done, upcoming


# ---------- summary ----------

def summarize(facts: dict) -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return "（摘要待補：未設定 ANTHROPIC_API_KEY）"
    import anthropic
    client = anthropic.Anthropic(api_key=key, max_retries=4)
    msg = client.messages.create(
        model=MODEL, max_tokens=1200, output_config={"effort": "low"},
        system=("你替《Jason好好聊》網站寫每週報告的開頭摘要，讀者是節目主持人與公司同事。"
                "用台灣繁體中文寫 2–3 句，語氣平實、像同事簡報，不用驚嘆號、不用行銷用語。"
                "只能使用提供的數字與項目，不可推測原因或編造；和上週比較時直接說增加或減少多少。"
                "數字很小時照實說，不要誇大。只輸出摘要本文。"),
        messages=[{"role": "user", "content": json.dumps(facts, ensure_ascii=False)}])
    return "".join(b.text for b in msg.content if b.type == "text").strip()


# ---------- mail rendering ----------

def rich_html(rich: list[dict]) -> str:
    out = []
    for t in rich:
        s = html.escape(t.get("plain_text", "")).replace("\n", "<br>")
        a = t.get("annotations", {})
        if a.get("code"):
            s = f'<code style="background:{GROUND};padding:1px 4px;">{s}</code>'
        if a.get("bold"):
            s = f"<b>{s}</b>"
        if a.get("italic"):
            s = f"<i>{s}</i>"
        if str(a.get("color", "")).startswith("gray"):
            s = f'<span style="color:{MUTED};">{s}</span>'
        href = t.get("href")
        if href and href.startswith(("https://", "http://", "mailto:")):
            s = f'<a href="{html.escape(href)}" style="color:{LINK};">{s}</a>'
        out.append(s)
    return "".join(out)


def body_html(blocks: list[dict]) -> str:
    """Notion blocks → email HTML. Callouts are reviewer notes and are skipped; a heading with
    nothing under it before the next heading or divider (an unused section) is dropped."""
    parts: list[tuple[str, str]] = []  # (kind, html)
    lst: tuple[str, list[str]] | None = None

    def flush():
        nonlocal lst
        if lst:
            tag, items = lst
            parts.append(("list", f'<{tag} style="margin:0 0 16px;padding-left:22px;">' + "".join(items) + f"</{tag}>"))
            lst = None

    for b in blocks:
        kind = b["type"]
        data = b.get(kind, {})
        rich = rich_html(data.get("rich_text", []))
        if kind in ("bulleted_list_item", "numbered_list_item", "to_do"):
            tag = "ol" if kind == "numbered_list_item" else "ul"
            if not rich:
                continue
            if lst and lst[0] != tag:
                flush()
            lst = lst or (tag, [])
            lst[1].append(f'<li style="margin:0 0 6px;">{rich}</li>')
            continue
        flush()
        if kind == "callout" or (kind == "paragraph" and not rich):
            continue
        if kind.startswith("heading_"):
            parts.append(("h", f'<h2 style="margin:24px 0 10px;font-size:18px;font-weight:600;color:{INK};">{rich}</h2>'))
        elif kind == "paragraph":
            parts.append(("p", f'<p style="margin:0 0 14px;">{rich}</p>'))
        elif kind == "quote":
            parts.append(("p", f'<p style="margin:0 0 14px;background:{WASH};padding:12px 16px;">{rich}</p>'))
        elif kind == "table":
            rows = []
            for i, row in enumerate(children(b["id"])):
                cells = row["table_row"]["cells"]
                tag = "th" if i == 0 and data.get("has_column_header") else "td"
                bg = WASH if tag == "th" else (GROUND if i % 2 == 0 else "#ffffff")
                rows.append("<tr>" + "".join(f'<{tag} style="text-align:left;padding:8px 10px;background:{bg};font-weight:{600 if tag == "th" else 400};">{rich_html(c)}</{tag}>' for c in cells) + "</tr>")
            parts.append(("table", '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;">' + "".join(rows) + "</table>"))
        elif kind == "divider":
            parts.append(("end", '<div style="height:16px;"></div>'))
    flush()
    kept = [h for i, (k, h) in enumerate(parts) if not (k == "h" and (i + 1 == len(parts) or parts[i + 1][0] in ("h", "end")))]
    if kept and kept[0].startswith("<h2"):
        kept[0] = kept[0].replace("margin:24px", "margin:0", 1)
    return "".join(kept)


def kpi_html(page: dict, previous: dict | None, col: dict[str, str]) -> str:
    tiles = []
    for key, label in KPIS:
        if key not in col:
            continue
        v = value(page, col[key])
        before = value(previous, col[key]) if previous else None
        shown = "—" if v is None else f"{v:,.0f}"
        prev = f'<div style="font-size:12px;color:{MUTED};margin-top:2px;">上週 {before:,.0f}</div>' if isinstance(before, (int, float)) else ""
        tiles.append(f'<td width="33%" valign="top" style="padding:0 8px 16px 0;"><div style="background:{GROUND};padding:14px 14px 12px;">'
                     f'<div style="font-size:28px;font-weight:300;line-height:1.2;color:{INK};">{shown}</div>'
                     f'<div style="font-size:13px;color:{MUTED};margin-top:4px;">{label}</div>{prev}</div></td>')
    return "".join("<tr>" + "".join(tiles[i:i + 3]) + "</tr>" for i in range(0, len(tiles), 3))


def render(page: dict) -> tuple[str, str]:
    ds = CONFIG["weekly"]
    col = columns(ds)
    sent_on = value(page, col["寄出日"])
    earlier = query(ds, {"filter": {"property": col["寄出日"], "date": {"before": sent_on}},
                         "sorts": [{"property": col["寄出日"], "direction": "descending"}], "page_size": 1}) if sent_on else []
    title = value(page, col["週次"])
    subject = f"Jason好好聊 網站週報｜{title}"
    fill = {"subject": html.escape(subject), "period": html.escape(value(page, col["期間"]) or ""),
            "kpis": kpi_html(page, earlier[0] if earlier else None, col), "body": body_html(children(page["id"])),
            "notion_url": html.escape(CONFIG["page"])}
    return subject, re.sub(r"\{\{(\w+)\}\}", lambda m: fill.get(m.group(1), ""), TEMPLATE)


def plain(mail_html: str) -> str:
    s = re.sub(r"(?s)<(style|head).*?</\1>", "", mail_html)
    s = re.sub(r"<br>|</(p|h2|li|tr|div)>", "\n", s)
    s = re.sub(r"<li[^>]*>", "・", s)
    return re.sub(r"\n{3,}", "\n\n", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


# ---------- Gmail ----------

def send_mail(to: list[str], subject: str, mail_html: str) -> None:
    user, password = os.environ.get("GMAIL_USER"), os.environ.get("GMAIL_APP_PASSWORD")
    if not user or not password:
        raise SystemExit("GMAIL_USER / GMAIL_APP_PASSWORD not set: nothing sent")
    reply_to = os.environ.get("REPLY_TO") or user
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=60) as smtp:
        smtp.login(user, password)
        for addr in to:  # one copy each, so recipients don't see each other
            msg = MIMEMultipart("alternative")
            msg["Subject"] = str(Header(subject, "utf-8"))
            msg["From"] = formataddr((str(Header("Jason好好聊 網站週報", "utf-8")), user))
            msg["To"] = addr
            msg["Reply-To"] = reply_to
            msg.attach(MIMEText(plain(mail_html), "plain", "utf-8"))
            msg.attach(MIMEText(mail_html, "html", "utf-8"))
            smtp.sendmail(user, [addr], msg.as_string())
            print(f"sent to {addr.split('@')[0][:2]}***@{addr.split('@')[-1]}")


# ---------- modes ----------

def draft() -> int:
    today = datetime.now(TAIPEI).date()
    start, end, send_on = last_week(today)
    ds = CONFIG["weekly"]
    col = columns(ds)
    existing = query(ds)
    if any(value(p, col["寄出日"]) == send_on.isoformat() for p in existing):
        print(f"A report for {send_on} already exists: nothing to do")
        return 0
    numbers = ga4_week(start, end)
    before = ga4_week(start - timedelta(days=7), end - timedelta(days=7)) if numbers else {}
    try:
        clarity = clarity_week(start, end)
    except SystemExit as err:
        print(f"Clarity rows skipped: {err}")
        clarity = {}
    done, upcoming = work_items(start, end)
    facts = {"期間": span(start, end), "本週": numbers, "上週": {k: v for k, v in before.items() if isinstance(v, int)},
             "Clarity": clarity, "本週完成": done, "接下來": upcoming}
    summary = summarize(facts)

    week_no = len(existing) + 1
    title = f"第 {week_no} 週 · {span(start, end)}"
    props = {col["週次"]: {"title": [text(title)]}, col["寄出日"]: {"date": {"start": send_on.isoformat()}},
             col["狀態"]: {"select": {"name": col_option(ds, col["狀態"], DRAFT)}},
             col["期間"]: {"rich_text": [text(f"{start.isoformat()} – {end.strftime('%m-%d')}")]}}
    for key, _ in KPIS:
        if key in col and isinstance(numbers.get(key), int):
            props[col[key]] = {"number": numbers[key]}

    bullets = lambda items, empty: [block("bulleted_list_item", text(s)) for s in items] or [block("paragraph", text(empty, color="gray"))]
    detail = [f"熱門集數：{'、'.join(numbers.get('熱門集數') or []) or '—'}",
              f"主要來源：{'、'.join(numbers.get('主要來源') or []) or '—'}",
              f"公司連結點擊：{numbers.get('公司點擊', '—')}"]
    if clarity.get("Clarity 工作階段") is not None:
        detail.append(f"Clarity 工作階段：{clarity['Clarity 工作階段']}" +
                      (f"，平均捲動深度 {clarity['平均捲動深度%']}%" if "平均捲動深度%" in clarity else ""))
    children_blocks = [
        {"object": "block", "type": "callout", "callout": {"icon": {"type": "emoji", "emoji": "✏️"}, "color": "gray_background", "rich_text": [
            text("草稿，尚未寄出。", bold=True),
            text(f" 數字在上方欄位（寄出時變成數字方塊）。改好內文後把狀態改成「已核准」，{send_on.month}/{send_on.day} 10:00 起自動寄給「收件人」裡勾選的人。"
                 "這個灰框不會寄出；沒有內容的段落會自動略過。")]}},
        block("paragraph", text("您好，")),
        block("paragraph", text(summary)),
        block("heading_2", text("一、本週完成")), *bullets(done, "（在「工作與內容」把完成的項目勾「進週報」，或直接在這裡寫）"),
        block("heading_2", text(f"二、數字補充（{span(start, end)}）")), *[block("bulleted_list_item", text(s)) for s in detail],
        block("heading_2", text("三、接下來")), *bullets(upcoming, "（待補）"),
        block("heading_2", text("四、需要協助")),
        {"object": "block", "type": "divider", "divider": {}},
        block("paragraph", text("Annie")),
    ]
    page = notion("/pages", "POST", {"parent": {"type": "data_source_id", "data_source_id": ds},
                                     "icon": {"type": "emoji", "emoji": "📬"}, "properties": props, "children": children_blocks})
    print(f"Draft created: {title} ({page['url']})")
    user = os.environ.get("GMAIL_USER")
    if user and os.environ.get("GMAIL_APP_PASSWORD"):
        note = (f'<p style="font-family:sans-serif;font-size:15px;line-height:1.7;">本週週報草稿已完成：<b>{html.escape(title)}</b><br>'
                f'<a href="{page["url"]}">在 Notion 打開</a>，修改後把狀態改成「已核准」，今天 10:00 起會自動寄出。</p>')
        send_mail([user], f"週報草稿已完成｜{title}", note)
    return 0


def recipients() -> list[str]:
    ds = CONFIG["recipients"]
    col = columns(ds)
    out = []
    for r in query(ds, {"filter": {"property": col["寄送"], "checkbox": {"equals": True}}}):
        addr = (value(r, col["Email"]) or "").strip()
        if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", addr) and addr.lower() not in {a.lower() for a in out}:
            out.append(addr)
    return out


def send() -> int:
    ds = CONFIG["weekly"]
    col = columns(ds)
    today = datetime.now(TAIPEI).date().isoformat()
    ready = query(ds, {"filter": {"and": [
        {"property": col["狀態"], "select": {"equals": col_option(ds, col["狀態"], APPROVED)}},
        {"property": col["寄出日"], "date": {"on_or_before": today}}]}})
    if not ready:
        print("No approved report due: nothing sent")
        return 0
    to = recipients()
    if not to:
        print("收件人 has no ticked rows with an email: nothing sent")
        return 1
    for page in ready:
        subject, mail = render(page)
        # Mark first so a crash mid-send can't mail everyone twice on the next run.
        notion(f"/pages/{page['id']}", "PATCH", {"properties": {col["狀態"]: {"select": {"name": col_option(ds, col["狀態"], SENT)}}}})
        send_mail(to, subject, mail)
        print(f"Sent 「{value(page, col['週次'])}」 to {len(to)} recipient(s)")
    return 0


def col_option(ds: str, column: str, prefix: str) -> str:
    """Full select option name for its Chinese part ("已核准" → "已核准 Approved")."""
    opts = notion(f"/data_sources/{ds}")["properties"][column]["select"]["options"]
    return next((o["name"] for o in opts if o["name"].split(" ", 1)[0] == prefix), prefix)


def test(page_id: str | None, out: str | None) -> int:
    ds = CONFIG["weekly"]
    col = columns(ds)
    if page_id:
        page = notion(f"/pages/{page_id}")
    else:
        pages = query(ds, {"sorts": [{"property": col["寄出日"], "direction": "descending"}], "page_size": 1})
        if not pages:
            print("No 週報 pages yet")
            return 1
        page = pages[0]
    subject, mail = render(page)
    if out:
        Path(out).write_text(mail, "utf-8")
        print(f"Wrote {out} ({subject})")
        return 0
    send_mail([os.environ.get("GMAIL_USER", "")], f"[測試] {subject}", mail)
    print(f"Test of 「{value(page, col['週次'])}」 sent to GMAIL_USER; status unchanged ({value(page, col['狀態'])})")
    return 0


def main() -> int:
    if not os.environ.get("NOTION_ANALYTICS_TOKEN"):
        print("NOTION_ANALYTICS_TOKEN not set")
        return 1
    args = sys.argv[1:]
    mode = args[0] if args else ""
    opt = lambda name: args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else None
    if mode == "draft":
        return draft()
    if mode == "send":
        return send()
    if mode == "test":
        return test(opt("--page") or None, opt("--out"))
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())
