(function () {
  var $ = function (id) { return document.getElementById(id); };

  var settings = { gender: 'chico' };
  try { settings.gender = localStorage.getItem('gender') || 'chico'; } catch (e) { /* sin almacenamiento */ }

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
      c.classList.toggle('selected', c.getAttribute('data-gender') === settings.gender);
    });
  }
  document.querySelectorAll('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      settings.gender = c.getAttribute('data-gender');
      try { localStorage.setItem('gender', settings.gender); } catch (e) { /* sin almacenamiento */ }
      renderHome();
    });
  });

  $('btn-mode-pick').addEventListener('click', function () { show('pick'); say('Elige tu imagen secreta'); });
  $('btn-mode-guess').addEventListener('click', function () { startGame(randomWord(), 'guess'); });

  /* ---------- Elegir imagen ---------- */
  var grid = $('pick-grid');
  window.WORDS.forEach(function (w) {
    var b = document.createElement('button');
    b.innerHTML = '<span class="emoji">' + w.emoji + '</span><span class="name">' + w.word + '</span>';
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
    state = { word: w.word, emoji: w.emoji, mode: mode, letters: w.word.split(''), found: {}, used: {}, errors: 0, over: false };
    show('game');

    var peek = $('btn-peek');
    $('peek-emoji').textContent = w.emoji;
    peek.classList.toggle('hidden', mode !== 'pick');
    $('game-hint').textContent = mode === 'pick'
      ? 'El otro jugador dice una letra y tú la tocas 👇'
      : '¿Qué letra crees que tiene? Tócala 👇';

    $('slots').innerHTML = state.letters.map(function (_, i) { return '<div class="slot" data-i="' + i + '"></div>'; }).join('');

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
    $('ask-emoji').textContent = state.emoji;
    $('ask-letter').textContent = l;
    $('ask-question').textContent = '¿Tu palabra tiene ' + letterName(l).toUpperCase() + '?';
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
        fb.textContent = really ? '¡Muy bien! Ahora escríbela ✏️' : '¡Correcto! No está 👍';
        setTimeout(function () { closeOverlay('ask'); resolveLetter(l); }, 900);
      } else {
        // Corrección suave: le ayudamos a revisar su palabra.
        fb.style.color = 'var(--primary)';
        fb.textContent = really ? '¡Mira bien! 👀 Sí está en ' + state.emoji : 'Mmm… 🤔 ' + state.emoji + ' no tiene la ' + l;
        say(really ? 'Mira bien, sí está' : 'Mmm, esa no está');
        setTimeout(function () { closeOverlay('ask'); resolveLetter(l); }, 2400);
      }
    };
    $('btn-yes').onclick = function () { answer(true); };
    $('btn-no').onclick = function () { answer(false); };
  }

  function resolveLetter(l) {
    state.used[l] = true;
    var key = document.querySelector('[data-letter="' + l + '"]');
    key.disabled = true;

    if (state.letters.indexOf(l) !== -1) {
      key.classList.add('good');
      sfx.good();
      openTracer(l);
    } else {
      key.classList.add('bad');
      state.errors++;
      sfx.bad();
      say(state.mode === 'pick' ? 'No está' : 'Esa no está');
      renderFigure(false);
      if (state.errors >= window.MAX_ERRORS) lose();
    }
  }

  /* ---------- Escribir la letra ---------- */
  function openTracer(l) {
    openOverlay('trace');
    $('trace-model').textContent = l;
    setTraceMsg('Escribe ' + letterName(l).toUpperCase() + '. Empieza en el punto verde 🟢');
    say('Escribe ' + letterName(l) + '. Empieza en el punto verde');

    var canvas = $('trace-canvas');
    var total = window.LETTERS[l].length;
    // Esperamos a que la ventana tenga tamaño antes de crear la pizarra.
    requestAnimationFrame(function () {
      tracer = new window.Tracer(canvas, l, {
        onStroke: function (n) {
          sfx.stroke();
          setTraceMsg('¡Bien! Ahora el trazo ' + (n + 1) + ' de ' + total + ' 🟢');
        },
        onKeepGoing: function () { setTraceMsg('¡Sigue el caminito hasta la flecha! ➡️'); },
        onRetry: function () {
          setTraceMsg('¡Casi! Sigue el dedito 👆 y vuelve a intentarlo');
          canvas.classList.remove('shake');
          void canvas.offsetWidth;
          canvas.classList.add('shake');
        },
        onDone: function (img) {
          sfx.win();
          setTraceMsg('¡Excelente! 🌟');
          say('¡Excelente!');
          setTimeout(function () {
            closeTracer();
            placeLetter(l, img);
          }, 1100);
        }
      });
    });
  }

  function setTraceMsg(t) { $('trace-msg').textContent = t; }

  function closeTracer() {
    if (tracer) { tracer.destroy(); tracer = null; }
    closeOverlay('trace');
  }

  $('btn-trace-reset').addEventListener('click', function () {
    if (!tracer) return;
    tracer.reset();
    setTraceMsg('Empieza en el punto verde 🟢');
  });
  $('btn-trace-say').addEventListener('click', function () {
    if (tracer) say('Escribe ' + letterName(tracer.letter));
  });

  function placeLetter(l, img) {
    state.letters.forEach(function (c, i) {
      if (c !== l) return;
      state.found[i] = true;
      var slot = document.querySelector('.slot[data-i="' + i + '"]');
      slot.innerHTML = '<img alt="' + l + '" src="' + img + '">';
    });
    if (Object.keys(state.found).length === state.letters.length) win();
  }

  /* ---------- Fin de partida ---------- */
  function win() {
    state.over = true;
    sfx.win();
    confetti();
    var pick = state.mode === 'pick';
    showEnd(state.emoji, pick ? '¡Adivinaron tu palabra! 🎉' : '¡Ganaste! 🎉',
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

  function showEnd(emoji, title, text) {
    $('end-emoji').textContent = emoji;
    $('end-title').textContent = title;
    $('end-text').textContent = text;
    $('end-word').textContent = state.emoji + ' ' + state.word;
    openOverlay('end');
  }

  $('btn-again').addEventListener('click', function () {
    if (state && state.mode === 'guess') startGame(randomWord(), 'guess');
    else show('pick');
  });

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
