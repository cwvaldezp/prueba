(function () {
  var $ = function (id) { return document.getElementById(id); };
  var cfg = window.CUENTAS_CONFIG, C = window.Calc, store = window.crearStore(cfg);

  var S = {
    yo: null, admin: false, hayAdmin: true,
    cuentas: [], accesos: [], fijos: [], movs: [],
    per: C.periodo('mes', C.hoy().slice(0, 7)),
    filtro: { cuenta: '', tipo: '', q: '' },
    grafico: '', verArchivadas: false
  };

  var AYUDA_TIPO = {
    ingreso: 'Dinero que entra: alquiler, sueldo, depósito…',
    gasto: 'Lo que cuesta mantener la cuenta o el inmueble: luz, impuestos, arreglos…',
    egreso: 'Dinero que sale sin ser gasto: entrega a la dueña, retiro, ahorro…'
  };

  /* ---------- Utilidades ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var formatos = {};
  function fmt(n, moneda) {
    moneda = (moneda || cfg.MONEDA).toUpperCase();
    if (!formatos[moneda]) {
      try { formatos[moneda] = new Intl.NumberFormat(cfg.IDIOMA, { style: 'currency', currency: moneda }); } catch (e) {
        var num = new Intl.NumberFormat(cfg.IDIOMA, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        formatos[moneda] = { format: function (x) { return moneda + ' ' + num.format(x); } };
      }
    }
    return formatos[moneda].format(n || 0);
  }
  function fmtFecha(f) {
    var p = f.split('-'), txt = +p[2] + ' ' + C.MESES[+p[1] - 1].slice(0, 3);
    return p[0] === C.hoy().slice(0, 4) ? txt : txt + ' ' + p[0];
  }
  function porId(lista, id) { return lista.filter(function (x) { return x.id === id; })[0]; }
  function cuentasPorId() {
    var o = {};
    S.cuentas.forEach(function (c) { o[c.id] = c; });
    return o;
  }
  function miAcceso(cid) {
    return S.accesos.filter(function (a) { return a.cuenta_id === cid && a.email === S.yo; })[0];
  }
  function puedeEditar(cid) { var a = miAcceso(cid); return S.admin || !!(a && a.rol === 'editar'); }
  function cuentasVisibles() {
    return S.cuentas.filter(function (c) { return !c.archivada; }).sort(function (a, b) {
      return (a.tipo === b.tipo ? 0 : a.tipo === 'personal' ? 1 : -1) || a.nombre.localeCompare(b.nombre);
    });
  }
  function cuentasEditables() { return cuentasVisibles().filter(function (c) { return puedeEditar(c.id); }); }
  function movsDe(cid) { return S.movs.filter(function (m) { return m.cuenta_id === cid; }); }
  function mesDeReferencia() { return S.per.modo === 'mes' ? S.per.ref : C.hoy().slice(0, 7); }
  function signo(tipo) { return tipo === 'ingreso' ? '+' : '−'; }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 2800);
  }
  function fallo(e) { toast('⚠️ ' + (e && e.message || e)); }

  function descargar(nombre, texto, tipo) {
    var url = URL.createObjectURL(new Blob([texto], { type: tipo }));
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- Sesión ---------- */

  function iniciar() {
    return store.sesion().then(function (u) {
      if (!u && store.demo) return store.entrar(store.usuariosDemo[0].email);
      return u;
    }).then(function (u) {
      if (!u) return mostrarLogin();
      S.yo = u.email;
      return Promise.all([store.esAdmin(), store.hayAdmin(), store.todo()]).then(function (r) {
        S.admin = r[0];
        S.hayAdmin = r[1];
        guardarDatos(r[2]);
        render();
      });
    }).catch(fallo);
  }
  function guardarDatos(d) {
    S.cuentas = d.cuentas;
    S.accesos = d.accesos;
    S.fijos = d.fijos;
    S.movs = d.movimientos;
  }
  function recargar() { return store.todo().then(function (d) { guardarDatos(d); render(); }); }

  function mostrarLogin() {
    S.yo = null;
    $('app').hidden = true;
    $('login').hidden = false;
    $('login-pass-row').hidden = store.demo;
    $('login-msg').textContent = store.demo ? 'En el modo de prueba basta con el correo (ej.: maria@ejemplo.com).' : '';
  }

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var modo = (e.submitter && e.submitter.dataset.modo) || 'entrar';
    var email = $('login-email').value, clave = $('login-pass').value, msg = $('login-msg');
    if (modo !== 'enlace' && !store.demo && clave.length < 6) {
      msg.textContent = 'Escribe tu contraseña (al menos 6 caracteres).';
      return;
    }
    msg.textContent = 'Un momento…';
    var accion = modo === 'enlace' ? store.enlaceMagico(email) : modo === 'registrarse' ? store.registrarse(email, clave) : store.entrar(email, clave);
    accion.then(function (r) {
      if (r === 'enviado') { msg.textContent = '📧 Te enviamos un enlace a ' + email + '. Ábrelo desde este mismo aparato.'; return; }
      if (!r) { msg.textContent = '📧 Listo. Revisa tu correo para confirmar tu usuario y después entra.'; return; }
      msg.textContent = '';
      $('login-pass').value = '';
      return iniciar();
    }).catch(function (err) { msg.textContent = '⚠️ ' + err.message; });
  });

  /* ---------- Pantallas ---------- */

  function ruta() { return (location.hash.slice(1) || 'resumen').split('/'); }

  function render() {
    if (!S.yo) return;
    $('login').hidden = true;
    $('app').hidden = false;
    document.body.classList.toggle('es-admin', S.admin);
    $('who-email').textContent = S.yo + (S.admin ? ' · administrador' : '');
    if (store.demo) $('demo-user').value = S.yo;

    var r = ruta(), vista = r[0];
    if (vista === 'cuentas' && !S.admin) vista = 'resumen';
    if (vista === 'cuenta' && !porId(S.cuentas, r[1])) vista = 'resumen';
    document.querySelectorAll('#tabs a').forEach(function (a) {
      a.classList.toggle('active', a.dataset.tab === vista || (vista === 'cuenta' && a.dataset.tab === 'resumen'));
    });
    $('fab').hidden = !cuentasEditables().length || vista === 'cuentas';

    var html;
    if (!S.cuentas.length && !S.admin) html = vistaSinCuentas();
    else if (vista === 'movimientos') html = vistaMovimientos();
    else if (vista === 'cuenta') html = vistaCuenta(porId(S.cuentas, r[1]));
    else if (vista === 'cuentas') html = vistaCuentas();
    else html = vistaResumen();
    $('view').innerHTML = html;
    if (vista === 'movimientos') pintarListaMovimientos();
  }

  function vistaSinCuentas() {
    if (!S.hayAdmin) {
      return '<section class="card vacio"><h2>👋 ¡Bienvenido!</h2><p>Todavía nadie administra este portal. ' +
        'Si eres quien lleva las cuentas, conviértete en el administrador: podrás crear cuentas e inmuebles ' +
        'y dar acceso a los dueños.</p><button class="btn primary" data-action="reclamar-admin">Ser el administrador</button></section>';
    }
    return '<section class="card vacio"><h2>Aún no tienes cuentas asignadas</h2><p>Pide a quien administra tus inmuebles que te dé acceso ' +
      'con este correo: <b>' + esc(S.yo) + '</b>. Cuando lo haga, vuelve a entrar.</p></section>';
  }

  function barraPeriodo() {
    var modos = [['mes', 'Mes'], ['anio', 'Año'], ['todo', 'Todo']];
    return '<div class="periodo"><div class="seg-mini">' + modos.map(function (m) {
      return '<button data-action="per-modo" data-modo="' + m[0] + '" class="' + (S.per.modo === m[0] ? 'on' : '') + '">' + m[1] + '</button>';
    }).join('') + '</div>' +
      (S.per.modo === 'todo' ? '<b class="per-txt">Todo el historial</b>' :
        '<button class="icon-btn" data-action="per-mover" data-d="-1" aria-label="Anterior">◀</button>' +
        '<b class="per-txt">' + esc(cap(S.per.etiqueta)) + '</b>' +
        '<button class="icon-btn" data-action="per-mover" data-d="1" aria-label="Siguiente">▶</button>') + '</div>';
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function filaTotal(etiqueta, valor, moneda, clase, nota) {
    return '<div class="fila ' + (clase || '') + '"><span>' + etiqueta + (nota ? ' <small class="muted">' + nota + '</small>' : '') +
      '</span><b>' + fmt(valor, moneda) + '</b></div>';
  }
  function bloqueTotales(t, moneda, pct) {
    return filaTotal('Ingresos', t.ingreso, moneda, 't-ingreso') +
      filaTotal('Gastos', -t.gasto, moneda, 't-gasto') +
      (pct ? filaTotal('Comisión administración', -t.comision, moneda, 't-gasto', pct + '%') : '') +
      filaTotal('Resultado', t.resultado, moneda, 'sep ' + (t.resultado < 0 ? 'neg' : '')) +
      filaTotal('Egresos / entregas', -t.egreso, moneda, 't-egreso');
  }
  function etiquetaSaldo(c) { return c.tipo === 'inmueble' ? 'Saldo en caja (por entregar)' : 'Saldo acumulado'; }

  function avisosDe(c) {
    var out = [], av = C.avisoContrato(c, C.hoy(), cfg.AVISO_CONTRATO_DIAS);
    if (av) out.push('<span class="chip ' + (av.vencido ? 'rojo' : 'ambar') + '">📄 ' +
      (av.vencido ? 'Contrato vencido hace ' + (-av.dias) + ' días' : av.dias === 0 ? 'El contrato vence hoy' : 'Contrato vence en ' + av.dias + ' días') + '</span>');
    var pend = C.pendientes(S.fijos.filter(function (f) { return f.cuenta_id === c.id; }), S.movs, C.hoy().slice(0, 7));
    var atrasados = pend.filter(function (p) { return p.fecha <= C.hoy(); }).length;
    if (atrasados) out.push('<span class="chip ambar">⏰ ' + atrasados + ' pendiente' + (atrasados > 1 ? 's' : '') + ' del mes</span>');
    return out.join('');
  }

  function tarjetaCuenta(c) {
    var r = C.resumenCuenta(c, S.movs, S.per), soloVer = !puedeEditar(c.id);
    return '<a class="card cuenta" href="#cuenta/' + c.id + '">' +
      '<div class="card-head"><span class="ico">' + (c.tipo === 'personal' ? '👤' : '🏢') + '</span>' +
      '<div><h3>' + esc(c.nombre) + '</h3><small class="muted">' + esc(c.direccion || (c.tipo === 'personal' ? 'Personal' : 'Inmueble')) +
      (soloVer ? ' · sólo lectura' : '') + '</small></div></div>' +
      bloqueTotales(r.periodo, c.moneda, c.comision_pct) +
      filaTotal(etiquetaSaldo(c), r.acumulado.saldo, c.moneda, 'saldo ' + (r.acumulado.saldo < 0 ? 'neg' : ''),
        S.per.modo === 'todo' ? '' : 'al ' + fmtFecha(S.per.hasta)) +
      '<div class="chips">' + avisosDe(c) + '</div></a>';
  }

  function vistaResumen() {
    var cuentas = cuentasVisibles(), html = barraPeriodo();
    if (!cuentas.length) {
      return html + '<section class="card vacio"><h2>Empecemos</h2><p>Crea tu primera cuenta: tus cuentas personales y cada inmueble que administras.</p>' +
        '<a class="btn primary" href="#cuentas">🏢 Crear cuentas</a></section>';
    }

    // Pendientes del mes
    var ym = mesDeReferencia(), pend = [];
    cuentas.forEach(function (c) {
      C.pendientes(S.fijos.filter(function (f) { return f.cuenta_id === c.id; }), S.movs, ym).forEach(function (p) {
        p.cuenta = c;
        pend.push(p);
      });
    });
    pend.sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
    if (pend.length) {
      html += '<section class="card"><h2>⏰ Pendientes de ' + esc(C.nombreMes(ym)) + '</h2><ul class="lista">' + pend.map(function (p) {
        var f = p.fijo, atrasado = p.fecha < C.hoy();
        return '<li class="item"><div class="item-main"><b>' + esc(f.descripcion || f.categoria) + '</b>' +
          '<small class="muted">' + esc(p.cuenta.nombre) + ' · ' + (atrasado ? '<span class="rojo-txt">desde el ' + fmtFecha(p.fecha) + '</span>' : 'el ' + fmtFecha(p.fecha)) + '</small></div>' +
          '<span class="monto t-' + f.tipo + '">' + signo(f.tipo) + fmt(f.monto, p.cuenta.moneda) + '</span>' +
          (puedeEditar(p.cuenta.id) ? '<button class="btn small" data-action="registrar-fijo" data-id="' + f.id + '" data-fecha="' + p.fecha + '">Registrar</button>' : '') +
          '</li>';
      }).join('') + '</ul></section>';
    }

    // Totales por moneda
    var grupos = C.sumarPorMoneda(cuentas, S.movs, S.per), monedas = Object.keys(grupos);
    if (cuentas.length > 1) {
      html += '<section class="totales">' + monedas.map(function (m) {
        var g = grupos[m];
        return '<div class="card total"><h2>Total ' + (monedas.length > 1 ? m : 'de todas las cuentas') + ' <small class="muted">' + g.n + ' cuentas</small></h2>' +
          '<div class="kpis">' +
          kpi('Ingresos', g.periodo.ingreso, m, 't-ingreso') + kpi('Gastos', g.periodo.gasto + g.periodo.comision, m, 't-gasto') +
          kpi('Egresos', g.periodo.egreso, m, 't-egreso') + kpi('Saldo en caja', g.acumulado.saldo, m, g.acumulado.saldo < 0 ? 'neg' : '') +
          '</div></div>';
      }).join('') + '</section>';
    }

    html += '<section class="grid">' + cuentas.map(tarjetaCuenta).join('') + '</section>';

    // Gráfico de los últimos 12 meses
    var opciones = monedas.map(function (m) { return ['moneda:' + m, 'Todas las cuentas' + (monedas.length > 1 ? ' en ' + m : '')]; })
      .concat(cuentas.map(function (c) { return [c.id, c.nombre]; }));
    if (!opciones.some(function (o) { return o[0] === S.grafico; })) S.grafico = opciones[0][0];
    var sel = S.grafico, movs, moneda;
    if (sel.indexOf('moneda:') === 0) {
      moneda = sel.slice(7);
      var ids = cuentas.filter(function (c) { return c.moneda === moneda; }).map(function (c) { return c.id; });
      movs = S.movs.filter(function (m) { return ids.indexOf(m.cuenta_id) >= 0; });
    } else {
      moneda = porId(S.cuentas, sel).moneda;
      movs = movsDe(sel);
    }
    html += '<section class="card"><div class="card-title"><h2>📈 Últimos 12 meses</h2><select data-grafico>' + opciones.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (o[0] === sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('') + '</select></div>' + grafico(C.serieMensual(movs, mesDeReferencia(), 12), moneda) + '</section>';
    return html;
  }

  function kpi(etiqueta, valor, moneda, clase) {
    return '<div class="kpi ' + (clase || '') + '"><small>' + etiqueta + '</small><b>' + fmt(valor, moneda) + '</b></div>';
  }

  /* Barras de ingresos y gastos por mes, con la línea del resultado. */
  function grafico(serie, moneda) {
    // El ancho del dibujo es el de la pantalla, así las letras quedan del mismo tamaño en el celular y en la PC.
    var W = Math.max(300, ($('view').clientWidth || 640) - 64), H = 210, izq = 4, abajo = 26, arriba = 12, ancho = (W - izq * 2) / serie.length;
    var max = Math.max.apply(null, serie.map(function (s) { return Math.max(s.ingreso, s.gasto); }).concat([1]));
    var y = function (v) { return arriba + (H - abajo - arriba) * (1 - v / max); };
    var barras = serie.map(function (s, i) {
      var x = izq + i * ancho, b = Math.max(4, ancho * 0.32), mes = C.MESES[+s.ym.slice(5) - 1].slice(0, 3);
      var tip = cap(C.nombreMes(s.ym)) + ' — ingresos ' + fmt(s.ingreso, moneda) + ', gastos ' + fmt(s.gasto, moneda) +
        ', resultado ' + fmt(s.ingreso - s.gasto, moneda);
      return '<g><title>' + esc(tip) + '</title>' +
        '<rect class="b-ingreso" x="' + (x + ancho / 2 - b - 1) + '" y="' + y(s.ingreso) + '" width="' + b + '" height="' + (H - abajo - y(s.ingreso)) + '" rx="2"/>' +
        '<rect class="b-gasto" x="' + (x + ancho / 2 + 1) + '" y="' + y(s.gasto) + '" width="' + b + '" height="' + (H - abajo - y(s.gasto)) + '" rx="2"/>' +
        '<rect x="' + x + '" y="0" width="' + ancho + '" height="' + H + '" fill="transparent"/>' +
        '<text x="' + (x + ancho / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + mes + '</text></g>';
    }).join('');
    var total = serie.reduce(function (a, s) { return { i: a.i + s.ingreso, g: a.g + s.gasto }; }, { i: 0, g: 0 });
    return '<div class="leyenda"><span><i class="b-ingreso"></i>Ingresos ' + fmt(total.i, moneda) + '</span>' +
      '<span><i class="b-gasto"></i>Gastos ' + fmt(total.g, moneda) + '</span>' +
      '<span>Resultado <b class="' + (total.i - total.g < 0 ? 'rojo-txt' : '') + '">' + fmt(total.i - total.g, moneda) + '</b></span></div>' +
      '<svg class="grafico" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ingresos y gastos por mes">' +
      '<line class="eje" x1="0" x2="' + W + '" y1="' + (H - abajo) + '" y2="' + (H - abajo) + '"/>' + barras + '</svg>';
  }

  /* ---------- Movimientos ---------- */

  function movsFiltrados() {
    var f = S.filtro, q = f.q.trim().toLowerCase(), ids = cuentasPorId();
    return C.ordenarMovimientos(S.movs.filter(function (m) {
      if (!ids[m.cuenta_id]) return false;
      if (f.cuenta ? m.cuenta_id !== f.cuenta : ids[m.cuenta_id].archivada) return false;
      if (f.tipo && m.tipo !== f.tipo) return false;
      if (!C.enPeriodo(m.fecha, S.per)) return false;
      return !q || ((m.descripcion || '') + ' ' + m.categoria + ' ' + ids[m.cuenta_id].nombre + ' ' + m.monto).toLowerCase().indexOf(q) >= 0;
    }));
  }

  function vistaMovimientos() {
    var f = S.filtro, todas = S.cuentas.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
    return barraPeriodo() + '<section class="card filtros">' +
      '<select data-filtro="cuenta"><option value="">Todas las cuentas</option>' + todas.map(function (c) {
        return '<option value="' + c.id + '"' + (f.cuenta === c.id ? ' selected' : '') + '>' + esc(c.nombre) + (c.archivada ? ' (archivada)' : '') + '</option>';
      }).join('') + '</select>' +
      '<select data-filtro="tipo"><option value="">Todos los tipos</option>' + Object.keys(C.TIPOS).map(function (t) {
        return '<option value="' + t + '"' + (f.tipo === t ? ' selected' : '') + '>' + C.TIPOS[t].plural + '</option>';
      }).join('') + '</select>' +
      '<input type="search" data-filtro="q" placeholder="Buscar…" value="' + esc(f.q) + '">' +
      '<button class="btn" data-action="csv">⬇️ Excel (CSV)</button></section>' +
      '<div id="mov-lista"></div>';
  }

  function pintarListaMovimientos() {
    var lista = movsFiltrados(), ids = cuentasPorId(), porMoneda = {};
    lista.forEach(function (m) {
      var mon = ids[m.cuenta_id].moneda;
      (porMoneda[mon] = porMoneda[mon] || []).push(m);
    });
    var resumen = Object.keys(porMoneda).map(function (mon) {
      var t = C.totales(porMoneda[mon]);
      return '<div class="kpis">' + kpi('Ingresos', t.ingreso, mon, 't-ingreso') + kpi('Gastos', t.gasto, mon, 't-gasto') +
        kpi('Egresos', t.egreso, mon, 't-egreso') + kpi('Neto', t.saldo, mon, t.saldo < 0 ? 'neg' : '') + '</div>';
    }).join('');
    $('mov-lista').innerHTML = (lista.length ? '<section class="card">' + resumen + '<p class="muted small">' + lista.length + ' movimientos</p></section>' : '') +
      listaMovimientos(lista, !S.filtro.cuenta);
  }

  function listaMovimientos(lista, conCuenta) {
    if (!lista.length) return '<p class="muted vacio-txt">No hay movimientos en este período.</p>';
    var ids = cuentasPorId();
    return '<ul class="lista movs card">' + lista.map(function (m) {
      var c = ids[m.cuenta_id], editable = puedeEditar(m.cuenta_id);
      return '<li class="item' + (editable ? ' clic' : '') + '"' + (editable ? ' data-action="editar-mov" data-id="' + m.id + '"' : '') + '>' +
        '<span class="fecha">' + fmtFecha(m.fecha) + '</span>' +
        '<div class="item-main"><b>' + esc(m.descripcion || m.categoria) + '</b><small class="muted">' +
        (conCuenta ? esc(c.nombre) + ' · ' : '') + esc(m.categoria) + (m.fijo_id ? ' · fijo' : '') + '</small></div>' +
        (m.comprobante ? '<button class="icon-btn" data-action="ver-comprobante" data-ruta="' + esc(m.comprobante) + '" title="Ver comprobante">📎</button>' : '') +
        '<span class="monto t-' + m.tipo + '">' + signo(m.tipo) + fmt(m.monto, c.moneda) + '</span></li>';
    }).join('') + '</ul>';
  }

  /* ---------- Estado de cuenta ---------- */

  function vistaCuenta(c) {
    var r = C.resumenCuenta(c, S.movs, S.per), t = r.periodo, editable = puedeEditar(c.id);
    var movs = C.ordenarMovimientos(movsDe(c.id).filter(function (m) { return C.enPeriodo(m.fecha, S.per); }));
    var anterior = Math.round((r.acumulado.saldo - t.saldo) * 100) / 100;
    var datos = [];
    if (c.inquilino) datos.push('Inquilino: <b>' + esc(c.inquilino) + '</b>');
    if (c.alquiler) datos.push('Alquiler: <b>' + fmt(c.alquiler, c.moneda) + '</b>');
    if (c.contrato_fin) datos.push('Contrato hasta: <b>' + fmtFecha(c.contrato_fin) + '</b>');
    if (c.comision_pct) datos.push('Comisión: <b>' + c.comision_pct + '%</b> de los ingresos');

    var html = '<div class="cuenta-head"><a href="#resumen" class="volver no-print">← Resumen</a>' +
      '<div class="titulo"><h1>' + (c.tipo === 'personal' ? '👤 ' : '🏢 ') + esc(c.nombre) + '</h1>' +
      (c.direccion ? '<p class="muted">' + esc(c.direccion) + '</p>' : '') +
      (datos.length ? '<p class="datos">' + datos.join(' · ') + '</p>' : '') +
      '<p class="muted small solo-print">Estado de cuenta · ' + esc(cap(S.per.etiqueta)) + ' · emitido el ' + fmtFecha(C.hoy()) + ' ' + C.hoy().slice(0, 4) + '</p>' +
      (c.notas && S.admin ? '<p class="nota no-print">📝 ' + esc(c.notas) + '</p>' : '') +
      '<div class="chips">' + avisosDe(c) + '</div></div>' +
      '<div class="acciones-cuenta no-print">' +
      (editable ? '<button class="btn primary" data-action="nuevo-movimiento" data-cuenta="' + c.id + '">＋ Movimiento</button>' : '') +
      '<button class="btn" data-action="imprimir">🖨️ Imprimir / PDF</button>' +
      '<button class="btn" data-action="csv" data-cuenta="' + c.id + '">⬇️ CSV</button>' +
      (S.admin ? '<button class="btn" data-action="editar-cuenta" data-id="' + c.id + '">✏️ Editar</button>' : '') +
      '</div></div>' + '<div class="no-print">' + barraPeriodo() + '</div>';

    html += '<section class="grid2"><div class="card"><h2>Estado de cuenta</h2>' +
      (S.per.modo !== 'todo' ? filaTotal('Saldo anterior', anterior, c.moneda, anterior < 0 ? 'neg' : '', 'antes del ' + fmtFecha(S.per.desde)) : '') +
      bloqueTotales(t, c.moneda, c.comision_pct) +
      filaTotal(etiquetaSaldo(c), r.acumulado.saldo, c.moneda, 'saldo ' + (r.acumulado.saldo < 0 ? 'neg' : ''), S.per.modo === 'todo' ? '' : 'al ' + fmtFecha(S.per.hasta)) +
      '</div><div class="card"><h2>Por categoría</h2>' + tablaCategorias(movs, c) + '</div></section>';

    html += '<section class="card"><h2>Movimientos de ' + esc(S.per.etiqueta) + '</h2>' + listaMovimientos(movs, false).replace('class="lista movs card"', 'class="lista movs"') + '</section>';

    html += '<section class="card no-print"><h2>📈 Últimos 12 meses</h2>' + grafico(C.serieMensual(movsDe(c.id), mesDeReferencia(), 12), c.moneda) + '</section>';
    html += seccionFijos(c, editable);
    if (S.admin) html += seccionAccesos(c);
    return html;
  }

  function tablaCategorias(movs, c) {
    var cats = C.porCategoria(movs);
    if (!cats.length) return '<p class="muted">Sin movimientos.</p>';
    var totalTipo = {};
    cats.forEach(function (k) { totalTipo[k.tipo] = (totalTipo[k.tipo] || 0) + k.total; });
    var ultimo = '';
    return cats.map(function (k) {
      var cab = k.tipo !== ultimo ? '<div class="fila cab t-' + k.tipo + '"><span>' + C.TIPOS[k.tipo].plural + '</span><b>' + fmt(totalTipo[k.tipo], c.moneda) + '</b></div>' : '';
      ultimo = k.tipo;
      var pct = totalTipo[k.tipo] ? k.total / totalTipo[k.tipo] * 100 : 0;
      return cab + '<div class="fila cat"><span>' + esc(k.categoria) + ' <small class="muted">×' + k.n + '</small></span><b>' + fmt(k.total, c.moneda) + '</b>' +
        '<i class="barra b-' + k.tipo + '" style="width:' + pct.toFixed(1) + '%"></i></div>';
    }).join('');
  }

  function seccionFijos(c, editable) {
    var fijos = S.fijos.filter(function (f) { return f.cuenta_id === c.id; }).sort(function (a, b) { return a.dia - b.dia; });
    if (!fijos.length && !editable) return '';
    var ym = mesDeReferencia(), pend = {};
    C.pendientes(fijos, S.movs, ym).forEach(function (p) { pend[p.fijo.id] = p.fecha; });
    return '<section class="card no-print"><div class="card-title"><h2>🔁 Cobros y pagos fijos</h2>' +
      (editable ? '<button class="btn small" data-action="nuevo-fijo" data-cuenta="' + c.id + '">＋ Agregar</button>' : '') + '</div>' +
      (fijos.length ? '<ul class="lista">' + fijos.map(function (f) {
        var estado = f.activo === false ? '<span class="chip">pausado</span>' :
          pend[f.id] ? '<span class="chip ambar">pendiente en ' + C.MESES[+ym.slice(5) - 1] + '</span>' : '<span class="chip verde">✓ ' + C.MESES[+ym.slice(5) - 1] + '</span>';
        return '<li class="item' + (editable ? ' clic' : '') + '"' + (editable ? ' data-action="editar-fijo" data-id="' + f.id + '"' : '') + '>' +
          '<span class="fecha">día ' + f.dia + '</span><div class="item-main"><b>' + esc(f.descripcion || f.categoria) + '</b>' +
          '<small class="muted">' + C.TIPOS[f.tipo].nombre + ' · ' + esc(f.categoria) + '</small></div>' + estado +
          '<span class="monto t-' + f.tipo + '">' + signo(f.tipo) + fmt(f.monto, c.moneda) + '</span>' +
          (editable && pend[f.id] ? '<button class="btn small" data-action="registrar-fijo" data-id="' + f.id + '" data-fecha="' + pend[f.id] + '">Registrar</button>' : '') +
          '</li>';
      }).join('') + '</ul>' : '<p class="muted small">Agrega el alquiler, las expensas o la entrega mensual a la dueña y el portal te avisará cada mes lo que falta registrar.</p>') +
      '</section>';
  }

  function seccionAccesos(c) {
    var accesos = S.accesos.filter(function (a) { return a.cuenta_id === c.id; });
    return '<section class="card no-print"><div class="card-title"><h2>🔑 Quién más puede ver esta cuenta</h2>' +
      '<button class="btn small" data-action="nuevo-acceso" data-cuenta="' + c.id + '">＋ Dar acceso</button></div>' +
      (accesos.length ? '<ul class="lista">' + accesos.map(function (a) {
        return '<li class="item clic" data-action="editar-acceso" data-id="' + a.id + '"><span class="ico">👤</span><div class="item-main"><b>' + esc(a.nombre || a.email) + '</b>' +
          '<small class="muted">' + esc(a.email) + '</small></div><span class="chip">' + (a.rol === 'editar' ? 've y carga' : 'sólo ve') + '</span></li>';
      }).join('') + '</ul>' : '<p class="muted small">Sólo tú. Si el inmueble es de otra persona, dale acceso con su correo: ' +
        'verá esta cuenta (y ninguna otra) con sus ingresos, gastos, egresos y saldo.</p>') + '</section>';
  }

  /* ---------- Administrar cuentas ---------- */

  function vistaCuentas() {
    var lista = S.cuentas.filter(function (c) { return S.verArchivadas || !c.archivada; })
      .sort(function (a, b) { return (a.archivada - b.archivada) || a.nombre.localeCompare(b.nombre); });
    var archivadas = S.cuentas.filter(function (c) { return c.archivada; }).length;
    return '<div class="card-title"><h1>Cuentas e inmuebles</h1><button class="btn primary" data-action="nueva-cuenta">＋ Nueva cuenta</button></div>' +
      '<section class="card"><ul class="lista">' + (lista.length ? lista.map(function (c) {
        var acc = S.accesos.filter(function (a) { return a.cuenta_id === c.id; });
        return '<li class="item"><span class="ico">' + (c.tipo === 'personal' ? '👤' : '🏢') + '</span>' +
          '<div class="item-main"><a href="#cuenta/' + c.id + '"><b>' + esc(c.nombre) + '</b></a><small class="muted">' +
          esc([c.moneda, c.direccion, c.comision_pct ? 'comisión ' + c.comision_pct + '%' : ''].filter(Boolean).join(' · ')) +
          (acc.length ? ' · 🔑 ' + acc.map(function (a) { return esc(a.nombre || a.email); }).join(', ') : '') + '</small></div>' +
          (c.archivada ? '<span class="chip">archivada</span>' : '') +
          '<button class="btn small" data-action="editar-cuenta" data-id="' + c.id + '">Editar</button></li>';
      }).join('') : '<li class="muted">Todavía no hay cuentas.</li>') + '</ul>' +
      (archivadas ? '<button class="link" data-action="toggle-archivadas">' + (S.verArchivadas ? 'Ocultar' : 'Ver') + ' archivadas (' + archivadas + ')</button>' : '') +
      '</section><section class="card ayuda"><h2>¿Cómo funciona?</h2><ul>' +
      '<li><b>Ingreso</b>: dinero que entra (alquiler, sueldo). <b>Gasto</b>: lo que cuesta la cuenta o el inmueble (luz, impuestos, arreglos). ' +
      '<b>Egreso</b>: dinero que sale sin ser gasto, como la transferencia a la dueña o un retiro.</li>' +
      '<li><b>Resultado</b> = ingresos − gastos − comisión. <b>Saldo en caja</b> = resultado − egresos: lo que todavía tienes de esa cuenta (o falta entregar a la dueña).</li>' +
      '<li>Para que la dueña vea su inmueble, entra a la cuenta y usa <b>Dar acceso</b> con su correo. Ella crea su usuario con ese correo y sólo ve lo suyo.</li>' +
      '<li>Con <b>Cobros y pagos fijos</b> el resumen te recuerda cada mes lo que falta registrar.</li></ul></section>';
  }

  /* ---------- Formularios ---------- */

  function abrir(dlg) {
    dlg.querySelectorAll('.msg').forEach(function (m) { m.textContent = ''; });
    dlg.showModal();
  }
  function radio(form, nombre) { var r = form.querySelector('input[name="' + nombre + '"]:checked'); return r && r.value; }
  function marcarRadio(form, nombre, valor) {
    form.querySelectorAll('input[name="' + nombre + '"]').forEach(function (r) { r.checked = r.value === valor; });
  }
  function llenarCategorias(lista, tipo) {
    lista.innerHTML = C.CATEGORIAS[tipo].map(function (c) { return '<option value="' + esc(c) + '">'; }).join('');
  }
  function ocupado(form, si) { form.querySelectorAll('button').forEach(function (b) { b.disabled = si; }); }

  var editMov = null;
  function abrirMov(m) {
    var form = $('form-mov'), cuentas = cuentasEditables();
    if (m.cuenta_id && !porId(cuentas, m.cuenta_id)) {
      var c = porId(S.cuentas, m.cuenta_id);
      if (c) cuentas = cuentas.concat([c]);
    }
    if (!cuentas.length) return toast('No tienes cuentas donde cargar movimientos.');
    editMov = m;
    $('mov-titulo').textContent = m.id ? 'Editar movimiento' : m.fijo_id ? 'Registrar fijo' : 'Nuevo movimiento';
    form.cuenta_id.innerHTML = cuentas.map(function (c) { return '<option value="' + c.id + '">' + esc(c.nombre) + '</option>'; }).join('');
    form.cuenta_id.value = m.cuenta_id || S.filtro.cuenta || (ruta()[0] === 'cuenta' ? ruta()[1] : '') || cuentas[0].id;
    if (!form.cuenta_id.value) form.cuenta_id.value = cuentas[0].id;
    marcarRadio(form, 'tipo', m.tipo || 'gasto');
    form.fecha.value = m.fecha || C.hoy();
    form.monto.value = m.monto || '';
    form.categoria.value = m.categoria || '';
    form.descripcion.value = m.descripcion || '';
    form.archivo.value = '';
    $('mov-comprobante').innerHTML = m.comprobante ? '📎 <button type="button" class="link" data-action="ver-comprobante" data-ruta="' + esc(m.comprobante) + '">Ver comprobante actual</button> (si subes otro, lo reemplaza)' : '';
    $('mov-borrar').hidden = !m.id;
    cambioTipoMov();
    abrir($('dlg-mov'));
    if (!m.id) setTimeout(function () { form.monto.focus(); }, 50);
  }
  function cambioTipoMov() {
    var tipo = radio($('form-mov'), 'tipo');
    llenarCategorias($('lista-categorias'), tipo);
    $('mov-ayuda').textContent = AYUDA_TIPO[tipo];
  }
  $('form-mov').addEventListener('change', function (e) { if (e.target.name === 'tipo') cambioTipoMov(); });
  $('form-mov').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, msg = $('mov-msg'), archivo = form.archivo.files[0];
    var m = Object.assign({}, editMov, {
      cuenta_id: form.cuenta_id.value, tipo: radio(form, 'tipo'), fecha: form.fecha.value,
      monto: Math.round(parseFloat(form.monto.value) * 100) / 100,
      categoria: form.categoria.value.trim(), descripcion: form.descripcion.value.trim() || null
    });
    if (!(m.monto > 0)) { msg.textContent = 'Escribe un monto mayor que cero.'; return; }
    var viejo = editMov.comprobante;
    ocupado(form, true);
    msg.textContent = archivo ? 'Subiendo comprobante…' : 'Guardando…';
    (archivo ? store.subirComprobante(m.cuenta_id, archivo) : Promise.resolve(null)).then(function (rutaArchivo) {
      if (rutaArchivo) m.comprobante = rutaArchivo;
      return store.guardarMovimiento(m).then(function () {
        if (rutaArchivo && viejo) return store.borrarComprobante(viejo).catch(function () { /* queda huérfano, no importa */ });
      });
    }).then(function () {
      $('dlg-mov').close();
      toast('✅ Guardado');
      return recargar();
    }).catch(function (err) { msg.textContent = '⚠️ ' + err.message; }).then(function () { ocupado(form, false); });
  });
  $('mov-borrar').addEventListener('click', function () {
    if (!confirm('¿Borrar este movimiento?')) return;
    var m = editMov;
    store.borrarMovimiento(m.id).then(function () {
      if (m.comprobante) store.borrarComprobante(m.comprobante).catch(function () { /* nada */ });
      $('dlg-mov').close();
      toast('🗑️ Borrado');
      return recargar();
    }).catch(function (err) { $('mov-msg').textContent = '⚠️ ' + err.message; });
  });

  var editCuenta = null;
  function abrirCuenta(c) {
    var form = $('form-cuenta');
    editCuenta = c;
    $('cuenta-titulo').textContent = c.id ? 'Editar cuenta' : 'Nueva cuenta';
    marcarRadio(form, 'tipo', c.tipo || 'inmueble');
    form.nombre.value = c.nombre || '';
    form.moneda.value = c.moneda || cfg.MONEDA;
    form.comision_pct.value = c.comision_pct || '';
    form.direccion.value = c.direccion || '';
    form.inquilino.value = c.inquilino || '';
    form.alquiler.value = c.alquiler == null ? '' : c.alquiler;
    form.contrato_fin.value = c.contrato_fin || '';
    form.notas.value = c.notas || '';
    form.archivada.checked = !!c.archivada;
    $('cuenta-borrar').hidden = !c.id;
    cambioTipoCuenta();
    abrir($('dlg-cuenta'));
  }
  function cambioTipoCuenta() {
    var personal = radio($('form-cuenta'), 'tipo') === 'personal';
    $('form-cuenta').querySelectorAll('.solo-inmueble').forEach(function (el) { el.hidden = personal; });
  }
  $('form-cuenta').addEventListener('change', function (e) { if (e.target.name === 'tipo') cambioTipoCuenta(); });
  $('form-cuenta').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, personal = radio(form, 'tipo') === 'personal';
    var num = function (v) { return v === '' ? null : Number(v); };
    var c = Object.assign({}, editCuenta, {
      tipo: radio(form, 'tipo'), nombre: form.nombre.value.trim(), moneda: form.moneda.value.trim().toUpperCase(),
      comision_pct: personal ? 0 : num(form.comision_pct.value) || 0,
      direccion: personal ? null : form.direccion.value.trim() || null,
      inquilino: personal ? null : form.inquilino.value.trim() || null,
      alquiler: personal ? null : num(form.alquiler.value),
      contrato_fin: personal ? null : form.contrato_fin.value || null,
      notas: form.notas.value.trim() || null, archivada: form.archivada.checked
    });
    ocupado(form, true);
    store.guardarCuenta(c).then(function (guardada) {
      $('dlg-cuenta').close();
      toast('✅ Cuenta guardada');
      if (!c.id) location.hash = 'cuenta/' + guardada.id;
      return recargar();
    }).catch(function (err) { $('cuenta-msg').textContent = '⚠️ ' + err.message; }).then(function () { ocupado(form, false); });
  });
  $('cuenta-borrar').addEventListener('click', function () {
    var c = editCuenta, n = movsDe(c.id).length;
    if (!confirm('¿Borrar "' + c.nombre + '"' + (n ? ' y sus ' + n + ' movimientos' : '') + '? No se puede deshacer.\n\nSi ya no la administras, mejor márcala como archivada.')) return;
    store.borrarCuenta(c.id).then(function () {
      $('dlg-cuenta').close();
      toast('🗑️ Cuenta borrada');
      location.hash = 'cuentas';
      return recargar();
    }).catch(function (err) { $('cuenta-msg').textContent = '⚠️ ' + err.message; });
  });

  var editFijo = null;
  function abrirFijo(f) {
    var form = $('form-fijo');
    editFijo = f;
    marcarRadio(form, 'tipo', f.tipo || 'ingreso');
    llenarCategorias($('lista-categorias-fijo'), f.tipo || 'ingreso');
    form.categoria.value = f.categoria || '';
    form.descripcion.value = f.descripcion || '';
    form.monto.value = f.monto || '';
    form.dia.value = f.dia || 1;
    form.activo.checked = f.activo !== false;
    $('fijo-borrar').hidden = !f.id;
    abrir($('dlg-fijo'));
  }
  $('form-fijo').addEventListener('change', function (e) {
    if (e.target.name === 'tipo') llenarCategorias($('lista-categorias-fijo'), e.target.value);
  });
  $('form-fijo').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var f = Object.assign({}, editFijo, {
      tipo: radio(form, 'tipo'), categoria: form.categoria.value.trim(), descripcion: form.descripcion.value.trim() || null,
      monto: Math.round(parseFloat(form.monto.value) * 100) / 100, dia: parseInt(form.dia.value, 10), activo: form.activo.checked
    });
    ocupado(form, true);
    store.guardarFijo(f).then(function () {
      $('dlg-fijo').close();
      toast('✅ Guardado');
      return recargar();
    }).catch(function (err) { $('fijo-msg').textContent = '⚠️ ' + err.message; }).then(function () { ocupado(form, false); });
  });
  $('fijo-borrar').addEventListener('click', function () {
    if (!confirm('¿Borrar este cobro o pago fijo? Los movimientos ya registrados se conservan.')) return;
    store.borrarFijo(editFijo.id).then(function () {
      $('dlg-fijo').close();
      return recargar();
    }).catch(function (err) { $('fijo-msg').textContent = '⚠️ ' + err.message; });
  });

  var editAcceso = null;
  function abrirAcceso(a) {
    var form = $('form-acceso');
    editAcceso = a;
    form.email.value = a.email || '';
    form.email.readOnly = !!a.id;
    form.nombre.value = a.nombre || '';
    form.rol.value = a.rol || 'ver';
    $('acceso-borrar').hidden = !a.id;
    abrir($('dlg-acceso'));
  }
  $('form-acceso').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var a = Object.assign({}, editAcceso, { email: form.email.value.trim().toLowerCase(), nombre: form.nombre.value.trim() || null, rol: form.rol.value });
    ocupado(form, true);
    store.guardarAcceso(a).then(function () {
      $('dlg-acceso').close();
      toast(a.id ? '✅ Guardado' : '✅ Listo: ' + a.email + ' ya puede entrar y ver esta cuenta');
      return recargar();
    }).catch(function (err) { $('acceso-msg').textContent = '⚠️ ' + err.message; }).then(function () { ocupado(form, false); });
  });
  $('acceso-borrar').addEventListener('click', function () {
    if (!confirm('¿Quitarle el acceso a ' + editAcceso.email + '?')) return;
    store.borrarAcceso(editAcceso.id).then(function () {
      $('dlg-acceso').close();
      return recargar();
    }).catch(function (err) { $('acceso-msg').textContent = '⚠️ ' + err.message; });
  });

  document.querySelectorAll('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) {
      if (e.target === d || e.target.hasAttribute('data-cerrar')) d.close();
    });
  });

  /* ---------- Acciones ---------- */

  function verComprobante(rutaArchivo) {
    var w = window.open('', '_blank');
    store.urlComprobante(rutaArchivo).then(function (url) {
      if (url.indexOf('data:') === 0) {
        return fetch(url).then(function (r) { return r.blob(); }).then(function (b) { return URL.createObjectURL(b); });
      }
      return url;
    }).then(function (url) {
      if (w) w.location = url; else location.href = url;
    }).catch(function (e) { if (w) w.close(); fallo(e); });
  }

  function exportarCSV(cuentaId) {
    var lista, nombre;
    if (cuentaId) {
      lista = C.ordenarMovimientos(movsDe(cuentaId).filter(function (m) { return C.enPeriodo(m.fecha, S.per); }));
      nombre = porId(S.cuentas, cuentaId).nombre;
    } else {
      lista = movsFiltrados();
      nombre = S.filtro.cuenta ? porId(S.cuentas, S.filtro.cuenta).nombre : 'movimientos';
    }
    var archivo = (nombre + ' ' + S.per.etiqueta).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    descargar(archivo + '.csv', C.csv(C.ordenarMovimientos(lista).reverse(), cuentasPorId(), { separador: cfg.CSV_SEPARADOR, decimal: cfg.CSV_DECIMAL }), 'text/csv;charset=utf-8');
  }

  var acciones = {
    'salir': function () { store.salir().then(mostrarLogin).catch(fallo); },
    'reiniciar-demo': function () {
      if (confirm('¿Volver a los datos de ejemplo? Se pierde lo que cargaste en la prueba.')) store.reiniciarDemo().then(iniciar);
    },
    'per-modo': function (el) {
      var modo = el.dataset.modo, ref = S.per.modo === 'todo' ? C.hoy().slice(0, 7) : S.per.ref;
      // Al pasar de un año al mes: el mes actual si es este año, si no diciembre de ese año.
      if (modo === 'mes' && S.per.modo === 'anio') ref = ref.slice(0, 4) === C.hoy().slice(0, 4) ? C.hoy().slice(0, 7) : ref.slice(0, 4) + '-12';
      S.per = C.periodo(modo, ref);
      render();
    },
    'per-mover': function (el) { S.per = C.moverPeriodo(S.per, +el.dataset.d); render(); },
    'nuevo-movimiento': function (el) { abrirMov({ cuenta_id: el.dataset.cuenta }); },
    'editar-mov': function (el) { abrirMov(porId(S.movs, el.dataset.id)); },
    'ver-comprobante': function (el) { verComprobante(el.dataset.ruta); },
    'registrar-fijo': function (el) {
      var f = porId(S.fijos, el.dataset.id);
      abrirMov({ cuenta_id: f.cuenta_id, tipo: f.tipo, categoria: f.categoria, descripcion: f.descripcion, monto: f.monto, fecha: el.dataset.fecha, fijo_id: f.id });
    },
    'nueva-cuenta': function () { abrirCuenta({}); },
    'editar-cuenta': function (el) { abrirCuenta(porId(S.cuentas, el.dataset.id)); },
    'nuevo-fijo': function (el) { abrirFijo({ cuenta_id: el.dataset.cuenta }); },
    'editar-fijo': function (el) { abrirFijo(porId(S.fijos, el.dataset.id)); },
    'nuevo-acceso': function (el) { abrirAcceso({ cuenta_id: el.dataset.cuenta }); },
    'editar-acceso': function (el) { abrirAcceso(porId(S.accesos, el.dataset.id)); },
    'csv': function (el) { exportarCSV(el.dataset.cuenta); },
    'imprimir': function () { window.print(); },
    'toggle-archivadas': function () { S.verArchivadas = !S.verArchivadas; render(); },
    'reclamar-admin': function () {
      store.reclamarAdmin().then(function (ok) {
        toast(ok ? '✅ Ahora eres el administrador' : 'Ya hay un administrador.');
        return iniciar();
      }).catch(fallo);
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || !acciones[el.dataset.action]) return;
    e.preventDefault();
    e.stopPropagation();
    acciones[el.dataset.action](el);
  });
  document.addEventListener('input', function (e) {
    var k = e.target.dataset && e.target.dataset.filtro;
    if (k) { S.filtro[k] = e.target.value; pintarListaMovimientos(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.hasAttribute('data-grafico')) { S.grafico = e.target.value; render(); }
  });
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });

  /* ---------- Arranque ---------- */

  if (store.demo) {
    $('demo-banner').hidden = false;
    $('demo-user').innerHTML = store.usuariosDemo.map(function (u) { return '<option value="' + u.email + '">' + esc(u.nombre) + '</option>'; }).join('');
    $('demo-user').addEventListener('change', function (e) {
      store.entrar(e.target.value).then(function () { location.hash = 'resumen'; return iniciar(); });
    });
  }
  store.alCambiarSesion(function (evento) {
    if (evento === 'SIGNED_IN' && !S.yo) iniciar();
    if (evento === 'SIGNED_OUT') mostrarLogin();
  });
  iniciar();
})();
