(function () {
  var $ = function (id) { return document.getElementById(id); };

  // gender: chico/chica · case: upper/lower (mayúsculas o minúsculas) · write: guided/free
  var settings = { gender: 'chico', case: 'upper', write: 'guided' };
  Object.keys(settings).forEach(function (k) {
    try { settings[k] = localStorage.getItem(k) || settings[k]; } catch (e) { /* sin almacenamiento */ }
  });

  var state = null;     // partida actual
  var tracer = null;    // pizarra activa
  var recent = [];      // palabras usadas hace poco en modo "Yo adivino"

  /* ---------- Sonido y voz ---------- */
  var audio = null;
  function tone(freqs, dur) {
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

  function say(text) {
    try {
      if (!window.speechSynthesis) return;
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      var voice = speechSynthesis.getVoices().filter(function (v) { return /^es/i.test(v.lang); })[0];
      if (voice) u.voice = voice;
      u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { /* sin voz */ }
  }
  function letterName(l) { return 'la ' + window.LETTER_NAMES[l]; }
  function isLower() { return settings.case === 'lower'; }
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
    $('home-figure').innerHTML = window.figureSVG(window.MAX_ERRORS, settings.gender, false);
    document.querySelectorAll('.chip').forEach(function (c) {
      c.classList.toggle('selected', settings[c.getAttribute('data-setting')] === c.getAttribute('data-value'));
    });
    document.body.classList.toggle('lower-case', isLower());
  }
  document.querySelectorAll('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      var key = c.getAttribute('data-setting');
      settings[key] = c.getAttribute('data-value');
      try { localStorage.setItem(key, settings[key]); } catch (e) { /* sin almacenamiento */ }
      renderHome();
    });
  });

  $('btn-mode-pick').addEventListener('click', function () {
    grid.querySelectorAll('button:not(.draw-own) .name').forEach(function (n, i) { n.textContent = disp(window.WORDS[i].word); });
    show('pick');
    say('Elige tu imagen secreta');
  });
  $('btn-mode-guess').addEventListener('click', function () { startGame(randomWord(), 'guess'); });

  /* ---------- Elegir imagen ---------- */
  var grid = $('pick-grid');
  var own = document.createElement('button');
  own.className = 'draw-own';
  own.innerHTML = '<span class="emoji">✏️</span><span class="name">DIBUJAR</span>';
  own.addEventListener('click', openDraw);
  grid.appendChild(own);
  window.WORDS.forEach(function (w) {
    var b = document.createElement('button');
    b.innerHTML = '<span class="emoji">' + w.emoji + '</span><span class="name">' + disp(w.word) + '</span>';
    b.addEventListener('click', function () { startGame(w, 'pick'); });
    grid.appendChild(b);
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
    state = { word: w.word, pic: picHTML(w), mode: mode, letters: w.word.split(''), found: {}, used: {}, errors: 0, over: false };
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
    say(mode === 'pick' ? 'Que empiece el juego' : 'Adivina la palabra');
  }

  function renderFigure(fallen) {
    $('figure').innerHTML = window.figureSVG(state.errors, settings.gender, fallen);
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
    $('ask-letter').textContent = disp(l);
    $('ask-question').textContent = '¿Tu palabra tiene la letra ' + disp(l) + '?';
    $('ask-feedback').textContent = '';
    $('btn-yes').disabled = $('btn-no').disabled = false;
    openOverlay('ask');
    say('¿Tu palabra tiene ' + letterName(l) + '?');

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
        say(really ? 'Mira bien, sí está' : 'Mmm, esa no está');
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
    $('trace-model').textContent = disp(l);
    var name = 'la ' + disp(l);
    var intro = found ? '' : 'No está, pero igual escríbela. ';
    if (free) {
      setTraceMsg(intro + 'Escribe ' + name + ' y toca Listo ✅');
      say(intro + 'Escribe ' + letterName(l));
    } else {
      setTraceMsg(intro + 'Escribe ' + name + '. Empieza en el punto verde 🟢');
      say(intro + 'Escribe ' + letterName(l) + '. Empieza en el punto verde');
    }

    var canvas = $('trace-canvas');
    var total = (isLower() ? window.LOWER_LETTERS : window.LETTERS)[l].length;
    // Esperamos a que la ventana tenga tamaño antes de crear la pizarra.
    requestAnimationFrame(function () {
      tracer = new window.Tracer(canvas, l, {
        lower: isLower(),
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
          say('Casi. Inténtalo otra vez');
          shakeCanvas();
        },
        onDone: function (img) {
          sfx.win();
          setTraceMsg('¡Excelente! 🌟');
          say('¡Excelente!');
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
    say('Te ayudo. Empieza en el punto verde');
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
    if (tracer) say('Escribe ' + letterName(tracer.letter));
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
    say(pick ? 'Adivinaron tu palabra: ' + state.word.toLowerCase() : 'Ganaste. La palabra es ' + state.word.toLowerCase());
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
      slot.innerHTML = '<span>' + c + '</span>';
    });
    var pick = state.mode === 'pick';
    setTimeout(function () {
      if (pick) confetti();
      showEnd(pick ? '🏆' : '💦', pick ? '¡Ganaste tú! 🏆' : '¡Se cayó al agua! 💦',
        pick ? 'No adivinaron tu palabra secreta:' : 'La palabra era:');
      say(pick ? 'Ganaste. No adivinaron tu palabra' : 'Se cayó al agua. La palabra era ' + state.word.toLowerCase());
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
    say('Dibuja tu imagen secreta');
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
    if (!draw.lines.length) { say('Primero dibuja algo'); return; }
    draw.image = exportDrawing();
    $('word-drawing').src = draw.image;
    $('word-input').value = '';
    $('word-error').textContent = '';
    openOverlay('word');
    say('¿Qué dibujaste?');
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
    startGame({ word: word, image: draw.image }, 'pick');
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
