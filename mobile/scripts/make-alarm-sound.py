# Uso: python scripts/make-alarm-sound.py assets/sounds/mariana_alarme.wav
# Som de alarme da Mariana, sintetizado aqui (sem amostra de terceiros).
# Dois tons alternados (A5 e D6), com harmônicos ímpares suaves e bordas
# arredondadas para não estalar; 3 séries de 4 bipes em ~3 s.
import math, struct, wave, sys
RATE = 22050
out = []
def tone(freq, dur, vol=0.6):
    n = int(RATE * dur)
    fade = int(RATE * 0.008)
    for i in range(n):
        t = i / RATE
        s = math.sin(2*math.pi*freq*t) + 0.30*math.sin(2*math.pi*3*freq*t) + 0.12*math.sin(2*math.pi*5*freq*t)
        env = min(1.0, i / fade, (n - 1 - i) / fade)
        out.append(vol * env * s / 1.42)
def silence(dur):
    out.extend([0.0] * int(RATE * dur))
for group in range(3):
    for k in range(4):
        tone(880 if k % 2 == 0 else 1174.66, 0.11)
        silence(0.04)
    silence(0.38)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, x)) * 32000)) for x in out))
print(len(out) / RATE, 's')
