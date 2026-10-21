/*
 * Trazos de cada letra mayúscula en una caja de 0..100.
 * Cada letra es una lista de trazos (en el orden en que se escriben);
 * cada trazo es una lista de puntos [x, y] que se recorre en ese sentido.
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

  var O = arc(50, 50, 30, 40, -90, -450, 40);
  var N = [[25, 90], [25, 18], [75, 90], [75, 18]];

  var LETTERS = {
    A: [[[50, 10], [20, 90]], [[50, 10], [80, 90]], [[33, 62], [67, 62]]],
    B: [
      [[26, 10], [26, 90]],
      join([[26, 10]], arc(52, 30, 22, 20, -90, 90, 20), [[26, 50]]),
      join([[26, 50]], arc(55, 70, 24, 20, -90, 90, 20), [[26, 90]])
    ],
    C: [arc(54, 50, 30, 40, -40, -320, 36)],
    D: [
      [[26, 10], [26, 90]],
      join([[26, 10]], arc(38, 50, 38, 40, -90, 90, 30), [[26, 90]])
    ],
    E: [[[28, 10], [28, 90]], [[28, 10], [75, 10]], [[28, 50], [66, 50]], [[28, 90], [75, 90]]],
    F: [[[30, 10], [30, 90]], [[30, 10], [76, 10]], [[30, 50], [66, 50]]],
    G: [arc(52, 50, 30, 40, -45, -330, 36), [[56, 56], [80, 56], [80, 84]]],
    H: [[[25, 10], [25, 90]], [[75, 10], [75, 90]], [[25, 50], [75, 50]]],
    I: [[[50, 10], [50, 90]]],
    J: [join([[64, 10]], arc(45, 68, 19, 22, 0, 180, 18))],
    K: [[[28, 10], [28, 90]], [[74, 10], [28, 56]], [[42, 44], [76, 90]]],
    L: [[[30, 10], [30, 90], [76, 90]]],
    M: [[[18, 90], [18, 10], [50, 62], [82, 10], [82, 90]]],
    N: [N.slice()],
    Ñ: [N.slice(), [[33, 9], [41, 3], [50, 8], [59, 12], [67, 6]]],
    O: [O],
    P: [[[28, 10], [28, 90]], join([[28, 10]], arc(54, 31, 22, 21, -90, 90, 20), [[28, 52]])],
    Q: [O, [[56, 66], [82, 94]]],
    R: [
      [[28, 10], [28, 90]],
      join([[28, 10]], arc(54, 31, 22, 21, -90, 90, 20), [[28, 52]]),
      [[50, 52], [76, 90]]
    ],
    S: [join(arc(50, 30, 22, 20, -20, -270, 22), arc(50, 70, 24, 20, -90, 160, 24))],
    T: [[[20, 10], [80, 10]], [[50, 10], [50, 90]]],
    U: [join([[25, 10]], arc(50, 60, 25, 30, 180, 0, 24), [[75, 10]])],
    V: [[[20, 10], [50, 90], [80, 10]]],
    W: [[[12, 10], [30, 90], [50, 35], [70, 90], [88, 10]]],
    X: [[[22, 10], [78, 90]], [[78, 10], [22, 90]]],
    Y: [[[22, 10], [50, 50]], [[78, 10], [50, 50], [50, 90]]],
    Z: [[[22, 10], [78, 10], [22, 90], [78, 90]]]
  };

  /*
   * Minúsculas. Renglones: ascendentes arriba (10), cuerpo de la letra
   * entre 45 y 80 (línea base) y descendentes hasta 107.
   */
  var round = arc(48, 62.5, 17, 17.5, -20, -380, 36);   // panza de a, d, g, q
  var belly = arc(49, 62.5, 17, 17.5, 180, 540, 36);    // panza de b, p
  var hump = join(arc(49, 62, 17, 17, 180, 360, 18), [[66, 80]]); // puente de h, n
  var n = [[[32, 45], [32, 80]], hump];

  var LOWER = {
    A: [round, [[65, 45], [65, 80]]],
    B: [[[32, 10], [32, 80]], belly],
    C: [arc(52, 62.5, 18, 17.5, -40, -320, 30)],
    D: [round, [[65, 10], [65, 80]]],
    E: [join([[32, 62.5], [68, 62.5]], arc(50, 62.5, 18, 17.5, 0, -320, 30))],
    F: [join(arc(58, 22, 12, 12, -20, -180, 12), [[46, 80]]), [[34, 45], [62, 45]]],
    G: [round, join([[65, 45], [65, 95]], arc(49, 95, 16, 12, 0, 180, 14))],
    H: [[[32, 10], [32, 80]], hump],
    I: [[[50, 45], [50, 80]], [[50, 30]]],
    J: [join([[55, 45], [55, 95]], arc(40, 95, 15, 12, 0, 180, 14)), [[55, 30]]],
    K: [[[32, 10], [32, 80]], [[64, 45], [32, 66]], [[42, 60], [66, 80]]],
    L: [[[50, 10], [50, 80]]],
    M: [
      [[25, 45], [25, 80]],
      join(arc(36, 57, 11, 12, 180, 360, 14), [[47, 80]]),
      join(arc(58, 57, 11, 12, 180, 360, 14), [[69, 80]])
    ],
    N: n,
    Ñ: n.concat([[[36, 32], [43, 27], [50, 32], [57, 36], [64, 30]]]),
    O: [arc(50, 62.5, 18, 17.5, -90, -450, 36)],
    P: [[[32, 45], [32, 107]], belly],
    Q: [round, [[65, 45], [65, 107]]],
    R: [[[36, 45], [36, 80]], arc(52, 60, 16, 14, 180, 300, 12)],
    S: [join(arc(50, 54, 15, 9, -20, -270, 18), arc(50, 72, 16, 9, -90, 160, 18))],
    T: [[[48, 20], [48, 80]], [[34, 45], [62, 45]]],
    U: [join([[32, 45]], arc(49, 63, 17, 17, 180, 0, 18), [[66, 45]]), [[66, 45], [66, 80]]],
    V: [[[30, 45], [50, 80], [70, 45]]],
    W: [[[20, 45], [32, 80], [50, 52], [68, 80], [80, 45]]],
    X: [[[32, 45], [68, 80]], [[68, 45], [32, 80]]],
    Y: [[[32, 45], [50, 80]], [[68, 45], [40, 107]]],
    Z: [[[32, 45], [68, 45], [32, 80], [68, 80]]]
  };

  /*
   * Cursiva (letra ligada), sólo minúsculas, en los mismos renglones que abc.
   * Cada letra entra desde abajo a la izquierda y sale hacia la derecha para
   * poder unirse con la siguiente. Se dibujan con curvas de Bézier.
   */
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
  // Subida de entrada: desde la línea base, a la izquierda, hasta el punto p.
  function lead(p) { return cubic([16, 80], [26, 82], [p[0] - 8, p[1] + 14], p, 12); }
  // Salida hacia la derecha desde el punto p (abajo), para unirse a la siguiente letra.
  function exit(p) { return cubic(p, [p[0] + 1, p[1] + 8], [p[0] + 10, p[1] + 8], [84, 68], 12); }
  // Salida alta (después de o, b, v, w), a la altura de la línea media.
  function exitHigh(p) { return cubic(p, [p[0] + 6, p[1] - 2], [p[0] + 12, p[1] - 2], [84, 46], 10); }
  // Bucle alto de b, h, k, l, f: sube desde la base y baja por x.
  function loopUp(x) {
    return join(cubic([16, 80], [34, 74], [x + 16, 44], [x + 12, 18], 16), cubic([x + 12, 18], [x + 10, 6], [x - 2, 8], [x, 24], 10));
  }
  var oval = function (from) { return arc(48, 63, 13, 17, from, from - 360, 30); };
  var ovalA = oval(-40);  // a, d, g, q empiezan arriba a la derecha del óvalo, sin subida
  var hump = function (x0, x1) {                                 // puente de n, m, h
    return join(cubic([x0, 80], [x0, 52], [x0 + 6, 45], [(x0 + x1) / 2, 45], 10), cubic([(x0 + x1) / 2, 45], [x1 - 2, 45], [x1, 52], [x1, 62], 8));
  };
  var cn = join(lead([30, 45]), [[30, 80]], hump(30, 60), [[60, 74]], exit([60, 74]));

  var CURSIVE = {
    A: [join(ovalA, [[62, 45], [62, 74]], exit([62, 74]))],
    B: [join(loopUp(40), [[40, 74]], cubic([40, 74], [42, 84], [62, 82], [62, 62]), cubic([62, 62], [62, 52], [56, 47], [52, 50], 8), exitHigh([52, 50]))],
    C: [join(arc(48, 63, 13, 17, -50, -300, 24), cubic([54.5, 77.7], [60, 80], [70, 78], [84, 68], 10))],
    D: [join(ovalA, [[62, 45], [62, 10], [62, 74]], exit([62, 74]))],
    E: [join(cubic([18, 76], [40, 72], [62, 62], [56, 50]), cubic([56, 50], [50, 40], [34, 44], [34, 60]), cubic([34, 60], [34, 78], [52, 84], [84, 68]))],
    F: [join(loopUp(40), [[40, 104]], cubic([40, 104], [40, 114], [58, 106], [54, 86]), cubic([54, 86], [58, 78], [68, 74], [84, 68]))],
    G: [join(ovalA, [[62, 45], [62, 98]], cubic([62, 98], [62, 112], [42, 112], [45, 98]), cubic([45, 98], [48, 86], [66, 80], [84, 70]))],
    H: [join(loopUp(36), [[36, 80]], hump(36, 62), [[62, 74]], exit([62, 74]))],
    I: [join(lead([46, 45]), [[46, 74]], exit([46, 74])), [[46, 30]]],
    J: [join(lead([48, 45]), [[48, 100]], cubic([48, 100], [48, 112], [32, 110], [35, 98]), cubic([35, 98], [38, 86], [62, 80], [84, 70])), [[48, 30]]],
    K: [join(loopUp(36), [[36, 80]], cubic([36, 80], [36, 56], [56, 42], [60, 50]), cubic([60, 50], [64, 60], [48, 64], [44, 62]), cubic([44, 62], [56, 66], [62, 78], [84, 68]))],
    L: [join(loopUp(40), cubic([40, 24], [40, 44], [40, 62], [42, 74]), exit([42, 74]))],
    M: [join(lead([24, 45]), [[24, 80]], hump(24, 44), [[44, 80]], hump(44, 64), [[64, 74]], exit([64, 74]))],
    N: [cn],
    Ñ: [cn, [[36, 32], [43, 27], [50, 32], [57, 36], [64, 30]]],
    O: [join(arc(48, 63, 13, 17, -90, -450, 30), exitHigh([48, 46]))],
    P: [join(lead([36, 45]), [[36, 107], [36, 62]], cubic([36, 62], [40, 44], [64, 44], [64, 62]), cubic([64, 62], [64, 82], [42, 82], [38, 74]), cubic([38, 74], [52, 80], [68, 78], [84, 68]))],
    Q: [join(ovalA, [[62, 45], [62, 104]], cubic([62, 104], [62, 96], [72, 86], [84, 76]))],
    R: [join(lead([36, 46]), [[46, 44], [48, 50]], [[48, 74]], exit([48, 74]))],
    S: [join(lead([46, 44]), cubic([46, 44], [60, 58], [62, 78], [46, 80]), cubic([46, 80], [40, 80], [36, 78], [36, 74], 6), cubic([36, 74], [46, 84], [66, 80], [84, 68]))],
    T: [join(lead([44, 20]), [[44, 74]], exit([44, 74])), [[32, 45], [58, 45]]],
    U: [join(lead([34, 45]), [[34, 70]], cubic([34, 70], [35, 82], [58, 84], [60, 60]), [[60, 45], [60, 74]], exit([60, 74]))],
    V: [join(lead([34, 46]), cubic([34, 46], [38, 64], [44, 80], [50, 80]), cubic([50, 80], [58, 80], [64, 60], [64, 46]), exitHigh([64, 46]))],
    W: [join(lead([26, 46]), [[26, 70]], cubic([26, 70], [27, 82], [44, 82], [45, 62]), [[45, 46]], cubic([45, 46], [45, 82], [64, 84], [65, 46]), exitHigh([65, 46]))],
    X: [join(lead([30, 47]), cubic([30, 47], [44, 44], [48, 80], [64, 78]), exit([64, 78]).slice(1)), [[64, 46], [34, 80]]],
    Y: [join(lead([32, 46]), [[32, 70]], cubic([32, 70], [33, 82], [56, 82], [58, 60]), [[58, 46], [58, 100]], cubic([58, 100], [58, 112], [42, 110], [44, 98]), cubic([44, 98], [48, 86], [66, 80], [84, 70]))],
    Z: [join(lead([32, 46]), [[60, 46], [34, 78]], cubic([34, 78], [46, 74], [62, 78], [84, 68]))]
  };

  // Renglones de cuaderno para cada tipo de letra: [altura, punteado].
  var LINES = {
    upper: [[10, false], [50, true], [90, false]],
    lower: [[10, false], [45, true], [80, false], [107, true]],
    cursive: [[10, false], [45, true], [80, false], [107, true]]
  };

  // Cómo se dice cada letra (para la voz).
  var NAMES = {
    A: 'a', B: 'be', C: 'ce', D: 'de', E: 'e', F: 'efe', G: 'ge', H: 'hache',
    I: 'i', J: 'jota', K: 'ka', L: 'ele', M: 'eme', N: 'ene', Ñ: 'eñe', O: 'o',
    P: 'pe', Q: 'cu', R: 'erre', S: 'ese', T: 'te', U: 'u', V: 've', W: 'doble ve',
    X: 'equis', Y: 'ye', Z: 'zeta'
  };

  window.LETTERS = LETTERS;
  window.LOWER_LETTERS = LOWER;
  window.CURSIVE_LETTERS = CURSIVE;
  // Trazos según el tipo de letra elegido: 'upper' (ABC), 'lower' (abc) o 'cursive'.
  window.letterSet = function (style) {
    return style === 'cursive' ? CURSIVE : style === 'lower' ? LOWER : LETTERS;
  };
  window.LETTER_LINES = LINES;
  window.LETTER_NAMES = NAMES;
  window.ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
})();
