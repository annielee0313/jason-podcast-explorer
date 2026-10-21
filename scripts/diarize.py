#!/usr/bin/env python3
"""
Speaker separation for existing transcripts: who is speaking on each line.

    python scripts/diarize.py --eps 247          # one episode
    python scripts/diarize.py                    # every transcript without speakers yet

Needs HF_TOKEN in .env (a free Hugging Face token) and access granted to the
gated model pyannote/speaker-diarization-community-1. Runs locally; audio never
leaves the machine (only the model is downloaded once).

What it does
1. Runs pyannote on audio/EP###.mp3 (expects 2 speakers; --speakers to change).
2. Gives every raw transcript segment in data/transcripts/EP###.json the speaker
   whose turn overlaps it most.
3. Works out which voice is Jason: the one who says the intro (「我是Jason」,
   「歡迎收聽」). That voice becomes "host", the other "guest".
4. Fills speakers into data/clips/EP###.json subtitles, never overwriting a
   speaker an editor already set.
Run scripts/clean_transcripts.py afterwards so the site picks the speakers up.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "transcripts"
CLIP_DIR = ROOT / "data" / "clips"
AUDIO_DIR = ROOT / "audio"
MODEL = "pyannote/speaker-diarization-community-1"
HOST_CUES = re.compile(r"我是\s*Jason|歡迎收聽|Jason好好聊")


def env_token() -> str:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text("utf-8").splitlines():
            if line.startswith("HF_TOKEN="):
                return line.split("=", 1)[1].strip()
    sys.exit("HF_TOKEN missing: add HF_TOKEN=hf_... to .env")


def overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--eps", type=int, nargs="*", default=[])
    ap.add_argument("--speakers", type=int, default=2)
    ap.add_argument("--force", action="store_true", help="redo episodes that already have speakers")
    args = ap.parse_args()

    files = [RAW_DIR / f"EP{e:03d}.json" for e in args.eps] if args.eps else sorted(RAW_DIR.glob("EP*.json"))
    todo = []
    for f in files:
        raw = json.loads(f.read_text("utf-8"))
        if raw.get("speakers") and not args.force:
            print(f"{f.stem}: already has speakers, skipping")
            continue
        todo.append((f, raw))
    if not todo:
        return 0

    import torch
    from faster_whisper.audio import decode_audio  # PyAV decode, no ffmpeg binary needed
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(MODEL, token=env_token())
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    pipeline.to(torch.device(device))

    for f, raw in todo:
        ep = raw["ep"]
        audio = AUDIO_DIR / f"EP{ep:03d}.mp3"
        if not audio.exists():
            print(f"EP.{ep}: no audio file, skipping")
            continue
        t0 = time.time()
        wav = torch.from_numpy(decode_audio(str(audio), sampling_rate=16000)).unsqueeze(0)
        out = pipeline({"waveform": wav, "sample_rate": 16000}, num_speakers=args.speakers)
        ann = getattr(out, "exclusive_speaker_diarization", None) or getattr(out, "speaker_diarization", out)
        turns = [(t.start, t.end, label) for t, _, label in ann.itertracks(yield_label=True)]

        for seg in raw["segments"]:
            best, best_ov = None, 0.0
            for s, e, label in turns:
                ov = overlap(seg["start"], seg["end"], s, e)
                if ov > best_ov:
                    best, best_ov = label, ov
            seg["spk"] = best

        # Jason is whoever says the intro lines.
        votes: dict[str, int] = {}
        for seg in raw["segments"]:
            if seg.get("spk") and HOST_CUES.search(seg["text"]):
                votes[seg["spk"]] = votes.get(seg["spk"], 0) + 1
        host = max(votes, key=votes.get) if votes else None
        if not host:
            print(f"EP.{ep}: could not tell which voice is Jason; roles left empty")
        for seg in raw["segments"]:
            seg["speaker"] = None if not (host and seg.get("spk")) else ("host" if seg["spk"] == host else "guest")
        raw["speakers"] = {"model": MODEL, "host": host, "labels": sorted({t[2] for t in turns})}
        f.write_text(json.dumps(raw, ensure_ascii=False, indent=1) + "\n", "utf-8")

        share = sum(1 for s in raw["segments"] if s["speaker"] == "host") / max(1, len(raw["segments"]))
        print(f"EP.{ep}: {len(turns)} turns, host={host}, Jason on {share:.0%} of lines, {time.time() - t0:.0f}s on {device}")

        # Fill clip subtitles, keeping anything an editor already tagged.
        clip_file = CLIP_DIR / f"EP{ep:03d}.json"
        if clip_file.exists():
            doc = json.loads(clip_file.read_text("utf-8"))
            filled = 0
            for clip in doc["clips"]:
                for sub in clip["subs"]:
                    if len(sub) > 3 and sub[3]:
                        continue
                    a, b = clip["start"] + sub[0], clip["start"] + sub[1]
                    match = max(raw["segments"], key=lambda s: overlap(a, b, s["start"], s["end"]))
                    if overlap(a, b, match["start"], match["end"]) > 0 and match.get("speaker"):
                        sub[3:] = [match["speaker"]]
                        filled += 1
                roles = [s[3] for s in clip["subs"] if len(s) > 3 and s[3]]
                if roles:
                    order = []
                    for r in roles:
                        if not order or order[-1] != r:
                            order.append(r)
                    clip["speaker"] = " → ".join("Jason" if r == "host" else "來賓" for r in order[:3]) + "（自動分辨，待校對）"
            clip_file.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", "utf-8")
            print(f"EP.{ep}: filled {filled} clip subtitle speakers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
