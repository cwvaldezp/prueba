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

  // Cómo se dice cada letra (para la voz).
  var NAMES = {
    A: 'a', B: 'be', C: 'ce', D: 'de', E: 'e', F: 'efe', G: 'ge', H: 'hache',
    I: 'i', J: 'jota', K: 'ka', L: 'ele', M: 'eme', N: 'ene', Ñ: 'eñe', O: 'o',
    P: 'pe', Q: 'cu', R: 'erre', S: 'ese', T: 'te', U: 'u', V: 've', W: 'doble ve',
    X: 'equis', Y: 'ye', Z: 'zeta'
  };

  window.LETTERS = LETTERS;
  window.LETTER_NAMES = NAMES;
  window.ALPHABET = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
})();
