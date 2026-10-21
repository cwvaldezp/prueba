(function () {
  var $ = function (id) { return document.getElementById(id); };

  // gender: chico/chica · case: upper/lower/cursive (ABC, abc o cursiva) · write: guided/free
  // voice: on/off (la voz que habla) · sfx: on/off (los efectos de sonido)
  var settings = { gender: 'chico', case: 'upper', write: 'guided', voice: 'on', sfx: 'on' };
  Object.keys(settings).forEach(function (k) {
    try { settings[k] = localStorage.getItem(k) || settings[k]; } catch (e) { /* sin almacenamiento */ }
  });

  // Selfie para la cara (data URL, sólo en este aparato).
  var photo = null;
  try { photo = localStorage.getItem('photo'); } catch (e) { /* sin almacenamiento */ }

  var state = null;     // partida actual
  var tracer = null;    // pizarra activa
  var recent = [];      // palabras usadas hace poco en modo "Yo adivino"

  /* ---------- Sonido y voz ---------- */
  var audio = null;
  function tone(freqs, dur) {
    if (settings.sfx === 'off') return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      freqs.forEach(function (f, i) {
        var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * dur;
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.2, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(audio.destination);
        o.start(t);
        o.stop(t + dur);
      });
    } catch (e) { /* sin audio */ }
  }
  var sfx = {
    good: function () { tone([660, 880], 0.12); },
    bad: function () { tone([300, 220], 0.18); },
    stroke: function () { tone([990], 0.08); },
    win: function () { tone([523, 659, 784, 1047], 0.14); },
    lose: function () { tone([440, 330, 220], 0.2); }
  };

  /*
   * Voz. say() recibe partes: claves de PHRASES ('escribe'), una letra {l: 'B'},
   * una palabra {w: 'GATO'} o una pista {cat: 'animal'}.
   * Si el navegador tiene voz en español se usa esa; si no (por ejemplo la app de
   * Claude en Android) se tocan las grabaciones de js/voice-clips.js.
   */
  var player = new Audio(), clipQueue = [], ttsBroken = false;
  player.onended = function () { playNextClip(); };

  function partText(p) {
    if (typeof p === 'string') return window.PHRASES[p];
    if (p.l) return letterName(p.l);
    if (p.w) return p.w.toLowerCase();
    return window.CATEGORIES[p.cat].say;
  }
  function partClip(p) {
    var key = typeof p === 'string' ? p : p.l ? 'L_' + p.l : p.w ? 'W_' + p.w : 'cat_' + p.cat;
    return (window.VOICE_CLIPS || {})[key];
  }
  function spanishVoice() {
    try {
      if (ttsBroken || !window.speechSynthesis) return null;
      return speechSynthesis.getVoices().filter(function (v) { return /^es/i.test(v.lang); })[0] || null;
    } catch (e) { return null; }
  }

  // Habla sólo si la voz está encendida.
  function say() {
    if (settings.voice === 'off') return;
    speak(Array.prototype.slice.call(arguments));
  }

  // Habla siempre: cuando el niño toca "Escuchar" o la pista, aunque la voz esté apagada.
  function sayAlways() {
    speak(Array.prototype.slice.call(arguments));
  }

  function speak(parts) {
    stopVoice();
    var voice = spanishVoice();
    if (voice) speakTTS(parts, voice);
    else playClips(parts);
  }

  function stopVoice() {
    clipQueue = [];
    try { player.pause(); } catch (e) { /* nada sonando */ }
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* sin voz */ }
  }

  function speakTTS(parts, voice) {
    try {
      var u = new SpeechSynthesisUtterance(parts.map(partText).join(' '));
      u.lang = voice.lang;
      u.voice = voice;
      u.rate = 0.9;
      var started = false;
      u.onstart = function () { started = true; };
      // Si la voz del navegador no arranca, usamos las grabaciones desde ahora.
      var fallback = function () {
        if (started) return;
        started = true;
        ttsBroken = true;
        try { speechSynthesis.cancel(); } catch (e) { /* sin voz */ }
        playClips(parts);
      };
      u.onerror = function (e) { if (e.error !== 'interrupted' && e.error !== 'canceled') fallback(); };
      setTimeout(fallback, 1500);
      speechSynthesis.speak(u);
    } catch (e) {
      ttsBroken = true;
      playClips(parts);
    }
  }

  function playClips(parts) {
    clipQueue = parts.map(partClip).filter(Boolean);
    playNextClip();
  }
  function playNextClip() {
    var src = clipQueue.shift();
    if (!src) return;
    player.muted = false;
    player.src = src;
    var p = player.play();
    if (p && p.catch) p.catch(function () { /* el navegador no dejó sonar */ });
  }

  // Algunos teléfonos sólo dejan sonar audio si el primer play() ocurre al tocar la pantalla.
  document.addEventListener('pointerdown', function unlock() {
    document.removeEventListener('pointerdown', unlock);
    if (spanishVoice() || player.src || !window.VOICE_CLIPS) return;
    var src = window.VOICE_CLIPS.excelente;
    player.muted = true;
    player.src = src;
    var p = player.play();
    if (p && p.then) p.then(function () { if (player.src === src) { player.pause(); player.muted = false; } }).catch(function () {});
  });

  function letterName(l) { return 'la ' + window.LETTER_NAMES[l]; }
  function isLower() { return settings.case !== 'upper'; }
  function isCursive() { return settings.case === 'cursive'; }

  // Muestra una letra: como texto (ABC, abc) o dibujada con sus trazos (cursiva, no hay fuente fiable).
  function letterHTML(l) {
    if (!isCursive()) return escapeHTML(disp(l));
    var paths = window.CURSIVE_LETTERS[l].map(function (st) {
      if (st.length === 1) return '<circle cx="' + st[0][0] + '" cy="' + st[0][1] + '" r="4" fill="currentColor"/>';
      return '<polyline points="' + st.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
    }).join('');
    return '<svg class="cursive-letter" viewBox="8 0 84 115" aria-label="' + disp(l) + '">' +
      '<g fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">' + paths + '</g></svg>';
  }
  // Cómo se muestra una letra o palabra según mayúsculas/minúsculas.
  function disp(text) { return isLower() ? text.toLowerCase() : text; }
  function escapeHTML(t) { return String(t).replace(/[&<>"]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  // La imagen secreta: un emoji o un dibujo hecho por el niño.
  function picHTML(w) { return w.image ? '<img alt="Dibujo" src="' + w.image + '">' : escapeHTML(w.emoji); }

  /* ---------- Navegación ---------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    document.querySelectorAll('.overlay').forEach(function (o) { o.classList.remove('active'); });
    if (id === 'home') renderHome();
  }
  function openOverlay(id) { $(id).classList.add('active'); }
  function closeOverlay(id) { $(id).classList.remove('active'); }

  document.querySelectorAll('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      closeTracer();
      show(b.getAttribute('data-go'));
    });
  });

  /* ---------- Inicio ---------- */
  function renderHome() {
    $('home-figure').innerHTML = window.figureSVG(window.MAX_ERRORS, settings.gender, false, photo);
    $('btn-photo').textContent = photo ? '📷 Cambiar foto' : '📷 Foto';
    $('btn-photo').classList.toggle('selected', !!photo);
    $('btn-photo-remove').hidden = !photo;
    document.querySelectorAll('.chip[data-setting]').forEach(function (c) {
      c.classList.toggle('selected', settings[c.getAttribute('data-setting')] === c.getAttribute('data-value'));
    });
    document.body.classList.toggle('lower-case', isLower());
    document.body.classList.toggle('cursive', isCursive());
    renderSound();
  }

  /* ---------- Selfie ---------- */
  // Se elige o se toma una foto, se encuadra la cara arrastrando y acercando, y se guarda
  // como un cuadrado chico (para que quepa en el almacenamiento del navegador).
  var shot = { img: null, zoom: 1, x: 0, y: 0, drag: null };
  var pc = $('photo-canvas'), pctx = pc.getContext('2d');

  $('btn-photo').addEventListener('click', function () { $('photo-input').click(); });
  $('btn-photo-again').addEventListener('click', function () { $('photo-input').click(); });
  $('btn-photo-remove').addEventListener('click', function () {
    photo = null;
    try { localStorage.removeItem('photo'); } catch (e) { /* sin almacenamiento */ }
    renderHome();
  });

  $('photo-input').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var img = new Image();
    img.onload = function () {
      shot.img = img;
      shot.zoom = 1;
      $('photo-zoom').value = 1;
      // Empezamos centrados, un poco hacia arriba (en las selfies la cara suele estar arriba).
      shot.x = 0;
      shot.y = Math.max(0, img.height - img.width) * -0.25 / Math.max(img.width, img.height);
      openOverlay('photo');
      requestAnimationFrame(function () {
        var dpr = window.devicePixelRatio || 1;
        pc.width = pc.clientWidth * dpr;
        pc.height = pc.clientHeight * dpr;
        drawShot(pctx, pc.width, true);
      });
    };
    img.src = URL.createObjectURL(file);
  });

  // Dibuja la foto en un cuadrado de lado `size`. x/y es el corrimiento en fracciones del lado.
  function drawShot(ctx, size, guide) {
    var img = shot.img, base = size / Math.min(img.width, img.height), sc = base * shot.zoom;
    var w = img.width * sc, h = img.height * sc;
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (size - w) / 2 + shot.x * size, (size - h) / 2 + shot.y * size, w, h);
    if (!guide) return;
    // Oscurecemos lo que queda fuera del círculo.
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = size * 0.012;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  pc.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { pc.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    shot.drag = [e.clientX, e.clientY, shot.x, shot.y];
  });
  pc.addEventListener('pointermove', function (e) {
    if (!shot.drag) return;
    var w = pc.clientWidth;
    shot.x = shot.drag[2] + (e.clientX - shot.drag[0]) / w;
    shot.y = shot.drag[3] + (e.clientY - shot.drag[1]) / w;
    drawShot(pctx, pc.width, true);
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    pc.addEventListener(ev, function () { shot.drag = null; });
  });
  $('photo-zoom').addEventListener('input', function () {
    shot.zoom = parseFloat(this.value);
    drawShot(pctx, pc.width, true);
  });

  $('btn-photo-ok').addEventListener('click', function () {
    // Guardamos sólo el círculo, ampliado a todo el cuadrado.
    var full = document.createElement('canvas'), size = 400;
    full.width = full.height = size;
    drawShot(full.getContext('2d'), size, false);
    var out = document.createElement('canvas'), r = size * 0.42;
    out.width = out.height = 160;
    out.getContext('2d').drawImage(full, size / 2 - r, size / 2 - r, r * 2, r * 2, 0, 0, 160, 160);
    photo = out.toDataURL('image/jpeg', 0.85);
    try { localStorage.setItem('photo', photo); } catch (e) { /* sin almacenamiento: dura sólo esta vez */ }
    closeOverlay('photo');
    renderHome();
  });

  /* ---------- Voz y sonidos encendidos/apagados ---------- */
  function saveSetting(key, value) {
    settings[key] = value;
    try { localStorage.setItem(key, value); } catch (e) { /* sin almacenamiento */ }
  }
  function renderSound() {
    document.querySelectorAll('[data-toggle]').forEach(function (b) {
      var on = settings[b.getAttribute('data-toggle')] === 'on';
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', on);
      b.querySelector('.state').textContent = on ? 'Sí' : 'No';
    });
    var any = settings.voice === 'on' || settings.sfx === 'on';
    $('btn-mute').textContent = any ? '🔊' : '🔇';
    $('btn-mute').setAttribute('aria-label', any ? 'Quitar sonido' : 'Poner sonido');
  }
  document.querySelectorAll('[data-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var key = b.getAttribute('data-toggle');
      saveSetting(key, settings[key] === 'on' ? 'off' : 'on');
      if (settings[key] === 'off' && key === 'voice') stopVoice();
      renderSound();
    });
  });
  // Botón rápido en el juego: apaga o enciende todo de una vez.
  $('btn-mute').addEventListener('click', function () {
    var value = settings.voice === 'on' || settings.sfx === 'on' ? 'off' : 'on';
    saveSetting('voice', value);
    saveSetting('sfx', value);
    if (value === 'off') stopVoice();
    renderSound();
  });
  document.querySelectorAll('.chip[data-setting]').forEach(function (c) {
    c.addEventListener('click', function () {
      var key = c.getAttribute('data-setting');
      settings[key] = c.getAttribute('data-value');
      try { localStorage.setItem(key, settings[key]); } catch (e) { /* sin almacenamiento */ }
      renderHome();
    });
  });

  $('btn-mode-pick').addEventListener('click', function () {
    grid.querySelectorAll('.name[data-word]').forEach(function (n) { n.textContent = disp(n.getAttribute('data-word')); });
    show('pick');
    say('elige');
  });
  $('btn-mode-guess').addEventListener('click', function () { startGame(randomWord(), 'guess'); });

  /* ---------- Elegir imagen ---------- */
  var grid = $('pick-grid');
  var own = document.createElement('button');
  own.className = 'draw-own';
  own.innerHTML = '<span class="emoji">✏️</span><span class="name">DIBUJAR</span>';
  own.addEventListener('click', openDraw);
  grid.appendChild(own);
  // Imágenes agrupadas por categoría, con un título por grupo.
  Object.keys(window.CATEGORIES).forEach(function (k) {
    var c = window.CATEGORIES[k], words = window.WORDS.filter(function (w) { return w.cat === k; });
    if (!words.length) return;
    var h = document.createElement('h3');
    h.className = 'pick-group';
    h.textContent = c.icon + ' ' + c.name;
    grid.appendChild(h);
    words.forEach(function (w) {
      var b = document.createElement('button');
      b.innerHTML = '<span class="emoji">' + w.emoji + '</span><span class="name" data-word="' + w.word + '">' + disp(w.word) + '</span>';
      b.addEventListener('click', function () { startGame(w, 'pick'); });
      grid.appendChild(b);
    });
  });

  function randomWord() {
    var options = window.WORDS.filter(function (w) { return recent.indexOf(w.word) === -1; });
    var w = options[Math.floor(Math.random() * options.length)];
    recent.push(w.word);
    if (recent.length > Math.min(10, window.WORDS.length - 1)) recent.shift();
    return w;
  }

  /* ---------- Partida ---------- */
  // mode 'pick': el niño eligió la imagen y otro adivina.
  // mode 'guess': el juego eligió la imagen y el niño adivina.
  function startGame(w, mode) {
    state = { word: w.word, pic: picHTML(w), cat: w.cat, mode: mode, letters: w.word.split(''), found: {}, used: {}, errors: 0, over: false };
    show('game');

    var peek = $('btn-peek');
    $('peek-emoji').innerHTML = state.pic;
    peek.classList.toggle('hidden', mode !== 'pick');
    $('game-hint').textContent = mode === 'pick'
      ? 'El otro jugador dice una letra y tú la tocas 👇'
      : '¿Qué letra crees que tiene? Tócala 👇';

    $('slots').innerHTML = state.letters.map(function (_, i) { return '<div class="slot" data-i="' + i + '"></div>'; }).join('');
    $('misses').innerHTML = '';

    var kb = $('keyboard');
    kb.innerHTML = '';
    window.ALPHABET.forEach(function (l) {
      var b = document.createElement('button');
      b.textContent = l;
      b.setAttribute('data-letter', l);
      b.addEventListener('click', function () { onLetter(l); });
      kb.appendChild(b);
    });
    renderFigure(false);
    // Pista: qué tipo de cosa es (animal, fruta…), para el que adivina.
    var cat = window.CATEGORIES[w.cat], pill = $('hint-cat');
    pill.hidden = !cat;
    if (cat) pill.innerHTML = '<span class="cat-label">Pista:</span> ' + cat.icon + ' ' + cat.label;
    var intro = mode === 'pick' ? 'empieza_juego' : 'adivina';
    if (cat) say(intro, { cat: w.cat });
    else say(intro);
  }

  $('hint-cat').addEventListener('click', function () {
    if (state && state.cat) sayAlways({ cat: state.cat });
  });

  function renderFigure(fallen) {
    $('figure').innerHTML = window.figureSVG(state.errors, settings.gender, fallen, photo);
    var left = window.MAX_ERRORS - state.errors;
    $('lives').textContent = '❤️ ' + left;
  }

  // Mantener presionado para ver la imagen secreta.
  (function () {
    var peek = $('btn-peek');
    var on = function (e) { e.preventDefault(); peek.classList.add('showing'); };
    var off = function () { peek.classList.remove('showing'); };
    peek.addEventListener('pointerdown', on);
    peek.addEventListener('pointerup', off);
    peek.addEventListener('pointerleave', off);
    peek.addEventListener('pointercancel', off);
  })();

  function onLetter(l) {
    if (!state || state.over || state.used[l]) return;
    if (state.mode === 'pick') askChild(l);
    else resolveLetter(l);
  }

  /* El niño decide si la letra está en su palabra. */
  function askChild(l) {
    $('ask-emoji').innerHTML = state.pic;
    $('ask-letter').innerHTML = letterHTML(l);
    $('ask-question').textContent = '¿Tu palabra tiene la letra ' + disp(l) + '?';
    $('ask-feedback').textContent = '';
    $('btn-yes').disabled = $('btn-no').disabled = false;
    openOverlay('ask');
    say('tiene', { l: l });

    var answer = function (saysYes) {
      $('btn-yes').disabled = $('btn-no').disabled = true;
      var really = state.letters.indexOf(l) !== -1;
      var fb = $('ask-feedback');
      if (saysYes === really) {
        fb.style.color = 'var(--yes)';
        fb.textContent = really ? '¡Muy bien! Ahora escríbela ✏️' : '¡Correcto! No está, pero igual escríbela ✏️';
        setTimeout(function () { closeOverlay('ask'); resolveLetter(l); }, 900);
      } else {
        // Corrección suave: le ayudamos a revisar su palabra.
        fb.style.color = 'var(--primary)';
        fb.textContent = really ? '¡Mira bien! 👀 Sí está en tu palabra' : 'Mmm… 🤔 Tu palabra no tiene la ' + disp(l);
        say(really ? 'mira_si' : 'mira_no');
        setTimeout(function () { closeOverlay('ask'); resolveLetter(l); }, 2400);
      }
    };
    $('btn-yes').onclick = function () { answer(true); };
    $('btn-no').onclick = function () { answer(false); };
  }

  // Toda letra se escribe a mano, esté o no en la palabra, para practicarlas todas.
  function resolveLetter(l) {
    state.used[l] = true;
    var key = document.querySelector('[data-letter="' + l + '"]');
    key.disabled = true;
    var found = state.letters.indexOf(l) !== -1;
    key.classList.add(found ? 'good' : 'bad');
    (found ? sfx.good : sfx.bad)();
    openTracer(l, found);
  }

  // Letra que no estaba: va abajo con una X roja y se dibuja una parte más.
  function placeMiss(l, img) {
    var m = document.createElement('div');
    m.className = 'miss';
    m.innerHTML = '<img alt="' + disp(l) + '" src="' + img + '">';
    $('misses').appendChild(m);
    state.errors++;
    sfx.bad();
    renderFigure(false);
    if (state.errors >= window.MAX_ERRORS) lose();
  }

  /* ---------- Escribir la letra ---------- */
  function openTracer(l, found) {
    var free = settings.write === 'free';
    openOverlay('trace');
    $('trace-model').innerHTML = letterHTML(l);
    var name = 'la ' + disp(l);
    var intro = found ? '' : window.PHRASES.no_esta + ' ';
    var spoken = (found ? [] : ['no_esta']).concat(['escribe', { l: l }]);
    if (free) {
      setTraceMsg(intro + 'Escribe ' + name + ' y toca Listo ✅');
      say.apply(null, spoken);
    } else {
      setTraceMsg(intro + 'Escribe ' + name + '. Empieza en el punto verde 🟢');
      say.apply(null, spoken.concat(['punto_verde']));
    }

    var canvas = $('trace-canvas');
    var total = window.letterSet(settings.case)[l].length;
    // Esperamos a que la ventana tenga tamaño antes de crear la pizarra.
    requestAnimationFrame(function () {
      tracer = new window.Tracer(canvas, l, {
        style: settings.case,
        free: free,
        onStroke: function (n) {
          sfx.stroke();
          setTraceMsg('¡Bien! Ahora el trazo ' + (n + 1) + ' de ' + total + ' 🟢');
        },
        onRetry: function (why) {
          setTraceMsg({
            start: 'Empieza en el punto verde 🟢 Inténtalo otra vez',
            short: '¡Casi! Llega hasta la flecha ➡️ Inténtalo otra vez',
            scribble: '¡Sin garabatos! Hazlo una sola vez, despacito 🐢'
          }[why] || '¡Casi! Sigue el dedito 👆 y vuelve a intentarlo');
          say('casi');
          shakeCanvas();
        },
        onDone: function (img) {
          sfx.win();
          setTraceMsg('¡Excelente! 🌟');
          say('excelente');
          setTimeout(function () {
            closeTracer();
            if (found) placeLetter(l, img);
            else placeMiss(l, img);
          }, 1100);
        }
      });
      updateTraceButtons();
    });
    updateTraceButtons(free);
  }

  // En modo libre se ven "Ayuda" y "Listo"; con caminito no hacen falta.
  function updateTraceButtons(free) {
    if (free === undefined) free = !!(tracer && tracer.free);
    $('btn-trace-help').hidden = !free;
    $('btn-trace-done').hidden = !free;
  }

  function shakeCanvas() {
    var canvas = $('trace-canvas');
    canvas.classList.remove('shake');
    void canvas.offsetWidth;
    canvas.classList.add('shake');
  }

  function showTraceGuide(msg) {
    tracer.showGuide();
    updateTraceButtons();
    setTraceMsg(msg);
    say('te_ayudo');
  }

  $('btn-trace-done').addEventListener('click', function () {
    if (!tracer || !tracer.free || tracer.finished) return;
    if (!tracer.pending.length) {
      setTraceMsg('Primero escribe la letra con tu dedo ✏️');
      return;
    }
    if (!tracer.checkFree()) {
      shakeCanvas();
      showTraceGuide(tracer.lastProblem === 'scribble'
        ? '¡Eso parece un garabato! 🙂 Vamos con el caminito: empieza en el punto verde 🟢'
        : '¡Casi! Ahora con el caminito: empieza en el punto verde 🟢');
    }
  });
  $('btn-trace-help').addEventListener('click', function () {
    if (tracer && tracer.free) showTraceGuide('Sigue el dedito 👆 Empieza en el punto verde 🟢');
  });

  function setTraceMsg(t) { $('trace-msg').textContent = t; }

  function closeTracer() {
    if (tracer) { tracer.destroy(); tracer = null; }
    closeOverlay('trace');
  }

  $('btn-trace-reset').addEventListener('click', function () {
    if (!tracer) return;
    tracer.reset();
    setTraceMsg(tracer.free ? 'Escribe la letra y toca Listo ✅' : 'Empieza en el punto verde 🟢');
  });
  $('btn-trace-say').addEventListener('click', function () {
    if (tracer) sayAlways('escribe', { l: tracer.letter });
  });

  function placeLetter(l, img) {
    state.letters.forEach(function (c, i) {
      if (c !== l) return;
      state.found[i] = true;
      var slot = document.querySelector('.slot[data-i="' + i + '"]');
      slot.innerHTML = '<img alt="' + disp(l) + '" src="' + img + '">';
    });
    if (Object.keys(state.found).length === state.letters.length) win();
  }

  /* ---------- Fin de partida ---------- */
  function win() {
    state.over = true;
    sfx.win();
    confetti();
    var pick = state.mode === 'pick';
    showEnd(state.pic, pick ? '¡Adivinaron tu palabra! 🎉' : '¡Ganaste! 🎉',
      pick ? '¡Y tú escribiste todas las letras!' : '¡Lo hiciste muy bien!');
    say(pick ? 'adivinaron' : 'ganaste_es', { w: state.word });
  }

  function lose() {
    state.over = true;
    renderFigure(true);
    sfx.lose();
    // Mostramos las letras que faltaban.
    state.letters.forEach(function (c, i) {
      if (state.found[i]) return;
      var slot = document.querySelector('.slot[data-i="' + i + '"]');
      slot.classList.add('reveal');
      slot.innerHTML = '<span>' + letterHTML(c) + '</span>';
    });
    var pick = state.mode === 'pick';
    setTimeout(function () {
      if (pick) confetti();
      showEnd(pick ? '🏆' : '💦', pick ? '¡Ganaste tú! 🏆' : '¡Se cayó al agua! 💦',
        pick ? 'No adivinaron tu palabra secreta:' : 'La palabra era:');
      if (pick) say('ganaste_no'); else say('cayo', { w: state.word });
    }, 1800);
  }

  function showEnd(pic, title, text) {
    $('end-emoji').innerHTML = pic;
    $('end-title').textContent = title;
    $('end-text').textContent = text;
    $('end-word').innerHTML = state.pic + ' ' + escapeHTML(disp(state.word));
    openOverlay('end');
  }

  $('btn-again').addEventListener('click', function () {
    if (state && state.mode === 'guess') startGame(randomWord(), 'guess');
    else show('pick');
  });

  /* ---------- Dibujar la imagen secreta ---------- */
  var COLORS = ['#2d2a4a', '#e74c3c', '#ff9f43', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#8d6e63', '#ff6fa8'];
  var draw = { color: COLORS[0], lines: [], current: null };
  var dc = $('draw-canvas'), dctx = dc.getContext('2d');

  COLORS.forEach(function (c, i) {
    var b = document.createElement('button');
    b.style.background = c;
    b.setAttribute('aria-label', 'Color ' + (i + 1));
    if (i === 0) b.classList.add('selected');
    b.addEventListener('click', function () {
      draw.color = c;
      $('palette').querySelectorAll('button').forEach(function (x) { x.classList.toggle('selected', x === b); });
    });
    $('palette').appendChild(b);
  });

  function openDraw() {
    draw.lines = [];
    show('draw');
    say('dibuja');
    requestAnimationFrame(sizeDraw);
  }

  function sizeDraw() {
    var dpr = window.devicePixelRatio || 1;
    dc.width = dc.clientWidth * dpr;
    dc.height = dc.clientHeight * dpr;
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderDraw(dctx, 1);
  }
  window.addEventListener('resize', function () { if ($('draw').classList.contains('active')) sizeDraw(); });

  // Los trazos se guardan en proporción al ancho para poder redibujarlos a cualquier tamaño.
  function renderDraw(ctx, k) {
    var w = dc.clientWidth * k;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, dc.clientHeight * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    draw.lines.forEach(function (ln) {
      ctx.strokeStyle = ln.color;
      ctx.lineWidth = 0.025 * w;
      ctx.beginPath();
      ctx.moveTo(ln.pts[0][0] * w, ln.pts[0][1] * w);
      ln.pts.forEach(function (p) { ctx.lineTo(p[0] * w, p[1] * w); });
      if (ln.pts.length === 1) ctx.lineTo(ln.pts[0][0] * w + 0.1, ln.pts[0][1] * w);
      ctx.stroke();
    });
  }

  function drawPoint(e) {
    var r = dc.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.width];
  }
  dc.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { dc.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    draw.current = { color: draw.color, pts: [drawPoint(e)] };
    draw.lines.push(draw.current);
    renderDraw(dctx, 1);
  });
  dc.addEventListener('pointermove', function (e) {
    if (!draw.current) return;
    draw.current.pts.push(drawPoint(e));
    renderDraw(dctx, 1);
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    dc.addEventListener(ev, function () { draw.current = null; });
  });

  $('btn-draw-clear').addEventListener('click', function () {
    draw.lines = [];
    renderDraw(dctx, 1);
  });

  $('btn-draw-next').addEventListener('click', function () {
    if (!draw.lines.length) { say('primero_dibuja'); return; }
    draw.image = exportDrawing();
    $('word-drawing').src = draw.image;
    $('word-input').value = '';
    draw.cat = null;
    $('word-cats').querySelectorAll('.chip').forEach(function (x) { x.classList.remove('selected'); });
    $('word-error').textContent = '';
    openOverlay('word');
    say('que_dibujaste');
    setTimeout(function () { $('word-input').focus(); }, 100);
  });

  // Imagen del dibujo recortada a lo que se dibujó, para que se vea grande.
  function exportDrawing() {
    var full = document.createElement('canvas'), k = 600 / dc.clientWidth;
    full.width = 600;
    full.height = Math.round(dc.clientHeight * k);
    renderDraw(full.getContext('2d'), k);
    var xs = [], ys = [];
    draw.lines.forEach(function (ln) { ln.pts.forEach(function (p) { xs.push(p[0] * 600); ys.push(p[1] * 600); }); });
    var m = 0.04 * 600; // margen: medio grosor del trazo y un poco de aire
    var x0 = Math.max(0, Math.min.apply(null, xs) - m), y0 = Math.max(0, Math.min.apply(null, ys) - m);
    var x1 = Math.min(full.width, Math.max.apply(null, xs) + m), y1 = Math.min(full.height, Math.max.apply(null, ys) + m);
    var side = Math.max(x1 - x0, y1 - y0, 60);
    var out = document.createElement('canvas');
    out.width = out.height = 300;
    var ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 300, 300);
    // Centrado en un cuadrado.
    var sc = 300 / side;
    ctx.drawImage(full, x0, y0, x1 - x0, y1 - y0,
      (300 - (x1 - x0) * sc) / 2, (300 - (y1 - y0) * sc) / 2, (x1 - x0) * sc, (y1 - y0) * sc);
    return out.toDataURL('image/png');
  }

  // Categorías para el dibujo propio (opcional).
  Object.keys(window.CATEGORIES).forEach(function (k) {
    var c = window.CATEGORIES[k], b = document.createElement('button');
    b.className = 'chip';
    b.setAttribute('data-cat', k);
    b.textContent = c.icon + ' ' + c.name;
    b.addEventListener('click', function () {
      draw.cat = draw.cat === k ? null : k;
      $('word-cats').querySelectorAll('.chip').forEach(function (x) {
        x.classList.toggle('selected', x.getAttribute('data-cat') === draw.cat);
      });
    });
    $('word-cats').appendChild(b);
  });

  $('btn-word-back').addEventListener('click', function () { closeOverlay('word'); });

  // Mayúsculas, sin tildes ni espacios (la Ñ se respeta).
  function normalizeWord(t) {
    return t.toUpperCase().replace(/Ñ/g, '\u0001').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0001/g, 'Ñ').replace(/[^A-ZÑ]/g, '');
  }

  function acceptWord() {
    var word = normalizeWord($('word-input').value);
    if (word.length < 2) {
      $('word-error').style.color = 'var(--no)';
      $('word-error').textContent = 'Escribe una palabra de al menos 2 letras';
      return;
    }
    $('word-input').blur();
    startGame({ word: word, image: draw.image, cat: draw.cat }, 'pick');
  }
  $('btn-word-ok').addEventListener('click', acceptWord);
  $('word-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') acceptWord(); });

  function confetti() {
    var box = $('confetti'), colors = ['#ff7a45', '#4fc3f7', '#2ecc71', '#ffd84d', '#ff6fa8', '#9b59b6'];
    for (var i = 0; i < 70; i++) {
      var c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
      c.style.animationDelay = Math.random() * 0.6 + 's';
      box.appendChild(c);
    }
    setTimeout(function () { box.innerHTML = ''; }, 4500);
  }

  /* ---------- Arranque ---------- */
  renderHome();
  if (window.speechSynthesis) speechSynthesis.getVoices();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo offline */ });
  }
})();
