/*
 * Prueba la revisión de letras con escritura simulada de un niño (temblorosa,
 * más chica, corrida, en otro orden) y con garabatos. Uso: node tests/revision-letras.js
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { window: {}, performance: { now: () => 0 } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['letters.js', 'tracer.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'js', f), 'utf8'), ctx);
const G0 = ctx.LetterGrader, R = l => G0.resample(l, 2);
let OTHERS = [];
const G = { gradeStroke: G0.gradeStroke, gradeLetter: (ink, st) => G0.gradeLetter(ink, st, OTHERS), resample: G0.resample };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// Mano temblorosa de niño: ondulación suave + ruido
function wobble(line, amp = 3) {
  const ph = rnd() * 6, ph2 = rnd() * 6;
  return R(line).map(([x, y], i) => [x + amp * Math.sin(i / 5 + ph) + (rnd() - .5), y + amp * Math.cos(i / 6 + ph2) + (rnd() - .5)]);
}
const tf = (line, s, dx, dy) => line.map(([x, y]) => [50 + (x - 50) * s + dx, 50 + (y - 50) * s + dy]);
function zigzag(b, n = 8) { const out = []; for (let i = 0; i <= n; i++) out.push([b[0] + (i % 2) * (b[2] - b[0]), b[1] + (b[3] - b[1]) * i / n]); return out; }
function bboxOf(strokes) { const p = strokes.flat(); return [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))]; }
function backAndForth(line) { const r = R(line), out = []; for (let k = 0; k < 3; k++) out.push(...(k % 2 ? r.slice().reverse() : r)); return out; }

const res = { guidedOk: [], guidedScribble: [], guidedBlob: [], guidedReverse: [], freeOk: [], freeOrder: [], freeZig: [], freeRetrace: [], freeBlob: [] };
let confusions = [];
for (const style of ['upper', 'lower', 'cursive']) {
  const set = ctx.letterSet(style), lower = style !== 'upper';
  for (const L of ctx.ALPHABET) {
    const name = (style === 'cursive' ? '~' : '') + (lower ? L.toLowerCase() : L);
    const strokes = set[L].map(R);
    OTHERS = ctx.ALPHABET.filter(k => k !== L).map(k => set[k].map(R));
    strokes.forEach((st, i) => {
      if (G.gradeStroke([wobble(st)], st)) res.guidedOk.push(name + i + ':' + G.gradeStroke([wobble(st)], st));
      if (R(st).length > 3) {
        if (!G.gradeStroke([backAndForth(st)], st)) res.guidedScribble.push(name + i);
        const b = bboxOf([st]); const zz = zigzag([b[0] - 5, b[1] - 5, b[2] + 5, b[3] + 5], 10);
        if (!G.gradeStroke([[st[0], ...zz]], st)) res.guidedBlob.push(name + i);
        const isClosed = Math.hypot(st[0][0] - st[st.length - 1][0], st[0][1] - st[st.length - 1][1]) < 10;
        if (!isClosed && !G.gradeStroke([st.slice().reverse()], st)) res.guidedReverse.push(name + i);
      }
    });
    // Libre: más chica, corrida y temblorosa
    for (const [s, dx, dy] of [[1, 0, 0], [0.7, 12, 8], [0.8, -10, 5], [1.1, 0, -4]]) {
      const ink = strokes.map(st => wobble(tf(st, s, dx, dy), 2.5 * s));
      const r = G.gradeLetter(ink, strokes);
      if (r) res.freeOk.push(name + '@' + s + ':' + r);
    }
    // Otro orden y otra dirección de trazos
    const alt = strokes.slice().reverse().map(st => wobble(st.slice().reverse()));
    if (G.gradeLetter(alt, strokes)) res.freeOrder.push(name + ':' + G.gradeLetter(alt, strokes));
    // Garabatos
    const b = bboxOf(strokes);
    if (!G.gradeLetter([zigzag(b, 10)], strokes)) res.freeZig.push(name);
    if (!G.gradeLetter(strokes.map(backAndForth), strokes)) res.freeRetrace.push(name);
    const blob = []; for (let a = 0; a < 40; a += 0.3) blob.push([50 + (12 + a / 2) * Math.cos(a), 60 + (12 + a / 2) * Math.sin(a)]);
    if (!G.gradeLetter([blob], strokes)) res.freeBlob.push(name);
    // ¿Otra letra bien escrita pasa como esta?
    for (const M of ctx.ALPHABET) {
      if (M === L) continue;
      const other = set[M].map(R).map(st => wobble(st, 2));
      if (!G.gradeLetter(other, strokes)) confusions.push((style === 'cursive' ? '~' : '') + (lower ? M.toLowerCase() : M) + '→' + name);
    }
  }
}
for (const k in res) console.log(k.padEnd(15), res[k].length, res[k].slice(0, 30).join(' '));
console.log('otra letra aceptada:', confusions.length, 'de', 3 * 27 * 26, '\n', confusions.join(' '));

// Letras correctas que se rechazan y garabatos que se aceptan son fallas.
// (Zigzag en I, i, l es sólo una raya: es la letra misma.)
const fallas = res.guidedOk.length + res.freeOk.length + res.guidedScribble.length + res.guidedBlob.length +
  res.guidedReverse.length + res.freeRetrace.length + res.freeBlob.length +
  res.freeZig.filter(n => !'Iil'.includes(n)).length;
if (fallas || confusions.length > 15) { console.log('FALLÓ'); process.exit(1); }
console.log('OK');
