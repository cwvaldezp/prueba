/*
 * Pizarra para aprender a escribir una letra o un número (copiada del abecedario;
 * aquí la caja puede ser más ancha que alta para los números de dos cifras).
 * Muestra la letra como un "caminito", con un punto verde donde empieza
 * cada trazo, una flecha que indica hacia dónde ir y un dedito animado
 * que enseña el movimiento. El niño debe repasar cada trazo en orden.
 *
 * Todo se guarda en coordenadas de la letra (0..100) y se dibuja escalado.
 */
(function () {
  /*
   * Qué tan exigente es la revisión con caminito (distancias en unidades de letra,
   * la letra mide 100). 'easy' es para los más chiquitos (3 años): camino más ancho
   * y más tolerante, pero un garabato sigue sin contar.
   */
  var LEVELS = {
    normal: { tolerance: 10, start: 14, coverage: 0.85, offPath: 0.15, maxInk: 1.6, lane: 16 },
    easy: { tolerance: 16, start: 22, coverage: 0.75, offPath: 0.3, maxInk: 2.2, lane: 26 }
  };
  var FREE_TOLERANCE = 10;   // modo libre: después de ajustar tamaño y posición
  var FREE_PRECISION = 0.85; // modo libre: tinta que debe caer sobre la forma de la letra
  var FREE_COVERAGE_OK = 0.85;     // modo libre: cuánto de la letra hay que dibujar
  var FREE_STROKE_COVERAGE = 0.7;  // modo libre: cuánto de cada trazo (no puede faltar ninguno)
  var FREE_INK_RANGE = [0.6, 1.5]; // modo libre: tinta mínima y máxima comparada con la letra
  var OTHER_MARGIN = 0.9;          // modo libre: otra letra tiene que ajustar 10% mejor para rechazar
  var COLORS = ['#e74c3c', '#3498db', '#27ae60', '#9b59b6'];

  function dist(a, b) {
    var dx = a[0] - b[0], dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function distToSegment(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len2 = dx * dx + dy * dy;
    if (len2 === 0) return dist(p, a);
    var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return dist(p, [a[0] + t * dx, a[1] + t * dy]);
  }

  function distToPolyline(p, line) {
    if (line.length === 1) return dist(p, line[0]);
    var best = Infinity;
    for (var i = 1; i < line.length; i++) best = Math.min(best, distToSegment(p, line[i - 1], line[i]));
    return best;
  }

  // Reparte puntos cada `step` unidades a lo largo del trazo.
  function resample(stroke, step) {
    var out = [stroke[0]];
    for (var i = 1; i < stroke.length; i++) {
      var a = stroke[i - 1], b = stroke[i];
      var d = dist(a, b), n = Math.max(1, Math.ceil(d / step));
      for (var k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    return out;
  }

  function strokeLength(pts) {
    var l = 0;
    for (var i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
    return l;
  }

  function pointAt(pts, t) {
    var target = strokeLength(pts) * t, acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var d = dist(pts[i - 1], pts[i]);
      if (acc + d >= target) {
        var f = d === 0 ? 0 : (target - acc) / d;
        return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
      }
      acc += d;
    }
    return pts[pts.length - 1];
  }

  function joinLines(lines) {
    var out = [];
    lines.forEach(function (line) { out = out.concat(resample(line, 2)); });
    return out;
  }

  function bbox(pts) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    pts.forEach(function (p) {
      b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]);
      b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
    });
    return b;
  }

  /*
   * Revisa un trazo con caminito. El niño debe empezar en el punto verde e ir
   * avanzando por el camino hasta la flecha, sin regresar ni hacer garabatos.
   * Devuelve null si está bien o el motivo: 'start', 'off', 'short' o 'scribble'.
   */
  function gradeStroke(inkLines, target, level) {
    var L = level || LEVELS.normal;
    var pts = joinLines(inkLines);
    if (!pts.length) return 'short';
    var targetLen = strokeLength(target);

    // Puntos (de la i y la j): un toque o rayita corta encima del punto.
    if (targetLen < 1) {
      var near = pts.every(function (p) { return dist(p, target[0]) < L.tolerance; });
      return !near ? 'off' : strokeLength(pts) > 12 ? 'scribble' : null;
    }
    if (dist(pts[0], target[0]) > L.start) return 'start';

    // Recorremos el camino sólo hacia adelante: ir y venir deja tinta "fuera".
    var idx = 0, off = 0, last = target.length - 1;
    pts.forEach(function (p) {
      var best = Infinity, bestJ = idx;
      for (var j = Math.max(0, idx - 3); j <= Math.min(last, idx + 10); j++) {
        var d = dist(p, target[j]);
        if (d < best) { best = d; bestJ = j; }
      }
      if (best > L.tolerance) off++;
      else idx = Math.max(idx, bestJ);
    });
    if (off / pts.length > L.offPath) return 'off';
    // Hasta dónde llegó: en trazos cortos (la rayita de la t) se perdonan unos 4 puntos del final.
    if (idx < Math.min(last * L.coverage, last - 4)) return 'short';
    if (strokeLength(pts) > targetLen * L.maxInk) return 'scribble';
    return null;
  }

  /*
   * Revisa una letra escrita libremente. Primero se ajusta al tamaño y posición
   * de la letra modelo (puede escribirla más chica o corrida) y luego se compara
   * la forma: tiene que estar cada trazo, casi toda la tinta debe caer sobre la
   * letra y no puede haber tinta de más. Así una b no pasa por d, ni un garabato
   * por letra. Además se compara con las demás letras (`others`): si lo escrito
   * se parece más a otra, no cuenta (una o no pasa por a).
   * Devuelve null si está bien o el motivo: 'empty', 'shape', 'scribble' u 'other'.
   */
  function gradeLetter(inkLines, strokes, others) {
    var mine = fitLetter(inkLines, strokes);
    if (mine.problem) return mine.problem;
    // ¿Dibujó algún puntito? Si no, no puede ser una i ni una j.
    var hasDot = inkLines.some(function (l) { return strokeLength(l) < 12; });
    var lookalike = (others || []).some(function (o) {
      var needsDot = o.some(function (st) { return strokeLength(st) < 1; });
      if (needsDot && !hasDot) return false;
      var f = fitLetter(inkLines, o);
      return !f.problem && f.score < mine.score * OTHER_MARGIN;
    });
    return lookalike ? 'other' : null;
  }

  // Ajusta lo escrito a una letra y la compara. Devuelve { problem, score }: score más bajo = más parecida.
  // Deja sólo puntos separados al menos `step` unidades (comparar menos puntos es mucho más rápido).
  function thin(pts, step) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) if (dist(pts[i], out[out.length - 1]) >= step) out.push(pts[i]);
    return out;
  }

  // Distancia de un punto al punto más cercano de una lista.
  function nearest(p, pts) {
    var best = Infinity;
    for (var i = 0; i < pts.length; i++) {
      var dx = p[0] - pts[i][0], dy = p[1] - pts[i][1], d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // Ajusta lo escrito a una letra y la compara. Devuelve { problem, score }: score más bajo = más parecida.
  function fitLetter(inkLines, strokes) {
    var pts = joinLines(inkLines);
    if (pts.length < 2) return { problem: 'empty' };
    if (inkLines.length > strokes.length + 2) return { problem: 'scribble' };

    var all = [];
    strokes.forEach(function (st) { all = all.concat(st); });
    var ib = bbox(pts), tb = bbox(all);
    var iw = ib[2] - ib[0], ih = ib[3] - ib[1], tw = tb[2] - tb[0], th = tb[3] - tb[1];
    if (Math.max(iw, ih) < 12) return { problem: 'shape' }; // demasiado chiquita: un puntito o rayita

    // Escala: en letras muy angostas (l, i) o muy bajitas sólo cuenta una medida.
    var sx = tw / Math.max(iw, 1), sy = th / Math.max(ih, 1);
    if (tw < 15 || iw < 15) sx = sy;
    if (th < 15 || ih < 15) sy = sx;
    if (sx / sy > 1.8 || sy / sx > 1.8) return { problem: 'shape' }; // muy ancha o muy alta para ser esta letra
    var cx = (ib[0] + ib[2]) / 2, cy = (ib[1] + ib[3]) / 2, tcx = (tb[0] + tb[2]) / 2, tcy = (tb[1] + tb[3]) / 2;
    var fit = function (p) { return [tcx + (p[0] - cx) * sx, tcy + (p[1] - cy) * sy]; };
    var lines = inkLines.map(function (line) { return line.map(fit); });
    var ink = thin(pts.map(fit), 3);
    var shape = thin(all, 3);

    var inkDist = ink.map(function (p) { return nearest(p, shape); });
    var onShape = inkDist.filter(function (d) { return d < FREE_TOLERANCE; }).length / ink.length;
    var coveredTotal = 0, shapeTotal = 0, missing = false, shapeDistSum = 0;
    strokes.forEach(function (st) {
      var sp = thin(st, 3), c = 0;
      sp.forEach(function (p) {
        var d = nearest(p, ink);
        shapeDistSum += d;
        if (d < FREE_TOLERANCE) c++;
      });
      coveredTotal += c;
      shapeTotal += sp.length;
      if (c / sp.length < FREE_STROKE_COVERAGE) missing = true;
    });
    var totalLen = strokes.reduce(function (a, st) { return a + Math.max(strokeLength(st), 4); }, 0);
    var inkRatio = lines.reduce(function (a, line) { return a + strokeLength(line); }, 0) / totalLen;

    if (inkRatio > FREE_INK_RANGE[1]) return { problem: 'scribble' };
    if (onShape < FREE_PRECISION || missing || coveredTotal / shapeTotal < FREE_COVERAGE_OK || inkRatio < FREE_INK_RANGE[0]) return { problem: 'shape' };

    // Distancia promedio en los dos sentidos (tinta → letra y letra → tinta), más un castigo por deformarla.
    var inkAvg = inkDist.reduce(function (a, d) { return a + d; }, 0) / ink.length;
    // Castigos: deformarla, agrandarla/achicarla y moverla de su lugar en los renglones.
    var stretch = Math.abs(Math.log(sx / sy));
    var resize = Math.abs(Math.log(Math.sqrt(sx * sy)));
    var shift = Math.sqrt((tcx - cx) * (tcx - cx) + (tcy - cy) * (tcy - cy));
    return { problem: null, score: inkAvg + shapeDistSum / shapeTotal + 4 * stretch + 3 * resize + 0.05 * shift };
  }

  function Tracer(canvas, letter, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.letter = letter;
    this.opts = opts || {};
    this.style = this.opts.style || 'upper'; // 'upper' (ABC), 'lower' (abc) o 'cursive'
    this.level = LEVELS[this.opts.level] || LEVELS.normal;
    this.free = !!this.opts.free; // modo libre: sin caminito, se revisa al tocar "Listo"
    this.lines = window.LETTER_LINES[this.style];
    this.boxW = this.opts.width || 100; // ancho de la caja (la altura siempre es 100)
    var set = window.letterSet(this.style);
    this.strokes = set[letter].map(function (s) { return resample(s, 2); });
    this.others = Object.keys(set).filter(function (k) { return k !== letter; }).map(function (k) {
      return set[k].map(function (s) { return resample(s, 2); });
    });
    this.current = 0;
    this.accepted = [];   // tinta aceptada: lista de líneas
    this.pending = [];    // tinta del trazo actual (puede tener varias líneas si levanta el dedo)
    this.drawing = null;
    this.guideStart = performance.now();
    this.finished = false;

    this._onDown = this.onDown.bind(this);
    this._onMove = this.onMove.bind(this);
    this._onUp = this.onUp.bind(this);
    this._onResize = this.resize.bind(this);
    canvas.addEventListener('pointerdown', this._onDown);
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointercancel', this._onUp);
    window.addEventListener('resize', this._onResize);
    // El tamaño también cambia si el mensaje de arriba ocupa más líneas.
    if (window.ResizeObserver) {
      this._observer = new ResizeObserver(this._onResize);
      this._observer.observe(canvas);
    }

    this.resize();
    this.loop();
  }

  Tracer.prototype.resize = function () {
    // clientWidth/Height no se ven afectados por animaciones (transform).
    var w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    var dpr = window.devicePixelRatio || 1;
    this.size = Math.min(w, h);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pad = this.size * 0.11;
    this.scale = Math.min((w - this.pad * 2) / this.boxW, (h - this.pad * 2) / 100);
    this.offX = (w - this.boxW * this.scale) / 2;
    this.offY = (h - 100 * this.scale) / 2;
  };

  Tracer.prototype.toScreen = function (p) {
    return [this.offX + p[0] * this.scale, this.offY + p[1] * this.scale];
  };

  Tracer.prototype.toLetter = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var k = rect.width / this.canvas.clientWidth || 1;
    return [((e.clientX - rect.left) / k - this.offX) / this.scale, ((e.clientY - rect.top) / k - this.offY) / this.scale];
  };

  Tracer.prototype.path = function (pts) {
    var ctx = this.ctx;
    ctx.beginPath();
    var p = this.toScreen(pts[0]);
    ctx.moveTo(p[0], p[1]);
    for (var i = 1; i < pts.length; i++) {
      p = this.toScreen(pts[i]);
      ctx.lineTo(p[0], p[1]);
    }
    if (pts.length === 1) ctx.lineTo(p[0] + 0.1, p[1]);
  };

  Tracer.prototype.render = function (now) {
    var ctx = this.ctx, s = this.scale, self = this;
    var w = this.canvas.width, h = this.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.restore();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Renglones de cuaderno (los punteados son guías intermedias).
    ctx.lineWidth = 2;
    this.lines.forEach(function (r) {
      ctx.strokeStyle = r[1] ? '#cfe3f5' : '#9ecbf0';
      ctx.setLineDash(r[1] ? [8, 8] : []);
      self.path([[-8, r[0]], [self.boxW + 8, r[0]]]);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Caminito de cada trazo (en modo libre no hay ayudas).
    if (!this.free) this.strokes.forEach(function (st, i) {
      ctx.lineWidth = self.level.lane * s;
      ctx.strokeStyle = i < self.current ? '#c8f7c5' : i === self.current ? '#ffe9a8' : '#ececec';
      self.path(st);
      ctx.stroke();
    });

    if (!this.finished && !this.free) {
      var st = this.strokes[this.current];
      var color = COLORS[this.current % COLORS.length];
      // Línea central punteada del trazo actual.
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.setLineDash([6, 8]);
      this.path(st);
      ctx.stroke();
      ctx.setLineDash([]);

      // Flecha al final del trazo (los puntos de la i y la j no llevan).
      if (strokeLength(st) > 1) {
      var end = this.toScreen(st[st.length - 1]);
      var prev = this.toScreen(st[Math.max(0, st.length - 4)]);
      var ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
      var ah = 7 * s;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(end[0] + Math.cos(ang) * ah * 0.6, end[1] + Math.sin(ang) * ah * 0.6);
      ctx.lineTo(end[0] + Math.cos(ang + 2.5) * ah, end[1] + Math.sin(ang + 2.5) * ah);
      ctx.lineTo(end[0] + Math.cos(ang - 2.5) * ah, end[1] + Math.sin(ang - 2.5) * ah);
      ctx.closePath();
      ctx.fill();
      }

      // Punto de inicio con el número del trazo.
      var start = this.toScreen(st[0]);
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(start[0], start[1], 7 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(9 * s) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.current + 1), start[0], start[1] + 0.5);
    }

    // Lo que se escribió mal se desvanece en rojo.
    var FADE = 800;
    if (this.failed && now - this.failedAt < FADE) {
      ctx.globalAlpha = 1 - (now - this.failedAt) / FADE;
      ctx.lineWidth = 6 * s;
      ctx.strokeStyle = '#ff5c5c';
      this.failed.forEach(function (line) {
        self.path(line);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    // Tinta del niño.
    ctx.lineWidth = 6 * s;
    ctx.strokeStyle = '#1f4e9c';
    this.accepted.concat(this.pending).forEach(function (line) {
      self.path(line);
      ctx.stroke();
    });

    // Dedito guía (sólo cuando el niño no está dibujando).
    if (!this.finished && !this.free && !this.drawing && this.pending.length === 0) {
      var cycle = 2600, t = ((now - this.guideStart) % cycle) / cycle;
      var move = Math.min(1, t / 0.8);
      var g = this.toScreen(pointAt(this.strokes[this.current], move));
      ctx.globalAlpha = t > 0.8 ? 1 - (t - 0.8) / 0.2 : 1;
      ctx.fillStyle = 'rgba(255,140,0,0.85)';
      ctx.beginPath();
      ctx.arc(g[0], g[1], 5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = Math.round(14 * s) + 'px system-ui, sans-serif';
      ctx.fillText('👆', g[0] + 5 * s, g[1] + 9 * s);
      ctx.globalAlpha = 1;
    }
  };

  Tracer.prototype.loop = function () {
    var self = this;
    this.raf = requestAnimationFrame(function (now) {
      self.render(now);
      if (!self.destroyed) self.loop();
    });
  };

  Tracer.prototype.onDown = function (e) {
    if (this.finished) return;
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    this.drawing = [this.toLetter(e)];
    this.pending.push(this.drawing);
  };

  Tracer.prototype.onMove = function (e) {
    if (!this.drawing) return;
    e.preventDefault();
    var p = this.toLetter(e);
    if (dist(p, this.drawing[this.drawing.length - 1]) > 0.8) this.drawing.push(p);
  };

  Tracer.prototype.onUp = function () {
    if (!this.drawing) return;
    this.drawing = null;
    if (this.free) {
      if (this.opts.onInk) this.opts.onInk();
    } else {
      this.check();
    }
  };

  // Modo libre: revisa la letra completa. Devuelve true si está bien.
  Tracer.prototype.checkFree = function () {
    if (!this.pending.length) return false;
    this.lastProblem = gradeLetter(this.pending, this.strokes, this.others);
    if (!this.lastProblem) {
      this.accepted = this.pending;
      this.pending = [];
      this.finished = true;
      if (this.opts.onDone) this.opts.onDone(this.snapshot());
      return true;
    }
    this.erase();
    return false;
  };

  // Pasa del modo libre al modo con guía, empezando de cero.
  Tracer.prototype.showGuide = function () {
    var failed = this.failed;
    this.free = false;
    this.reset();
    this.failed = failed; // que se vea en rojo lo que no salió
  };

  Tracer.prototype.check = function () {
    // Si no salió bien, se borra para intentarlo de nuevo.
    var problem = gradeStroke(this.pending, this.strokes[this.current], this.level);
    if (problem) {
      this.erase();
      if (this.opts.onRetry) this.opts.onRetry(problem);
      return;
    }
    {
      this.accepted = this.accepted.concat(this.pending);
      this.pending = [];
      this.current++;
      this.guideStart = performance.now();
      if (this.current >= this.strokes.length) {
        this.finished = true;
        if (this.opts.onDone) this.opts.onDone(this.snapshot());
      } else if (this.opts.onStroke) {
        this.opts.onStroke(this.current);
      }
    }
  };

  // Borra lo que se escribió mal, mostrándolo un momento en rojo para que el niño lo vea.
  Tracer.prototype.erase = function () {
    this.failed = this.pending;
    this.failedAt = performance.now();
    this.pending = [];
    this.guideStart = performance.now();
  };

  // Vuelve a empezar la letra desde el primer trazo.
  Tracer.prototype.reset = function () {
    this.current = 0;
    this.accepted = [];
    this.pending = [];
    this.failed = null;
    this.finished = false;
    this.guideStart = performance.now();
  };

  // Imagen (PNG transparente) con la letra tal como la escribió el niño.
  // Cubre de -5 a 115 en vertical para que quepan las letras que bajan (g, j, p, q, y).
  Tracer.prototype.snapshot = function () {
    var k = 1.4, c = document.createElement('canvas');
    c.width = 110 * k;
    c.height = 120 * k;
    var ctx = c.getContext('2d');
    ctx.translate(5 * k, 5 * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = '#1f4e9c';
    this.accepted.forEach(function (line) {
      ctx.beginPath();
      ctx.moveTo(line[0][0] * k, line[0][1] * k);
      for (var i = 1; i < line.length; i++) ctx.lineTo(line[i][0] * k, line[i][1] * k);
      if (line.length === 1) ctx.lineTo(line[0][0] * k + 0.1, line[0][1] * k);
      ctx.stroke();
    });
    return c.toDataURL('image/png');
  };

  Tracer.prototype.destroy = function () {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this.canvas.removeEventListener('pointermove', this._onMove);
    this.canvas.removeEventListener('pointerup', this._onUp);
    this.canvas.removeEventListener('pointercancel', this._onUp);
    window.removeEventListener('resize', this._onResize);
    if (this._observer) this._observer.disconnect();
  };

  window.Tracer = Tracer;
  window.LetterGrader = { gradeStroke: gradeStroke, gradeLetter: gradeLetter, resample: resample, LEVELS: LEVELS };
})();
