/*
 * Cálculos del portal de cuentas (sin pantalla, se prueban con node tests/cuentas.js).
 * Las fechas son siempre texto 'AAAA-MM-DD' para no tener líos con la zona horaria.
 *
 * Tres tipos de movimiento:
 *  - ingreso: dinero que entra (alquiler, sueldo…)
 *  - gasto:   lo que cuesta mantener la cuenta o el inmueble (luz, impuestos, arreglos…)
 *  - egreso:  dinero que sale sin ser gasto (entrega a la dueña, retiro, ahorro…)
 * Resultado = ingresos − gastos − comisión de administración.
 * Saldo = resultado − egresos (lo que queda en caja o falta entregar al dueño).
 */
(function (root) {
  var TIPOS = {
    ingreso: { nombre: 'Ingreso', plural: 'Ingresos', signo: '+' },
    gasto: { nombre: 'Gasto', plural: 'Gastos', signo: '−' },
    egreso: { nombre: 'Egreso', plural: 'Egresos', signo: '−' }
  };

  var CATEGORIAS = {
    ingreso: ['Alquiler', 'Depósito o garantía', 'Expensas cobradas', 'Sueldo', 'Honorarios', 'Intereses', 'Otros ingresos'],
    gasto: ['Expensas / condominio', 'Luz', 'Agua', 'Gas', 'Internet y teléfono', 'Impuestos', 'Seguro', 'Mantenimiento',
      'Reparaciones', 'Limpieza', 'Comisión inmobiliaria', 'Comida', 'Transporte', 'Salud', 'Educación', 'Otros gastos'],
    egreso: ['Entrega al dueño', 'Devolución de garantía', 'Retiro', 'Transferencia', 'Ahorro', 'Otros egresos']
  };

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function r2(n) { return Math.round(n * 100) / 100; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function hoy(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function diasDelMes(ym) {
    var p = ym.split('-');
    return new Date(+p[0], +p[1], 0).getDate();
  }
  function sumarMeses(ym, n) {
    var p = ym.split('-'), t = +p[0] * 12 + (+p[1] - 1) + n;
    return Math.floor(t / 12) + '-' + pad(t % 12 + 1);
  }
  function nombreMes(ym) {
    var p = ym.split('-');
    return MESES[+p[1] - 1] + ' ' + p[0];
  }
  function diasEntre(a, b) {
    var pa = a.split('-'), pb = b.split('-');
    return Math.round((Date.UTC(+pb[0], pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], pa[1] - 1, +pa[2])) / 864e5);
  }

  /* Período: modo 'mes' (ref 'AAAA-MM'), 'anio' (ref 'AAAA…') o 'todo'. Fechas inclusive. */
  function periodo(modo, ref) {
    if (modo === 'mes') {
      return { modo: modo, ref: ref, desde: ref + '-01', hasta: ref + '-' + pad(diasDelMes(ref)), etiqueta: nombreMes(ref) };
    }
    if (modo === 'anio') {
      var y = ref.slice(0, 4);
      return { modo: modo, ref: ref, desde: y + '-01-01', hasta: y + '-12-31', etiqueta: 'año ' + y };
    }
    return { modo: 'todo', ref: ref, desde: null, hasta: null, etiqueta: 'todo el historial' };
  }
  function moverPeriodo(per, delta) {
    if (per.modo === 'mes') return periodo('mes', sumarMeses(per.ref, delta));
    if (per.modo === 'anio') return periodo('anio', (+per.ref.slice(0, 4) + delta) + per.ref.slice(4));
    return per;
  }
  function enPeriodo(fecha, per) {
    return (!per.desde || fecha >= per.desde) && (!per.hasta || fecha <= per.hasta);
  }

  /* Totales de una lista de movimientos de una misma cuenta. */
  function totales(movs, cuenta) {
    var t = { ingreso: 0, gasto: 0, egreso: 0 };
    movs.forEach(function (m) { t[m.tipo] += Number(m.monto); });
    var pct = cuenta && cuenta.comision_pct ? Number(cuenta.comision_pct) : 0;
    t.ingreso = r2(t.ingreso);
    t.gasto = r2(t.gasto);
    t.egreso = r2(t.egreso);
    t.comision = r2(t.ingreso * pct / 100);
    t.resultado = r2(t.ingreso - t.gasto - t.comision);
    t.saldo = r2(t.resultado - t.egreso);
    return t;
  }

  /* Lo del período y el saldo acumulado hasta el final del período. */
  function resumenCuenta(cuenta, movs, per) {
    var propios = movs.filter(function (m) { return m.cuenta_id === cuenta.id; });
    return {
      periodo: totales(propios.filter(function (m) { return enPeriodo(m.fecha, per); }), cuenta),
      acumulado: totales(propios.filter(function (m) { return !per.hasta || m.fecha <= per.hasta; }), cuenta)
    };
  }

  /* Suma resúmenes de varias cuentas, separados por moneda: { USD: {periodo, acumulado}, … } */
  function sumarPorMoneda(cuentas, movs, per) {
    var out = {};
    cuentas.forEach(function (c) {
      var r = resumenCuenta(c, movs, per), o = out[c.moneda];
      if (!o) o = out[c.moneda] = { n: 0, periodo: {}, acumulado: {} };
      o.n++;
      ['periodo', 'acumulado'].forEach(function (k) {
        Object.keys(r[k]).forEach(function (f) { o[k][f] = r2((o[k][f] || 0) + r[k][f]); });
      });
    });
    return out;
  }

  function porCategoria(movs) {
    var map = {};
    movs.forEach(function (m) {
      var k = m.tipo + '|' + m.categoria;
      if (!map[k]) map[k] = { tipo: m.tipo, categoria: m.categoria, total: 0, n: 0 };
      map[k].total = r2(map[k].total + Number(m.monto));
      map[k].n++;
    });
    var orden = { ingreso: 0, gasto: 1, egreso: 2 };
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return orden[a.tipo] - orden[b.tipo] || b.total - a.total;
    });
  }

  /* n meses terminando en hastaYM: [{ ym, ingreso, gasto, egreso }] */
  function serieMensual(movs, hastaYM, n) {
    var serie = [], idx = {};
    for (var i = n - 1; i >= 0; i--) {
      var ym = sumarMeses(hastaYM, -i);
      idx[ym] = serie.length;
      serie.push({ ym: ym, ingreso: 0, gasto: 0, egreso: 0 });
    }
    movs.forEach(function (m) {
      var j = idx[m.fecha.slice(0, 7)];
      if (j !== undefined) serie[j][m.tipo] = r2(serie[j][m.tipo] + Number(m.monto));
    });
    return serie;
  }

  /* Cobros y pagos fijos del mes que todavía no se registraron. */
  function pendientes(fijos, movs, ym) {
    var hechos = {};
    movs.forEach(function (m) { if (m.fijo_id && m.fecha.slice(0, 7) === ym) hechos[m.fijo_id] = true; });
    return fijos.filter(function (f) { return f.activo !== false && !hechos[f.id]; }).map(function (f) {
      return { fijo: f, fecha: ym + '-' + pad(Math.min(f.dia || 1, diasDelMes(ym))) };
    }).sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
  }

  /* Aviso de contrato: vencido o vence dentro de `dias` días. */
  function avisoContrato(cuenta, fechaHoy, dias) {
    if (!cuenta.contrato_fin) return null;
    var d = diasEntre(fechaHoy, cuenta.contrato_fin);
    if (d > (dias || 60)) return null;
    return { dias: d, vencido: d < 0 };
  }

  /* CSV para Excel. Por defecto separador ';' y coma decimal (Excel en español). */
  function csv(movs, cuentasPorId, opciones) {
    opciones = opciones || {};
    var sep = opciones.separador || ';', dec = opciones.decimal || ',';
    function campo(v) {
      v = v == null ? '' : String(v);
      return v.indexOf(sep) >= 0 || /["\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    function num(n) { return Number(n).toFixed(2).replace('.', dec); }
    var filas = [['Fecha', 'Cuenta', 'Tipo', 'Categoría', 'Descripción', 'Monto', 'Moneda']];
    movs.forEach(function (m) {
      var c = cuentasPorId[m.cuenta_id] || {};
      filas.push([m.fecha, c.nombre || '', TIPOS[m.tipo].nombre, m.categoria, m.descripcion || '',
        num(m.tipo === 'ingreso' ? m.monto : -m.monto), c.moneda || '']);
    });
    return '﻿' + filas.map(function (f) { return f.map(campo).join(sep); }).join('\r\n') + '\r\n';
  }

  function ordenarMovimientos(movs) {
    return movs.slice().sort(function (a, b) {
      return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (b.created_at || '') < (a.created_at || '') ? -1 : 1;
    });
  }

  root.Calc = {
    TIPOS: TIPOS, CATEGORIAS: CATEGORIAS, MESES: MESES,
    hoy: hoy, diasDelMes: diasDelMes, sumarMeses: sumarMeses, nombreMes: nombreMes, diasEntre: diasEntre,
    periodo: periodo, moverPeriodo: moverPeriodo, enPeriodo: enPeriodo,
    totales: totales, resumenCuenta: resumenCuenta, sumarPorMoneda: sumarPorMoneda, porCategoria: porCategoria,
    serieMensual: serieMensual, pendientes: pendientes, avisoContrato: avisoContrato, csv: csv,
    ordenarMovimientos: ordenarMovimientos
  };
})(typeof window !== 'undefined' ? window : globalThis);
