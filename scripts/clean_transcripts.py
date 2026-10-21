#!/usr/bin/env python3
"""
Clean raw Whisper transcripts and write compact copies the site loads.

    python scripts/clean_transcripts.py            # every data/transcripts/EP###.json
    python scripts/clean_transcripts.py --eps 247

Reads  data/transcripts/EP###.json      (raw: one segment per Whisper line)
Writes data/transcripts-web/EP###.json  { "ep", "model", "paragraphs": [[startSec, text, speaker?], ...] }
(speaker is "host"/"guest" once scripts/diarize.py has run; paragraphs also break where the speaker changes)

What it removes
- Whisper "hallucinations" over intro/outro music: stock YouTube sign-offs that
  nobody says on the show (請關注…小鈴鐺, 請不吝點贊 訂閱 轉發 打賞…, 優優獨播劇場…).
  Patterns are specific phrases, not single words: guests really do say 訂閱.
- Runaway loops: the same line repeated 3+ times in a row is kept once.
It does not correct wording. The text stays exactly what Whisper heard.

Paragraphs break on a pause (> 1.5 s) or once a paragraph passes ~45 s / 140 chars.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "transcripts"
WEB_DIR = ROOT / "data" / "transcripts-web"

HALLUCINATIONS = re.compile(
    r"小鈴鐺|請不吝點贊|打賞支援|明鏡與點點|請選擇正式播放|優優獨播劇場|YoYo Television"
    r"|字幕由|請關注.{0,12}網路|www\.jason\.com"
)
CJK = r"[　-〿一-鿿＀-￯]"


def is_noise(text: str) -> bool:
    if HALLUCINATIONS.search(text):
        return True
    # one short phrase repeated over and over inside a single segment
    m = re.fullmatch(r"(.{2,12}?)(?:\s*\1){2,}\s*", text)
    return bool(m)


def tidy(text: str) -> str:
    # half-width punctuation between CJK characters → full-width (display only)
    text = re.sub(rf"(?<={CJK}),\s*", "，", text)
    text = re.sub(rf"(?<={CJK})\?", "？", text)
    text = re.sub(rf"(?<={CJK})!", "！", text)
    return text.strip()


def clean(segments: list[dict]) -> list[dict]:
    out: list[dict] = []
    for seg in segments:
        text = tidy(seg["text"])
        if not text or is_noise(text):
            continue
        if len(out) >= 2 and out[-1]["text"] == text and out[-2]["text"] == text:
            continue  # third+ identical line in a row
        out.append({**seg, "text": text})
    return out


def paragraphs(segments: list[dict]) -> list[list]:
    paras: list[list] = []
    cur: list[dict] = []
    for seg in segments:
        if cur:
            gap = seg["start"] - cur[-1]["end"]
            length = sum(len(s["text"]) for s in cur)
            turn = seg.get("speaker") != cur[-1].get("speaker")
            if turn or gap > 1.5 or seg["start"] - cur[0]["start"] > 45 or length > 140:
                paras.append(cur)
                cur = []
        cur.append(seg)
    if cur:
        paras.append(cur)
    out = []
    for p in paras:
        row = [round(p[0]["start"]), " ".join(s["text"] for s in p)]
        if p[0].get("speaker"):
            row.append(p[0]["speaker"])
        out.append(row)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--eps", type=int, nargs="*", default=[])
    args = ap.parse_args()

    files = [RAW_DIR / f"EP{ep:03d}.json" for ep in args.eps] if args.eps else sorted(RAW_DIR.glob("EP*.json"))
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    for f in files:
        if not f.exists():
            print(f"{f.name}: missing", file=sys.stderr)
            continue
        raw = json.loads(f.read_text("utf-8"))
        kept = clean(raw["segments"])
        paras = paragraphs(kept)
        out = {"ep": raw["ep"], "model": raw.get("model"), "paragraphs": paras}
        (WEB_DIR / f.name).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", "utf-8")
        print(f"EP.{raw['ep']}: {len(raw['segments'])} → {len(kept)} segments, {len(paras)} paragraphs "
              f"(dropped {len(raw['segments']) - len(kept)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
