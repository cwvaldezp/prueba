#!/usr/bin/env python3
"""
Graba la voz del juego en www/js/voice-clips.js.

Se usa cuando el navegador del teléfono no tiene voz propia (por ejemplo, la
app de Claude en Android). Graba las frases de www/js/phrases.js, el nombre de
cada letra, las pistas de categoría y las palabras de www/js/words.js.

Voz: "carlfm" de Piper (español, dominio público). La primera vez se descarga
en tools/voces/ (unos 19 MB, no se guarda en git).

Requisitos: node, ffmpeg y `pip install piper-tts`.
Uso: python3 tools/generar-voz.py
"""
import base64, json, os, subprocess, tarfile, tempfile, urllib.request, wave

from piper import PiperVoice, SynthesisConfig

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', 'www')
VOICE = 'es-carlfm-x-low'
VOICE_URL = 'https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-%s.tar.gz' % VOICE
VOICE_DIR = os.path.join(HERE, 'voces', VOICE)
# Un poco más despacio que lo normal (1.0) para que un niño de 5 años la entienda bien.
SPEED = SynthesisConfig(length_scale=1.3)

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


def load_voice():
    model = os.path.join(VOICE_DIR, VOICE + '.onnx')
    if not os.path.exists(model):
        os.makedirs(VOICE_DIR, exist_ok=True)
        print('Descargando la voz', VOICE, '...')
        archive = os.path.join(VOICE_DIR, 'voz.tar.gz')
        urllib.request.urlretrieve(VOICE_URL, archive)
        with tarfile.open(archive) as t:
            t.extractall(VOICE_DIR, filter='data')
        os.remove(archive)
    return PiperVoice.load(model)


def main():
    clips = json.loads(subprocess.check_output(['node', '-e', LIST_JS, ROOT]))
    voice = load_voice()

    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        for key, text in clips.items():
            wav_path, mp3_path = os.path.join(tmp, 'c.wav'), os.path.join(tmp, 'c.mp3')
            with wave.open(wav_path, 'wb') as w:
                voice.synthesize_wav(text, w, syn_config=SPEED)
            # Quitamos el silencio del principio y del final y comprimimos (mono, 32 kbps).
            trim = 'silenceremove=start_periods=1:start_threshold=-50dB'
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav_path,
                            '-af', '%s,areverse,%s,areverse' % (trim, trim),
                            '-ac', '1', '-b:a', '32k', mp3_path], check=True)
            with open(mp3_path, 'rb') as f:
                out[key] = 'data:audio/mpeg;base64,' + base64.b64encode(f.read()).decode()

    with open(os.path.join(ROOT, 'js', 'voice-clips.js'), 'w') as f:
        f.write('// Generado con tools/generar-voz.py; no editar a mano.\n')
        f.write('window.VOICE_CLIPS = ' + json.dumps(out, indent=0) + ';\n')
    print(len(out), 'grabaciones')


if __name__ == '__main__':
    main()
