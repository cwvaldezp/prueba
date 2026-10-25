/*
 * Prueba los cálculos del portal de cuentas y los permisos del modo de prueba.
 * Uso: node tests/cuentas.js
 */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const memoria = {};
const ctx = {
  localStorage: { getItem: k => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = String(v); }, removeItem: k => { delete memoria[k]; } },
  crypto: require('crypto'), console
};
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['calc.js', 'store.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'cuentas', 'js', f), 'utf8'), ctx);
const C = ctx.Calc;
let pruebas = 0;
// Los objetos vienen de otro contexto de vm: se comparan como JSON.
const igual = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);
function prueba(nombre, fn) {
  return Promise.resolve().then(fn).then(() => { pruebas++; }, e => { console.error('✗ ' + nombre + '\n  ' + e.message); process.exitCode = 1; });
}

const depto = { id: 'a', nombre: 'Depto', moneda: 'USD', comision_pct: 10 };
const casa = { id: 'b', nombre: 'Casa', moneda: 'USD', comision_pct: 0 };
const movs = [
  { id: 1, cuenta_id: 'a', fecha: '2026-09-05', tipo: 'ingreso', categoria: 'Alquiler', monto: 500 },
  { id: 2, cuenta_id: 'a', fecha: '2026-09-10', tipo: 'gasto', categoria: 'Luz', monto: 40.1 },
  { id: 3, cuenta_id: 'a', fecha: '2026-09-15', tipo: 'egreso', categoria: 'Entrega al dueño', monto: 300 },
  { id: 4, cuenta_id: 'a', fecha: '2026-10-05', tipo: 'ingreso', categoria: 'Alquiler', monto: 500, fijo_id: 'f1' },
  { id: 5, cuenta_id: 'a', fecha: '2026-10-12', tipo: 'gasto', categoria: 'Reparaciones', monto: 120.2, descripcion: 'Plomero; "urgente"' },
  { id: 6, cuenta_id: 'b', fecha: '2026-10-01', tipo: 'ingreso', categoria: 'Alquiler', monto: 900 }
];

(async () => {
  await prueba('períodos', () => {
    const oct = C.periodo('mes', '2026-10');
    assert.strictEqual(oct.desde, '2026-10-01');
    assert.strictEqual(oct.hasta, '2026-10-31');
    assert.strictEqual(C.periodo('mes', '2028-02').hasta, '2028-02-29');
    assert.strictEqual(C.moverPeriodo(C.periodo('mes', '2026-01'), -1).ref, '2025-12');
    assert.strictEqual(C.moverPeriodo(C.periodo('mes', '2026-12'), 1).ref, '2027-01');
    assert.strictEqual(C.moverPeriodo(C.periodo('anio', '2026-10'), -1).desde, '2025-01-01');
    assert.strictEqual(C.periodo('todo').desde, null);
    assert.ok(C.enPeriodo('1999-01-01', C.periodo('todo')));
    assert.strictEqual(C.diasEntre('2026-10-25', '2026-11-01'), 7);
  });

  await prueba('totales con comisión y saldo', () => {
    const t = C.totales(movs.filter(m => m.cuenta_id === 'a'), depto);
    igual(
      { i: t.ingreso, g: t.gasto, e: t.egreso, c: t.comision, r: t.resultado, s: t.saldo },
      { i: 1000, g: 160.3, e: 300, c: 100, r: 739.7, s: 439.7 });
  });

  await prueba('resumen del mes y saldo acumulado', () => {
    const r = C.resumenCuenta(depto, movs, C.periodo('mes', '2026-10'));
    assert.strictEqual(r.periodo.ingreso, 500);
    assert.strictEqual(r.periodo.saldo, 500 - 120.2 - 50);
    assert.strictEqual(r.acumulado.saldo, 439.7);
    const sep = C.resumenCuenta(depto, movs, C.periodo('mes', '2026-09'));
    assert.strictEqual(sep.acumulado.saldo, 109.9, 'el saldo de septiembre no incluye octubre');
  });

  await prueba('suma por moneda', () => {
    const g = C.sumarPorMoneda([depto, casa, { id: 'z', moneda: 'ARS' }], movs, C.periodo('mes', '2026-10'));
    assert.strictEqual(g.USD.n, 2);
    assert.strictEqual(g.USD.periodo.ingreso, 1400);
    assert.strictEqual(g.ARS.periodo.ingreso, 0);
  });

  await prueba('por categoría y serie mensual', () => {
    const cats = C.porCategoria(movs.filter(m => m.cuenta_id === 'a'));
    igual(cats.map(c => c.tipo + ':' + c.categoria), ['ingreso:Alquiler', 'gasto:Reparaciones', 'gasto:Luz', 'egreso:Entrega al dueño']);
    assert.strictEqual(cats[0].n, 2);
    const s = C.serieMensual(movs, '2026-10', 3);
    igual(s.map(x => x.ym), ['2026-08', '2026-09', '2026-10']);
    assert.strictEqual(s[2].ingreso, 1400);
    assert.strictEqual(s[1].egreso, 300);
  });

  await prueba('pendientes del mes', () => {
    const fijos = [
      { id: 'f1', cuenta_id: 'a', tipo: 'ingreso', categoria: 'Alquiler', monto: 500, dia: 5 },
      { id: 'f2', cuenta_id: 'a', tipo: 'gasto', categoria: 'Expensas', monto: 80, dia: 31 },
      { id: 'f3', cuenta_id: 'a', tipo: 'gasto', categoria: 'Seguro', monto: 30, dia: 3, activo: false }
    ];
    const oct = C.pendientes(fijos, movs, '2026-10');
    igual(oct.map(p => p.fijo.id + '@' + p.fecha), ['f2@2026-10-31']);
    const feb = C.pendientes(fijos, movs, '2027-02');
    igual(feb.map(p => p.fijo.id + '@' + p.fecha), ['f1@2027-02-05', 'f2@2027-02-28']);
  });

  await prueba('aviso de contrato', () => {
    assert.strictEqual(C.avisoContrato({ contrato_fin: '2027-06-01' }, '2026-10-25', 60), null);
    igual(C.avisoContrato({ contrato_fin: '2026-11-15' }, '2026-10-25', 60), { dias: 21, vencido: false });
    igual(C.avisoContrato({ contrato_fin: '2026-10-20' }, '2026-10-25', 60), { dias: -5, vencido: true });
    assert.strictEqual(C.avisoContrato({}, '2026-10-25'), null);
  });

  await prueba('CSV para Excel', () => {
    const txt = C.csv(movs.filter(m => m.id === 5 || m.id === 1), { a: depto });
    const filas = txt.replace('﻿', '').trim().split('\r\n');
    assert.strictEqual(filas[0], 'Fecha;Cuenta;Tipo;Categoría;Descripción;Monto;Moneda');
    assert.strictEqual(filas[1], '2026-09-05;Depto;Ingreso;Alquiler;;500,00;USD');
    assert.strictEqual(filas[2], '2026-10-12;Depto;Gasto;Reparaciones;"Plomero; ""urgente""";-120,20;USD');
    assert.ok(C.csv([movs[0]], { a: depto }, { separador: ',', decimal: '.' }).includes('2026-09-05,Depto,Ingreso,Alquiler,,500.00,USD'));
  });

  await prueba('modo de prueba: la dueña ve sólo lo suyo y no puede editar', async () => {
    const s = ctx.DemoStore();
    await s.entrar('yo@ejemplo.com');
    const todo = await s.todo();
    assert.strictEqual(todo.cuentas.length, 3);
    assert.ok(await s.esAdmin());
    const centro = todo.cuentas.find(c => c.nombre === 'Depto. Centro');

    await s.entrar('MARIA@ejemplo.com ');
    assert.ok(!(await s.esAdmin()));
    const suyo = await s.todo();
    igual(suyo.cuentas.map(c => c.nombre), ['Depto. Centro']);
    assert.ok(suyo.movimientos.length > 0 && suyo.movimientos.every(m => m.cuenta_id === centro.id));
    assert.ok(suyo.accesos.every(a => a.email === 'maria@ejemplo.com'));
    await assert.rejects(s.guardarMovimiento({ cuenta_id: centro.id, fecha: '2026-10-01', tipo: 'gasto', categoria: 'Luz', monto: 10 }));
    await assert.rejects(s.guardarCuenta({ nombre: 'Nueva' }));
    await assert.rejects(s.borrarMovimiento(suyo.movimientos[0].id));

    await s.entrar('otro@ejemplo.com');
    const nada = await s.todo();
    assert.strictEqual(nada.cuentas.length + nada.movimientos.length + nada.fijos.length, 0);

    // Con rol "editar" sí puede cargar movimientos, pero sólo en su cuenta.
    await s.entrar('yo@ejemplo.com');
    const acc = (await s.todo()).accesos.find(a => a.email === 'maria@ejemplo.com');
    await s.guardarAcceso(Object.assign({}, acc, { rol: 'editar' }));
    await assert.rejects(s.guardarAcceso({ cuenta_id: centro.id, email: 'Maria@Ejemplo.com', rol: 'ver' }), /ya tiene acceso/);
    await s.entrar('maria@ejemplo.com');
    const nuevo = await s.guardarMovimiento({ cuenta_id: centro.id, fecha: '2026-10-01', tipo: 'gasto', categoria: 'Luz', monto: 10 });
    assert.strictEqual(nuevo.creado_por, 'maria@ejemplo.com');
    const otra = todo.cuentas.find(c => c.nombre === 'Casa Las Flores');
    await assert.rejects(s.guardarMovimiento({ cuenta_id: otra.id, fecha: '2026-10-01', tipo: 'gasto', categoria: 'Luz', monto: 10 }));
    await assert.rejects(s.guardarMovimiento(Object.assign({}, nuevo, { cuenta_id: otra.id })), 'no puede mover un movimiento a una cuenta ajena');
  });

  console.log(process.exitCode ? 'Hubo fallas.' : '✓ ' + pruebas + ' pruebas pasaron');
})();
