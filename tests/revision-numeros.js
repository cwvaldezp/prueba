/*
 * Prueba la revisión de los números con caminito: escritura temblorosa de niño
 * tiene que pasar; garabatos, ir y venir y trazos al revés no.
 * Uso: node tests/revision-numeros.js
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { performance: { now: () => 0 } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['numbers.js', 'tracer.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'numeros', 'js', f), 'utf8'), ctx);
const G = ctx.LetterGrader, R = l => G.resample(l, 2);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function wobble(line, amp) {
  const ph = rnd() * 6, ph2 = rnd() * 6;
  return R(line).map(([x, y], i) => [x + amp * Math.sin(i / 5 + ph) + (rnd() - .5), y + amp * Math.cos(i / 6 + ph2) + (rnd() - .5)]);
}
function zigzag(b, n) { const out = []; for (let i = 0; i <= n; i++) out.push([b[0] + (i % 2) * (b[2] - b[0]), b[1] + (b[3] - b[1]) * i / n]); return out; }
function bbox(st) { return [Math.min(...st.map(q => q[0])), Math.min(...st.map(q => q[1])), Math.max(...st.map(q => q[0])), Math.max(...st.map(q => q[1]))]; }
function backAndForth(line) { const r = R(line), out = []; for (let k = 0; k < 3; k++) out.push(...(k % 2 ? r.slice().reverse() : r)); return out; }

const res = { tembloroso: [], garabato: [], zigzag: [], alReves: [], fueraDeLaCaja: [] };
for (const level of ['easy', 'normal']) {
  const L = G.LEVELS[level];
  for (let n = 0; n <= 20; n++) {
    ctx.NUMBERS[n].map(R).forEach((st, i) => {
      const name = level + ':' + n + '.' + i;
      for (const amp of [2, 3.5]) {
        const p = G.gradeStroke([wobble(st, level === 'easy' ? amp * 1.4 : amp)], st, L);
        if (p) res.tembloroso.push(name + '~' + amp + ':' + p);
      }
      if (!G.gradeStroke([backAndForth(st)], st, L)) res.garabato.push(name);
      const b = bbox(st), zz = zigzag([b[0] - 5, b[1] - 5, b[2] + 5, b[3] + 5], 10);
      if (!G.gradeStroke([[st[0], ...zz]], st, L)) res.zigzag.push(name);
      const closed = Math.hypot(st[0][0] - st[st.length - 1][0], st[0][1] - st[st.length - 1][1]) < 10;
      if (!closed && !G.gradeStroke([st.slice().reverse()], st, L)) res.alReves.push(name);
      if (st.some(([x, y]) => x < -2 || y < 5 || x > ctx.NUMBER_WIDTHS[n] + 2 || y > 95)) res.fueraDeLaCaja.push(name);
    });
  }
}
let fallas = 0;
for (const k in res) { console.log(k.padEnd(14), res[k].length, res[k].slice(0, 20).join(' ')); fallas += res[k].length; }
if (fallas) { console.log('FALLÓ'); process.exit(1); }
console.log('OK');
