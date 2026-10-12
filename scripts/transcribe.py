#!/usr/bin/env python3
"""
Transcribe episodes to data/transcripts/EP###.json (segments with timestamps, optional speakers).

    pip install -r scripts/requirements.txt
    python scripts/transcribe.py --eps 247 248          # specific episodes
    python scripts/transcribe.py --latest 5             # newest 5 from data/audio_urls.json
    python scripts/transcribe.py --eps 247 --diarize    # + speaker labels (needs HF_TOKEN, pyannote)

Notes
- Uses faster-whisper (large-v3 by default; --model medium for speed on a laptop).
- Mandarin with English mixed in ("AI", "SOP", "B2B") — Whisper handles code-switching
  reasonably; the initial prompt nudges it toward Traditional characters, and OpenCC
  (if installed) converts any Simplified output to Taiwan Traditional.
- Diarization labels are SPEAKER_00/01…; map the one who asks most questions to "Jason".
- Audio files are cached in audio/ (git-ignored).

Output shape:
{ "ep": 247, "model": "large-v3", "segments": [ {"start": 12.3, "end": 17.9, "text": "...", "speaker": "SPEAKER_00"} ] }
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = ROOT / "audio"
OUT_DIR = ROOT / "data" / "transcripts"
AUDIO_URLS = ROOT / "data" / "audio_urls.json"
INITIAL_PROMPT = "以下是繁體中文的 Podcast 訪談《Jason好好聊》，主持人是 Jason，內容會提到 AI、SOP、品牌、創業。"


def download(ep: int, url: str) -> Path:
    AUDIO_DIR.mkdir(exist_ok=True)
    path = AUDIO_DIR / f"EP{ep:03d}.mp3"
    if not path.exists():
        print(f"  downloading EP.{ep}…")
        req = urllib.request.Request(url, headers={"User-Agent": "jason-podcast-explorer/0.1"})
        with urllib.request.urlopen(req, timeout=300) as r, open(path, "wb") as f:
            f.write(r.read())
    return path


def to_traditional(text: str) -> str:
    try:
        from opencc import OpenCC  # type: ignore
    except ImportError:
        return text
    return OpenCC("s2twp").convert(text)


def diarize(path: Path, segments: list[dict]) -> None:
    from pyannote.audio import Pipeline  # type: ignore

    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=os.environ["HF_TOKEN"])
    turns = [(t.start, t.end, spk) for t, _, spk in pipeline(str(path)).itertracks(yield_label=True)]
    for seg in segments:
        mid = (seg["start"] + seg["end"]) / 2
        seg["speaker"] = next((spk for s, e, spk in turns if s <= mid <= e), None)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--eps", type=int, nargs="*", default=[])
    ap.add_argument("--latest", type=int, default=0)
    ap.add_argument("--model", default="large-v3")
    ap.add_argument("--diarize", action="store_true")
    ap.add_argument("--force", action="store_true", help="re-transcribe even if output exists")
    args = ap.parse_args()

    if not AUDIO_URLS.exists():
        print("data/audio_urls.json missing — run scripts/fetch_episodes.py first", file=sys.stderr)
        return 1
    urls = {int(k): v for k, v in json.loads(AUDIO_URLS.read_text("utf-8")).items()}
    eps = args.eps or sorted(urls, reverse=True)[: args.latest]
    if not eps:
        print("Pass --eps N … or --latest N", file=sys.stderr)
        return 1

    from faster_whisper import WhisperModel  # type: ignore

    model = WhisperModel(args.model, device="auto", compute_type="auto")
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for ep in eps:
        out = OUT_DIR / f"EP{ep:03d}.json"
        if out.exists() and not args.force:
            print(f"EP.{ep}: exists, skipping")
            continue
        if ep not in urls:
            print(f"EP.{ep}: no audio URL")
            continue
        path = download(ep, urls[ep])
        print(f"EP.{ep}: transcribing with {args.model}…")
        segs, _info = model.transcribe(str(path), language="zh", initial_prompt=INITIAL_PROMPT, vad_filter=True)
        segments = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": to_traditional(s.text.strip())} for s in segs]
        if args.diarize:
            diarize(path, segments)
        out.write_text(json.dumps({"ep": ep, "model": args.model, "segments": segments}, ensure_ascii=False, indent=1) + "\n", "utf-8")
        print(f"EP.{ep}: {len(segments)} segments → {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
