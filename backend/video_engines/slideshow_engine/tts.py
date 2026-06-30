"""Offline TTS using the espeak-ng shared library bundled by espeakng-loader.
Synthesizes text to a 22.05kHz mono WAV via the synth callback."""
import ctypes, wave, struct
import espeakng_loader

AUDIO_CHUNK = []

SAMPLE_RATE_MODE = 0  # play=0; we use AUDIO_OUTPUT_SYNCHRONOUS via retrieval
# espeak constants
EVENT_LIST_TERMINATED = 0
EVENT_SAMPLERATE = 1
AUDIO_OUTPUT_SYNCHRONOUS = 2  # 0x02 -> returns samples via callback

_lib = ctypes.CDLL(espeakng_loader.get_library_path())

# int espeak_Initialize(audio_output, buflength, path, options)
_lib.espeak_Initialize.restype = ctypes.c_int
_lib.espeak_Initialize.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]

SynthCallback = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short),
                                 ctypes.c_int, ctypes.c_void_p)

_lib.espeak_SetSynthCallback.argtypes = [SynthCallback]
_lib.espeak_SetVoiceByName.argtypes = [ctypes.c_char_p]
_lib.espeak_SetVoiceByName.restype = ctypes.c_int
_lib.espeak_SetParameter.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]

# espeak_Synth(text, size, position, position_type, end_position, flags, unique_id, user_data)
_lib.espeak_Synth.argtypes = [ctypes.c_char_p, ctypes.c_size_t, ctypes.c_uint,
                              ctypes.c_int, ctypes.c_uint, ctypes.c_uint,
                              ctypes.POINTER(ctypes.c_uint), ctypes.c_void_p]
_lib.espeak_Synth.restype = ctypes.c_int
_lib.espeak_Synchronize.restype = ctypes.c_int

# espeak parameters
espeakRATE=1; espeakVOLUME=2; espeakPITCH=3

_samples = []

@SynthCallback
def _cb(wav, numsamples, events):
    if wav and numsamples > 0:
        _samples.extend(wav[i] for i in range(numsamples))
    return 0

_sr = _lib.espeak_Initialize(AUDIO_OUTPUT_SYNCHRONOUS, 0,
                             espeakng_loader.get_data_path().encode(), 0)
_lib.espeak_SetSynthCallback(_cb)

def synth_to_wav(text, out_path, voice=b"en-us", rate=150, pitch=50, volume=100):
    global _samples
    _samples = []
    _lib.espeak_SetVoiceByName(voice)
    _lib.espeak_SetParameter(espeakRATE, rate, 0)
    _lib.espeak_SetParameter(espeakPITCH, pitch, 0)
    _lib.espeak_SetParameter(espeakVOLUME, volume, 0)
    b = text.encode("utf-8")
    uid = ctypes.c_uint(0)
    _lib.espeak_Synth(b, len(b)+1, 0, 0, 0, 0x0001, ctypes.byref(uid), None)
    _lib.espeak_Synchronize()
    with wave.open(out_path, "w") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(_sr)
        w.writeframes(struct.pack("<%dh" % len(_samples), *_samples))
    return _sr, len(_samples)/_sr

if __name__ == "__main__":
    sr, dur = synth_to_wav("Welcome to London, a city of history and wonder.", "/tmp/test_tts.wav")
    print(f"sample_rate={sr} duration={dur:.2f}s")
