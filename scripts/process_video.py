#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
from pathlib import Path


def run(cmd, check=True):
    p = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        errors='replace'
    )
    stdout = p.stdout or ''
    stderr = p.stderr or ''
    if check and p.returncode != 0:
        raise RuntimeError(stderr.strip() or stdout.strip() or f'Command failed: {cmd}')
    return stdout + stderr


def parse_duration(raw):
    m = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', raw)
    if not m:
        return None
    h, mi, sec = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(sec)


def clean_ocr_text(text):
    text = re.sub(r'\s+', ' ', str(text or '')).strip()
    text = text.strip('*/|·.。,:：;；-_')
    if len(text) < 3:
        return ''
    noise = {
        'the', 'he', 'ne', 'ire', 'her', 'but', 'ways', 'provide', 'you',
        'for us', 'forus', 'onvers', 'anvers', 'nvers', 'onivers', 'stisye',
        'istisye', 'ispos', 'ispo', 'aslisyE'.lower(), 'pous', 'gota'
    }
    if text.lower() in noise:
        return ''
    if re.fullmatch(r'[A-Za-z]{3,8}', text) and text.lower() not in {
        'turn', 'photo', 'merch', 'candle', 'idea', 'birthday', 'giving', 'wanted'
    }:
        return ''
    return text


def is_important_ocr(text):
    return bool(re.search(
        r'stop|giving|same|gift|photo|merch|candle|idea|what\s*if|birthday|another|turn|wanted',
        text,
        re.I
    ))


def detect_scenes(video_path):
    try:
        from scenedetect import detect, ContentDetector
        scenes = detect(str(video_path), ContentDetector())
        return [
            {
                'start': round(scene[0].get_seconds(), 2),
                'end': round(scene[1].get_seconds(), 2),
                'duration': round(scene[1].get_seconds() - scene[0].get_seconds(), 2),
            }
            for scene in scenes[:30]
        ]
    except Exception as exc:
        return {'error': str(exc)}


def run_ocr(frames):
    try:
        from rapidocr_onnxruntime import RapidOCR
        engine = RapidOCR()
        results = []
        for frame in frames:
            result, _ = engine(frame)
            texts = []
            for item in result or []:
                if len(item) >= 2:
                    text = clean_ocr_text(item[1])
                    score = float(item[2]) if len(item) > 2 else None
                    min_score = 0.5 if is_important_ocr(text) else 0.72
                    if text and (score is None or score >= min_score):
                        texts.append({'text': text, 'score': round(score, 3) if score is not None else None})
            results.append({'frame': str(frame), 'texts': texts})
        merged = []
        seen = set()
        for row in results:
            for item in row['texts']:
                key = item['text']
                if key not in seen:
                    seen.add(key)
                    merged.append(key)
        important = [text for text in merged if is_important_ocr(text)]
        return {'frames': results, 'merged_text': merged[:80], 'important_text': important[:30]}
    except Exception as exc:
        return {'error': str(exc)}


def transcribe(audio_path, out_dir):
    try:
        from faster_whisper import WhisperModel
        model_name = os.environ.get('CONTENTOPS_WHISPER_MODEL', 'base')
        local_only = os.environ.get('CONTENTOPS_WHISPER_LOCAL_ONLY', '1') == '1'
        model = WhisperModel(model_name, device='cpu', compute_type='int8', local_files_only=local_only)
        segments_iter, info = model.transcribe(str(audio_path), beam_size=5, vad_filter=True)
        segments = []
        for seg in segments_iter:
            text = ' '.join(seg.text.split())
            if text:
                segments.append({'start': round(seg.start, 2), 'end': round(seg.end, 2), 'text': text})
        text_path = out_dir / 'transcript.txt'
        text_path.write_text('\n'.join(f"[{s['start']}-{s['end']}] {s['text']}" for s in segments), encoding='utf-8')
        return {
            'language': getattr(info, 'language', None),
            'language_probability': getattr(info, 'language_probability', None),
            'segment_count': len(segments),
            'segments': segments[:80],
            'text_path': str(text_path),
        }
    except Exception as exc:
        return {'error': str(exc)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--video', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--frames', type=int, default=8)
    args = parser.parse_args()

    video = Path(args.video).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    audio = out / 'audio.wav'
    frame_pattern = out / 'frame_%03d.jpg'

    raw = run(['ffmpeg', '-hide_banner', '-i', str(video)], check=False)
    duration = parse_duration(raw)

    audio_error = None
    try:
        run(['ffmpeg', '-y', '-hide_banner', '-i', str(video), '-vn', '-ac', '1', '-ar', '16000', str(audio)])
    except Exception as exc:
        audio_error = str(exc)

    if duration and duration > 0:
        interval = max(duration / max(args.frames, 1), 0.5)
        vf = f'fps=1/{interval},scale=720:-1'
    else:
        vf = 'fps=1,scale=720:-1'
    run(['ffmpeg', '-y', '-hide_banner', '-i', str(video), '-vf', vf, '-frames:v', str(args.frames), str(frame_pattern)])

    scenes = detect_scenes(video)
    frames = sorted(str(p) for p in out.glob('frame_*.jpg'))
    ocr = run_ocr(frames) if frames else {'error': '未抽取到关键帧'}
    transcript = transcribe(audio, out) if audio.exists() else {'error': audio_error or '未提取到音频'}

    payload = {
        'video_path': str(video),
        'duration_seconds': duration,
        'audio_path': str(audio),
        'frames': frames,
        'frame_count': len(frames),
        'scenes': scenes,
        'transcript': transcript,
        'ocr': ocr,
        'open_source_status': {
            'ffmpeg': '已接入：抽音频、抽关键帧、基础时长解析',
            'pyscenedetect': '已接入：真实镜头切分' if not isinstance(scenes, dict) else f"失败：{scenes.get('error')}",
            'faster_whisper': '已接入：真实口播转写' if 'error' not in transcript else f"失败：{transcript.get('error')}",
            'ocr': '已接入：RapidOCR 关键帧文字识别' if 'error' not in ocr else f"失败：{ocr.get('error')}",
            'llava': '未部署：暂由Gemini视觉理解关键帧和视频'
        }
    }
    print(json.dumps(payload, ensure_ascii=True))

if __name__ == '__main__':
    main()


