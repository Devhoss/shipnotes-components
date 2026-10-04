#!/usr/bin/env python3
"""Original music for MATERIAL / AI states. MIT licensed.

Requires Python 3.10+, numpy, scipy, and FFmpeg on PATH.
Usage: python compose.py --ffmpeg /path/to/ffmpeg --output .
All instruments are synthesized; no samples or third-party recordings.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import re
import shutil
import subprocess

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
BPM = 128
BEAT = 60 / BPM
BAR = BEAT * 4
DURATION = BAR * 10
N = round(DURATION * SR)
RNG = np.random.default_rng(20261004)


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def timebase(seconds):
    return np.arange(round(seconds * SR)) / SR


def edges(y, attack=.002, release=.03):
    t = np.arange(len(y)) / SR
    return y * np.minimum(1, t / attack) * np.minimum(1, (len(y) / SR - t) / release)


def pluck(note, seconds=.75, velocity=1):
    t = timebase(seconds)
    f = hz(note)
    # Soft FM tine with a rapidly disappearing upper partial.
    carrier = np.sin(2 * np.pi * f * t + .65 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 15))
    body = carrier * np.exp(-t * 6.5)
    body += .17 * np.sin(2 * np.pi * f * 2.003 * t) * np.exp(-t * 12)
    return edges(body * velocity, .004, .08)


def bass(note, seconds, velocity=1):
    t = timebase(seconds)
    f = hz(note)
    phase = 2 * np.pi * f * t
    y = np.sin(phase) + .20 * np.sin(phase * 2) + .065 * np.sin(phase * 3)
    return edges(np.tanh(y * 1.35) * np.exp(-t * 2.5) * velocity, .009, .04)


def kick(velocity=1):
    t = timebase(.34)
    f = 48 + 100 * np.exp(-t * 45)
    phase = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(phase) * np.exp(-t * 14)
    click = RNG.normal(0, 1, len(t)) * np.exp(-t * 800) * .085
    return edges(np.tanh((body + click) * 1.1) * velocity, .001, .02)


def hat(opened=False):
    t = timebase(.16 if opened else .065)
    noise = RNG.normal(0, 1, len(t))
    noise = signal.sosfilt(signal.butter(2, 7000, 'highpass', fs=SR, output='sos'), noise)
    return edges(noise * np.exp(-t * (28 if opened else 90)), .001, .015)


def clap():
    t = timebase(.17)
    noise = RNG.normal(0, 1, len(t))
    noise = signal.sosfilt(signal.butter(2, [900, 6500], 'bandpass', fs=SR, output='sos'), noise)
    envelope = np.exp(-t * 42)
    for start in (.009, .018):
        envelope += .6 * np.exp(-np.maximum(0, t - start) * 100) * (t >= start)
    return edges(noise * envelope, .001, .03)


def add(bus, wave, at, amp=1, pan=0):
    start = round(at * SR)
    count = min(len(wave), len(bus) - start)
    if count <= 0:
        return
    gain = np.array([math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)])
    bus[start:start + count] += wave[:count, None] * gain[None, :] * amp


def delayed(bus):
    result = bus.copy()
    for duration, gain in [(BEAT * .75, .19), (BEAT * 1.5, .105), (BEAT * 2.25, .05)]:
        shift = round(duration * SR)
        result[shift:] += bus[:-shift, ::-1] * gain
    return result


def synthesize():
    drums = np.zeros((N, 2))
    low = np.zeros_like(drums)
    keys = np.zeros_like(drums)
    atmosphere = np.zeros_like(drums)
    t = np.arange(N) / SR
    kicks = []
    # Original eight-note motif. The drop opens the voicing into C major 7.
    motif = [76, 79, 83, 74, 76, 71, 79, 83]
    for step, note in [(0, 76), (3, 83), (6, 79)]:
        add(keys, pluck(note, 1.0), step * BEAT / 2, .075, -.4 + step * .12)

    for bar in [1, 2, 3, 4, 6, 7, 8]:
        start = bar * BAR
        drop = bar >= 6
        strength = 1.12 if drop else 1
        root = 36 if drop else (33 if bar < 3 else 40)
        for beat in [0, 1.5, 2, 3.25]:
            at = start + beat * BEAT
            add(drums, kick(), at, .48 * strength)
            kicks.append(at)
        for beat in [1, 3]:
            add(drums, clap(), start + beat * BEAT, .105 * strength, .035)
        for eighth in range(8):
            add(drums, hat(eighth in [3, 7]), start + eighth * BEAT / 2,
                (.035 if eighth % 2 == 0 else .073) * strength, -.30 if eighth % 2 == 0 else .32)
        for beat, note in [(0, root), (.75, root), (1.5, root + 7), (2, root), (2.75, root + 12), (3.25, root + 7)]:
            add(low, bass(note, BEAT * .60), start + beat * BEAT + .015, .25 * strength)
        for eighth in [0, 1, 3, 4, 6]:
            note = motif[(eighth + (bar % 2) * 2) % 8] + (0 if not drop else 5)
            add(keys, pluck(note), start + eighth * BEAT / 2, .125 * strength,
                -.48 + eighth / 7 * .96)
        # An airy chord breath, not a sustained organ bed.
        notes = [57, 64, 67, 71] if not drop else [60, 67, 71, 76]
        ct = timebase(BAR)
        breath = np.sin(np.pi * np.clip(ct / BAR, 0, 1)) ** 2
        for i, note in enumerate(notes):
            wave = (np.sin(2 * np.pi * hz(note) * ct) + .10 * np.sin(2 * np.pi * hz(note) * 2.001 * ct)) * breath
            add(atmosphere, wave, start, .032, -.6 + i * .4)

    # Eight sixteenth notes support the rapid transformation montage.
    for index, note in enumerate([79, 83, 86, 88, 83, 86, 91, 88]):
        at = 6 * BAR + index * BEAT / 4
        add(keys, pluck(note, .35), at, .11, -.7 + index / 7 * 1.4)
        add(drums, hat(), at, .055, .4 if index % 2 else -.4)

    # Breakdown: sparse glass notes and a low, accelerating air rise.
    for beat, note in [(0, 76), (1.5, 83), (2.75, 86)]:
        add(keys, pluck(note, 1.0), 5 * BAR + beat * BEAT, .040, -.35 + beat * .23)
    bt = timebase(BAR - .1)
    breath = np.minimum(1, bt / .15) * np.minimum(1, (BAR - .1 - bt) / .18)
    for index, note in enumerate([64, 71, 76]):
        wave = np.sin(2 * np.pi * hz(note) * bt + .05 * np.sin(2 * np.pi * 1.4 * bt)) * breath
        add(atmosphere, wave, 5 * BAR, .041, -.5 + index * .5)
    for at, length, amplitude in [(0.0, BAR - .05, .055), (5 * BAR, BAR - .1, .04)]:
        rt = timebase(length)
        noise = RNG.normal(0, 1, len(rt))
        noise = signal.sosfilt(signal.butter(2, [1500, 5300], 'bandpass', fs=SR, output='sos'), noise)
        sweep = np.sin(2 * np.pi * (160 * rt + 80 * rt ** 2)) * .20
        rise = (rt / length) ** 2
        add(atmosphere, edges((noise * .28 + sweep) * rise, .06, .025), at, amplitude, -.1)

    # The lockup rings out on an intentionally open voicing.
    for i, note in enumerate([72, 79, 83, 86]):
        add(keys, pluck(note, 1.875), 9 * BAR + i * .012, .060, -.5 + i / 3)

    # Sidechain melodic layers around the transient, retaining the groove.
    duck = np.ones(N)
    for at in kicks:
        start = round(at * SR)
        end = min(N, start + round(.17 * SR))
        dt = np.arange(end - start) / SR
        duck[start:end] *= 1 - .55 * np.exp(-dt * 25)
    keys = delayed(keys)
    atmosphere = delayed(atmosphere)
    melodic = keys * duck[:, None] + atmosphere * duck[:, None]
    mix = drums + low + melodic
    # Gentle bus saturation reduces crest factor without a pumping limiter.
    mix = np.tanh(mix * 1.45) / 1.45
    mix = signal.sosfilt(signal.butter(2, 27, 'highpass', fs=SR, output='sos'), mix, axis=0)
    # Silence is cut after every delay and filter.
    silence0, silence1 = round(11.15 * SR), round(11.25 * SR)
    fade = round(.010 * SR)
    mix[silence0 - fade:silence0] *= np.linspace(1, 0, fade)[:, None]
    mix[silence0:silence1] = 0
    # Keep the downbeat itself crisp with only a 1 ms anti-click ramp.
    mix[silence1:silence1 + 48] *= np.linspace(0, 1, 48)[:, None]
    mix[:240] *= np.linspace(0, 1, 240)[:, None]
    mix[-round(.55 * SR):] *= np.linspace(1, 0, round(.55 * SR))[:, None] ** 1.5
    return mix.astype(np.float32)


def run(ffmpeg, args):
    proc = subprocess.run([ffmpeg, '-hide_banner', '-nostdin', *args], text=True,
                          encoding='utf-8', errors='replace', capture_output=True, check=True)
    return proc.stderr


def measure(ffmpeg, path):
    log = run(ffmpeg, ['-i', str(path), '-af', 'loudnorm=I=-14:TP=-1.8:LRA=11:print_format=json', '-f', 'null', '-'])
    return json.loads(re.findall(r'\{[^{}]+\}', log)[-1])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'))
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if not args.ffmpeg:
        parser.error('FFmpeg is required; put it on PATH or pass --ffmpeg.')
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    raw = out / 'mix.wav'
    master = out / 'master.wav'
    wavfile.write(raw, SR, synthesize())
    first = measure(args.ffmpeg, raw)
    norm = ('loudnorm=I=-14:TP=-1.8:LRA=11:linear=true:print_format=json'
            f":measured_I={first['input_i']}:measured_TP={first['input_tp']}"
            f":measured_LRA={first['input_lra']}:measured_thresh={first['input_thresh']}"
            f":offset={first['target_offset']}")
    log = run(args.ffmpeg, ['-y', '-i', str(raw), '-af', norm, '-ar', str(SR), '-c:a', 'pcm_s24le', str(master)])
    second = json.loads(re.findall(r'\{[^{}]+\}', log)[-1])
    # Reapply exact digital silence after normalization's resampling/filtering.
    sr, pcm = wavfile.read(master)
    a, b = round(11.15 * sr), round(11.25 * sr)
    pcm[a:b] = 0
    wavfile.write(master, sr, pcm)
    final = measure(args.ffmpeg, master)
    float_pcm = pcm.astype(float) / np.iinfo(pcm.dtype).max
    def rms_db(start, end):
        section = float_pcm[round(start * sr):round(end * sr)]
        return float(20 * np.log10(max(1e-12, np.sqrt(np.mean(section ** 2)))))
    report = {
        'title': 'Material / original procedural score', 'bpm': BPM, 'duration_seconds': len(pcm) / sr,
        'sample_rate': int(sr), 'channels': int(pcm.shape[1]),
        'integrated_lufs': float(final['input_i']), 'true_peak_dbtp': float(final['input_tp']),
        'loudness_range_lu': float(final['input_lra']),
        'normalization': {'method': 'two pass FFmpeg loudnorm', 'first_pass': first, 'second_pass': second},
        'silence': {'start': 11.15, 'end': 11.25, 'samples': b - a, 'nonzero_samples': int(np.count_nonzero(pcm[a:b]))},
        'rms_dbfs': {'groove': rms_db(7.5, 9.375), 'breakdown': rms_db(9.375, 11.15),
                     'drop': rms_db(11.25, 13.125), 'tail': rms_db(16.875, 18.75)},
        'auditioned': False,
        'originality': 'Deterministic numpy/scipy synthesis. No third-party audio, recordings, or samples.'
    }
    beat_map = {'bpm': BPM, 'beats_per_bar': 4, 'beat_seconds': BEAT, 'bar_seconds': BAR,
                'duration_seconds': DURATION, 'bar_starts': [i * BAR for i in range(11)],
                'beats': [i * BEAT for i in range(41)],
                'sections': [{'name': 'intro', 'start': 0}, {'name': 'first_hit', 'start': BAR},
                             {'name': 'breakdown', 'start': BAR * 5}, {'name': 'silence', 'start': 11.15},
                             {'name': 'drop', 'start': BAR * 6}, {'name': 'logo_tail', 'start': BAR * 9}],
                'montage_cuts': [BAR * 6 + i * BEAT / 4 for i in range(9)],
                'license': 'MIT'}
    (out / 'beat-map.json').write_text(json.dumps(beat_map, indent=2) + '\n', encoding='utf-8')
    report_path = args.report or out / 'audio-report.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: report[k] for k in ['duration_seconds', 'integrated_lufs', 'true_peak_dbtp', 'silence', 'rms_dbfs']}, indent=2))


if __name__ == '__main__':
    main()
