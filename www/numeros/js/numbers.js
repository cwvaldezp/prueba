/*
 * Trazos de cada número en una caja de 0..100 (los de dos cifras son más anchos).
 * Cada número es una lista de trazos (en el orden en que se escriben);
 * cada trazo es una lista de puntos [x, y] que se recorre en ese sentido.
 * También están los nombres de los números, los dibujitos para contar y
 * todo lo que dice la voz (se graba en js/voice-clips.js con tools/generar-voz-numeros.py).
 */
(function () {
  // Genera los puntos de un arco de elipse. Ángulos en grados, 0 = derecha, 90 = abajo.
  function arc(cx, cy, rx, ry, from, to, steps) {
    steps = steps || 24;
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var a = ((from + (to - from) * (i / steps)) * Math.PI) / 180;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
  }

  function join() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) out = out.concat(arguments[i]);
    return out;
  }

  function cubic(p0, p1, p2, p3, steps) {
    steps = steps || 16;
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var t = i / steps, u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
      ]);
    }
    return pts;
  }

  // El ocho: arriba, a la izquierda, cruza al centro, abajo y vuelve a subir por la izquierda.
  var eight = [];
  for (var i = 0; i <= 48; i++) {
    var t = (i / 48) * Math.PI * 2;
    eight.push([50 - 44 * Math.sin(t) * Math.cos(t), 50 - 40 * Math.cos(t)]);
  }

  var DIGITS = {
    0: [arc(50, 50, 26, 40, -90, -450, 40)],
    1: [[[34, 26], [56, 10], [56, 90]]],
    2: [join(arc(50, 32, 22, 22, 200, 380, 20), [[26, 90], [76, 90]])],
    3: [join(arc(48, 30, 21, 20, 200, 450, 22), arc(48, 70, 23, 20, 270, 520, 22))],
    4: [[[52, 10], [22, 64], [80, 64]], [[64, 34], [64, 90]]],
    5: [join([[33, 10], [31, 47]], arc(48, 66, 24, 24, 234, 500, 26)), [[33, 10], [72, 10]]],
    6: [join(cubic([68, 12], [44, 14], [28, 38], [28, 68], 16), arc(50, 68, 22, 22, 180, -180, 32))],
    7: [[[26, 10], [74, 10], [42, 90]]],
    8: [eight],
    9: [join(arc(48, 32, 22, 22, -20, -380, 32), [[69, 90]])]
  };

  // Números de dos cifras: cada cifra un poco más angosta, una al lado de la otra.
  var SQUEEZE = 0.72, GAP = 52;
  function twoDigits(n) {
    var out = [];
    String(n).split('').forEach(function (d, k) {
      DIGITS[d].forEach(function (st) {
        out.push(st.map(function (p) { return [(p[0] - 15) * SQUEEZE + k * GAP, p[1]]; }));
      });
    });
    return out;
  }

  var NUMBERS = {}, WIDTHS = {};
  for (var n = 0; n <= 20; n++) {
    NUMBERS[n] = n < 10 ? DIGITS[n] : twoDigits(n);
    WIDTHS[n] = n < 10 ? 100 : 70 * SQUEEZE + GAP;
  }

  var NAMES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
    'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte'];

  // Dibujitos para contar: el número n usa THINGS[n] (el 0 no tiene nada que contar). f = femenino.
  var THINGS = [null,
    { emoji: '🌞', one: 'sol', many: 'soles' },
    { emoji: '🐶', one: 'perrito', many: 'perritos' },
    { emoji: '🐱', one: 'gatito', many: 'gatitos' },
    { emoji: '🍎', one: 'manzana', f: true, many: 'manzanas' },
    { emoji: '⭐', one: 'estrella', f: true, many: 'estrellas' },
    { emoji: '🐟', one: 'pez', many: 'peces' },
    { emoji: '🎈', one: 'globo', many: 'globos' },
    { emoji: '🐞', one: 'mariquita', f: true, many: 'mariquitas' },
    { emoji: '🍓', one: 'fresa', f: true, many: 'fresas' },
    { emoji: '🐥', one: 'pollito', many: 'pollitos' },
    { emoji: '🚗', one: 'carrito', many: 'carritos' },
    { emoji: '🦋', one: 'mariposa', f: true, many: 'mariposas' },
    { emoji: '🌸', one: 'flor', f: true, many: 'flores' },
    { emoji: '🍪', one: 'galleta', f: true, many: 'galletas' },
    { emoji: '🐢', one: 'tortuga', f: true, many: 'tortugas' },
    { emoji: '⚽', one: 'pelota', f: true, many: 'pelotas' },
    { emoji: '🐸', one: 'rana', f: true, many: 'ranas' },
    { emoji: '🍌', one: 'plátano', many: 'plátanos' },
    { emoji: '🦆', one: 'patito', many: 'patitos' },
    { emoji: '🧸', one: 'osito', many: 'ositos' }
  ];

  window.PHRASES = {
    vamos: '¡Vamos a escribir números!',
    escribe: 'Escribe el',
    casi: 'Casi. Inténtalo otra vez',
    muy_bien: '¡Muy bien!',
    cuenta: '¡Ahora cuéntalos! Toca cada uno',
    cero: 'El cero es cuando no hay nada',
    premio: '¡Lo lograste! Aquí está tu premio',
    sin_premio: '¡Lo lograste! Pide a un adulto que elija tu premio'
  };

  // Cómo se dice lo que se contó: "un sol", "tres gatitos".
  window.countPhrase = function (n) {
    return n === 1 ? 'un ' + THINGS[1].one : NAMES[n] + ' ' + THINGS[n].many;
  };

  window.NUMBERS = NUMBERS;
  window.NUMBER_WIDTHS = WIDTHS;
  window.NUMBER_NAMES = NAMES;
  window.NUMBER_THINGS = THINGS;
  // El tracer comparte código con el del abecedario: le damos los "renglones" y los trazos.
  window.LETTER_LINES = { upper: [[10, false], [50, true], [90, false]] };
  window.letterSet = function () { return NUMBERS; };
})();
