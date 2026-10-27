(function () {
  var $ = function (id) { return document.getElementById(id); };
  var cfg = window.BARBERIA_CONFIG, A = window.Agenda, store = window.crearStore(cfg);
  var PENDIENTE_KEY = 'barberia-unirme';

  var S = {
    yo: null, super: false, haySuper: true,
    d: { barberias: [], documentos: [], revisiones: [], barberos: [], servicios: [], afiliaciones: [], citas: [], espera: [], notificaciones: [] },
    res: {},          // lo elegido al reservar: barberia, servicio, barbero ('' = cualquiera), fecha
    ocupados: {}      // horas ocupadas por "barbería|fecha"
  };

  /* ---------- Utilidades ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var formatoPrecio;
  function precio(n) {
    if (n == null || n === '') return '';
    if (!formatoPrecio) {
      try { formatoPrecio = new Intl.NumberFormat(cfg.IDIOMA, { style: 'currency', currency: cfg.MONEDA }); } catch (e) {
        formatoPrecio = { format: function (x) { return cfg.MONEDA + ' ' + Number(x).toFixed(2); } };
      }
    }
    return formatoPrecio.format(n);
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function hora(iso) { return A.horaDe(new Date(iso)); }
  function fechaDeIso(iso) { return A.fechaDe(new Date(iso)); }
  function fechaCorta(fecha) {
    if (fecha === A.hoy()) return 'Hoy';
    if (fecha === A.sumarDias(A.hoy(), 1)) return 'Mañana';
    return cap(A.nombreFecha(fecha));
  }
  function haceCuanto(iso) {
    var min = Math.round((Date.now() - new Date(iso)) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return 'hace ' + min + ' min';
    if (min < 60 * 24) return 'hace ' + Math.round(min / 60) + ' h';
    return fechaCorta(fechaDeIso(iso));
  }
  function porId(lista, id) { return lista.filter(function (x) { return x.id === id; })[0]; }
  function de(lista, bid) { return lista.filter(function (x) { return x.barberia_id === bid; }); }
  function chip(txt, clase) { return '<span class="chip ' + (clase || '') + '">' + txt + '</span>'; }
  function chipEstado(b) { var e = A.ESTADOS_BARBERIA[b.estado]; return chip(e.ico + ' ' + e.txt, e.clase); }
  function barberia(id) { return porId(S.d.barberias, id); }
  function nombreBarbero(id) { var b = porId(S.d.barberos, id); return b ? b.nombre : '—'; }
  function enlaceInvitacion(b) { return location.href.split('#')[0] + '#unirme/' + b.codigo; }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function fallo(e) { toast('⚠️ ' + (e && e.message || e)); }

  /* Quién soy en cada barbería */
  function misBarberias() { return S.d.barberias.filter(function (b) { return b.dueno_email === S.yo; }); }
  function esDueno(bid) { var b = barberia(bid); return !!b && b.dueno_email === S.yo; }
  function misPuestos() { return S.d.barberos.filter(function (x) { return x.email === S.yo && x.activo; }); }
  function misAfiliaciones() { return S.d.afiliaciones.filter(function (a) { return a.cliente_email === S.yo; }); }
  function esAfiliado(bid) { return misAfiliaciones().some(function (a) { return a.barberia_id === bid; }); }
  function misCitas() { return S.d.citas.filter(function (c) { return c.cliente_email === S.yo; }); }
  function miEspera(bid, fecha) {
    return S.d.espera.filter(function (e) {
      return e.cliente_email === S.yo && e.estado === 'esperando' && (!bid || e.barberia_id === bid) && (!fecha ? e.fecha >= A.hoy() : e.fecha === fecha);
    });
  }
  function noLeidas() { return S.d.notificaciones.filter(function (n) { return !n.leida; }).length; }
  function proximas(citas) {
    var ahora = new Date();
    return citas.filter(function (c) { return c.estado === 'reservada' && new Date(c.fin) > ahora; })
      .sort(function (a, b) { return a.inicio < b.inicio ? -1 : 1; });
  }

  /* ---------- Sesión ---------- */

  function iniciar() {
    return store.sesion().then(function (u) {
      if (!u && store.demo) return store.entrar(store.usuariosDemo[0].email);
      return u;
    }).then(function (u) {
      if (!u) return mostrarLogin();
      S.yo = u.email;
      // Si llegó con un enlace de invitación antes de entrar, se retoma.
      var pendiente = leerPendiente();
      if (pendiente) { guardarPendiente(null); if (ruta()[0] !== 'unirme') location.hash = 'unirme/' + pendiente; }
      return Promise.all([store.esSuper(), store.haySuper(), store.todo()]).then(function (r) {
        S.super = r[0];
        S.haySuper = r[1];
        S.d = r[2];
        S.ocupados = {};
        render();
      });
    }).catch(fallo);
  }
  function recargar() {
    return store.todo().then(function (d) { S.d = d; S.ocupados = {}; render(); });
  }
  function leerPendiente() { try { return localStorage.getItem(PENDIENTE_KEY); } catch (e) { return null; } }
  function guardarPendiente(v) {
    try { if (v) localStorage.setItem(PENDIENTE_KEY, v); else localStorage.removeItem(PENDIENTE_KEY); } catch (e) { /* sin almacenamiento */ }
  }

  function mostrarLogin() {
    S.yo = null;
    $('app').hidden = true;
    $('login').hidden = false;
    $('login-pass-row').hidden = store.demo;
    var r = ruta();
    if (r[0] === 'unirme' && r[1]) {
      guardarPendiente(r[1]);
      $('login-intro').textContent = 'Te invitaron a unirte a una barbería. Entra o crea tu usuario y te llevamos ahí.';
      store.invitacion(r[1]).then(function (inv) {
        if (inv) $('login-intro').innerHTML = 'Te invitaron a <b>' + esc(inv.nombre) + '</b>. Entra o crea tu usuario para unirte y reservar tus citas.';
      }).catch(function () { /* se ve el texto general */ });
    }
    $('login-msg').textContent = store.demo ? 'En el modo de prueba basta con el correo (ej.: ana@ejemplo.com).' : '';
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

  function ruta() { return (decodeURIComponent(location.hash.slice(1)) || 'inicio').split('/'); }

  function pestanas(vista) {
    var t = [['inicio', '🏠', 'Inicio']];
    if (misAfiliaciones().length || misCitas().length) t.push(['citas', '📅', 'Mis citas']);
    var mias = misBarberias();
    if (mias.length) t.push(['b/' + mias[0].id + '/' + (mias[0].estado === 'aprobada' ? 'agenda' : 'datos'), '💈', mias.length > 1 ? 'Mis barberías' : 'Mi barbería', 'b']);
    if (misPuestos().length) t.push(['agenda', '✂️', 'Mi agenda']);
    if (S.super) {
      var n = S.d.barberias.filter(function (b) { return b.estado === 'en_revision'; }).length;
      t.push(['revision', '🛡️', 'Revisión', null, n]);
    }
    var nl = noLeidas();
    t.push(['avisos', '🔔', 'Avisos', null, nl]);
    $('tabs').innerHTML = t.map(function (x) {
      var activa = (x[3] || x[0].split('/')[0]) === vista;
      return '<a href="#' + x[0] + '" class="' + (activa ? 'active' : '') + '" title="' + x[2] + '">' + x[1] + ' <span>' + x[2] + '</span>' +
        (x[4] ? ' <b class="badge">' + x[4] + '</b>' : '') + '</a>';
    }).join('');
  }

  function render() {
    if (!S.yo) return;
    $('login').hidden = true;
    $('app').hidden = false;
    $('who-email').textContent = S.yo + (S.super ? ' · superadministrador' : '');
    if (store.demo) $('demo-user').value = S.yo;

    var r = ruta(), vista = r[0], html, despues;
    var b = r[1] && barberia(r[1]);
    if (vista === 'b' && !(b && esDueno(b.id))) vista = 'inicio';
    if (vista === 'reservar' && !(b && esAfiliado(b.id))) vista = 'inicio';
    if (vista === 'revision' && !S.super) vista = 'inicio';
    if (vista === 'agenda' && !misPuestos().length) vista = 'inicio';
    pestanas(vista);

    if (vista === 'citas') html = vistaMisCitas();
    else if (vista === 'reservar') { html = vistaReservar(b, r[2]); despues = pintarHoras; }
    else if (vista === 'unirme') { html = '<section class="card" id="invitacion"><p class="muted">Buscando la invitación…</p></section>'; despues = function () { pintarInvitacion(r[1]); }; }
    else if (vista === 'b') {
      var sec = r[2] || 'agenda';
      html = vistaBarberia(b, sec, r[3]);
      if (sec === 'clientes') despues = function () { pintarQR(b); };
    }
    else if (vista === 'agenda') html = vistaMiAgenda(r[1] || A.hoy());
    else if (vista === 'revision') html = b ? vistaRevisionDetalle(b) : vistaRevision();
    else if (vista === 'avisos') { html = vistaAvisos(); despues = leerAvisos; }
    else html = vistaInicio();
    $('view').innerHTML = html;
    if (despues) despues();
  }

  /* ----- Inicio ----- */

  function vistaInicio() {
    var html = '';
    if (!S.haySuper) {
      html += '<section class="card destacado"><h2>👋 Este portal todavía no tiene superadministrador</h2>' +
        '<p>Si eres quien va a aprobar las barberías, conviértete en el superadministrador (sólo el primero puede).</p>' +
        '<button class="btn primary" data-action="reclamar-super">Ser el superadministrador</button></section>';
    }
    var avisos = S.d.notificaciones.filter(function (n) { return !n.leida; });
    if (avisos.length) {
      html += '<section class="card"><div class="card-title"><h2>🔔 Avisos nuevos</h2><a href="#avisos">Ver todos</a></div>' +
        listaAvisos(avisos.slice(0, 3)) + '</section>';
    }

    var afil = misAfiliaciones();
    if (afil.length) {
      var prox = proximas(misCitas());
      if (prox.length) html += '<section class="card"><div class="card-title"><h2>📅 Tus próximas citas</h2><a href="#citas">Ver todas</a></div>' +
        '<ul class="lista">' + prox.slice(0, 3).map(itemCitaCliente).join('') + '</ul></section>';
      html += '<h2 class="seccion">💈 Tus barberías</h2><div class="grid">' + afil.map(function (a) {
        var b = barberia(a.barberia_id);
        if (!b) return '';
        return '<section class="card barberia-card"><h3>' + esc(b.nombre) + '</h3>' +
          '<p class="muted small">' + esc(b.direccion || '') + (b.telefono ? ' · ' + esc(b.telefono) : '') + '</p>' +
          (b.descripcion ? '<p class="small">' + esc(b.descripcion) + '</p>' : '') +
          (b.estado === 'aprobada' ? '<a class="btn primary" href="#reservar/' + b.id + '">Reservar cita</a>'
            : '<p class="nota">Por ahora esta barbería no está recibiendo citas.</p>') + '</section>';
      }).join('') + '</div>';
    }

    html += '<section class="card"><h2>🔗 ¿Tu barbería te pasó un código?</h2>' +
      '<p class="muted small">También puedes abrir directamente el enlace o escanear el QR que te compartieron.</p>' +
      '<form class="en-linea" data-form="codigo"><input name="codigo" required placeholder="Ej.: CLASICO7" autocapitalize="characters" maxlength="12">' +
      '<button class="btn primary">Unirme</button></form></section>';

    var mias = misBarberias();
    html += '<section class="card"><div class="card-title"><h2>🏪 ' + (mias.length ? 'Tus barberías como dueño' : '¿Tienes una barbería?') + '</h2>' +
      '<button class="btn' + (mias.length ? '' : ' primary') + '" data-action="nueva-barberia">＋ Registrar barbería</button></div>' +
      (mias.length ? '<ul class="lista">' + mias.map(function (b) {
        return '<li class="item"><a class="item-main" href="#b/' + b.id + '/' + (b.estado === 'aprobada' ? 'agenda' : 'datos') + '"><b>' + esc(b.nombre) + '</b>' +
          '<small class="muted">' + esc(b.direccion || '') + '</small></a>' + chipEstado(b) + '</li>';
      }).join('') + '</ul>'
        : '<p class="muted">Regístrala, sube tus documentos y, cuando la aprobemos, invita a tus clientes con un enlace o un QR para que reserven aquí.</p>') +
      '</section>';

    var puestos = misPuestos();
    if (puestos.length) {
      var hoy = S.d.citas.filter(function (c) {
        return c.estado === 'reservada' && fechaDeIso(c.inicio) === A.hoy() && puestos.some(function (p) { return p.id === c.barbero_id; });
      }).length;
      html += '<section class="card"><h2>✂️ Tu agenda</h2><p>Hoy tienes <b>' + hoy + '</b> cita' + (hoy === 1 ? '' : 's') + '.</p>' +
        '<a class="btn" href="#agenda">Ver mi agenda</a></section>';
    }
    return html;
  }

  /* ----- Unirme con invitación ----- */

  function pintarInvitacion(codigo) {
    store.invitacion(codigo).then(function (inv) {
      var el = $('invitacion');
      if (!el) return;
      if (!inv) {
        el.innerHTML = '<h2>😕 Invitación no válida</h2><p>El código <b>' + esc(codigo) + '</b> no existe, cambió o la barbería no está disponible. ' +
          'Pide a tu barbería un enlace nuevo.</p><a class="btn" href="#inicio">Ir al inicio</a>';
        return;
      }
      if (inv.ya_afiliado) {
        el.innerHTML = '<h2>✅ Ya eres cliente de ' + esc(inv.nombre) + '</h2><a class="btn primary" href="#reservar/' + inv.id + '">Reservar cita</a>';
        return;
      }
      var otra = misAfiliaciones()[0];
      el.innerHTML = '<div class="logo">💈</div><h2>Te invitaron a ' + esc(inv.nombre) + '</h2>' +
        '<p class="muted">' + esc(inv.direccion || '') + '</p>' +
        '<form class="form-simple" data-form="unirme" data-codigo="' + esc(codigo) + '">' +
        '<label>Tu nombre <input name="nombre" required value="' + esc(otra ? otra.nombre : '') + '" autocomplete="name"></label>' +
        '<label>Teléfono / WhatsApp <input name="telefono" type="tel" value="' + esc(otra ? otra.telefono || '' : '') + '" autocomplete="tel"></label>' +
        '<button class="btn primary">Unirme y reservar</button><p class="msg" role="status"></p></form>';
    }).catch(fallo);
  }

  /* ----- Reservar (cliente) ----- */

  function vistaReservar(b, fechaRuta) {
    var servicios = de(S.d.servicios, b.id).filter(function (s) { return s.activo; });
    var barberos = de(S.d.barberos, b.id).filter(function (x) { return x.activo; });
    var R = S.res;
    if (R.barberia !== b.id) S.res = R = { barberia: b.id, servicio: servicios[0] && servicios[0].id, barbero: '', fecha: A.hoy() };
    if (fechaRuta) R.fecha = fechaRuta < A.hoy() ? A.hoy() : fechaRuta;
    if (!porId(servicios, R.servicio)) R.servicio = servicios[0] && servicios[0].id;
    if (R.barbero && !porId(barberos, R.barbero)) R.barbero = '';

    var html = '<a class="volver" href="#inicio">← Inicio</a><div class="card-title"><div><h1>' + esc(b.nombre) + '</h1>' +
      '<p class="muted small">' + esc(b.direccion || '') + (b.telefono ? ' · ' + esc(b.telefono) : '') + '</p></div></div>';
    if (b.estado !== 'aprobada') return html + '<section class="card vacio"><p>Por ahora esta barbería no está recibiendo citas.</p></section>';
    if (!servicios.length || !barberos.length) return html + '<section class="card vacio"><p>La barbería todavía está preparando su agenda. Vuelve pronto.</p></section>';

    html += '<section class="card"><h2>1. ¿Qué te vas a hacer?</h2><div class="opciones">' + servicios.map(function (s) {
      return '<button class="opcion' + (s.id === R.servicio ? ' on' : '') + '" data-action="res-elegir" data-k="servicio" data-v="' + s.id + '">' +
        '<b>' + esc(s.nombre) + '</b><small>' + s.duracion_min + ' min' + (s.precio != null ? ' · ' + precio(s.precio) : '') + '</small></button>';
    }).join('') + '</div></section>';

    html += '<section class="card"><h2>2. ¿Con quién?</h2><div class="opciones">' +
      '<button class="opcion' + (!R.barbero ? ' on' : '') + '" data-action="res-elegir" data-k="barbero" data-v=""><b>Cualquiera</b><small>el primero libre</small></button>' +
      barberos.map(function (x) {
        return '<button class="opcion' + (x.id === R.barbero ? ' on' : '') + '" data-action="res-elegir" data-k="barbero" data-v="' + x.id + '"><b>' + esc(x.nombre) + '</b></button>';
      }).join('') + '</div></section>';

    var elegidos = R.barbero ? barberos.filter(function (x) { return x.id === R.barbero; }) : barberos;
    var dias = [];
    for (var i = 0; i < cfg.DIAS_RESERVA; i++) dias.push(A.sumarDias(A.hoy(), i));
    html += '<section class="card"><h2>3. ¿Qué día?</h2><div class="dias">' + dias.map(function (f) {
      var trabaja = elegidos.some(function (x) { return A.horarioDelDia(x, f).length; }), d = A.aDate(f);
      return '<button class="dia' + (f === R.fecha ? ' on' : '') + '"' + (trabaja ? '' : ' disabled title="Cerrado"') +
        ' data-action="res-elegir" data-k="fecha" data-v="' + f + '"><small>' + A.DIAS[A.diaSemana(f) - 1].slice(0, 3) + '</small><b>' + d.getDate() + '</b>' +
        '<small>' + A.MESES[d.getMonth()].slice(0, 3) + '</small></button>';
    }).join('') + '</div></section>';

    html += '<section class="card"><h2>4. ¿A qué hora? <span class="muted small">' + esc(fechaCorta(R.fecha)) + '</span></h2><div id="horas"><p class="muted">Buscando horarios…</p></div></section>';
    html += '<p class="muted small centro">Puedes cancelar hasta ' + b.cancelar_horas + ' h antes desde "Mis citas".</p>';
    return html;
  }

  function ocupadosDe(bid, fecha) {
    var k = bid + '|' + fecha;
    if (S.ocupados[k]) return Promise.resolve(S.ocupados[k]);
    return store.ocupados(bid, fecha).then(function (l) { S.ocupados[k] = l; return l; });
  }
  function opcionesHoras() { return { intervalo: cfg.INTERVALO_MIN, anticipacion: cfg.ANTICIPACION_MIN, ahora: new Date() }; }

  function pintarHoras() {
    var R = S.res, b = barberia(R.barberia), srv = porId(S.d.servicios, R.servicio);
    var barberos = de(S.d.barberos, b.id).filter(function (x) { return x.activo && (!R.barbero || x.id === R.barbero); });
    ocupadosDe(b.id, R.fecha).then(function (ocup) {
      var el = $('horas');
      if (!el || S.res !== R) return;
      var libres = A.horasLibresVarios(barberos, R.fecha, srv.duracion_min, ocup, opcionesHoras());
      var yaEspero = miEspera(b.id, R.fecha)[0];
      var html = '';
      if (libres.length) {
        html += '<div class="horas">' + libres.map(function (l) {
          return '<button class="hora" data-action="res-hora" data-hora="' + l.hora + '" data-barbero="' + l.barbero_id + '">' + l.hora + '</button>';
        }).join('') + '</div>';
      } else {
        html += '<div class="sin-horas"><p>😕 <b>No quedan horarios</b> ' + (R.barbero ? 'con ' + esc(nombreBarbero(R.barbero)) + ' ' : '') +
          'para ' + esc(fechaCorta(R.fecha).toLowerCase()) + '.</p></div>';
      }
      if (yaEspero) {
        html += '<p class="nota">🔔 Estás en la lista de espera de este día' + (yaEspero.desde || yaEspero.hasta ? ' (' + franja(yaEspero) + ')' : '') +
          '. Si alguien cancela te avisamos. <button class="link" data-action="salir-espera" data-id="' + yaEspero.id + '">Salir de la lista</button></p>';
      } else {
        html += '<div class="espera-cta' + (libres.length ? '' : ' fuerte') + '">' +
          (libres.length ? '<span class="muted small">¿Ninguna hora te sirve?</span>' : '<span>Si alguien cancela, te avisamos al instante.</span>') +
          '<button class="btn' + (libres.length ? ' small' : ' primary') + '" data-action="abrir-espera">🔔 Avisarme si se libera un lugar</button></div>';
      }
      el.innerHTML = html;
    }).catch(fallo);
  }
  function franja(e) { return (e.desde ? 'desde ' + e.desde : '') + (e.desde && e.hasta ? ' ' : '') + (e.hasta ? 'hasta ' + e.hasta : ''); }

  var reservaPendiente = null;
  function abrirReserva(horaTxt, barberoId) {
    var R = S.res, b = barberia(R.barberia), srv = porId(S.d.servicios, R.servicio);
    reservaPendiente = { barberia_id: b.id, servicio_id: srv.id, barbero_id: barberoId, inicio: A.aDate(R.fecha, horaTxt).toISOString() };
    $('reserva-resumen').innerHTML = '<p class="grande">' + esc(fechaCorta(R.fecha)) + ' · <b>' + horaTxt + '</b></p>' +
      '<p><b>' + esc(srv.nombre) + '</b> (' + srv.duracion_min + ' min' + (srv.precio != null ? ', ' + precio(srv.precio) : '') + ')</p>' +
      '<p>Con <b>' + esc(nombreBarbero(barberoId)) + '</b> en ' + esc(b.nombre) + '</p>' +
      '<p class="muted small">Si no puedes ir, cancela hasta ' + b.cancelar_horas + ' h antes para que otro cliente pueda usar el lugar.</p>';
    $('form-reserva').reset();
    abrir($('dlg-reserva'));
  }
  $('form-reserva').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, r = Object.assign({ nota: form.nota.value }, reservaPendiente);
    ocupado(form, true);
    store.reservar(r).then(function () {
      $('dlg-reserva').close();
      toast('✅ ¡Cita reservada!');
      location.hash = 'citas';
      return recargar();
    }).catch(function (err) {
      $('reserva-msg').textContent = '⚠️ ' + err.message;
      S.ocupados = {};
      pintarHoras();
    }).then(function () { ocupado(form, false); });
  });

  function abrirEspera() {
    var R = S.res, b = barberia(R.barberia), form = $('form-espera');
    form.reset();
    $('espera-txt').innerHTML = 'Para el <b>' + esc(A.nombreFecha(R.fecha)) + '</b> en ' + esc(b.nombre) + '.';
    form.barbero_id.innerHTML = '<option value="">Cualquier barbero</option>' + de(S.d.barberos, b.id).filter(function (x) { return x.activo; }).map(function (x) {
      return '<option value="' + x.id + '">' + esc(x.nombre) + '</option>';
    }).join('');
    form.barbero_id.value = R.barbero || '';
    abrir($('dlg-espera'));
  }
  $('form-espera').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, R = S.res;
    ocupado(form, true);
    store.anotarEspera({ barberia_id: R.barberia, fecha: R.fecha, barbero_id: form.barbero_id.value || null, servicio_id: R.servicio,
      desde: form.desde.value || null, hasta: form.hasta.value || null }).then(function () {
      $('dlg-espera').close();
      toast('🔔 Listo: te avisamos si se libera un lugar');
      return recargar();
    }).catch(function (err) { $('espera-msg').textContent = '⚠️ ' + err.message; }).then(function () { ocupado(form, false); });
  });

  /* ----- Mis citas (cliente) ----- */

  function itemCitaCliente(c) {
    var b = barberia(c.barberia_id), ahora = new Date();
    var puede = b && A.puedeCancelar(c, b.cancelar_horas, ahora, true);
    var tarde = c.estado === 'reservada' && new Date(c.inicio) > ahora && !puede;
    return '<li class="item"><div class="fecha"><b>' + hora(c.inicio) + '</b><small>' + esc(fechaCorta(fechaDeIso(c.inicio))) + '</small></div>' +
      '<div class="item-main"><b>' + esc(c.servicio_nombre) + '</b><small class="muted">' + esc(b ? b.nombre : '') + ' · con ' + esc(nombreBarbero(c.barbero_id)) + '</small>' +
      (tarde ? '<small class="muted">Faltan menos de ' + b.cancelar_horas + ' h: para cancelar llama a la barbería' + (b.telefono ? ' (' + esc(b.telefono) + ')' : '') + '.</small>' : '') +
      '</div>' + (c.estado !== 'reservada' ? chip(A.ESTADOS_CITA[c.estado].txt, A.ESTADOS_CITA[c.estado].clase) : '') +
      (puede ? '<button class="btn small danger" data-action="cancelar-cita" data-id="' + c.id + '">Cancelar</button>' : '') + '</li>';
  }

  function vistaMisCitas() {
    var mias = misCitas(), prox = proximas(mias);
    var pasadas = mias.filter(function (c) { return prox.indexOf(c) < 0; }).sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; }).slice(0, 20);
    var espera = miEspera();
    var html = '<h1>Mis citas</h1>';
    html += '<section class="card"><h2>📅 Próximas</h2>' + (prox.length ? '<ul class="lista">' + prox.map(itemCitaCliente).join('') + '</ul>'
      : '<p class="muted">No tienes citas pendientes.</p>') +
      '<div class="acciones-fila">' + misAfiliaciones().map(function (a) {
        var b = barberia(a.barberia_id);
        return b && b.estado === 'aprobada' ? '<a class="btn" href="#reservar/' + b.id + '">＋ Reservar en ' + esc(b.nombre) + '</a>' : '';
      }).join('') + '</div></section>';
    if (espera.length) {
      html += '<section class="card"><h2>🔔 En lista de espera</h2><ul class="lista">' + espera.map(function (e) {
        var b = barberia(e.barberia_id);
        return '<li class="item"><div class="item-main"><b>' + esc(fechaCorta(e.fecha)) + '</b><small class="muted">' + esc(b ? b.nombre : '') +
          ' · ' + (e.barbero_id ? 'con ' + esc(nombreBarbero(e.barbero_id)) : 'cualquier barbero') + (e.desde || e.hasta ? ' · ' + franja(e) : '') +
          (e.avisos ? ' · te avisamos ' + e.avisos + ' vez' + (e.avisos > 1 ? 'es' : '') : '') + '</small></div>' +
          '<a class="btn small" href="#reservar/' + e.barberia_id + '/' + e.fecha + '">Ver horarios</a>' +
          '<button class="btn small" data-action="salir-espera" data-id="' + e.id + '">Salir</button></li>';
      }).join('') + '</ul></section>';
    }
    if (pasadas.length) html += '<section class="card"><h2>🕘 Historial</h2><ul class="lista">' + pasadas.map(itemCitaCliente).join('') + '</ul></section>';
    return html;
  }

  /* ----- Mi barbería (dueño) ----- */

  function vistaBarberia(b, sec, fecha) {
    var secciones = [['agenda', '📅 Agenda'], ['equipo', '✂️ Equipo y servicios'], ['clientes', '👥 Clientes'], ['datos', '📄 Datos y documentos']];
    var otras = misBarberias().filter(function (x) { return x.id !== b.id; });
    var html = '<div class="card-title"><div><h1>' + esc(b.nombre) + '</h1>' + chipEstado(b) + '</div>' +
      (otras.length ? '<select data-ir>' + [b].concat(otras).map(function (x) {
        return '<option value="#b/' + x.id + '/' + sec + '">' + esc(x.nombre) + '</option>';
      }).join('') + '</select>' : '') + '</div>' +
      '<nav class="subtabs">' + secciones.map(function (s) {
        return '<a href="#b/' + b.id + '/' + s[0] + '" class="' + (s[0] === sec ? 'active' : '') + '">' + s[1] + '</a>';
      }).join('') + '</nav>';
    if (b.estado !== 'aprobada' && sec !== 'datos') {
      html += '<p class="nota">' + (b.estado === 'suspendida' ? '⏸️ Tu barbería está suspendida: los clientes no pueden reservar.'
        : 'Mientras no esté aprobada puedes ir preparando tu equipo y servicios; las citas y las invitaciones se habilitan al aprobarse.') + '</p>';
    }
    if (sec === 'equipo') return html + seccionEquipo(b);
    if (sec === 'clientes') return html + seccionClientes(b);
    if (sec === 'datos') return html + seccionDatos(b);
    return html + vistaAgendaDia(b, fecha || A.hoy(), de(S.d.barberos, b.id), true);
  }

  // Agenda de un día. Para el dueño, con todos sus barberos; para un barbero, sólo lo suyo.
  function vistaAgendaDia(b, fecha, barberos, comoDueno) {
    var base = comoDueno ? '#b/' + b.id + '/agenda/' : '#agenda/';
    var html = '<div class="periodo"><a class="icon-btn" href="' + base + A.sumarDias(fecha, -1) + '" aria-label="Día anterior">◀</a>' +
      '<b class="per-txt">' + esc(fechaCorta(fecha)) + (fecha === A.hoy() ? '' : ' <small class="muted">' + esc(fecha.split('-').reverse().join('/')) + '</small>') + '</b>' +
      '<a class="icon-btn" href="' + base + A.sumarDias(fecha, 1) + '" aria-label="Día siguiente">▶</a>' +
      (fecha !== A.hoy() ? '<a class="btn small" href="' + base + A.hoy() + '">Hoy</a>' : '') +
      '<input type="date" value="' + fecha + '" data-ir-fecha="' + base + '" aria-label="Elegir fecha">' +
      (comoDueno && b.estado === 'aprobada' ? '<span class="spacer"></span><button class="btn primary" data-action="nueva-cita" data-barberia="' + b.id + '" data-fecha="' + fecha + '">＋ Cita</button>' : '') +
      '</div>';
    var delDia = S.d.citas.filter(function (c) { return fechaDeIso(c.inicio) === fecha; });
    var activos = barberos.filter(function (x) { return x.activo || delDia.some(function (c) { return c.barbero_id === x.id; }); });
    if (!activos.length) return html + '<section class="card vacio"><p>Todavía no hay barberos. Agrégalos en <a href="#b/' + b.id + '/equipo">Equipo y servicios</a>.</p></section>';

    html += '<div class="grid">' + activos.map(function (x) {
      var citas = delDia.filter(function (c) { return c.barbero_id === x.id; }).sort(function (p, q) { return p.inicio < q.inicio ? -1 : 1; });
      var fr = A.horarioDelDia(x, fecha), activas = citas.filter(A.activa).length;
      var bb = barberia(x.barberia_id);
      return '<section class="card"><div class="card-title"><h2>✂️ ' + esc(x.nombre) + (comoDueno ? '' : ' <small class="muted">· ' + esc(bb ? bb.nombre : '') + '</small>') + '</h2>' +
        '<small class="muted">' + (fr.length ? esc(A.textoFranjas(fr)) : 'No atiende') + '</small></div>' +
        (citas.length ? '<ul class="lista">' + citas.map(itemCitaAgenda).join('') + '</ul>' : '<p class="muted">Sin citas.</p>') +
        (fr.length ? '<p class="muted small">' + activas + ' cita' + (activas === 1 ? '' : 's') + ' · ' +
          A.horasLibres(x, fecha, cfg.INTERVALO_MIN, delDia, { intervalo: cfg.INTERVALO_MIN, ahora: new Date() }).length + ' espacios libres de ' + cfg.INTERVALO_MIN + ' min</p>' : '') +
        '</section>';
    }).join('') + '</div>';

    if (comoDueno) {
      var espera = de(S.d.espera, b.id).filter(function (e) { return e.fecha === fecha && e.estado === 'esperando'; })
        .sort(function (p, q) { return p.created_at < q.created_at ? -1 : 1; });
      if (espera.length) {
        html += '<section class="card"><h2>🔔 Lista de espera de este día</h2><p class="muted small">Cuando se cancela una cita les avisamos solos. ' +
          'Si te queda un hueco también puedes llamarlos.</p><ul class="lista">' + espera.map(function (e, i) {
          var a = S.d.afiliaciones.filter(function (x) { return x.barberia_id === b.id && x.cliente_email === e.cliente_email; })[0];
          var srv = porId(S.d.servicios, e.servicio_id);
          return '<li class="item"><span class="ico">' + (i + 1) + '</span><div class="item-main"><b>' + esc(e.cliente_nombre || e.cliente_email) + '</b>' +
            '<small class="muted">' + (srv ? esc(srv.nombre) + ' · ' : '') + (e.barbero_id ? 'con ' + esc(nombreBarbero(e.barbero_id)) : 'cualquier barbero') +
            (e.desde || e.hasta ? ' · ' + franja(e) : '') + (e.avisos ? ' · avisado ' + e.avisos + '×' : '') + '</small></div>' +
            (a && a.telefono ? '<a class="btn small" href="tel:' + esc(a.telefono.replace(/[^\d+]/g, '')) + '">📞 ' + esc(a.telefono) + '</a>' : '') + '</li>';
        }).join('') + '</ul></section>';
      }
    }
    return html;
  }

  function itemCitaAgenda(c) {
    var ahora = new Date(), empezo = new Date(c.inicio) <= ahora, e = A.ESTADOS_CITA[c.estado];
    var botones = '';
    if (c.estado === 'reservada' && !empezo) botones = '<button class="btn small danger" data-action="cancelar-cita" data-id="' + c.id + '">Cancelar</button>';
    else if (c.estado === 'reservada') {
      botones = '<button class="btn small" data-action="marcar-cita" data-estado="completada" data-id="' + c.id + '">✓ Atendida</button>' +
        '<button class="btn small" data-action="marcar-cita" data-estado="no_asistio" data-id="' + c.id + '">✗ No vino</button>';
    } else if (c.estado !== 'cancelada') botones = '<button class="link small" data-action="marcar-cita" data-estado="reservada" data-id="' + c.id + '">Deshacer</button>';
    var afil = c.cliente_email && S.d.afiliaciones.filter(function (a) { return a.barberia_id === c.barberia_id && a.cliente_email === c.cliente_email; })[0];
    return '<li class="item cita-' + c.estado + '"><div class="fecha"><b>' + hora(c.inicio) + '</b><small>' + hora(c.fin) + '</small></div>' +
      '<div class="item-main"><b>' + esc(c.cliente_nombre) + '</b><small class="muted">' + esc(c.servicio_nombre) +
      (afil && afil.telefono ? ' · ' + esc(afil.telefono) : '') + '</small>' +
      (c.nota ? '<small>📝 ' + esc(c.nota) + '</small>' : '') +
      (c.estado === 'cancelada' && c.motivo_cancelacion ? '<small class="muted">Motivo: ' + esc(c.motivo_cancelacion) + '</small>' : '') + '</div>' +
      (c.estado !== 'reservada' ? chip(e.txt, e.clase) : '') + botones + '</li>';
  }

  function vistaMiAgenda(fecha) {
    var puestos = misPuestos();
    return '<h1>Mi agenda</h1>' + vistaAgendaDia(barberia(puestos[0].barberia_id) || {}, fecha, puestos, false);
  }

  function seccionEquipo(b) {
    var barberos = de(S.d.barberos, b.id), servicios = de(S.d.servicios, b.id);
    return '<div class="grid2"><section class="card"><div class="card-title"><h2>✂️ Barberos</h2>' +
      '<button class="btn small" data-action="nuevo-barbero" data-barberia="' + b.id + '">＋ Agregar</button></div>' +
      (barberos.length ? '<ul class="lista">' + barberos.map(function (x) {
        var dias = [1, 2, 3, 4, 5, 6, 7].filter(function (d) { return (x.horario[d] || []).length; }).map(function (d) { return A.DIAS[d - 1].slice(0, 3); });
        return '<li class="item clic" data-action="editar-barbero" data-id="' + x.id + '"><span class="ico">' + (x.activo ? '✂️' : '💤') + '</span>' +
          '<div class="item-main"><b>' + esc(x.nombre) + '</b><small class="muted">' + (dias.length ? esc(dias.join(', ')) : 'Sin horario') +
          (x.email ? ' · 🔑 ' + esc(x.email) : '') + (x.activo ? '' : ' · inactivo') + '</small></div></li>';
      }).join('') + '</ul>' : '<p class="muted">Agrega a quienes atienden, con su horario.</p>') + '</section>' +
      '<section class="card"><div class="card-title"><h2>💇 Servicios</h2>' +
      '<button class="btn small" data-action="nuevo-servicio" data-barberia="' + b.id + '">＋ Agregar</button></div>' +
      (servicios.length ? '<ul class="lista">' + servicios.map(function (s) {
        return '<li class="item clic" data-action="editar-servicio" data-id="' + s.id + '"><div class="item-main"><b>' + esc(s.nombre) + '</b>' +
          '<small class="muted">' + s.duracion_min + ' min' + (s.activo ? '' : ' · no se puede reservar') + '</small></div><b>' + precio(s.precio) + '</b></li>';
      }).join('') + '</ul>' : '<p class="muted">Ej.: corte (30 min), corte + barba (60 min).</p>') + '</section></div>';
  }

  function seccionClientes(b) {
    var afil = de(S.d.afiliaciones, b.id).sort(function (p, q) { return p.nombre.localeCompare(q.nombre); });
    var html = '';
    if (b.estado === 'aprobada') {
      html += '<section class="card invitar"><div class="qr" id="qr"></div><div><h2>📲 Invita a tus clientes</h2>' +
        '<p class="muted small">Comparte este enlace o el QR. Quien entra con él queda como cliente tuyo, ve sólo tu barbería y puede reservar.</p>' +
        '<p class="codigo">Código: <b>' + esc(b.codigo) + '</b></p>' +
        '<input class="enlace" readonly value="' + esc(enlaceInvitacion(b)) + '" data-seleccionar>' +
        '<div class="acciones-fila"><button class="btn primary" data-action="copiar-enlace" data-id="' + b.id + '">📋 Copiar enlace</button>' +
        (navigator.share ? '<button class="btn" data-action="compartir-enlace" data-id="' + b.id + '">📤 Compartir</button>' : '') +
        '<a class="btn" href="https://wa.me/?text=' + encodeURIComponent('Reserva tu cita en ' + b.nombre + ': ' + enlaceInvitacion(b)) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' +
        '<button class="btn" data-action="imprimir-cartel">🖨️ Imprimir cartel</button>' +
        '<button class="link small" data-action="nuevo-codigo" data-id="' + b.id + '">Cambiar código (el enlace anterior deja de servir)</button></div></div>' +
        '<div class="cartel solo-print"><h1>' + esc(b.nombre) + '</h1><p>Escanea y reserva tu cita</p><div class="qr-print"></div><p>Código: <b>' + esc(b.codigo) + '</b></p></div></section>';
    }
    html += '<section class="card"><h2>👥 Clientes (' + afil.length + ')</h2>' + (afil.length ? '<ul class="lista">' + afil.map(function (a) {
      var suyas = S.d.citas.filter(function (c) { return c.barberia_id === b.id && c.cliente_email === a.cliente_email; });
      var vinieron = suyas.filter(function (c) { return c.estado === 'completada'; }).length, faltas = suyas.filter(function (c) { return c.estado === 'no_asistio'; }).length;
      return '<li class="item"><span class="ico">👤</span><div class="item-main"><b>' + esc(a.nombre) + '</b><small class="muted">' + esc(a.cliente_email) +
        (a.telefono ? ' · ' + esc(a.telefono) : '') + ' · ' + vinieron + ' visita' + (vinieron === 1 ? '' : 's') + (faltas ? ' · ' + faltas + ' falta' + (faltas > 1 ? 's' : '') : '') + '</small></div>' +
        (a.telefono ? '<a class="btn small" href="https://wa.me/' + esc(a.telefono.replace(/\D/g, '')) + '" target="_blank" rel="noopener">💬</a>' : '') +
        '<button class="btn small danger" data-action="quitar-cliente" data-id="' + a.id + '">Quitar</button></li>';
    }).join('') + '</ul>' : '<p class="muted">Todavía no hay clientes. Comparte tu enlace de invitación.</p>') + '</section>';
    return html;
  }

  var qrLib = null;
  function cargarQR() {
    if (!qrLib) qrLib = new Promise(function (ok, mal) {
      if (window.qrcode) return ok(window.qrcode);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      s.onload = function () { ok(window.qrcode); };
      s.onerror = function () { qrLib = null; mal(new Error('sin conexión')); };
      document.head.appendChild(s);
    });
    return qrLib;
  }
  function pintarQR(b) {
    if (b.estado !== 'aprobada') return;
    cargarQR().then(function (qrcode) {
      var q = qrcode(0, 'M');
      q.addData(enlaceInvitacion(b));
      q.make();
      var svg = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
      document.querySelectorAll('#qr, .qr-print').forEach(function (el) { el.innerHTML = svg; });
    }).catch(function () {
      var el = $('qr');
      if (el) el.innerHTML = '<p class="muted small">No se pudo dibujar el QR sin internet. Comparte el enlace.</p>';
    });
  }

  function seccionDatos(b) {
    var docs = de(S.d.documentos, b.id), editable = b.estado === 'borrador' || b.estado === 'correccion';
    var faltan = A.documentosFaltantes(cfg.DOCUMENTOS, docs);
    var e = A.ESTADOS_BARBERIA[b.estado];
    var html = '<section class="card estado-' + e.clase + '"><h2>' + e.ico + ' ' + e.txt + '</h2>' + ({
      borrador: '<p>Sube los documentos y envía tu barbería a revisión. Te avisaremos aquí cuando la revisemos.</p>',
      en_revision: '<p>Estamos revisando tus documentos. Te avisaremos aquí cuando terminemos.</p>',
      correccion: '<p>Hay que corregir algo antes de aprobarla. Reemplaza los documentos marcados en rojo y vuelve a enviarla.</p>',
      aprobada: '<p>Tu barbería está activa: tus clientes pueden reservar.</p>',
      rechazada: '<p>Tu solicitud fue rechazada.</p>',
      suspendida: '<p>Tu barbería está suspendida y no recibe citas.</p>'
    })[b.estado] + (b.motivo ? '<p class="motivo"><b>Motivo:</b> ' + esc(b.motivo) + '</p>' : '') +
      (editable ? '<button class="btn primary" data-action="enviar-revision" data-id="' + b.id + '"' + (faltan.length ? ' disabled' : '') + '>📨 ' +
        (b.estado === 'correccion' ? 'Volver a enviar' : 'Enviar a revisión') + '</button>' +
        (faltan.length ? ' <small class="muted">Faltan ' + faltan.length + ' documento' + (faltan.length > 1 ? 's' : '') + ' obligatorio' + (faltan.length > 1 ? 's' : '') + '.</small>' : '') : '') +
      '</section>';

    html += '<div class="grid2"><section class="card"><div class="card-title"><h2>🏪 Datos</h2><button class="btn small" data-action="editar-barberia" data-id="' + b.id + '">✏️ Editar</button></div>' +
      '<dl class="datos"><dt>Dirección</dt><dd>' + esc(b.direccion || '—') + '</dd><dt>Teléfono</dt><dd>' + esc(b.telefono || '—') + '</dd>' +
      '<dt>Descripción</dt><dd>' + esc(b.descripcion || '—') + '</dd><dt>Cancelación</dt><dd>Hasta ' + b.cancelar_horas + ' h antes</dd></dl></section>';

    html += '<section class="card"><div class="card-title"><h2>📄 Documentos</h2>' +
      (editable ? '<button class="btn small" data-action="subir-documento" data-barberia="' + b.id + '">＋ Subir</button>' : '') + '</div>' +
      tablaDocumentos(docs, editable, false) + '</section></div>';

    html += historial(b);
    if (b.estado === 'borrador') html += '<p class="centro"><button class="link danger" data-action="borrar-barberia" data-id="' + b.id + '">Borrar esta solicitud</button></p>';
    return html;
  }

  // Lista de documentos según config.js, con los que faltan. revisar = botones del superadministrador.
  function tablaDocumentos(docs, editable, revisar) {
    var tipos = cfg.DOCUMENTOS.map(function (t) { return t.tipo; });
    docs.forEach(function (d) { if (tipos.indexOf(d.tipo) < 0) tipos.push(d.tipo); });
    return '<ul class="lista docs">' + tipos.map(function (tipo) {
      var t = cfg.DOCUMENTOS.filter(function (x) { return x.tipo === tipo; })[0] || {};
      var suyos = docs.filter(function (d) { return d.tipo === tipo; });
      if (!suyos.length) {
        return '<li class="item"><span class="ico">' + (t.obligatorio ? '⚪' : '◽') + '</span><div class="item-main"><b>' + esc(tipo) + '</b>' +
          '<small class="' + (t.obligatorio ? 'rojo-txt' : 'muted') + '">' + (t.obligatorio ? 'Falta (obligatorio)' : 'Opcional') + '</small></div></li>';
      }
      return suyos.map(function (d) {
        var ico = { pendiente: '🕓', aceptado: '✅', rechazado: '❌' }[d.estado];
        var av = A.documentoVence(d, A.hoy(), cfg.AVISO_VENCE_DIAS);
        return '<li class="item"><span class="ico">' + ico + '</span><div class="item-main"><b>' + esc(tipo) + '</b>' +
          '<small class="muted">' + esc(d.nombre_archivo || 'archivo') + (d.vence ? ' · vence ' + esc(d.vence.split('-').reverse().join('/')) : '') + '</small>' +
          (av ? '<small class="' + (av.vencido ? 'rojo-txt' : 'ambar-txt') + '">' + (av.vencido ? '⚠️ Vencido' : '⏰ Vence en ' + av.dias + ' días') + '</small>' : '') +
          (d.observacion ? '<small class="rojo-txt">' + esc(d.observacion) + '</small>' : '') + '</div>' +
          '<button class="btn small" data-action="ver-documento" data-id="' + d.id + '">Ver</button>' +
          (revisar ? '<button class="btn small" data-action="doc-aceptar" data-id="' + d.id + '"' + (d.estado === 'aceptado' ? ' disabled' : '') + '>✓</button>' +
            '<button class="btn small danger" data-action="doc-rechazar" data-id="' + d.id + '">✗</button>' : '') +
          (editable && d.estado !== 'aceptado' ? '<button class="btn small danger" data-action="borrar-documento" data-id="' + d.id + '">Quitar</button>' : '') + '</li>';
      }).join('');
    }).join('') + '</ul>';
  }

  function historial(b) {
    var revs = de(S.d.revisiones, b.id).sort(function (p, q) { return p.created_at < q.created_at ? 1 : -1; });
    if (!revs.length) return '';
    return '<section class="card"><h2>🕘 Historial de la revisión</h2><ul class="lista">' + revs.map(function (r) {
      var e = A.ESTADOS_BARBERIA[r.estado] || { ico: '•', txt: r.estado };
      return '<li class="item"><span class="ico">' + e.ico + '</span><div class="item-main"><b>' + esc(e.txt) + '</b>' +
        (r.motivo ? '<small>' + esc(r.motivo) + '</small>' : '') + '<small class="muted">' + esc(haceCuanto(r.created_at)) + ' · ' + esc(r.por_email) + '</small></div></li>';
    }).join('') + '</ul></section>';
  }

  /* ----- Revisión (superadministrador) ----- */

  function vistaRevision() {
    var grupos = ['en_revision', 'correccion', 'aprobada', 'suspendida', 'rechazada', 'borrador'];
    var html = '<h1>Revisión de barberías</h1>';
    grupos.forEach(function (g) {
      var lista = S.d.barberias.filter(function (b) { return b.estado === g; }).sort(function (p, q) { return (p.enviada_at || '') < (q.enviada_at || '') ? -1 : 1; });
      if (!lista.length && g !== 'en_revision') return;
      var e = A.ESTADOS_BARBERIA[g];
      html += '<section class="card"><h2>' + e.ico + ' ' + e.txt + ' (' + lista.length + ')</h2>' + (lista.length ? '<ul class="lista">' + lista.map(function (b) {
        var docs = de(S.d.documentos, b.id), faltan = A.documentosFaltantes(cfg.DOCUMENTOS, docs).length;
        var pend = docs.filter(function (d) { return d.estado === 'pendiente'; }).length;
        var vencen = docs.filter(function (d) { return A.documentoVence(d, A.hoy(), cfg.AVISO_VENCE_DIAS); }).length;
        return '<li class="item clic"><a class="item-main" href="#revision/' + b.id + '"><b>' + esc(b.nombre) + '</b><small class="muted">' + esc(b.dueno_email) +
          (b.enviada_at ? ' · enviada ' + esc(haceCuanto(b.enviada_at)) : '') + '</small></a>' +
          (pend ? chip(pend + ' por revisar', 'ambar') : '') + (faltan ? chip(faltan + ' faltan', 'rojo') : '') + (vencen ? chip('⏰ ' + vencen + ' por vencer', 'ambar') : '') + '</li>';
      }).join('') + '</ul>' : '<p class="muted">No hay solicitudes pendientes. 🎉</p>') + '</section>';
    });
    return html;
  }

  function vistaRevisionDetalle(b) {
    var docs = de(S.d.documentos, b.id), botones = A.DECISIONES[b.estado] || [];
    var nombres = { aprobada: b.estado === 'suspendida' ? '▶️ Reactivar' : '✅ Aprobar', correccion: '✏️ Pedir corrección', rechazada: '⛔ Rechazar', suspendida: '⏸️ Suspender' };
    var faltan = A.documentosFaltantes(cfg.DOCUMENTOS, docs);
    return '<a class="volver" href="#revision">← Todas las solicitudes</a>' +
      '<div class="card-title"><div><h1>' + esc(b.nombre) + '</h1>' + chipEstado(b) + '</div></div>' +
      (b.motivo ? '<p class="nota"><b>Último motivo:</b> ' + esc(b.motivo) + '</p>' : '') +
      '<div class="grid2"><section class="card"><h2>🏪 Datos</h2><dl class="datos"><dt>Dueño</dt><dd>' + esc(b.dueno_email) + '</dd>' +
      '<dt>Dirección</dt><dd>' + esc(b.direccion || '—') + '</dd><dt>Teléfono</dt><dd>' + esc(b.telefono || '—') + '</dd>' +
      '<dt>Descripción</dt><dd>' + esc(b.descripcion || '—') + '</dd></dl></section>' +
      '<section class="card"><h2>📄 Documentos</h2><p class="muted small">Marca cada documento con ✓ o ✗ (con el motivo). Los rechazados se muestran al dueño en rojo.</p>' +
      tablaDocumentos(docs, false, true) + (faltan.length ? '<p class="rojo-txt small">Faltan: ' + esc(faltan.join(', ')) + '</p>' : '') + '</section></div>' +
      (botones.length ? '<section class="card"><h2>Decisión</h2><div class="acciones-fila">' + botones.map(function (est) {
        return '<button class="btn' + (est === 'aprobada' ? ' primary' : est === 'correccion' ? '' : ' danger') + '" data-action="decidir" data-id="' + b.id + '" data-estado="' + est + '">' + nombres[est] + '</button>';
      }).join('') + '</div><p class="muted small">El dueño recibe un aviso con tu motivo. "Pedir corrección" le deja cambiar los documentos y volver a enviar; "Rechazar" cierra la solicitud.</p></section>' : '') +
      historial(b);
  }

  /* ----- Avisos ----- */

  function listaAvisos(lista) {
    return '<ul class="lista avisos">' + lista.map(function (n) {
      var cuerpo = '<b>' + esc(n.titulo) + '</b>' + (n.texto ? '<small>' + esc(n.texto) + '</small>' : '') + '<small class="muted">' + esc(haceCuanto(n.created_at)) + '</small>';
      return '<li class="item' + (n.leida ? '' : ' nuevo') + '">' + (n.enlace ? '<a class="item-main" href="' + esc(n.enlace) + '">' + cuerpo + '</a>' : '<div class="item-main">' + cuerpo + '</div>') + '</li>';
    }).join('') + '</ul>';
  }
  function vistaAvisos() {
    var lista = S.d.notificaciones.slice().sort(function (p, q) { return p.created_at < q.created_at ? 1 : -1; }).slice(0, 60);
    return '<h1>Avisos</h1><section class="card">' + (lista.length ? listaAvisos(lista) : '<p class="muted">No tienes avisos.</p>') + '</section>' +
      '<p class="muted small centro">Los avisos llegan aquí al instante. Abre el portal para verlos.</p>';
  }
  function leerAvisos() {
    if (!noLeidas()) return;
    store.marcarLeidas().then(function () {
      S.d.notificaciones.forEach(function (n) { n.leida = true; });
      pestanas('avisos');
    }).catch(function () { /* se marcarán la próxima vez */ });
  }

  /* ---------- Formularios ---------- */

  function abrir(dlg) {
    dlg.querySelectorAll('.msg').forEach(function (m) { m.textContent = ''; });
    dlg.showModal();
  }
  function ocupado(form, si) { form.querySelectorAll('button').forEach(function (b) { b.disabled = si; }); }
  function conMensaje(id, promesa, form) {
    if (form) ocupado(form, true);
    return promesa.catch(function (err) { $(id).textContent = '⚠️ ' + err.message; throw err; })
      .then(function (r) { if (form) ocupado(form, false); return r; }, function () { if (form) ocupado(form, false); return Promise.reject(); });
  }

  /* Barbería */
  var editBarberia = null;
  function abrirBarberia(b) {
    editBarberia = b;
    var form = $('form-barberia');
    form.reset();
    $('barberia-titulo').textContent = b.id ? 'Datos de la barbería' : 'Registrar mi barbería';
    $('barberia-ayuda').hidden = !!b.id;
    form.nombre.value = b.nombre || '';
    form.direccion.value = b.direccion || '';
    form.telefono.value = b.telefono || '';
    form.descripcion.value = b.descripcion || '';
    form.cancelar_horas.value = b.cancelar_horas != null ? b.cancelar_horas : cfg.CANCELAR_HORAS;
    $('barberia-borrar').hidden = true;
    abrir($('dlg-barberia'));
  }
  $('form-barberia').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, b = Object.assign({}, editBarberia, {
      nombre: form.nombre.value.trim(), direccion: form.direccion.value.trim(), telefono: form.telefono.value.trim(),
      descripcion: form.descripcion.value.trim(), cancelar_horas: Number(form.cancelar_horas.value)
    });
    conMensaje('barberia-msg', store.guardarBarberia(b), form).then(function (g) {
      $('dlg-barberia').close();
      toast(editBarberia.id ? '✅ Guardado' : '✅ Barbería creada. Ahora sube los documentos.');
      if (!editBarberia.id) location.hash = 'b/' + g.id + '/datos';
      return recargar();
    }).catch(function () { /* el mensaje ya se mostró */ });
  });

  /* Documentos */
  var docBarberia = null;
  function abrirDocumento(bid) {
    docBarberia = bid;
    var form = $('form-documento'), docs = de(S.d.documentos, bid);
    form.reset();
    var faltan = A.documentosFaltantes(cfg.DOCUMENTOS, docs);
    form.tipo.innerHTML = cfg.DOCUMENTOS.map(function (t) {
      return '<option' + (faltan[0] === t.tipo ? ' selected' : '') + '>' + esc(t.tipo) + '</option>';
    }).join('');
    cambioTipoDoc();
    abrir($('dlg-documento'));
  }
  function cambioTipoDoc() {
    var form = $('form-documento'), t = cfg.DOCUMENTOS.filter(function (x) { return x.tipo === form.tipo.value; })[0];
    $('doc-vence-row').hidden = !(t && t.vence);
    form.vence.required = !!(t && t.vence);
  }
  $('form-documento').addEventListener('change', function (e) { if (e.target.name === 'tipo') cambioTipoDoc(); });
  $('form-documento').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, archivo = form.archivo.files[0], tipo = form.tipo.value, vence = $('doc-vence-row').hidden ? null : form.vence.value || null;
    if (!archivo) return;
    var anteriores = de(S.d.documentos, docBarberia).filter(function (d) { return d.tipo === tipo && d.estado === 'rechazado'; });
    conMensaje('documento-msg', store.subirArchivo(docBarberia, archivo).then(function (ruta) {
      return store.guardarDocumento({ barberia_id: docBarberia, tipo: tipo, archivo: ruta, nombre_archivo: archivo.name, vence: vence });
    }).then(function () {
      // El documento nuevo reemplaza a los rechazados del mismo tipo.
      return Promise.all(anteriores.map(function (d) { return borrarDoc(d); }));
    }), form).then(function () {
      $('dlg-documento').close();
      toast('📄 Documento subido');
      return recargar();
    }).catch(function () { /* el mensaje ya se mostró */ });
  });
  function borrarDoc(d) {
    return store.borrarDocumento(d.id).then(function () {
      if (d.archivo) return store.borrarArchivo(d.archivo).catch(function () { /* queda huérfano, no importa */ });
    });
  }
  function verDocumento(d) {
    var w = window.open('', '_blank');
    store.urlArchivo(d.archivo).then(function (url) {
      if (url.indexOf('data:') === 0) return fetch(url).then(function (r) { return r.blob(); }).then(function (bl) { return URL.createObjectURL(bl); });
      return url;
    }).then(function (url) {
      if (w) w.location = url; else location.href = url;
    }).catch(function (e) { if (w) w.close(); fallo(e); });
  }

  /* Barberos */
  var editBarbero = null;
  function abrirBarbero(x) {
    editBarbero = x;
    var form = $('form-barbero');
    form.reset();
    $('barbero-titulo').textContent = x.id ? x.nombre : 'Nuevo barbero';
    form.nombre.value = x.nombre || '';
    form.email.value = x.email || '';
    form.activo.checked = x.activo !== false;
    var horario = x.horario || (de(S.d.barberos, x.barberia_id)[0] || {}).horario ||
      { 1: [['09:00', '13:00'], ['15:00', '19:00']], 2: [['09:00', '13:00'], ['15:00', '19:00']], 3: [['09:00', '13:00'], ['15:00', '19:00']],
        4: [['09:00', '13:00'], ['15:00', '19:00']], 5: [['09:00', '13:00'], ['15:00', '19:00']], 6: [['09:00', '14:00']] };
    $('barbero-horario').innerHTML = A.DIAS.map(function (dia, i) {
      return '<label><span>' + cap(dia) + '</span><input name="dia' + (i + 1) + '" value="' + esc(A.textoFranjas(horario[i + 1])) + '" placeholder="Cerrado" inputmode="numeric"></label>';
    }).join('');
    $('barbero-borrar').hidden = !x.id;
    abrir($('dlg-barbero'));
  }
  $('form-barbero').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target, horario = {};
    try {
      for (var d = 1; d <= 7; d++) {
        var fr = A.leerFranjas(form['dia' + d].value);
        if (fr.length) horario[d] = fr;
      }
    } catch (err) { $('barbero-msg').textContent = '⚠️ ' + err.message; return; }
    var x = Object.assign({}, editBarbero, { nombre: form.nombre.value.trim(), email: form.email.value.trim() || null, horario: horario, activo: form.activo.checked });
    conMensaje('barbero-msg', store.guardarBarbero(x), form).then(function () {
      $('dlg-barbero').close();
      return recargar();
    }).catch(function () { /* el mensaje ya se mostró */ });
  });
  $('barbero-borrar').addEventListener('click', function () {
    if (!confirm('¿Borrar a ' + editBarbero.nombre + '?')) return;
    conMensaje('barbero-msg', store.borrarBarbero(editBarbero.id)).then(function () {
      $('dlg-barbero').close();
      return recargar();
    }).catch(function () { /* el mensaje ya se mostró */ });
  });

  /* Servicios */
  var editServicio = null;
  function abrirServicio(s) {
    editServicio = s;
    var form = $('form-servicio');
    form.reset();
    form.nombre.value = s.nombre || '';
    form.duracion_min.value = s.duracion_min || 30;
    form.precio.value = s.precio != null ? s.precio : '';
    form.activo.checked = s.activo !== false;
    $('servicio-borrar').hidden = !s.id;
    abrir($('dlg-servicio'));
  }
  $('form-servicio').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    var s = Object.assign({}, editServicio, { nombre: form.nombre.value.trim(), duracion_min: Number(form.duracion_min.value),
      precio: form.precio.value === '' ? null : Number(form.precio.value), activo: form.activo.checked });
    conMensaje('servicio-msg', store.guardarServicio(s), form).then(function () {
      $('dlg-servicio').close();
      return recargar();
    }).catch(function () { /* el mensaje ya se mostró */ });
  });
  $('servicio-borrar').addEventListener('click', function () {
    if (!confirm('¿Borrar el servicio ' + editServicio.nombre + '? Las citas ya hechas no se borran.')) return;
    conMensaje('servicio-msg', store.borrarServicio(editServicio.id)).then(function () {
      $('dlg-servicio').close();
      return recargar();
    }).catch(function () { /* el mensaje ya se mostró */ });
  });

  /* Cita agendada por la barbería */
  var citaBarberia = null;
  function abrirCita(bid, fecha) {
    citaBarberia = bid;
    var form = $('form-cita');
    form.reset();
    form.cliente.innerHTML = '<option value="">Otro (sin cuenta en el portal)</option>' + de(S.d.afiliaciones, bid)
      .sort(function (p, q) { return p.nombre.localeCompare(q.nombre); }).map(function (a) {
        return '<option value="' + esc(a.cliente_email) + '">' + esc(a.nombre) + '</option>';
      }).join('');
    form.servicio_id.innerHTML = de(S.d.servicios, bid).filter(function (s) { return s.activo; }).map(function (s) {
      return '<option value="' + s.id + '">' + esc(s.nombre) + ' (' + s.duracion_min + ' min)</option>';
    }).join('');
    form.barbero_id.innerHTML = de(S.d.barberos, bid).filter(function (x) { return x.activo; }).map(function (x) {
      return '<option value="' + x.id + '">' + esc(x.nombre) + '</option>';
    }).join('');
    form.fecha.value = fecha < A.hoy() ? A.hoy() : fecha;
    form.fecha.min = A.hoy();
    $('cita-nombre-row').hidden = false;
    abrir($('dlg-cita'));
    horasCita();
  }
  function horasCita() {
    var form = $('form-cita'), srv = porId(S.d.servicios, form.servicio_id.value), br = porId(S.d.barberos, form.barbero_id.value), fecha = form.fecha.value;
    form.hora.innerHTML = '<option value="">…</option>';
    if (!srv || !br || !fecha) { form.hora.innerHTML = '<option value="">Falta servicio o barbero</option>'; return; }
    ocupadosDe(citaBarberia, fecha).then(function (ocup) {
      var libres = A.horasLibres(br, fecha, srv.duracion_min, ocup, { intervalo: 15, ahora: new Date() });
      form.hora.innerHTML = libres.length ? libres.map(function (h) { return '<option>' + h + '</option>'; }).join('') : '<option value="">Sin horas libres</option>';
    }).catch(fallo);
  }
  $('form-cita').addEventListener('change', function (e) {
    if (e.target.name === 'cliente') $('cita-nombre-row').hidden = !!e.target.value;
    if (['servicio_id', 'barbero_id', 'fecha'].indexOf(e.target.name) >= 0) horasCita();
  });
  $('form-cita').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    if (!form.hora.value) { $('cita-msg').textContent = '⚠️ Elige una hora.'; return; }
    conMensaje('cita-msg', store.reservar({ barberia_id: citaBarberia, servicio_id: form.servicio_id.value, barbero_id: form.barbero_id.value,
      inicio: A.aDate(form.fecha.value, form.hora.value).toISOString(), cliente_email: form.cliente.value || null,
      cliente_nombre: form.cliente_nombre.value, nota: form.nota.value }), form).then(function () {
      $('dlg-cita').close();
      toast('📅 Cita agendada');
      location.hash = 'b/' + citaBarberia + '/agenda/' + form.fecha.value;
      return recargar();
    }).catch(function () { S.ocupados = {}; horasCita(); });
  });

  /* Pedir un motivo (cancelar, rechazar, decidir) */
  var motivoAccion = null;
  function pedirMotivo(o) {
    motivoAccion = o;
    var form = $('form-motivo');
    form.reset();
    $('motivo-titulo').textContent = o.titulo;
    $('motivo-txt').innerHTML = o.texto || '';
    $('motivo-etiqueta').textContent = o.etiqueta || 'Motivo';
    $('motivo-row').hidden = o.sinMotivo;
    form.motivo.required = !!o.requerido;
    form.motivo.placeholder = o.requerido ? '' : '(opcional)';
    $('motivo-ok').textContent = o.boton || 'Confirmar';
    $('motivo-ok').className = 'btn ' + (o.peligro ? 'danger' : 'primary');
    abrir($('dlg-motivo'));
  }
  $('form-motivo').addEventListener('submit', function (e) {
    e.preventDefault();
    var form = e.target;
    conMensaje('motivo-msg', motivoAccion.ok(form.motivo.value.trim()), form).then(function () {
      $('dlg-motivo').close();
      if (motivoAccion.listo) toast(motivoAccion.listo);
      return recargar();
    }).catch(function () { /* el mensaje ya se mostró */ });
  });

  document.querySelectorAll('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) {
      if (e.target === d || e.target.hasAttribute('data-cerrar')) d.close();
    });
  });

  /* ---------- Acciones ---------- */

  function copiar(texto) {
    if (navigator.clipboard) return navigator.clipboard.writeText(texto);
    var t = document.createElement('textarea');
    t.value = texto;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
    return Promise.resolve();
  }

  var acciones = {
    'salir': function () { store.salir().then(mostrarLogin).catch(fallo); },
    'reiniciar-demo': function () {
      if (confirm('¿Volver a los datos de ejemplo? Se pierde lo que hiciste en la prueba.')) store.reiniciarDemo().then(function () { S.res = {}; return iniciar(); });
    },
    'reclamar-super': function () {
      store.reclamarSuper().then(function (ok) {
        toast(ok ? '✅ Ahora eres el superadministrador' : 'Ya hay un superadministrador.');
        return iniciar();
      }).catch(fallo);
    },
    'res-elegir': function (el) {
      S.res[el.dataset.k] = el.dataset.v;
      if (el.dataset.k === 'fecha') location.hash = 'reservar/' + S.res.barberia + '/' + el.dataset.v;
      else render();
    },
    'res-hora': function (el) { abrirReserva(el.dataset.hora, el.dataset.barbero); },
    'abrir-espera': function () { abrirEspera(); },
    'salir-espera': function (el) {
      store.borrarEspera(el.dataset.id).then(function () { toast('Saliste de la lista de espera'); return recargar(); }).catch(fallo);
    },
    'cancelar-cita': function (el) {
      var c = porId(S.d.citas, el.dataset.id), b = barberia(c.barberia_id), soyCliente = c.cliente_email === S.yo && !esDueno(b.id);
      pedirMotivo({
        titulo: 'Cancelar cita',
        texto: '<b>' + esc(c.servicio_nombre) + '</b> · ' + esc(fechaCorta(fechaDeIso(c.inicio))) + ' a las ' + hora(c.inicio) +
          (soyCliente ? '' : ' · ' + esc(c.cliente_nombre)) + '<br><span class="muted small">El horario queda libre y avisamos a quienes estén en la lista de espera.</span>',
        etiqueta: soyCliente ? 'Motivo (opcional)' : 'Motivo para el cliente (opcional)',
        boton: 'Cancelar cita', peligro: true, listo: 'Cita cancelada',
        ok: function (m) { return store.cancelarCita(c.id, m); }
      });
    },
    'marcar-cita': function (el) { store.marcarCita(el.dataset.id, el.dataset.estado).then(recargar).catch(fallo); },
    'nueva-cita': function (el) { abrirCita(el.dataset.barberia, el.dataset.fecha); },
    'nueva-barberia': function () { abrirBarberia({}); },
    'editar-barberia': function (el) { abrirBarberia(barberia(el.dataset.id)); },
    'borrar-barberia': function (el) {
      var b = barberia(el.dataset.id);
      if (!confirm('¿Borrar la solicitud de ' + b.nombre + ' con sus documentos?')) return;
      store.borrarBarberia(b.id).then(function () { location.hash = 'inicio'; return recargar(); }).catch(fallo);
    },
    'enviar-revision': function (el) {
      var b = barberia(el.dataset.id);
      pedirMotivo({ titulo: 'Enviar a revisión', texto: 'Revisaremos los documentos de <b>' + esc(b.nombre) + '</b>. Mientras tanto no podrás cambiarlos.',
        sinMotivo: true, boton: '📨 Enviar', listo: '📨 Enviada. Te avisaremos cuando la revisemos.',
        ok: function () { return store.enviarARevision(b.id); } });
    },
    'subir-documento': function (el) { abrirDocumento(el.dataset.barberia); },
    'ver-documento': function (el) { verDocumento(porId(S.d.documentos, el.dataset.id)); },
    'borrar-documento': function (el) {
      var d = porId(S.d.documentos, el.dataset.id);
      if (confirm('¿Quitar "' + d.tipo + '"?')) borrarDoc(d).then(recargar).catch(fallo);
    },
    'doc-aceptar': function (el) { store.revisarDocumento(el.dataset.id, 'aceptado').then(recargar).catch(fallo); },
    'doc-rechazar': function (el) {
      var d = porId(S.d.documentos, el.dataset.id);
      pedirMotivo({ titulo: 'Rechazar documento', texto: esc(d.tipo), etiqueta: '¿Qué está mal? (lo verá el dueño)', requerido: true,
        boton: 'Rechazar documento', peligro: true, ok: function (m) { return store.revisarDocumento(d.id, 'rechazado', m); } });
    },
    'decidir': function (el) {
      var b = barberia(el.dataset.id), est = el.dataset.estado, e = A.ESTADOS_BARBERIA[est];
      var rechazados = de(S.d.documentos, b.id).filter(function (d) { return d.estado === 'rechazado'; });
      var sugerido = rechazados.map(function (d) { return '• ' + d.tipo + ': ' + d.observacion; }).join('\n');
      pedirMotivo({
        titulo: b.nombre + ' → ' + e.txt,
        texto: est === 'aprobada' ? 'Puedes dejarle un mensaje de bienvenida (opcional).' : 'El dueño verá este motivo.',
        etiqueta: est === 'aprobada' ? 'Mensaje' : 'Motivo', requerido: A.pideMotivo(est),
        boton: e.ico + ' ' + e.txt, peligro: est === 'rechazada' || est === 'suspendida', listo: '✅ Listo: le avisamos al dueño',
        ok: function (m) { return store.decidir(b.id, est, m); }
      });
      if (est !== 'aprobada' && sugerido) $('form-motivo').motivo.value = sugerido;
    },
    'nuevo-barbero': function (el) { abrirBarbero({ barberia_id: el.dataset.barberia }); },
    'editar-barbero': function (el) { abrirBarbero(porId(S.d.barberos, el.dataset.id)); },
    'nuevo-servicio': function (el) { abrirServicio({ barberia_id: el.dataset.barberia }); },
    'editar-servicio': function (el) { abrirServicio(porId(S.d.servicios, el.dataset.id)); },
    'copiar-enlace': function (el) { copiar(enlaceInvitacion(barberia(el.dataset.id))).then(function () { toast('📋 Enlace copiado'); }).catch(fallo); },
    'compartir-enlace': function (el) {
      var b = barberia(el.dataset.id);
      navigator.share({ title: b.nombre, text: 'Reserva tu cita en ' + b.nombre, url: enlaceInvitacion(b) }).catch(function () { /* canceló */ });
    },
    'imprimir-cartel': function () {
      document.body.classList.add('imprimir-cartel');
      window.print();
      setTimeout(function () { document.body.classList.remove('imprimir-cartel'); }, 500);
    },
    'nuevo-codigo': function (el) {
      if (!confirm('¿Cambiar el código? El enlace y el QR anteriores dejan de servir (tus clientes actuales no se pierden).')) return;
      store.nuevoCodigo(el.dataset.id).then(function () { toast('🔄 Código nuevo'); return recargar(); }).catch(fallo);
    },
    'quitar-cliente': function (el) {
      var a = porId(S.d.afiliaciones, el.dataset.id);
      if (confirm('¿Quitar a ' + a.nombre + '? Ya no verá tu barbería ni podrá reservar (sus citas ya hechas siguen).')) {
        store.borrarAfiliacion(a.id).then(recargar).catch(fallo);
      }
    }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el || !acciones[el.dataset.action]) return;
    e.preventDefault();
    e.stopPropagation();
    acciones[el.dataset.action](el);
  });
  document.addEventListener('submit', function (e) {
    var tipo = e.target.dataset.form;
    if (!tipo) return;
    e.preventDefault();
    var form = e.target;
    if (tipo === 'codigo') location.hash = 'unirme/' + form.codigo.value.trim().toUpperCase();
    if (tipo === 'unirme') {
      var msg = form.querySelector('.msg');
      ocupado(form, true);
      store.unirme(form.dataset.codigo, form.nombre.value.trim(), form.telefono.value.trim()).then(function (bid) {
        toast('🎉 ¡Listo! Ya puedes reservar');
        location.hash = 'reservar/' + bid;
        return recargar();
      }).catch(function (err) { msg.textContent = '⚠️ ' + err.message; ocupado(form, false); });
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.hasAttribute('data-ir')) location.hash = e.target.value.slice(1);
    if (e.target.dataset.irFecha && e.target.value) location.hash = e.target.dataset.irFecha.slice(1) + e.target.value;
  });
  document.addEventListener('focusin', function (e) { if (e.target.hasAttribute('data-seleccionar')) e.target.select(); });
  window.addEventListener('hashchange', function () { render(); window.scrollTo(0, 0); });

  /* ---------- Arranque ---------- */

  document.querySelectorAll('.nombre-portal').forEach(function (el) { el.textContent = cfg.NOMBRE; });
  if (store.demo) {
    $('demo-banner').hidden = false;
    $('demo-user').innerHTML = store.usuariosDemo.map(function (u) { return '<option value="' + u.email + '">' + esc(u.nombre) + '</option>'; }).join('');
    $('demo-user').addEventListener('change', function (e) {
      store.entrar(e.target.value).then(function () { S.res = {}; location.hash = 'inicio'; return iniciar(); });
    });
  }
  store.alCambiarSesion(function (evento) {
    if (evento === 'SIGNED_IN' && !S.yo) iniciar();
    if (evento === 'SIGNED_OUT') mostrarLogin();
  });
  iniciar();
})();
