import ctypes
import time
import os
import urllib.request
import json

winmm = ctypes.windll.winmm

def record_mic(duration_sec=3, output_wav="scratch/real_mic_sample.wav"):
    print(f"Opening microphone to record {duration_sec} seconds of live ambient audio...")
    os.makedirs("scratch", exist_ok=True)
    
    # 1. Open waveaudio device
    res1 = winmm.mciSendStringW("open new type waveaudio alias recsound", None, 0, None)
    if res1 != 0:
        print("Failed to open waveaudio device, code:", res1)
        return False

    # 2. Set recording format to 16kHz mono 16-bit PCM (what Whisper expects)
    winmm.mciSendStringW("set recsound time format ms bitspersample 16 channels 1 samplespersec 16000 bytespersec 32000 alignment 2", None, 0, None)

    # 3. Start recording
    print("Recording START...")
    winmm.mciSendStringW("record recsound", None, 0, None)
    time.sleep(duration_sec)
    print("Recording STOP...")
    winmm.mciSendStringW("stop recsound", None, 0, None)

    # 4. Save to wav file
    winmm.mciSendStringW(f'save recsound "{os.path.abspath(output_wav)}"', None, 0, None)
    winmm.mciSendStringW("close recsound", None, 0, None)

    if os.path.exists(output_wav):
        size = os.path.getsize(output_wav)
        print(f"Recorded live mic WAV: {output_wav} ({size} bytes)")
        return True
    else:
        print("WAV file was not created.")
        return False

def transcribe_wav(wav_path):
    print(f"Sending {wav_path} to faster-whisper sidecar on port 8976...")
    t0 = time.perf_hooks_time = time.time()
    with open(wav_path, "rb") as f:
        data = f.read()

    req = urllib.request.Request("http://127.0.0.1:8976/transcribe", data=data, headers={"Content-Type": "application/octet-stream"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            t1 = time.time()
            res = json.loads(resp.read().decode("utf-8"))
            dt = round((t1 - t0) * 1000, 1)
            print(f"STT Response in {dt}ms: {res}")
            return res, dt
    except Exception as e:
        print("STT failed:", e)
        return None, 0

if __name__ == "__main__":
    ok = record_mic(3, "scratch/real_mic_sample.wav")
    if ok:
        transcribe_wav("scratch/real_mic_sample.wav")
