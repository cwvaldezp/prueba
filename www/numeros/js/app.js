(function () {
  var $ = function (id) { return document.getElementById(id); };
  var all = function (sel) { return document.querySelectorAll(sel); };

  /* ---------- Ajustes y progreso (guardados sólo en este aparato) ---------- */
  // Las claves llevan "num_" porque esta página comparte el sitio con ¡Que no se caiga!.
  // range: 5/10/20 · order: seq/mix · goal: números para el premio (o "all") · count: on/off
  // level: easy/normal (caminito ancho o angosto) · reward: youtube/file · voice: on/off · yt: enlace
  var settings = { range: '10', order: 'seq', goal: '5', count: 'on', level: 'easy', reward: 'youtube', voice: 'on', yt: '' };
  Object.keys(settings).forEach(function (k) { settings[k] = load(k) || settings[k]; });

  var stars = loadJSON('stars');   // números que ya escribió bien: { 3: true, ... }
  var misses = loadJSON('misses'); // cuántas veces se le borró un trazo en cada número
  var pos = parseInt(load('pos') || '0', 10) || 0;  // próximo número en orden (índice en la lista)
  var current = null;  // número que está escribiendo
  var session = 0;     // números escritos en esta ronda
  var tracer = null, timers = [];

  function load(k) { try { return localStorage.getItem('num_' + k); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem('num_' + k, v); } catch (e) { /* sin almacenamiento */ } }
  function loadJSON(k) { try { return JSON.parse(load(k) || '{}') || {}; } catch (e) { return {}; } }

  // Los números que se practican según el ajuste: 1 al 5, 0 al 10 o 0 al 20.
  function list() {
    var max = parseInt(settings.range, 10), out = [];
    for (var n = max === 5 ? 1 : 0; n <= max; n++) out.push(n);
    return out;
  }
  function goal() { return settings.goal === 'all' ? list().length : parseInt(settings.goal, 10); }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  /* ---------- Sonido y voz ---------- */
  var audio = null;
  function tone(freqs, dur) {
    if (settings.voice === 'off') return;
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

  /*
   * say() recibe partes: claves de PHRASES ('muy_bien'), un número {n: 3} ("tres"),
   * {esc: 3} ("Escribe el tres") o {son: 3} ("¡Son tres gatitos!"). Si el navegador
   * tiene voz en español se usa esa; si no, se tocan las grabaciones de js/voice-clips.js.
   */
  var player = new Audio(), clipQueue = [], ttsBroken = false;
  player.onended = function () { playNextClip(); };

  function partText(p) {
    var names = window.NUMBER_NAMES;
    if (typeof p === 'string') return window.PHRASES[p];
    if ('n' in p) return names[p.n];
    if ('esc' in p) return window.PHRASES.escribe + ' ' + names[p.esc];
    return (p.son === 1 ? '¡Es ' : '¡Son ') + window.countPhrase(p.son) + '!';
  }
  function partClip(p) {
    var key = typeof p === 'string' ? p : 'n' in p ? 'N_' + p.n : 'esc' in p ? 'ESC_' + p.esc : 'SON_' + p.son;
    return (window.VOICE_CLIPS || {})[key];
  }
  function spanishVoice() {
    try {
      if (ttsBroken || !window.speechSynthesis) return null;
      return speechSynthesis.getVoices().filter(function (v) { return /^es/i.test(v.lang); })[0] || null;
    } catch (e) { return null; }
  }
  function say() {
    if (settings.voice === 'off') return;
    var parts = Array.prototype.slice.call(arguments);
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
      var u = new SpeechSynthesisUtterance(parts.map(partText).join('. '));
      u.lang = voice.lang;
      u.voice = voice;
      u.rate = 0.85;
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
    player.src = src;
    var p = player.play();
    if (p && p.catch) p.catch(function () { /* el navegador no dejó sonar */ });
  }

  /* ---------- Navegación ---------- */
  function show(id) {
    if (tracer && id !== 'practice') { tracer.destroy(); tracer = null; }
    all('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    if (id === 'home') renderHome();
    if (id === 'parents') renderParents();
  }
  all('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () { clearTimers(); stopVoice(); show(b.getAttribute('data-go')); });
  });

  /* ---------- Inicio ---------- */
  function renderHome() {
    var box = $('stars'), nums = list();
    box.innerHTML = '';
    box.style.gridTemplateColumns = 'repeat(' + (nums.length > 11 ? 7 : 6) + ', 1fr)';
    nums.forEach(function (n, i) {
      var c = document.createElement('div');
      var next = settings.order === 'seq' && i === pos % nums.length;
      c.className = 'star-cell' + (stars[n] ? ' done' : '') + (next ? ' next' : '');
      c.textContent = n;
      box.appendChild(c);
    });
    if (load('rewardReady') === '1') {
      $('btn-play').textContent = '🎁 ¡Ver mi premio!';
      $('goal-text').textContent = '¡Ya ganaste tu premio!';
    } else {
      $('btn-play').textContent = '▶️ ¡A escribir!';
      $('goal-text').textContent = 'Escribe ' + goal() + ' números y gana tu premio 🎁';
    }
  }

  $('btn-play').addEventListener('click', function () {
    if (load('rewardReady') === '1') { showReward(); return; }
    session = 0;
    current = null;
    say('vamos');
    later(startNumber, 1200);
  });

  /* ---------- Elegir el próximo número ---------- */
  function nextNumber() {
    var nums = list();
    if (settings.order === 'seq') return nums[pos % nums.length];
    // Salteados: primero los que no tienen estrella; si ya están todos, los que más le cuestan.
    var pool = nums.filter(function (n) { return !stars[n] && n !== current; });
    if (!pool.length) {
      var most = Math.max.apply(null, nums.map(function (n) { return n === current ? -1 : misses[n] || 0; }));
      pool = nums.filter(function (n) { return n !== current && (most === 0 || (misses[n] || 0) >= most / 2); });
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ---------- Escribir un número ---------- */
  function renderSessionStars() {
    var html = '';
    for (var i = 0; i < goal(); i++) html += '<span class="' + (i < session ? '' : 'off') + '">⭐</span>';
    all('.session-stars').forEach(function (el) { el.innerHTML = goal() > 10 ? '⭐ ' + session + ' / ' + goal() : html; });
  }

  function startNumber() {
    var n = current = nextNumber(), thing = window.NUMBER_THINGS[n];
    show('practice');
    renderSessionStars();
    $('word-number').textContent = n;
    $('word-name').textContent = window.NUMBER_NAMES[n];
    $('word-emoji').textContent = thing ? thing.emoji : '🧺';
    setMsg('Empieza en el punto verde 🟢');
    later(function () { say({ n: n }, { esc: n }); }, 300);

    var canvas = $('trace-canvas');
    requestAnimationFrame(function () {
      if (tracer) tracer.destroy();
      tracer = new window.Tracer(canvas, String(n), {
        width: window.NUMBER_WIDTHS[n],
        level: settings.level,
        onStroke: function () {
          tone([990], 0.08);
          setMsg('¡Bien! Sigue con el punto verde 🟢');
        },
        onRetry: function () {
          misses[n] = (misses[n] || 0) + 1;
          save('misses', JSON.stringify(misses));
          setMsg('¡Casi! Sigue el caminito 👆');
          say('casi');
          canvas.classList.remove('shake');
          void canvas.offsetWidth;
          canvas.classList.add('shake');
        },
        onDone: written
      });
    });
  }

  function setMsg(t) { $('trace-msg').textContent = t; }

  function written(picture) {
    tone([523, 659, 784], 0.1);
    setMsg('¡Muy bien! 🎉');
    if (settings.count === 'off') { say('muy_bien'); later(numberDone, 1200); return; }
    say('muy_bien');
    later(function () { startCount(picture); }, 1100);
  }

  /* ---------- Contar los dibujitos ---------- */
  // Se ponen en filas de 5 (como en los dedos de una mano) para que se vea cuántos son.
  function startCount(picture) {
    var n = current, thing = window.NUMBER_THINGS[n], box = $('count-box');
    show('count');
    renderSessionStars();
    $('my-number').src = picture;
    box.innerHTML = '';
    $('count-msg').textContent = '';
    if (n === 0) {
      $('count-title').textContent = 'El cero es cuando no hay nada';
      box.innerHTML = '<div class="empty-plate">🧺</div>';
      say({ n: 0 }, 'cero');
      later(numberDone, 3500);
      return;
    }
    $('count-title').textContent = '¡Cuenta ' + (n === 1 ? (thing.f ? 'la ' : 'el ') + thing.one : (thing.f ? 'las ' : 'los ') + thing.many) + '!';
    say('cuenta');
    var counted = 0;
    for (var r = 0; r < n; r += 5) {
      var row = document.createElement('div');
      row.className = 'count-row';
      for (var i = r; i < Math.min(n, r + 5); i++) {
        var b = document.createElement('button');
        b.className = 'thing';
        b.textContent = thing.emoji;
        b.setAttribute('aria-label', thing.one);
        b.addEventListener('click', function () {
          if (this.classList.contains('counted') || counted >= n) return;
          counted++;
          this.classList.add('counted', 'pop');
          this.setAttribute('data-n', counted);
          $('count-msg').textContent = counted;
          tone([440 + counted * 30], 0.1);
          if (counted < n) { say({ n: counted }); return; }
          $('count-msg').textContent = (n === 1 ? '¡Es ' : '¡Son ') + window.countPhrase(n) + '! 🎉';
          say({ son: n });
          later(numberDone, 2200);
        });
        row.appendChild(b);
      }
      box.appendChild(row);
    }
  }

  /* ---------- Número terminado: estrella ---------- */
  function numberDone() {
    var nums = list();
    stars[current] = true;
    save('stars', JSON.stringify(stars));
    if (settings.order === 'seq') {
      pos = (nums.indexOf(current) + 1) % nums.length;
      save('pos', String(pos));
    }
    session++;
    renderSessionStars();
    tone([523, 659, 784, 1047], 0.12);
    confetti(25);
    if (session >= goal()) {
      save('rewardReady', '1');
      later(showReward, 1500);
    } else {
      later(startNumber, 1300);
    }
  }

  $('btn-reset').addEventListener('click', function () {
    if (!tracer) return;
    tracer.reset();
    setMsg('Empieza en el punto verde 🟢');
  });
  function sayNumber() {
    var v = settings.voice;
    settings.voice = 'on'; // Escuchar suena aunque la voz esté apagada: el niño lo pidió
    say({ n: current }, { esc: current });
    settings.voice = v;
  }
  $('btn-say').addEventListener('click', sayNumber);
  $('word-card').addEventListener('click', sayNumber);

  all('.btn-mute').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.voice = settings.voice === 'on' ? 'off' : 'on';
      save('voice', settings.voice);
      if (settings.voice === 'off') stopVoice();
      renderMute();
    });
  });
  function renderMute() { all('.btn-mute').forEach(function (b) { b.textContent = settings.voice === 'on' ? '🔊' : '🔇'; }); }

  /* ---------- Premio ---------- */
  // Sólo se llega aquí al completar los números. Al salir, el premio se gasta.
  function youtubeId(url) {
    var m = String(url || '').match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
    return m ? m[1] : null;
  }

  function showReward() {
    show('reward');
    confetti(70);
    var box = $('reward-box');
    var id = youtubeId(settings.yt);
    if (settings.reward === 'youtube' && id) {
      say('premio');
      box.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id +
        '?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="Tu premio" ' +
        'allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>' +
        '<p class="reward-msg">¡Disfruta tu video! 🍿</p>';
      return;
    }
    if (settings.reward === 'file') {
      loadVideo(function (blob) {
        if (blob) {
          say('premio');
          box.innerHTML = '<video controls autoplay playsinline></video><p class="reward-msg">¡Disfruta tu video! 🍿</p>';
          box.querySelector('video').src = URL.createObjectURL(blob);
        } else {
          noReward(box);
        }
      });
      return;
    }
    noReward(box);
  }
  function noReward(box) {
    say('sin_premio');
    box.innerHTML = '<div class="reward-emoji">🏆</div><p class="reward-msg">¡Escribiste todos tus números!<br>Pide a un adulto que elija tu premio.</p>';
  }

  $('btn-reward-home').addEventListener('click', function () {
    $('reward-box').innerHTML = ''; // detiene el video
    save('rewardReady', '0');
    session = 0;
    show('home');
  });

  /* Video del teléfono: se guarda en IndexedDB (puede pesar mucho para localStorage). */
  function withDB(fn) {
    try {
      var req = indexedDB.open('numeros', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('premio'); };
      req.onsuccess = function () { fn(req.result); };
      req.onerror = function () { fn(null); };
    } catch (e) { fn(null); }
  }
  function saveVideo(blob, done) {
    withDB(function (db) {
      if (!db) { done(false); return; }
      var tx = db.transaction('premio', 'readwrite');
      tx.objectStore('premio').put(blob, 'video');
      tx.oncomplete = function () { done(true); };
      tx.onerror = function () { done(false); };
    });
  }
  function loadVideo(done) {
    withDB(function (db) {
      if (!db) { done(null); return; }
      var r = db.transaction('premio').objectStore('premio').get('video');
      r.onsuccess = function () { done(r.result || null); };
      r.onerror = function () { done(null); };
    });
  }

  /* ---------- Zona para adultos ---------- */
  var gateAnswer = 0;
  $('btn-parents').addEventListener('click', function () {
    var a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
    gateAnswer = a * b;
    $('gate-question').textContent = '¿Cuánto es ' + a + ' × ' + b + '?';
    $('gate-answer').value = '';
    $('gate-error').textContent = '';
    $('gate').classList.add('active');
    setTimeout(function () { $('gate-answer').focus(); }, 100);
  });
  $('btn-gate-cancel').addEventListener('click', function () { $('gate').classList.remove('active'); });
  function tryGate() {
    if (parseInt($('gate-answer').value, 10) === gateAnswer) {
      $('gate').classList.remove('active');
      $('gate-answer').blur();
      show('parents');
    } else {
      $('gate-error').textContent = 'Esa no es la respuesta.';
    }
  }
  $('btn-gate-ok').addEventListener('click', tryGate);
  $('gate-answer').addEventListener('keydown', function (e) { if (e.key === 'Enter') tryGate(); });

  function renderParents() {
    all('.chip[data-setting]').forEach(function (c) {
      c.classList.toggle('selected', settings[c.getAttribute('data-setting')] === c.getAttribute('data-value'));
    });
    $('reward-youtube').classList.toggle('active', settings.reward === 'youtube');
    $('reward-file').classList.toggle('active', settings.reward === 'file');
    $('yt-link').value = settings.yt;
    renderYtStatus();
    loadVideo(function (blob) {
      $('file-status').textContent = blob ? '✅ Hay un video guardado (' + Math.round(blob.size / 1048576) + ' MB).' : 'Todavía no hay video.';
    });
    // Los números en los que más se le borró el trazo.
    var hard = Object.keys(misses).filter(function (n) { return misses[n] >= 3; })
      .sort(function (a, b) { return misses[b] - misses[a]; }).slice(0, 5);
    $('hard-list').textContent = hard.length ? 'Los que más le cuestan: ' + hard.join(', ') + '. En "Salteados" le salen más seguido.'
      : 'Todavía no hay números que le cuesten.';
    $('restart-status').textContent = '';
  }
  all('.chip[data-setting]').forEach(function (c) {
    c.addEventListener('click', function () {
      var k = c.getAttribute('data-setting');
      settings[k] = c.getAttribute('data-value');
      save(k, settings[k]);
      renderParents();
      renderMute();
    });
  });
  function renderYtStatus() {
    var id = youtubeId(settings.yt);
    $('yt-status').textContent = !settings.yt ? 'Todavía no hay video.'
      : id ? '✅ Video listo.' : '⚠️ No reconozco ese enlace. Cópialo desde "Compartir" en YouTube.';
  }
  $('yt-link').addEventListener('input', function () {
    settings.yt = this.value.trim();
    save('yt', settings.yt);
    renderYtStatus();
  });
  $('btn-video-file').addEventListener('click', function () { $('video-file').click(); });
  $('video-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    $('file-status').textContent = 'Guardando…';
    saveVideo(file, function (ok) {
      $('file-status').textContent = ok ? '✅ Video guardado: ' + file.name : '⚠️ No se pudo guardar. Prueba con un video más corto.';
    });
  });
  $('btn-restart').addEventListener('click', function () {
    stars = {};
    misses = {};
    pos = 0;
    save('stars', '{}');
    save('misses', '{}');
    save('pos', '0');
    save('rewardReady', '0');
    renderParents();
    $('restart-status').textContent = '✅ Listo: empieza otra vez desde el principio.';
  });

  /* ---------- Festejo ---------- */
  function confetti(n) {
    var box = $('confetti'), colors = ['#ff7a45', '#4fc3f7', '#2ecc71', '#ffc93c', '#ff6fa8', '#7c5cff'];
    for (var i = 0; i < n; i++) {
      var c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
      c.style.animationDelay = Math.random() * 0.4 + 's';
      box.appendChild(c);
    }
    setTimeout(function () { box.innerHTML = ''; }, 3800);
  }

  /* ---------- Arranque ---------- */
  renderHome();
  renderMute();
  if (window.speechSynthesis) speechSynthesis.getVoices();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo offline */ });
  }
})();
