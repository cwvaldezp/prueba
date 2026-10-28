/*
 * Cálculos del portal de barberías que no dependen de dónde se guardan los datos:
 * horarios libres, si una cita todavía se puede cancelar, a quién avisar de la lista de espera
 * y los estados de la revisión de una barbería. Se prueban con: node tests/barberia.js
 *
 * Fechas: 'AAAA-MM-DD'. Horas: 'HH:MM'. Las citas guardan inicio y fin como fecha-hora ISO.
 * Se toma la hora local del aparato como la hora de la barbería.
 */
(function (root) {
  var DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var ESTADOS_BARBERIA = {
    borrador: { txt: 'Sin enviar', ico: '📝', clase: 'gris' },
    en_revision: { txt: 'En revisión', ico: '⏳', clase: 'ambar' },
    correccion: { txt: 'Requiere corrección', ico: '✏️', clase: 'ambar' },
    aprobada: { txt: 'Aprobada', ico: '✅', clase: 'verde' },
    rechazada: { txt: 'Rechazada', ico: '⛔', clase: 'rojo' },
    suspendida: { txt: 'Suspendida', ico: '⏸️', clase: 'rojo' }
  };
  // Qué puede hacer el superadministrador desde cada estado.
  var DECISIONES = {
    en_revision: ['aprobada', 'correccion', 'rechazada'],
    aprobada: ['suspendida'],
    suspendida: ['aprobada'],
    correccion: [],
    rechazada: [],
    borrador: []
  };
  var ESTADOS_CITA = {
    reservada: { txt: 'Reservada', clase: 'verde' },
    completada: { txt: 'Atendida', clase: 'gris' },
    no_asistio: { txt: 'No vino', clase: 'rojo' },
    cancelada: { txt: 'Cancelada', clase: 'rojo' }
  };

  function dos(n) { return String(n).padStart(2, '0'); }
  function fechaDe(d) { return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()); }
  function horaDe(d) { return dos(d.getHours()) + ':' + dos(d.getMinutes()); }
  function hoy() { return fechaDe(new Date()); }
  function aDate(fecha, hora) {
    var f = fecha.split('-'), h = (hora || '00:00').split(':');
    return new Date(+f[0], +f[1] - 1, +f[2], +h[0], +h[1]);
  }
  function minutos(hora) { var h = hora.split(':'); return +h[0] * 60 + +h[1]; }
  function hhmm(min) { return dos(Math.floor(min / 60)) + ':' + dos(min % 60); }
  function sumarDias(fecha, n) { var d = aDate(fecha); d.setDate(d.getDate() + n); return fechaDe(d); }
  // 1 = lunes … 7 = domingo (igual que isodow de Postgres).
  function diaSemana(fecha) { var g = aDate(fecha).getDay(); return g === 0 ? 7 : g; }
  function nombreFecha(fecha) {
    var d = aDate(fecha);
    return DIAS[diaSemana(fecha) - 1] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
  }

  /* ---------- Horario de trabajo ---------- */

  // Texto "09:00-13:00, 15:00-20:00" → [['09:00','13:00'], ['15:00','20:00']]. Vacío = no trabaja.
  function leerFranjas(txt) {
    txt = String(txt || '').trim();
    if (!txt) return [];
    var franjas = txt.split(/[,;y]+/).map(function (p) {
      var m = p.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(?:-|–|a)\s*(\d{1,2})(?::(\d{2}))?$/);
      if (!m) throw new Error('No entiendo "' + p.trim() + '". Escríbelo así: 09:00-13:00, 15:00-20:00');
      var a = dos(m[1]) + ':' + (m[2] || '00'), b = dos(m[3]) + ':' + (m[4] || '00');
      if (+m[1] > 23 || +m[3] > 24 || minutos(a) >= minutos(b)) throw new Error('El horario "' + p.trim() + '" no es válido.');
      return [a, b];
    }).sort(function (x, y) { return minutos(x[0]) - minutos(y[0]); });
    for (var i = 1; i < franjas.length; i++) {
      if (minutos(franjas[i][0]) < minutos(franjas[i - 1][1])) throw new Error('Los horarios se pisan: ' + txt);
    }
    return franjas;
  }
  function textoFranjas(franjas) {
    return (franjas || []).map(function (f) { return f[0] + '-' + f[1]; }).join(', ');
  }
  function horarioDelDia(barbero, fecha) {
    return (barbero.horario && barbero.horario[String(diaSemana(fecha))]) || [];
  }

  /* ---------- Horarios libres ---------- */

  function activa(c) { return c.estado === 'reservada' || c.estado === 'completada'; }
  function pisa(ini, fin, c) { return ini < new Date(c.fin) && fin > new Date(c.inicio); }

  /*
   * Horas en las que se puede empezar un servicio de `duracion` minutos con ese barbero ese día.
   * opc: intervalo (cada cuántos minutos se ofrece una hora), ahora (Date) y anticipacion (minutos
   * mínimos desde ahora). Devuelve ['09:00', '09:30', …].
   */
  function horasLibres(barbero, fecha, duracion, citas, opc) {
    opc = opc || {};
    var paso = opc.intervalo || 30, limite = new Date((opc.ahora || new Date()).getTime() + (opc.anticipacion || 0) * 60000);
    var suyas = citas.filter(function (c) { return c.barbero_id === barbero.id && activa(c); });
    var libres = [];
    if (barbero.activo === false) return libres;
    horarioDelDia(barbero, fecha).forEach(function (fr) {
      for (var m = minutos(fr[0]); m + duracion <= minutos(fr[1]); m += paso) {
        var ini = aDate(fecha, hhmm(m)), fin = new Date(ini.getTime() + duracion * 60000);
        if (ini < limite) continue;
        if (suyas.some(function (c) { return pisa(ini, fin, c); })) continue;
        libres.push(hhmm(m));
      }
    });
    return libres;
  }

  // Para "cualquier barbero": cada hora con el primer barbero libre (en el orden de la lista).
  function horasLibresVarios(barberos, fecha, duracion, citas, opc) {
    var porHora = {};
    barberos.forEach(function (b) {
      horasLibres(b, fecha, duracion, citas, opc).forEach(function (h) { if (!porHora[h]) porHora[h] = b.id; });
    });
    return Object.keys(porHora).sort().map(function (h) { return { hora: h, barbero_id: porHora[h] }; });
  }

  function finDe(inicioIso, duracion) { return new Date(new Date(inicioIso).getTime() + duracion * 60000).toISOString(); }

  /* ---------- Cancelar ---------- */

  // El cliente puede cancelar hasta `horas` antes. La barbería puede cancelar siempre (antes de que empiece).
  function puedeCancelar(cita, horas, ahora, esCliente) {
    if (cita.estado !== 'reservada') return false;
    var falta = new Date(cita.inicio) - (ahora || new Date());
    if (falta <= 0) return false;
    return !esCliente || falta >= horas * 3600000;
  }

  /* ---------- Lista de espera ---------- */

  /*
   * Al cancelarse `cita`, a quiénes de la lista de espera hay que avisar: los que esperan ese día en
   * esa barbería, con ese barbero o "cualquiera", y cuya franja (si la pusieron) se cruza con la hora
   * que quedó libre. En orden de llegada; el primero que reserva se queda con el lugar.
   */
  function aQuienAvisar(cita, espera) {
    var ini = new Date(cita.inicio), fin = new Date(cita.fin), fecha = fechaDe(ini);
    return espera.filter(function (e) {
      if (e.estado !== 'esperando' || e.barberia_id !== cita.barberia_id || e.fecha !== fecha) return false;
      if (e.cliente_email && e.cliente_email === cita.cliente_email) return false;
      if (e.barbero_id && e.barbero_id !== cita.barbero_id) return false;
      var desde = aDate(fecha, e.desde || '00:00'), hasta = e.hasta ? aDate(fecha, e.hasta) : aDate(sumarDias(fecha, 1));
      return ini < hasta && fin > desde;
    }).sort(function (a, b) { return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0; });
  }

  /* ---------- Revisión de la barbería ---------- */

  // Documentos obligatorios que faltan subir (o que fueron rechazados y no se reemplazaron).
  function documentosFaltantes(tipos, documentos) {
    return tipos.filter(function (t) {
      if (!t.obligatorio) return false;
      return !documentos.some(function (d) { return d.tipo === t.tipo && d.estado !== 'rechazado'; });
    }).map(function (t) { return t.tipo; });
  }
  function puedeEnviar(barberia, tipos, documentos) {
    return (barberia.estado === 'borrador' || barberia.estado === 'correccion') && !documentosFaltantes(tipos, documentos).length;
  }
  function puedeDecidir(estadoActual, nuevo) { return (DECISIONES[estadoActual] || []).indexOf(nuevo) >= 0; }
  // Los rechazos, correcciones y suspensiones necesitan un motivo para el dueño.
  function pideMotivo(nuevo) { return nuevo !== 'aprobada'; }
  function documentoVence(doc, fecha, dias) {
    if (!doc.vence) return null;
    var falta = Math.round((aDate(doc.vence) - aDate(fecha)) / 86400000);
    return falta <= dias ? { dias: falta, vencido: falta < 0 } : null;
  }

  function codigoInvitacion() {
    var letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '', bytes = new Uint8Array(8);
    if (root.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else for (var i = 0; i < 8; i++) bytes[i] = Math.random() * 256;
    for (var j = 0; j < 8; j++) s += letras[bytes[j] % letras.length];
    return s;
  }

  root.Agenda = {
    DIAS: DIAS, MESES: MESES, ESTADOS_BARBERIA: ESTADOS_BARBERIA, ESTADOS_CITA: ESTADOS_CITA, DECISIONES: DECISIONES,
    hoy: hoy, fechaDe: fechaDe, horaDe: horaDe, aDate: aDate, sumarDias: sumarDias, diaSemana: diaSemana, nombreFecha: nombreFecha,
    minutos: minutos, hhmm: hhmm,
    leerFranjas: leerFranjas, textoFranjas: textoFranjas, horarioDelDia: horarioDelDia,
    horasLibres: horasLibres, horasLibresVarios: horasLibresVarios, finDe: finDe, activa: activa, pisa: pisa,
    puedeCancelar: puedeCancelar, aQuienAvisar: aQuienAvisar,
    documentosFaltantes: documentosFaltantes, puedeEnviar: puedeEnviar, puedeDecidir: puedeDecidir, pideMotivo: pideMotivo,
    documentoVence: documentoVence, codigoInvitacion: codigoInvitacion
  };
})(typeof window !== 'undefined' ? window : globalThis);
