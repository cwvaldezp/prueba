#!/usr/bin/env python3
"""
Graba la voz de "Mis números" en www/numeros/js/voice-clips.js.

Se usa cuando el navegador del teléfono no tiene voz propia (por ejemplo, la
app de Claude en Android). Graba las frases y, para cada número, "tres",
"Escribe el tres" y "¡Son tres gatitos!", todo leído de www/numeros/js/numbers.js.

Voz: "carlfm" de Piper (español, dominio público), la misma de tools/generar-voz.py.
Requisitos: node, ffmpeg y `pip install piper-tts`.
Uso: python3 tools/generar-voz-numeros.py
"""
import base64, importlib.util, json, os, subprocess, tempfile, wave

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', 'www', 'numeros')

# Reutilizamos la descarga de la voz y la velocidad del grabador del ahorcado.
_spec = importlib.util.spec_from_file_location('generar_voz', os.path.join(HERE, 'generar-voz.py'))
gv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gv)

# Lista de lo que hay que grabar (los mismos textos que arma say() en js/app.js).
LIST_JS = r"""
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(process.argv[1], 'js', 'numbers.js'), 'utf8'), ctx);
const clips = {};
for (const k in ctx.PHRASES) if (k !== 'escribe') clips[k] = ctx.PHRASES[k];
ctx.NUMBER_NAMES.forEach((name, n) => {
  clips['N_' + n] = name;
  clips['ESC_' + n] = ctx.PHRASES.escribe + ' ' + name;
  if (n) clips['SON_' + n] = (n === 1 ? '¡Es ' : '¡Son ') + ctx.countPhrase(n) + '!';
});
console.log(JSON.stringify(clips));
"""


def main():
    clips = json.loads(subprocess.check_output(['node', '-e', LIST_JS, ROOT]))
    voice = gv.load_voice()

    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        for key, text in clips.items():
            wav_path, mp3_path = os.path.join(tmp, 'c.wav'), os.path.join(tmp, 'c.mp3')
            with wave.open(wav_path, 'wb') as w:
                voice.synthesize_wav(text, w, syn_config=gv.SPEED)
            # Quitamos el silencio del principio y del final y comprimimos (mono, 32 kbps).
            trim = 'silenceremove=start_periods=1:start_threshold=-50dB'
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav_path,
                            '-af', '%s,areverse,%s,areverse' % (trim, trim),
                            '-ac', '1', '-b:a', '32k', mp3_path], check=True)
            with open(mp3_path, 'rb') as f:
                out[key] = 'data:audio/mpeg;base64,' + base64.b64encode(f.read()).decode()

    with open(os.path.join(ROOT, 'js', 'voice-clips.js'), 'w') as f:
        f.write('// Generado con tools/generar-voz-numeros.py; no editar a mano.\n')
        f.write('window.VOICE_CLIPS = ' + json.dumps(out, indent=0) + ';\n')
    print(len(out), 'grabaciones')


if __name__ == '__main__':
    main()
