/*
 * Dónde se guardan los datos. Las dos versiones tienen las mismas funciones (todas devuelven promesas):
 *  - SupabaseStore: la de verdad, con usuarios y permisos (supabase/esquema.sql).
 *  - DemoStore: modo de prueba, guarda en este navegador y deja cambiar de usuario
 *    para ver lo mismo que vería la dueña.
 */
(function (root) {
  var C = root.Calc;

  function uid() {
    if (root.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function limpio(email) { return String(email || '').trim().toLowerCase(); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- Modo de prueba ---------- */

  var DEMO_KEY = 'cuentas-demo-v1';
  var DEMO_USUARIOS = [
    { email: 'yo@ejemplo.com', nombre: 'Yo (administrador)' },
    { email: 'maria@ejemplo.com', nombre: 'María (dueña del depto. Centro)' },
    { email: 'otro@ejemplo.com', nombre: 'Alguien sin acceso' }
  ];

  function datosDeEjemplo() {
    var hoyYM = C.hoy().slice(0, 7), d = { administradores: ['yo@ejemplo.com'], cuentas: [], accesos: [], fijos: [], movimientos: [] };
    function cuenta(o) { o.id = uid(); o.archivada = false; o.created_at = new Date().toISOString(); d.cuentas.push(o); return o; }
    function fijo(c, tipo, categoria, descripcion, monto, dia) {
      var f = { id: uid(), cuenta_id: c.id, tipo: tipo, categoria: categoria, descripcion: descripcion, monto: monto, dia: dia, activo: true };
      d.fijos.push(f);
      return f;
    }
    function mov(c, fecha, tipo, categoria, descripcion, monto, f) {
      d.movimientos.push({ id: uid(), cuenta_id: c.id, fecha: fecha, tipo: tipo, categoria: categoria, descripcion: descripcion,
        monto: monto, fijo_id: f ? f.id : null, comprobante: null, creado_por: 'yo@ejemplo.com', created_at: fecha + 'T12:00:00Z' });
    }
    var contratoFin = C.sumarMeses(hoyYM, 1) + '-15';
    var centro = cuenta({ nombre: 'Depto. Centro', tipo: 'inmueble', direccion: 'Av. Principal 123, 4°B', moneda: 'USD',
      comision_pct: 8, inquilino: 'Juan Pérez', alquiler: 650, contrato_fin: contratoFin, notas: 'Dueña: María. Le transfiero el 15 de cada mes.' });
    var casa = cuenta({ nombre: 'Casa Las Flores', tipo: 'inmueble', direccion: 'Calle Las Flores 45', moneda: 'USD',
      comision_pct: 0, inquilino: 'Familia Gómez', alquiler: 900, contrato_fin: C.sumarMeses(hoyYM, 14) + '-01', notas: '' });
    var personal = cuenta({ nombre: 'Mis cuentas personales', tipo: 'personal', direccion: '', moneda: 'USD',
      comision_pct: 0, inquilino: '', alquiler: null, contrato_fin: null, notas: '' });
    d.accesos.push({ id: uid(), cuenta_id: centro.id, email: 'maria@ejemplo.com', nombre: 'María', rol: 'ver' });

    var fAlqC = fijo(centro, 'ingreso', 'Alquiler', 'Alquiler Juan Pérez', 650, 5);
    var fExpC = fijo(centro, 'gasto', 'Expensas / condominio', 'Expensas del edificio', 85, 10);
    var fEntC = fijo(centro, 'egreso', 'Entrega al dueño', 'Transferencia a María', 480, 15);
    var fAlqF = fijo(casa, 'ingreso', 'Alquiler', 'Alquiler familia Gómez', 900, 1);
    var fSeg = fijo(casa, 'gasto', 'Seguro', 'Seguro del hogar', 35, 20);
    var fSue = fijo(personal, 'ingreso', 'Sueldo', 'Sueldo', 2400, 1);
    var fNet = fijo(personal, 'gasto', 'Internet y teléfono', 'Internet + celular', 55, 12);

    var dia = +C.hoy().slice(8, 10);
    for (var i = 7; i >= 0; i--) {
      var ym = C.sumarMeses(hoyYM, -i), actual = i === 0;
      var siPaso = function (f, fn) { if (!actual || dia >= f.dia) fn(ym + '-' + String(f.dia).padStart(2, '0')); };
      siPaso(fAlqC, function (fe) { mov(centro, fe, 'ingreso', 'Alquiler', 'Alquiler Juan Pérez', 650, fAlqC); });
      siPaso(fExpC, function (fe) { mov(centro, fe, 'gasto', 'Expensas / condominio', 'Expensas del edificio', 85, fExpC); });
      // La entrega de este mes y el seguro quedan sin registrar para que se vean los pendientes.
      if (!actual) siPaso(fEntC, function (fe) { mov(centro, fe, 'egreso', 'Entrega al dueño', 'Transferencia a María', 480, fEntC); });
      siPaso(fAlqF, function (fe) { mov(casa, fe, 'ingreso', 'Alquiler', 'Alquiler familia Gómez', 900, fAlqF); });
      if (!actual) siPaso(fSeg, function (fe) { mov(casa, fe, 'gasto', 'Seguro', 'Seguro del hogar', 35, fSeg); });
      siPaso(fSue, function (fe) { mov(personal, fe, 'ingreso', 'Sueldo', 'Sueldo', 2400, fSue); });
      siPaso(fNet, function (fe) { mov(personal, fe, 'gasto', 'Internet y teléfono', 'Internet + celular', 55, fNet); });
      if (!actual) {
        mov(personal, ym + '-08', 'gasto', 'Comida', 'Supermercado', 310 + (i * 37) % 90);
        mov(personal, ym + '-22', 'gasto', 'Transporte', 'Combustible', 60 + (i * 13) % 30);
        mov(personal, ym + '-25', 'egreso', 'Ahorro', 'A la cuenta de ahorro', 400);
      }
      if (i === 5) mov(centro, ym + '-18', 'gasto', 'Reparaciones', 'Plomero: pérdida en el baño', 120);
      if (i === 3) mov(centro, ym + '-28', 'gasto', 'Impuestos', 'Impuesto inmobiliario (cuota)', 140);
      if (i === 2) mov(casa, ym + '-14', 'gasto', 'Mantenimiento', 'Pintura de la fachada', 450);
      if (i === 6) mov(casa, ym + '-28', 'gasto', 'Impuestos', 'Impuesto inmobiliario (cuota)', 180);
    }
    return d;
  }

  function DemoStore() {
    var db, yo = null;
    function cargar() {
      try { db = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch (e) { db = null; }
      if (!db) { db = datosDeEjemplo(); guardar(); }
      try { yo = localStorage.getItem(DEMO_KEY + '-usuario'); } catch (e) { yo = null; }
    }
    function guardar() {
      try { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); } catch (e) { /* sin almacenamiento: queda en memoria */ }
    }
    function esAdmin() { return db.administradores.indexOf(yo) >= 0; }
    function acceso(cid) {
      return db.accesos.filter(function (a) { return a.cuenta_id === cid && a.email === yo; })[0];
    }
    function puedeVer(cid) { return esAdmin() || !!acceso(cid); }
    function puedeEditar(cid) { var a = acceso(cid); return esAdmin() || (a && a.rol === 'editar'); }
    function prohibido() { return Promise.reject(new Error('No tienes permiso para hacer eso.')); }
    function guardarEn(tabla, fila, permitido) {
      if (!permitido) return prohibido();
      fila = copia(fila);
      var lista = db[tabla], i = -1;
      if (fila.id) lista.forEach(function (x, j) { if (x.id === fila.id) i = j; });
      if (i >= 0) lista[i] = Object.assign({}, lista[i], fila);
      else {
        fila.id = fila.id || uid();
        fila.created_at = new Date().toISOString();
        lista.push(fila);
        i = lista.length - 1;
      }
      guardar();
      return Promise.resolve(copia(lista[i]));
    }
    function borrarDe(tabla, id, permitido) {
      if (!permitido) return prohibido();
      db[tabla] = db[tabla].filter(function (x) { return x.id !== id; });
      guardar();
      return Promise.resolve();
    }
    function buscar(tabla, id) { return db[tabla].filter(function (x) { return x.id === id; })[0]; }

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
      reiniciarDemo: function () { db = datosDeEjemplo(); guardar(); return Promise.resolve(); },
      esAdmin: function () { return Promise.resolve(esAdmin()); },
      hayAdmin: function () { return Promise.resolve(db.administradores.length > 0); },
      reclamarAdmin: function () {
        if (db.administradores.length) return Promise.resolve(false);
        db.administradores.push(yo);
        guardar();
        return Promise.resolve(true);
      },
      todo: function () {
        var vis = function (x) { return puedeVer(x.cuenta_id); };
        return Promise.resolve(copia({
          cuentas: db.cuentas.filter(function (c) { return puedeVer(c.id); }),
          accesos: db.accesos.filter(function (a) { return esAdmin() || a.email === yo; }),
          fijos: db.fijos.filter(vis),
          movimientos: db.movimientos.filter(vis)
        }));
      },
      guardarCuenta: function (c) { return guardarEn('cuentas', c, esAdmin()); },
      borrarCuenta: function (id) {
        if (!esAdmin()) return prohibido();
        ['accesos', 'fijos', 'movimientos'].forEach(function (t) {
          db[t] = db[t].filter(function (x) { return x.cuenta_id !== id; });
        });
        return borrarDe('cuentas', id, true);
      },
      guardarAcceso: function (a) {
        a = Object.assign({}, a, { email: limpio(a.email) });
        var repetido = db.accesos.some(function (x) { return x.cuenta_id === a.cuenta_id && x.email === a.email && x.id !== a.id; });
        if (repetido) return Promise.reject(new Error('Ese correo ya tiene acceso a esta cuenta.'));
        return guardarEn('accesos', a, esAdmin());
      },
      borrarAcceso: function (id) { return borrarDe('accesos', id, esAdmin()); },
      guardarFijo: function (f) { return guardarEn('fijos', f, puedeEditar(f.cuenta_id)); },
      borrarFijo: function (id) {
        var f = buscar('fijos', id);
        db.movimientos.forEach(function (m) { if (m.fijo_id === id) m.fijo_id = null; });
        return borrarDe('fijos', id, f && puedeEditar(f.cuenta_id));
      },
      guardarMovimiento: function (m) {
        var antes = m.id && buscar('movimientos', m.id);
        if (!m.id) m = Object.assign({ creado_por: yo }, m);
        return guardarEn('movimientos', m, puedeEditar(m.cuenta_id) && (!antes || puedeEditar(antes.cuenta_id)));
      },
      borrarMovimiento: function (id) {
        var m = buscar('movimientos', id);
        return borrarDe('movimientos', id, m && puedeEditar(m.cuenta_id));
      },
      subirComprobante: function (cuentaId, archivo) {
        if (!puedeEditar(cuentaId)) return prohibido();
        if (archivo.size > 1.5e6) return Promise.reject(new Error('En el modo de prueba los comprobantes pueden pesar hasta 1,5 MB.'));
        return new Promise(function (ok, mal) {
          var r = new FileReader();
          r.onload = function () { ok(r.result); };
          r.onerror = function () { mal(new Error('No se pudo leer el archivo.')); };
          r.readAsDataURL(archivo);
        });
      },
      urlComprobante: function (ruta) { return Promise.resolve(ruta); },
      borrarComprobante: function () { return Promise.resolve(); }
    };
  }

  /* ---------- Supabase ---------- */

  function SupabaseStore(cfg) {
    var sb = root.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    function ok(res) {
      if (res.error) throw new Error(traducir(res.error.message));
      return res.data;
    }
    function traducir(msg) {
      if (/Invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
      if (/Email not confirmed/i.test(msg)) return 'Todavía no confirmaste tu correo: revisa tu bandeja de entrada.';
      if (/User already registered/i.test(msg)) return 'Ese correo ya está registrado: usa "Entrar".';
      if (/Password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
      if (/row-level security|permission denied/i.test(msg)) return 'No tienes permiso para hacer eso.';
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
    function guardarEn(tabla, fila) {
      fila = copia(fila);
      var id = fila.id;
      delete fila.created_at;
      var q = id ? sb.from(tabla).update(fila).eq('id', id) : sb.from(tabla).insert(fila);
      return q.select().single().then(ok);
    }
    function borrarDe(tabla, id) { return sb.from(tabla).delete().eq('id', id).then(ok); }
    function rpc(nombre) { return sb.rpc(nombre).then(ok); }
    var volver = location.href.split('#')[0];

    return {
      demo: false,
      sesion: function () {
        return sb.auth.getSession().then(ok).then(function (d) { return d.session ? { email: limpio(d.session.user.email) } : null; });
      },
      alCambiarSesion: function (fn) { sb.auth.onAuthStateChange(function (evento) { fn(evento); }); },
      entrar: function (email, clave) {
        return sb.auth.signInWithPassword({ email: limpio(email), password: clave }).then(ok).then(function (d) {
          return { email: limpio(d.user.email) };
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
      salir: function () { return sb.auth.signOut().then(ok); },
      esAdmin: function () { return rpc('es_admin'); },
      hayAdmin: function () { return rpc('hay_admin'); },
      reclamarAdmin: function () { return rpc('reclamar_admin'); },
      todo: function () {
        return Promise.all(['cuentas', 'accesos', 'fijos', 'movimientos'].map(todas)).then(function (r) {
          r[3].forEach(function (m) { m.monto = Number(m.monto); });
          r[2].forEach(function (f) { f.monto = Number(f.monto); });
          r[0].forEach(function (c) { c.comision_pct = Number(c.comision_pct); if (c.alquiler != null) c.alquiler = Number(c.alquiler); });
          return { cuentas: r[0], accesos: r[1], fijos: r[2], movimientos: r[3] };
        });
      },
      guardarCuenta: function (c) { return guardarEn('cuentas', c); },
      borrarCuenta: function (id) { return borrarDe('cuentas', id); },
      guardarAcceso: function (a) { return guardarEn('accesos', Object.assign({}, a, { email: limpio(a.email) })); },
      borrarAcceso: function (id) { return borrarDe('accesos', id); },
      guardarFijo: function (f) { return guardarEn('fijos', f); },
      borrarFijo: function (id) { return borrarDe('fijos', id); },
      guardarMovimiento: function (m) { return guardarEn('movimientos', m); },
      borrarMovimiento: function (id) { return borrarDe('movimientos', id); },
      subirComprobante: function (cuentaId, archivo) {
        var ext = (archivo.name.match(/\.[a-z0-9]{1,5}$/i) || [''])[0].toLowerCase();
        var ruta = cuentaId + '/' + uid() + ext;
        return sb.storage.from('comprobantes').upload(ruta, archivo, { contentType: archivo.type || undefined })
          .then(ok).then(function () { return ruta; });
      },
      urlComprobante: function (ruta) {
        return sb.storage.from('comprobantes').createSignedUrl(ruta, 3600).then(ok).then(function (d) { return d.signedUrl; });
      },
      borrarComprobante: function (ruta) {
        return sb.storage.from('comprobantes').remove([ruta]).then(ok);
      }
    };
  }

  root.crearStore = function (cfg) {
    if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && root.supabase) return SupabaseStore(cfg);
    return DemoStore();
  };
  root.DemoStore = DemoStore;
})(typeof window !== 'undefined' ? window : globalThis);
