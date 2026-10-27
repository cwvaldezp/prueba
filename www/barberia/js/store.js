/*
 * Dónde se guardan los datos. Las dos versiones tienen las mismas funciones (todas devuelven promesas):
 *  - SupabaseStore: la de verdad, con usuarios y permisos (supabase/barberia.sql).
 *  - DemoStore: modo de prueba, guarda en este navegador y deja cambiar de usuario
 *    para ver lo que ve el superadministrador, un dueño, un barbero o un cliente.
 * Las reglas del modo de prueba copian las del servidor: si cambias una, cambia la otra.
 */
(function (root) {
  var A = root.Agenda;

  function uid() {
    if (root.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function limpio(email) { return String(email || '').trim().toLowerCase(); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function error(msg) { return Promise.reject(new Error(msg)); }
  var PROHIBIDO = 'No tienes permiso para hacer eso.';

  function textoCita(c, barbero) {
    return A.nombreFecha(A.fechaDe(new Date(c.inicio))) + ' a las ' + A.horaDe(new Date(c.inicio)) + (barbero ? ' con ' + barbero.nombre : '');
  }

  /* ---------- Modo de prueba ---------- */

  var DEMO_KEY = 'barberia-demo-v1';
  var DEMO_USUARIOS = [
    { email: 'yo@ejemplo.com', nombre: 'Yo (superadministrador)' },
    { email: 'carlos@ejemplo.com', nombre: 'Carlos (dueño de El Clásico)' },
    { email: 'pedro@ejemplo.com', nombre: 'Pedro (barbero de El Clásico)' },
    { email: 'ana@ejemplo.com', nombre: 'Ana (clienta con cita)' },
    { email: 'jorge@ejemplo.com', nombre: 'Jorge (cliente en lista de espera)' },
    { email: 'sofia@ejemplo.com', nombre: 'Sofía (barbería en revisión)' },
    { email: 'nuevo@ejemplo.com', nombre: 'Alguien nuevo' }
  ];

  function datosDeEjemplo(tiposDoc) {
    var d = { superadmins: ['yo@ejemplo.com'], barberias: [], documentos: [], revisiones: [], barberos: [], servicios: [],
      afiliaciones: [], citas: [], espera: [], notificaciones: [] };
    var ahora = new Date().toISOString(), hoy = A.hoy();
    function fila(tabla, o) { o.id = o.id || uid(); o.created_at = o.created_at || ahora; d[tabla].push(o); return o; }
    var semana = { 1: [['09:00', '13:00'], ['15:00', '19:00']], 2: [['09:00', '13:00'], ['15:00', '19:00']], 3: [['09:00', '13:00'], ['15:00', '19:00']],
      4: [['09:00', '13:00'], ['15:00', '19:00']], 5: [['09:00', '13:00'], ['15:00', '20:00']], 6: [['09:00', '14:00']] };

    var clasico = fila('barberias', { nombre: 'Barbería El Clásico', direccion: 'Av. Los Próceres 456', telefono: '+51 987 654 321',
      descripcion: 'Cortes clásicos y modernos, barba con toalla caliente.', dueno_email: 'carlos@ejemplo.com', estado: 'aprobada',
      motivo: null, codigo: 'CLASICO7', cancelar_horas: 2, enviada_at: ahora });
    tiposDoc.forEach(function (t) {
      fila('documentos', { barberia_id: clasico.id, tipo: t.tipo, archivo: null, nombre_archivo: 'ejemplo.pdf',
        vence: t.vence ? A.sumarDias(hoy, 20) : null, estado: 'aceptado', observacion: null });
    });
    fila('revisiones', { barberia_id: clasico.id, estado: 'en_revision', motivo: null, por_email: 'carlos@ejemplo.com' });
    fila('revisiones', { barberia_id: clasico.id, estado: 'aprobada', motivo: 'Todo en orden. ¡Bienvenidos!', por_email: 'yo@ejemplo.com' });
    var pedro = fila('barberos', { barberia_id: clasico.id, nombre: 'Pedro', email: 'pedro@ejemplo.com', horario: semana, activo: true });
    var luis = fila('barberos', { barberia_id: clasico.id, nombre: 'Luis', email: null, horario: semana, activo: true });
    var corte = fila('servicios', { barberia_id: clasico.id, nombre: 'Corte de cabello', duracion_min: 30, precio: 15, activo: true });
    fila('servicios', { barberia_id: clasico.id, nombre: 'Corte + barba', duracion_min: 60, precio: 25, activo: true });
    fila('servicios', { barberia_id: clasico.id, nombre: 'Perfilado de barba', duracion_min: 30, precio: 10, activo: true });
    fila('afiliaciones', { barberia_id: clasico.id, cliente_email: 'ana@ejemplo.com', nombre: 'Ana Torres', telefono: '+51 900 111 222' });
    fila('afiliaciones', { barberia_id: clasico.id, cliente_email: 'jorge@ejemplo.com', nombre: 'Jorge Ríos', telefono: '+51 900 333 444' });

    // El próximo día que atienden queda lleno, para que Jorge esté en la lista de espera.
    var dia = A.sumarDias(hoy, 1);
    while (!A.horarioDelDia(pedro, dia).length) dia = A.sumarDias(dia, 1);
    var nombres = ['Mario', 'Raúl', 'Diego', 'Kevin', 'Hugo', 'Iván', 'Óscar', 'Bruno', 'Félix', 'Tomás', 'Ángel', 'Martín'];
    var n = 0;
    [pedro, luis].forEach(function (b) {
      A.horarioDelDia(b, dia).forEach(function (fr) {
        for (var m = A.minutos(fr[0]); m + 30 <= A.minutos(fr[1]); m += 30) {
          var ini = A.aDate(dia, A.hhmm(m)).toISOString(), deAna = b === pedro && m === 10 * 60 + 30;
          fila('citas', { barberia_id: clasico.id, barbero_id: b.id, servicio_id: corte.id, servicio_nombre: corte.nombre,
            cliente_email: deAna ? 'ana@ejemplo.com' : null, cliente_nombre: deAna ? 'Ana Torres' : nombres[n++ % nombres.length] + ' (sin cuenta)',
            inicio: ini, fin: A.finDe(ini, 30), estado: 'reservada', nota: null, cancelada_por: null, motivo_cancelacion: null,
            creada_por: deAna ? 'ana@ejemplo.com' : 'carlos@ejemplo.com' });
        }
      });
    });
    // Una cita pasada de Ana.
    var antes = A.aDate(A.sumarDias(hoy, -12), '17:00').toISOString();
    fila('citas', { barberia_id: clasico.id, barbero_id: luis.id, servicio_id: corte.id, servicio_nombre: corte.nombre,
      cliente_email: 'ana@ejemplo.com', cliente_nombre: 'Ana Torres', inicio: antes, fin: A.finDe(antes, 30), estado: 'completada',
      nota: null, cancelada_por: null, motivo_cancelacion: null, creada_por: 'ana@ejemplo.com' });
    fila('espera', { barberia_id: clasico.id, cliente_email: 'jorge@ejemplo.com', cliente_nombre: 'Jorge Ríos', fecha: dia,
      barbero_id: null, servicio_id: corte.id, desde: '09:00', hasta: '13:00', estado: 'esperando', avisos: 0 });

    var navaja = fila('barberias', { nombre: 'Navaja de Oro', direccion: 'Jr. Las Begonias 120', telefono: '+51 955 000 111',
      descripcion: 'Barbería y spa para caballeros.', dueno_email: 'sofia@ejemplo.com', estado: 'en_revision', motivo: null,
      codigo: 'NAVAJA42', cancelar_horas: 3, enviada_at: ahora });
    tiposDoc.filter(function (t) { return t.obligatorio; }).forEach(function (t) {
      fila('documentos', { barberia_id: navaja.id, tipo: t.tipo, archivo: null, nombre_archivo: 'documento.pdf',
        vence: t.vence ? A.sumarDias(hoy, 300) : null, estado: 'pendiente', observacion: null });
    });
    fila('revisiones', { barberia_id: navaja.id, estado: 'en_revision', motivo: null, por_email: 'sofia@ejemplo.com' });
    fila('barberos', { barberia_id: navaja.id, nombre: 'Sofía', email: 'sofia@ejemplo.com', horario: semana, activo: true });
    fila('servicios', { barberia_id: navaja.id, nombre: 'Corte premium', duracion_min: 45, precio: 30, activo: true });
    fila('notificaciones', { email: 'yo@ejemplo.com', barberia_id: navaja.id, tipo: 'revision', titulo: 'Nueva barbería para revisar',
      texto: 'Navaja de Oro envió sus documentos.', enlace: '#revision/' + navaja.id, leida: false });
    return d;
  }

  function DemoStore(cfg) {
    var tiposDoc = (cfg && cfg.DOCUMENTOS) || [];
    var db, yo = null;
    function cargar() {
      try { db = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch (e) { db = null; }
      if (!db) { db = datosDeEjemplo(tiposDoc); guardar(); }
      try { yo = localStorage.getItem(DEMO_KEY + '-usuario'); } catch (e) { yo = null; }
    }
    function guardar() {
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch (e) { /* sin almacenamiento: queda en memoria */ }
    }
    function buscar(tabla, id) { return db[tabla].filter(function (x) { return x.id === id; })[0]; }
    function nuevo(tabla, o) { o.id = uid(); o.created_at = new Date().toISOString(); db[tabla].push(o); return o; }

    function esSuper() { return db.superadmins.indexOf(yo) >= 0; }
    function esDueno(bid) { var b = buscar('barberias', bid); return !!b && b.dueno_email === yo; }
    function esBarbero(bid) { return db.barberos.some(function (x) { return x.barberia_id === bid && x.email === yo && x.activo; }); }
    function esStaff(bid) { return esDueno(bid) || esBarbero(bid); }
    function esAfiliado(bid) { return db.afiliaciones.some(function (a) { return a.barberia_id === bid && a.cliente_email === yo; }); }
    function puedeVer(bid) { return esSuper() || esStaff(bid) || esAfiliado(bid); }
    function editable(bid) { var b = buscar('barberias', bid); return esDueno(bid) && (b.estado === 'borrador' || b.estado === 'correccion'); }
    function veCita(c) {
      if (esDueno(c.barberia_id) || c.cliente_email === yo) return true;
      var b = buscar('barberos', c.barbero_id);
      return !!b && b.email === yo;
    }

    function notificar(email, barberiaId, tipo, titulo, texto, enlace) {
      if (!email) return;
      nuevo('notificaciones', { email: email, barberia_id: barberiaId, tipo: tipo, titulo: titulo, texto: texto, enlace: enlace || null, leida: false });
    }
    // El dueño y, si tiene correo y no es el dueño, el barbero de la cita.
    function notificarBarberia(b, barbero, titulo, texto, enlace) {
      notificar(b.dueno_email, b.id, 'cita', titulo, texto, enlace);
      if (barbero && barbero.email && barbero.email !== b.dueno_email) notificar(barbero.email, b.id, 'cita', titulo, texto, '#agenda');
    }
    function guardarEn(tabla, fila, campos) {
      var f = {};
      campos.forEach(function (k) { if (k in fila) f[k] = fila[k]; });
      var actual = fila.id && buscar(tabla, fila.id);
      if (actual) Object.assign(actual, f);
      else actual = nuevo(tabla, f);
      guardar();
      return Promise.resolve(copia(actual));
    }
    function ok(x) { guardar(); return Promise.resolve(x === undefined ? undefined : copia(x)); }

    cargar();
    return {
      demo: true,
      usuariosDemo: DEMO_USUARIOS,
      sesion: function () { return Promise.resolve(yo ? { email: yo } : null); },
      alCambiarSesion: function () { /* en prueba la sesión cambia sólo con entrar/salir */ },
      entrar: function (email) {
        yo = limpio(email);
        try { localStorage.setItem(DEMO_KEY + '-usuario', yo); } catch (e) { /* sin almacenamiento */ }
        return Promise.resolve({ email: yo });
      },
      registrarse: function (email) { return this.entrar(email); },
      enlaceMagico: function (email) { return this.entrar(email).then(function () { return 'entró'; }); },
      salir: function () {
        yo = null;
        try { localStorage.removeItem(DEMO_KEY + '-usuario'); } catch (e) { /* sin almacenamiento */ }
        return Promise.resolve();
      },
      reiniciarDemo: function () { db = datosDeEjemplo(tiposDoc); guardar(); return Promise.resolve(); },

      esSuper: function () { return Promise.resolve(esSuper()); },
      haySuper: function () { return Promise.resolve(db.superadmins.length > 0); },
      reclamarSuper: function () {
        if (db.superadmins.length) return Promise.resolve(false);
        db.superadmins.push(yo);
        return ok(true);
      },

      todo: function () {
        var dueno = function (x) { return esSuper() || esDueno(x.barberia_id); };
        return Promise.resolve(copia({
          barberias: db.barberias.filter(function (b) { return puedeVer(b.id); }),
          documentos: db.documentos.filter(dueno),
          revisiones: db.revisiones.filter(dueno),
          barberos: db.barberos.filter(function (x) { return puedeVer(x.barberia_id); }),
          servicios: db.servicios.filter(function (x) { return puedeVer(x.barberia_id); }),
          afiliaciones: db.afiliaciones.filter(function (a) { return esStaff(a.barberia_id) || a.cliente_email === yo; }),
          citas: db.citas.filter(veCita),
          espera: db.espera.filter(function (e) { return esDueno(e.barberia_id) || e.cliente_email === yo; }),
          notificaciones: db.notificaciones.filter(function (n) { return n.email === yo; })
        }));
      },

      /* Barbería y revisión */
      guardarBarberia: function (b) {
        if (b.id && !esDueno(b.id) && !esSuper()) return error(PROHIBIDO);
        if (!b.id) {
          b = Object.assign({}, b, { dueno_email: yo, estado: 'borrador', motivo: null, codigo: A.codigoInvitacion(), enviada_at: null });
          return guardarEn('barberias', b, Object.keys(b));
        }
        return guardarEn('barberias', b, ['id', 'nombre', 'direccion', 'telefono', 'descripcion', 'cancelar_horas']);
      },
      borrarBarberia: function (id) {
        var b = buscar('barberias', id);
        if (!b || !(esSuper() || (esDueno(id) && b.estado === 'borrador'))) return error(PROHIBIDO);
        Object.keys(db).forEach(function (t) {
          if (Array.isArray(db[t]) && t !== 'superadmins') db[t] = db[t].filter(function (x) { return x.barberia_id !== id; });
        });
        db.barberias = db.barberias.filter(function (x) { return x.id !== id; });
        return ok();
      },
      enviarARevision: function (id) {
        var b = buscar('barberias', id);
        if (!b || !esDueno(id)) return error(PROHIBIDO);
        if (b.estado !== 'borrador' && b.estado !== 'correccion') return error('Esta barbería ya fue enviada.');
        var docs = db.documentos.filter(function (x) { return x.barberia_id === id; }), faltan = A.documentosFaltantes(tiposDoc, docs);
        if (faltan.length) return error('Faltan documentos: ' + faltan.join(', ') + '.');
        b.estado = 'en_revision';
        b.motivo = null;
        b.enviada_at = new Date().toISOString();
        nuevo('revisiones', { barberia_id: id, estado: 'en_revision', motivo: null, por_email: yo });
        db.superadmins.forEach(function (s) {
          notificar(s, id, 'revision', 'Nueva barbería para revisar', b.nombre + ' envió sus documentos.', '#revision/' + id);
        });
        return ok(b);
      },
      decidir: function (id, estado, motivo) {
        var b = buscar('barberias', id);
        motivo = String(motivo || '').trim();
        if (!b || !esSuper()) return error(PROHIBIDO);
        if (!A.puedeDecidir(b.estado, estado)) return error('No se puede pasar de "' + A.ESTADOS_BARBERIA[b.estado].txt + '" a "' + A.ESTADOS_BARBERIA[estado].txt + '".');
        if (A.pideMotivo(estado) && !motivo) return error('Escribe el motivo para el dueño.');
        b.estado = estado;
        b.motivo = motivo || null;
        nuevo('revisiones', { barberia_id: id, estado: estado, motivo: motivo || null, por_email: yo });
        var e = A.ESTADOS_BARBERIA[estado];
        notificar(b.dueno_email, id, 'revision', e.ico + ' ' + b.nombre + ': ' + e.txt.toLowerCase(), motivo || '¡Ya puedes invitar a tus clientes y recibir citas!', '#b/' + id + '/datos');
        return ok(b);
      },
      nuevoCodigo: function (id) {
        var b = buscar('barberias', id);
        if (!b || !esDueno(id)) return error(PROHIBIDO);
        b.codigo = A.codigoInvitacion();
        return ok(b.codigo);
      },

      /* Documentos */
      subirArchivo: function (barberiaId, archivo) {
        if (!editable(barberiaId)) return error(PROHIBIDO);
        if (archivo.size > 1.5e6) return error('En el modo de prueba los archivos pueden pesar hasta 1,5 MB.');
        return new Promise(function (bien, mal) {
          var r = new FileReader();
          r.onload = function () { bien(r.result); };
          r.onerror = function () { mal(new Error('No se pudo leer el archivo.')); };
          r.readAsDataURL(archivo);
        });
      },
      urlArchivo: function (ruta) { return ruta ? Promise.resolve(ruta) : error('En los datos de ejemplo no hay archivo real.'); },
      borrarArchivo: function () { return Promise.resolve(); },
      guardarDocumento: function (doc) {
        if (!editable(doc.barberia_id)) return error('Sólo se pueden cambiar documentos antes de enviar o cuando te piden corrección.');
        doc = Object.assign({}, doc, { estado: 'pendiente', observacion: null });
        return guardarEn('documentos', doc, ['barberia_id', 'tipo', 'archivo', 'nombre_archivo', 'vence', 'estado', 'observacion']);
      },
      borrarDocumento: function (id) {
        var doc = buscar('documentos', id);
        if (!doc || !editable(doc.barberia_id)) return error(PROHIBIDO);
        db.documentos = db.documentos.filter(function (x) { return x.id !== id; });
        return ok();
      },
      revisarDocumento: function (id, estado, observacion) {
        var doc = buscar('documentos', id);
        if (!doc || !esSuper()) return error(PROHIBIDO);
        if (estado === 'rechazado' && !String(observacion || '').trim()) return error('Escribe qué está mal en el documento.');
        doc.estado = estado;
        doc.observacion = String(observacion || '').trim() || null;
        return ok(doc);
      },

      /* Equipo y servicios */
      guardarBarbero: function (x) {
        if (!esDueno(x.barberia_id) || (x.id && buscar('barberos', x.id).barberia_id !== x.barberia_id)) return error(PROHIBIDO);
        x = Object.assign({}, x, { email: x.email ? limpio(x.email) : null });
        return guardarEn('barberos', x, ['id', 'barberia_id', 'nombre', 'email', 'horario', 'activo']);
      },
      borrarBarbero: function (id) {
        var x = buscar('barberos', id);
        if (!x || !esDueno(x.barberia_id)) return error(PROHIBIDO);
        if (db.citas.some(function (c) { return c.barbero_id === id; })) return error('Tiene citas registradas: desactívalo en lugar de borrarlo.');
        db.barberos = db.barberos.filter(function (b) { return b.id !== id; });
        db.espera.forEach(function (e) { if (e.barbero_id === id) e.barbero_id = null; });
        return ok();
      },
      guardarServicio: function (x) {
        if (!esDueno(x.barberia_id) || (x.id && buscar('servicios', x.id).barberia_id !== x.barberia_id)) return error(PROHIBIDO);
        return guardarEn('servicios', x, ['id', 'barberia_id', 'nombre', 'duracion_min', 'precio', 'activo']);
      },
      borrarServicio: function (id) {
        var x = buscar('servicios', id);
        if (!x || !esDueno(x.barberia_id)) return error(PROHIBIDO);
        db.servicios = db.servicios.filter(function (s) { return s.id !== id; });
        db.citas.forEach(function (c) { if (c.servicio_id === id) c.servicio_id = null; });
        db.espera.forEach(function (e) { if (e.servicio_id === id) e.servicio_id = null; });
        return ok();
      },

      /* Clientes */
      invitacion: function (codigo) {
        var b = db.barberias.filter(function (x) { return x.codigo === String(codigo || '').trim().toUpperCase() && x.estado === 'aprobada'; })[0];
        return Promise.resolve(b ? { id: b.id, nombre: b.nombre, direccion: b.direccion, ya_afiliado: esAfiliado(b.id) } : null);
      },
      unirme: function (codigo, nombre, telefono) {
        var b = db.barberias.filter(function (x) { return x.codigo === String(codigo || '').trim().toUpperCase() && x.estado === 'aprobada'; })[0];
        if (!b) return error('Ese código no existe o la barbería no está disponible.');
        if (!String(nombre || '').trim()) return error('Escribe tu nombre.');
        var a = db.afiliaciones.filter(function (x) { return x.barberia_id === b.id && x.cliente_email === yo; })[0];
        if (a) { a.nombre = nombre.trim(); a.telefono = telefono || null; }
        else {
          nuevo('afiliaciones', { barberia_id: b.id, cliente_email: yo, nombre: nombre.trim(), telefono: telefono || null });
          notificar(b.dueno_email, b.id, 'cliente', 'Nuevo cliente', nombre.trim() + ' se unió a ' + b.nombre + '.', '#b/' + b.id + '/clientes');
        }
        return ok(b.id);
      },
      borrarAfiliacion: function (id) {
        var a = buscar('afiliaciones', id);
        if (!a || !(esDueno(a.barberia_id) || a.cliente_email === yo)) return error(PROHIBIDO);
        db.afiliaciones = db.afiliaciones.filter(function (x) { return x.id !== id; });
        return ok();
      },

      /* Citas */
      // Horarios ocupados de un día (sin datos de los clientes), para calcular las horas libres.
      ocupados: function (barberiaId, fecha) {
        if (!puedeVer(barberiaId)) return error(PROHIBIDO);
        var desde = A.aDate(fecha), hasta = A.aDate(A.sumarDias(fecha, 1));
        return Promise.resolve(db.citas.filter(function (c) {
          return c.barberia_id === barberiaId && A.activa(c) && new Date(c.inicio) < hasta && new Date(c.fin) > desde;
        }).map(function (c) { return { barbero_id: c.barbero_id, inicio: c.inicio, fin: c.fin, estado: c.estado }; }));
      },
      reservar: function (r) {
        var b = buscar('barberias', r.barberia_id), staff = b && esStaff(b.id);
        if (!b || !(staff || esAfiliado(b.id))) return error(PROHIBIDO);
        if (b.estado !== 'aprobada') return error('La barbería no está habilitada para recibir citas.');
        var srv = buscar('servicios', r.servicio_id), barbero = buscar('barberos', r.barbero_id);
        if (!srv || srv.barberia_id !== b.id || !srv.activo) return error('Elige un servicio.');
        if (!barbero || barbero.barberia_id !== b.id || !barbero.activo) return error('Elige un barbero.');
        var ini = new Date(r.inicio), fin = new Date(A.finDe(r.inicio, srv.duracion_min)), fecha = A.fechaDe(ini);
        if (ini <= new Date()) return error('Esa hora ya pasó.');
        var dentro = A.horarioDelDia(barbero, fecha).some(function (f) {
          return A.aDate(fecha, f[0]) <= ini && fin <= A.aDate(fecha, f[1]);
        });
        if (!dentro) return error(barbero.nombre + ' no atiende a esa hora.');
        if (db.citas.some(function (c) { return c.barbero_id === barbero.id && A.activa(c) && A.pisa(ini, fin, c); })) {
          return error('Ese horario se acaba de ocupar. Elige otro.');
        }
        var email = staff ? (r.cliente_email ? limpio(r.cliente_email) : null) : yo;
        var afil = email && db.afiliaciones.filter(function (a) { return a.barberia_id === b.id && a.cliente_email === email; })[0];
        var nombre = (afil && afil.nombre) || String(r.cliente_nombre || '').trim();
        if (!nombre) return error('Escribe el nombre del cliente.');
        var c = nuevo('citas', { barberia_id: b.id, barbero_id: barbero.id, servicio_id: srv.id, servicio_nombre: srv.nombre,
          cliente_email: email, cliente_nombre: nombre, inicio: ini.toISOString(), fin: fin.toISOString(), estado: 'reservada',
          nota: String(r.nota || '').trim() || null, cancelada_por: null, motivo_cancelacion: null, creada_por: yo });
        if (email) db.espera.forEach(function (e) {
          if (e.barberia_id === b.id && e.cliente_email === email && e.fecha === fecha && e.estado === 'esperando') e.estado = 'atendida';
        });
        if (!staff) notificarBarberia(b, barbero, '📅 Nueva cita', nombre + ' reservó ' + srv.nombre + ' el ' + textoCita(c, barbero) + '.', '#b/' + b.id + '/agenda/' + fecha);
        else if (email && email !== yo) notificar(email, b.id, 'cita', '📅 Te agendaron una cita', srv.nombre + ' en ' + b.nombre + ' el ' + textoCita(c, barbero) + '.', '#citas');
        return ok(c);
      },
      cancelarCita: function (id, motivo) {
        var c = buscar('citas', id);
        if (!c) return error(PROHIBIDO);
        var b = buscar('barberias', c.barberia_id), barbero = buscar('barberos', c.barbero_id);
        var staff = esDueno(b.id) || (barbero && barbero.email === yo), cliente = c.cliente_email === yo;
        if (!staff && !cliente) return error(PROHIBIDO);
        if (!A.puedeCancelar(c, b.cancelar_horas, new Date(), !staff)) {
          if (c.estado !== 'reservada' || new Date(c.inicio) <= new Date()) return error('Esta cita ya no se puede cancelar.');
          return error('Sólo se puede cancelar hasta ' + b.cancelar_horas + ' h antes. Comunícate con la barbería.');
        }
        c.estado = 'cancelada';
        c.cancelada_por = yo;
        c.motivo_cancelacion = String(motivo || '').trim() || null;
        var cuando = textoCita(c, barbero);
        if (staff && c.cliente_email && c.cliente_email !== yo) {
          notificar(c.cliente_email, b.id, 'cita', '❌ Tu cita fue cancelada', b.nombre + ' canceló tu cita del ' + cuando + '.' +
            (c.motivo_cancelacion ? ' Motivo: ' + c.motivo_cancelacion : ''), '#reservar/' + b.id);
        }
        if (!staff) notificarBarberia(b, barbero, '❌ Cita cancelada', c.cliente_nombre + ' canceló su cita del ' + cuando + '.', '#b/' + b.id + '/agenda/' + A.fechaDe(new Date(c.inicio)));
        A.aQuienAvisar(c, db.espera).forEach(function (e) {
          e.avisos = (e.avisos || 0) + 1;
          notificar(e.cliente_email, b.id, 'espera', '🔔 ¡Se liberó un horario!', 'En ' + b.nombre + ' el ' + cuando +
            '. El primero que reserva se lo queda.', '#reservar/' + b.id + '/' + e.fecha);
        });
        return ok(c);
      },
      marcarCita: function (id, estado) {
        var c = buscar('citas', id), barbero = c && buscar('barberos', c.barbero_id);
        if (!c || !(esDueno(c.barberia_id) || (barbero && barbero.email === yo))) return error(PROHIBIDO);
        if (['reservada', 'completada', 'no_asistio'].indexOf(estado) < 0 || c.estado === 'cancelada') return error('No se puede cambiar esa cita.');
        c.estado = estado;
        return ok(c);
      },

      /* Lista de espera */
      anotarEspera: function (e) {
        if (!esAfiliado(e.barberia_id)) return error(PROHIBIDO);
        if (e.fecha < A.hoy()) return error('Esa fecha ya pasó.');
        if (e.desde && e.hasta && e.desde >= e.hasta) return error('La hora "desde" tiene que ser antes que "hasta".');
        var ya = db.espera.some(function (x) { return x.barberia_id === e.barberia_id && x.cliente_email === yo && x.fecha === e.fecha && x.estado === 'esperando'; });
        if (ya) return error('Ya estás en la lista de espera de ese día.');
        var afil = db.afiliaciones.filter(function (a) { return a.barberia_id === e.barberia_id && a.cliente_email === yo; })[0];
        return ok(nuevo('espera', { barberia_id: e.barberia_id, cliente_email: yo, cliente_nombre: afil.nombre, fecha: e.fecha,
          barbero_id: e.barbero_id || null, servicio_id: e.servicio_id || null, desde: e.desde || null, hasta: e.hasta || null,
          estado: 'esperando', avisos: 0 }));
      },
      borrarEspera: function (id) {
        var e = buscar('espera', id);
        if (!e || !(e.cliente_email === yo || esDueno(e.barberia_id))) return error(PROHIBIDO);
        db.espera = db.espera.filter(function (x) { return x.id !== id; });
        return ok();
      },

      /* Avisos */
      marcarLeidas: function () {
        db.notificaciones.forEach(function (n) { if (n.email === yo) n.leida = true; });
        return ok();
      }
    };
  }

  /* ---------- Supabase ---------- */

  function SupabaseStore(cfg) {
    var sb = root.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    var yo = null;
    function ok(res) {
      if (res.error) throw new Error(traducir(res.error.message));
      return res.data;
    }
    function traducir(msg) {
      if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
      if (/Email not confirmed/i.test(msg)) return 'Todavía no confirmaste tu correo: revisa tu bandeja de entrada.';
      if (/User already registered/i.test(msg)) return 'Ese correo ya está registrado: usa "Entrar".';
      if (/Password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
      if (/row-level security|permission denied/i.test(msg)) return PROHIBIDO;
      if (/duplicate key/i.test(msg)) return 'Ese dato ya existe.';
      if (/multiple \(or no\) rows|contain 0 rows/i.test(msg)) return 'No tienes permiso o el dato ya no existe.';
      if (/rate limit/i.test(msg)) return 'Demasiados intentos seguidos: espera unos minutos.';
      return msg;
    }
    function todas(tabla) {
      // Supabase entrega hasta 1000 filas por pedido; se piden de a páginas.
      var filas = [];
      function pagina(desde) {
        return sb.from(tabla).select('*').order('id').range(desde, desde + 999).then(ok).then(function (data) {
          filas = filas.concat(data);
          return data.length === 1000 ? pagina(desde + 1000) : filas;
        });
      }
      return pagina(0);
    }
    function guardarEn(tabla, fila, campos) {
      var f = {};
      campos.forEach(function (k) { if (k in fila) f[k] = fila[k]; });
      var q = fila.id ? sb.from(tabla).update(f).eq('id', fila.id) : sb.from(tabla).insert(f);
      return q.select().single().then(ok);
    }
    function borrarDe(tabla, id) { return sb.from(tabla).delete().eq('id', id).select().then(ok).then(function (r) { if (!r.length) throw new Error(PROHIBIDO); }); }
    function rpc(nombre, args) { return sb.rpc(nombre, args || {}).then(ok); }
    var volver = location.href.split('#')[0];
    var BUCKET = 'barberia-documentos';

    return {
      demo: false,
      sesion: function () {
        return sb.auth.getSession().then(ok).then(function (d) {
          yo = d.session ? limpio(d.session.user.email) : null;
          return yo ? { email: yo } : null;
        });
      },
      alCambiarSesion: function (fn) { sb.auth.onAuthStateChange(function (evento) { fn(evento); }); },
      entrar: function (email, clave) {
        return sb.auth.signInWithPassword({ email: limpio(email), password: clave }).then(ok).then(function (d) {
          yo = limpio(d.user.email);
          return { email: yo };
        });
      },
      registrarse: function (email, clave) {
        return sb.auth.signUp({ email: limpio(email), password: clave, options: { emailRedirectTo: volver } }).then(ok).then(function (d) {
          return d.session ? { email: limpio(d.user.email) } : null;
        });
      },
      enlaceMagico: function (email) {
        return sb.auth.signInWithOtp({ email: limpio(email), options: { emailRedirectTo: volver } }).then(ok).then(function () { return 'enviado'; });
      },
      salir: function () { yo = null; return sb.auth.signOut().then(ok); },

      esSuper: function () { return rpc('bar_es_super'); },
      haySuper: function () { return rpc('bar_hay_super'); },
      reclamarSuper: function () { return rpc('bar_reclamar_super'); },

      todo: function () {
        var tablas = ['barberias', 'documentos', 'revisiones', 'barberos', 'servicios', 'afiliaciones', 'citas', 'lista_espera', 'notificaciones'];
        return Promise.all(tablas.map(todas)).then(function (r) {
          r[0].forEach(function (b) { b.cancelar_horas = Number(b.cancelar_horas); });
          r[4].forEach(function (s) { s.precio = s.precio == null ? null : Number(s.precio); });
          r[7].forEach(function (e) { e.desde = e.desde && e.desde.slice(0, 5); e.hasta = e.hasta && e.hasta.slice(0, 5); });
          return { barberias: r[0], documentos: r[1], revisiones: r[2], barberos: r[3], servicios: r[4], afiliaciones: r[5],
            citas: r[6], espera: r[7], notificaciones: r[8] };
        });
      },

      guardarBarberia: function (b) {
        var campos = ['nombre', 'direccion', 'telefono', 'descripcion', 'cancelar_horas'];
        if (!b.id) {
          b = Object.assign({}, b, { zona_horaria: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
          campos = campos.concat('zona_horaria');
        }
        return guardarEn('barberias', b, campos);
      },
      borrarBarberia: function (id) { return borrarDe('barberias', id); },
      enviarARevision: function (id) {
        // El servidor no conoce la lista de documentos de config.js: se revisa aquí antes de enviar.
        return sb.from('documentos').select('*').eq('barberia_id', id).then(ok).then(function (docs) {
          var faltan = A.documentosFaltantes(cfg.DOCUMENTOS, docs);
          if (faltan.length) throw new Error('Faltan documentos: ' + faltan.join(', ') + '.');
          return rpc('bar_enviar', { p_barberia: id });
        });
      },
      decidir: function (id, estado, motivo) { return rpc('bar_decidir', { p_barberia: id, p_estado: estado, p_motivo: motivo || null }); },
      nuevoCodigo: function (id) { return rpc('bar_nuevo_codigo', { p_barberia: id }); },

      subirArchivo: function (barberiaId, archivo) {
        var ext = (archivo.name.match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
        var ruta = barberiaId + '/' + uid() + ext;
        return sb.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type || undefined })
          .then(ok).then(function () { return ruta; });
      },
      urlArchivo: function (ruta) {
        return sb.storage.from(BUCKET).createSignedUrl(ruta, 3600).then(ok).then(function (d) { return d.signedUrl; });
      },
      borrarArchivo: function (ruta) { return sb.storage.from(BUCKET).remove([ruta]).then(ok); },
      guardarDocumento: function (d) { return guardarEn('documentos', d, ['barberia_id', 'tipo', 'archivo', 'nombre_archivo', 'vence']); },
      borrarDocumento: function (id) { return borrarDe('documentos', id); },
      revisarDocumento: function (id, estado, observacion) {
        return rpc('bar_revisar_documento', { p_documento: id, p_estado: estado, p_observacion: observacion || null });
      },

      guardarBarbero: function (x) {
        x = Object.assign({}, x, { email: x.email ? limpio(x.email) : null });
        return guardarEn('barberos', x, ['barberia_id', 'nombre', 'email', 'horario', 'activo']);
      },
      borrarBarbero: function (id) {
        return borrarDe('barberos', id).catch(function (e) {
          if (/foreign key/i.test(e.message)) throw new Error('Tiene citas registradas: desactívalo en lugar de borrarlo.');
          throw e;
        });
      },
      guardarServicio: function (x) { return guardarEn('servicios', x, ['barberia_id', 'nombre', 'duracion_min', 'precio', 'activo']); },
      borrarServicio: function (id) { return borrarDe('servicios', id); },

      invitacion: function (codigo) {
        return rpc('bar_invitacion', { p_codigo: String(codigo || '').trim().toUpperCase() }).then(function (r) { return r[0] || null; });
      },
      unirme: function (codigo, nombre, telefono) {
        return rpc('bar_unirme', { p_codigo: String(codigo || '').trim().toUpperCase(), p_nombre: nombre, p_telefono: telefono || null });
      },
      borrarAfiliacion: function (id) { return borrarDe('afiliaciones', id); },

      ocupados: function (barberiaId, fecha) {
        return rpc('bar_ocupados', { p_barberia: barberiaId, p_desde: A.aDate(fecha).toISOString(), p_hasta: A.aDate(A.sumarDias(fecha, 1)).toISOString() });
      },
      reservar: function (r) {
        return rpc('bar_reservar', { p_barberia: r.barberia_id, p_barbero: r.barbero_id, p_servicio: r.servicio_id, p_inicio: r.inicio,
          p_cliente_email: r.cliente_email || null, p_cliente_nombre: r.cliente_nombre || null, p_nota: r.nota || null });
      },
      cancelarCita: function (id, motivo) { return rpc('bar_cancelar', { p_cita: id, p_motivo: motivo || null }); },
      marcarCita: function (id, estado) { return rpc('bar_marcar', { p_cita: id, p_estado: estado }); },

      anotarEspera: function (e) {
        return guardarEn('lista_espera', e, ['barberia_id', 'fecha', 'barbero_id', 'servicio_id', 'desde', 'hasta']).catch(function (err) {
          if (/ya existe/i.test(err.message)) throw new Error('Ya estás en la lista de espera de ese día.');
          throw err;
        });
      },
      borrarEspera: function (id) { return borrarDe('lista_espera', id); },

      marcarLeidas: function () { return sb.from('notificaciones').update({ leida: true }).eq('leida', false).eq('email', yo).then(ok); }
    };
  }

  root.crearStore = function (cfg) {
    if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && root.supabase) return SupabaseStore(cfg);
    return DemoStore(cfg);
  };
  root.DemoStore = DemoStore;
})(typeof window !== 'undefined' ? window : globalThis);
