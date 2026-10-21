#!/usr/bin/env python3
"""
Graba la voz del juego en www/js/voice-clips.js.

Se usa cuando el navegador del teléfono no tiene voz propia (por ejemplo, la
app de Claude en Android). Graba las frases de www/js/phrases.js, el nombre de
cada letra, las pistas de categoría y las palabras de www/js/words.js.

Requisitos: node, ffmpeg y `pip install espeakng-loader`.
Uso: python3 tools/generar-voz.py
"""
import base64, ctypes, json, os, subprocess, tempfile, wave

import espeakng_loader

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'www')

# Lista de lo que hay que grabar, leída de los mismos archivos que usa el juego.
LIST_JS = r"""
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['phrases.js', 'words.js', 'letters.js'])
  vm.runInContext(fs.readFileSync(path.join(process.argv[1], 'js', f), 'utf8'), ctx);
const clips = {};
for (const k in ctx.PHRASES) clips[k] = ctx.PHRASES[k];
for (const k in ctx.CATEGORIES) clips['cat_' + k] = ctx.CATEGORIES[k].say;
for (const l of ctx.ALPHABET) clips['L_' + l] = 'la ' + ctx.LETTER_NAMES[l];
for (const w of ctx.WORDS) clips['W_' + w.word] = w.word.toLowerCase();
console.log(JSON.stringify(clips));
"""


def main():
    clips = json.loads(subprocess.check_output(['node', '-e', LIST_JS, ROOT]))

    lib = ctypes.CDLL(espeakng_loader.get_library_path())
    callback_type = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
    samples = []

    def collect(wav, n, _events):
        if wav and n > 0:
            samples.extend(wav[:n])
        return 0

    collect_cb = callback_type(collect)
    rate = lib.espeak_Initialize(2, 0, espeakng_loader.get_data_path().encode(), 0)  # 2 = síncrono
    lib.espeak_SetSynthCallback(collect_cb)
    lib.espeak_SetVoiceByName(b'es-419')  # español latinoamericano
    lib.espeak_SetParameter(1, 135, 0)    # velocidad (palabras por minuto)
    lib.espeak_SetParameter(3, 60, 0)     # tono

    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        for key, text in clips.items():
            samples.clear()
            data = text.encode()
            lib.espeak_Synth(data, len(data) + 1, 0, 1, 0, 1, None, None)  # 1 = UTF-8
            lib.espeak_Synchronize()
            wav_path, mp3_path = os.path.join(tmp, 'c.wav'), os.path.join(tmp, 'c.mp3')
            with wave.open(wav_path, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(rate)
                w.writeframes((ctypes.c_short * len(samples))(*samples))
            # Quitamos el silencio del final y comprimimos (mono, 32 kbps).
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav_path,
                            '-af', 'areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse',
                            '-ac', '1', '-ar', '22050', '-b:a', '32k', mp3_path], check=True)
            with open(mp3_path, 'rb') as f:
                out[key] = 'data:audio/mpeg;base64,' + base64.b64encode(f.read()).decode()

    with open(os.path.join(ROOT, 'js', 'voice-clips.js'), 'w') as f:
        f.write('// Generado con tools/generar-voz.py; no editar a mano.\n')
        f.write('window.VOICE_CLIPS = ' + json.dumps(out, indent=0) + ';\n')
    print(len(out), 'grabaciones')


if __name__ == '__main__':
    main()
