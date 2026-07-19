#!/usr/bin/env python3
"""Génère un fichier beep.wav (sonnerie simple) pour les notifications Android."""
import struct
import math

def gen_wav(filename, freq=440, duration=0.5, sample_rate=44100, volume=0.5):
    num_samples = int(sample_rate * duration)
    # WAV header
    data_size = num_samples * 2  # 16-bit mono
    header = struct.pack('<4sI4s4sIHHIIHH4sI',
        b'RIFF', 36 + data_size, b'WAVE',
        b'fmt ', 16, 1, 1,  # PCM, mono
        sample_rate, sample_rate * 2, 2, 16,
        b'data', data_size
    )
    samples = b''
    for i in range(num_samples):
        # Fade in/out to avoid clicks
        t = i / sample_rate
        fade = min(t / 0.01, 1.0, (duration - t) / 0.01)
        sample = int(volume * fade * 32767 * math.sin(2 * math.pi * freq * t))
        samples += struct.pack('<h', max(-32768, min(32767, sample)))
    with open(filename, 'wb') as f:
        f.write(header + samples)
    print(f"✓ {filename} généré ({duration}s, {freq}Hz)")

gen_wav("android/app/src/main/res/raw/beep.wav", freq=880, duration=0.8)
print("✅ beep.wav créé")
