#!/usr/bin/env python3
"""
Transcribe episodes to data/transcripts/EP###.json (segments with timestamps, optional speakers).

    pip install -r scripts/requirements.txt
    python scripts/transcribe.py --eps 247 248          # specific episodes
    python scripts/transcribe.py --latest 5             # newest 5 from data/audio_urls.json
    python scripts/transcribe.py --eps 247 --diarize    # + speaker labels (needs HF_TOKEN, pyannote)

Notes
- Backends: mlx-whisper (Apple Silicon GPU, default on M-series Macs, ~10x faster there)
  or faster-whisper (CPU/CUDA elsewhere). --backend picks one explicitly.
- large-v3 by default; --model large-v3-turbo or medium for speed.
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
import time
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
    if path.exists() and path.stat().st_size > 0:
        return path
    # Stream to a .part file and rename when complete, so a dropped connection
    # never leaves a truncated mp3 that later runs would treat as cached.
    part = path.with_suffix(".mp3.part")
    req = urllib.request.Request(url, headers={"User-Agent": "jason-podcast-explorer/0.1"})
    for attempt in range(1, 4):
        print(f"  downloading EP.{ep} (attempt {attempt})…", flush=True)
        try:
            with urllib.request.urlopen(req, timeout=60) as r, open(part, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            part.rename(path)
            return path
        except OSError as err:
            print(f"  download failed: {err}", flush=True)
            time.sleep(10 * attempt)
    raise RuntimeError(f"EP.{ep}: download failed after 3 attempts")


def to_traditional(text: str) -> str:
    try:
        from opencc import OpenCC  # type: ignore
    except ImportError:
        return text
    return OpenCC("s2twp").convert(text)


MLX_REPOS = {
    "large-v3": "mlx-community/whisper-large-v3-mlx",
    "large-v3-turbo": "mlx-community/whisper-large-v3-turbo",
    "medium": "mlx-community/whisper-medium-mlx",
}


def default_backend() -> str:
    try:
        import mlx_whisper  # type: ignore  # noqa: F401
    except ImportError:
        return "faster"
    return "mlx"


def make_transcriber(backend: str, model_name: str):
    """Return fn(path) -> list of (start, end, text)."""
    if backend == "mlx":
        import mlx_whisper  # type: ignore
        from faster_whisper.audio import decode_audio  # type: ignore  # PyAV decode, no ffmpeg binary needed

        repo = MLX_REPOS.get(model_name, model_name)

        def run(path: Path):
            # condition_on_previous_text=False avoids Whisper's repetition loops on hour-long audio.
            result = mlx_whisper.transcribe(
                decode_audio(str(path)), path_or_hf_repo=repo, language="zh",
                initial_prompt=INITIAL_PROMPT, condition_on_previous_text=False,
            )
            return [(s["start"], s["end"], s["text"]) for s in result["segments"]]

        return run

    from faster_whisper import WhisperModel  # type: ignore

    model = WhisperModel(model_name, device="auto", compute_type="auto")

    def run(path: Path):
        segs, _info = model.transcribe(str(path), language="zh", initial_prompt=INITIAL_PROMPT, vad_filter=True)
        return [(s.start, s.end, s.text) for s in segs]

    return run


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
    ap.add_argument("--backend", choices=["mlx", "faster"], default=None, help="default: mlx if installed, else faster")
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

    backend = args.backend or default_backend()
    transcribe = make_transcriber(backend, args.model)
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
        print(f"EP.{ep}: transcribing with {args.model} ({backend})…", flush=True)
        segments = [
            {"start": round(start, 2), "end": round(end, 2), "text": to_traditional(text.strip())}
            for start, end, text in transcribe(path)
            if text.strip()
        ]
        if args.diarize:
            diarize(path, segments)
        out.write_text(json.dumps({"ep": ep, "model": args.model, "segments": segments}, ensure_ascii=False, indent=1) + "\n", "utf-8")
        print(f"EP.{ep}: {len(segments)} segments → {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
