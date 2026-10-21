/*
 * Pizarra para aprender a escribir una letra.
 * Muestra la letra como un "caminito", con un punto verde donde empieza
 * cada trazo, una flecha que indica hacia dónde ir y un dedito animado
 * que enseña el movimiento. El niño debe repasar cada trazo en orden.
 *
 * Todo se guarda en coordenadas de la letra (0..100) y se dibuja escalado.
 */
(function () {
  var TOLERANCE = 10;      // qué tan lejos del camino se acepta el dedo (unidades de letra)
  var COVERAGE_OK = 0.8;   // porcentaje del trazo que hay que cubrir
  var PRECISION_MIN = 0.55; // porcentaje mínimo de la tinta que debe estar sobre el camino
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

  function Tracer(canvas, letter, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.letter = letter;
    this.opts = opts || {};
    this.strokes = window.LETTERS[letter].map(function (s) { return resample(s, 2); });
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
    this.pad = this.size * 0.1;
    this.scale = (this.size - this.pad * 2) / 100;
    this.offX = (w - this.size) / 2 + this.pad;
    this.offY = (h - this.size) / 2 + this.pad;
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

    // Renglones de cuaderno: arriba, medio (punteado) y abajo.
    ctx.lineWidth = 2;
    [[10, '#9ecbf0', []], [50, '#cfe3f5', [8, 8]], [90, '#9ecbf0', []]].forEach(function (r) {
      ctx.strokeStyle = r[1];
      ctx.setLineDash(r[2]);
      self.path([[-8, r[0]], [108, r[0]]]);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // Caminito de cada trazo.
    this.strokes.forEach(function (st, i) {
      ctx.lineWidth = 16 * s;
      ctx.strokeStyle = i < self.current ? '#c8f7c5' : i === self.current ? '#ffe9a8' : '#ececec';
      self.path(st);
      ctx.stroke();
    });

    if (!this.finished) {
      var st = this.strokes[this.current];
      var color = COLORS[this.current % COLORS.length];
      // Línea central punteada del trazo actual.
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.setLineDash([6, 8]);
      this.path(st);
      ctx.stroke();
      ctx.setLineDash([]);

      // Flecha al final del trazo.
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

    // Tinta del niño.
    ctx.lineWidth = 6 * s;
    ctx.strokeStyle = '#1f4e9c';
    this.accepted.concat(this.pending).forEach(function (line) {
      self.path(line);
      ctx.stroke();
    });

    // Dedito guía (sólo cuando el niño no está dibujando).
    if (!this.finished && !this.drawing && this.pending.length === 0) {
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
    this.check();
  };

  Tracer.prototype.check = function () {
    var target = this.strokes[this.current];
    var ink = this.pending;
    var inkPts = [];
    ink.forEach(function (line) { inkPts = inkPts.concat(resample(line, 2)); });

    var covered = target.filter(function (p) {
      return ink.some(function (line) { return distToPolyline(p, line) < TOLERANCE; });
    }).length / target.length;
    var precise = inkPts.filter(function (p) { return distToPolyline(p, target) < TOLERANCE * 1.5; }).length / inkPts.length;

    if (precise < PRECISION_MIN) {
      this.pending = [];
      this.guideStart = performance.now();
      if (this.opts.onRetry) this.opts.onRetry();
      return;
    }
    if (covered >= COVERAGE_OK) {
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
    } else if (this.opts.onKeepGoing) {
      this.opts.onKeepGoing();
    }
  };

  // Vuelve a empezar la letra desde el primer trazo.
  Tracer.prototype.reset = function () {
    this.current = 0;
    this.accepted = [];
    this.pending = [];
    this.finished = false;
    this.guideStart = performance.now();
  };

  // Imagen (PNG transparente) con la letra tal como la escribió el niño.
  Tracer.prototype.snapshot = function () {
    var size = 160, c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var ctx = c.getContext('2d'), k = size / 100;
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
  };

  window.Tracer = Tracer;
})();
