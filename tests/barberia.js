/*
 * Prueba los horarios, la cancelación, la lista de espera y los permisos del modo de prueba
 * del portal de barberías. Uso: node tests/barberia.js
 */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const memoria = {};
const ctx = {
  localStorage: { getItem: k => (k in memoria ? memoria[k] : null), setItem: (k, v) => { memoria[k] = String(v); }, removeItem: k => { delete memoria[k]; } },
  crypto: require('crypto').webcrypto, console
};
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['config.js', 'agenda.js', 'store.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'www', 'barberia', 'js', f), 'utf8'), ctx);
const A = ctx.Agenda, cfg = ctx.BARBERIA_CONFIG;
let pruebas = 0;
// Los objetos vienen de otro contexto de vm: se comparan como JSON.
const igual = (a, b, msg) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg);
function prueba(nombre, fn) {
  return Promise.resolve().then(fn).then(() => { pruebas++; }, e => { console.error('✗ ' + nombre + '\n  ' + e.message); process.exitCode = 1; });
}
async function rechaza(promesa, texto) {
  try { await promesa; } catch (e) { assert.ok(new RegExp(texto, 'i').test(e.message), 'mensaje inesperado: ' + e.message); return; }
  throw new Error('debía fallar con "' + texto + '"');
}

const iso = (fecha, hora) => A.aDate(fecha, hora).toISOString();
const pedro = { id: 'p', activo: true, horario: { 2: [['09:00', '11:00'], ['15:00', '16:00']] } };   // martes
const luis = { id: 'l', activo: true, horario: { 2: [['10:00', '12:00']] } };
const MARTES = '2026-11-03';
const ANTES = A.aDate('2026-11-01', '12:00');   // "ahora" en las pruebas: el domingo anterior

(async () => {
  await prueba('fechas y días de la semana', () => {
    assert.strictEqual(A.diaSemana(MARTES), 2);
    assert.strictEqual(A.diaSemana('2026-11-08'), 7);
    assert.strictEqual(A.sumarDias('2026-12-31', 1), '2027-01-01');
    assert.strictEqual(A.nombreFecha(MARTES), 'martes 3 de noviembre');
  });

  await prueba('leer horarios escritos a mano', () => {
    igual(A.leerFranjas('9-13, 15:00-19:30'), [['09:00', '13:00'], ['15:00', '19:30']]);
    igual(A.leerFranjas('15:00-19:00; 09:00-13:00'), [['09:00', '13:00'], ['15:00', '19:00']]);
    igual(A.leerFranjas('  '), []);
    assert.throws(() => A.leerFranjas('13:00-09:00'), /no es válido/);
    assert.throws(() => A.leerFranjas('09:00-13:00, 12:00-15:00'), /se pisan/);
    assert.throws(() => A.leerFranjas('mañana'), /No entiendo/);
    assert.strictEqual(A.textoFranjas([['09:00', '13:00'], ['15:00', '19:00']]), '09:00-13:00, 15:00-19:00');
  });

  await prueba('horas libres según horario, duración y citas', () => {
    const op = { intervalo: 30, ahora: ANTES };
    igual(A.horasLibres(pedro, MARTES, 30, [], op), ['09:00', '09:30', '10:00', '10:30', '15:00', '15:30']);
    igual(A.horasLibres(pedro, MARTES, 60, [], op), ['09:00', '09:30', '10:00', '15:00'], 'un servicio de 1 h no cabe a las 10:30');
    const citas = [
      { barbero_id: 'p', inicio: iso(MARTES, '09:30'), fin: iso(MARTES, '10:00'), estado: 'reservada' },
      { barbero_id: 'p', inicio: iso(MARTES, '15:00'), fin: iso(MARTES, '15:30'), estado: 'cancelada' },
      { barbero_id: 'l', inicio: iso(MARTES, '10:00'), fin: iso(MARTES, '11:00'), estado: 'reservada' }
    ];
    igual(A.horasLibres(pedro, MARTES, 30, citas, op), ['09:00', '10:00', '10:30', '15:00', '15:30'], 'la cancelada no ocupa');
    igual(A.horasLibres(pedro, MARTES, 60, citas, op), ['10:00', '15:00']);
    igual(A.horasLibres(pedro, '2026-11-04', 30, [], op), [], 'el miércoles no atiende');
    igual(A.horasLibres(Object.assign({}, pedro, { activo: false }), MARTES, 30, [], op), []);
  });

  await prueba('no se ofrecen horas pasadas ni con poca anticipación', () => {
    const ahora = A.aDate(MARTES, '09:40');
    igual(A.horasLibres(pedro, MARTES, 30, [], { intervalo: 30, ahora }), ['10:00', '10:30', '15:00', '15:30']);
    igual(A.horasLibres(pedro, MARTES, 30, [], { intervalo: 30, ahora, anticipacion: 30 }), ['10:30', '15:00', '15:30']);
  });

  await prueba('"cualquier barbero" junta las horas de todos', () => {
    const citas = [{ barbero_id: 'p', inicio: iso(MARTES, '10:00'), fin: iso(MARTES, '11:00'), estado: 'reservada' }];
    const r = A.horasLibresVarios([pedro, luis], MARTES, 30, citas, { intervalo: 30, ahora: ANTES });
    igual(r.map(x => x.hora + ':' + x.barbero_id),
      ['09:00:p', '09:30:p', '10:00:l', '10:30:l', '11:00:l', '11:30:l', '15:00:p', '15:30:p']);
  });

  await prueba('cancelar: el cliente hasta N horas antes, la barbería siempre', () => {
    const c = { estado: 'reservada', inicio: iso(MARTES, '15:00') };
    assert.ok(A.puedeCancelar(c, 2, A.aDate(MARTES, '12:59'), true));
    assert.ok(A.puedeCancelar(c, 2, A.aDate(MARTES, '13:00'), true), 'justo 2 h antes todavía se puede');
    assert.ok(!A.puedeCancelar(c, 2, A.aDate(MARTES, '13:01'), true));
    assert.ok(A.puedeCancelar(c, 2, A.aDate(MARTES, '14:50'), false), 'la barbería sí puede');
    assert.ok(!A.puedeCancelar(c, 2, A.aDate(MARTES, '15:00'), false), 'ya empezó');
    assert.ok(!A.puedeCancelar(Object.assign({}, c, { estado: 'cancelada' }), 2, ANTES, false));
  });

  await prueba('a quién avisar de la lista de espera', () => {
    const cita = { barberia_id: 'b', barbero_id: 'p', cliente_email: 'ana', inicio: iso(MARTES, '10:30'), fin: iso(MARTES, '11:00') };
    const e = (id, o) => Object.assign({ id, barberia_id: 'b', fecha: MARTES, estado: 'esperando', barbero_id: null, desde: null, hasta: null,
      cliente_email: id, created_at: '2026-11-01T0' + id.length + ':00:00Z' }, o);
    const espera = [
      e('juan', {}),                                      // cualquiera, todo el día → sí
      e('jorge', { desde: '09:00', hasta: '13:00' }),     // franja que incluye la hora → sí
      e('mariana', { desde: '15:00' }),                   // sólo de tarde → no
      e('luisa', { barbero_id: 'l' }),                    // quería a otro barbero → no
      e('pepe', { fecha: '2026-11-04' }),                 // otro día → no
      e('ana', {}),                                       // la misma que canceló → no
      e('rosa', { estado: 'atendida' }),                  // ya consiguió → no
      e('x', { barberia_id: 'otra' }),                    // otra barbería → no
      e('tito', { barbero_id: 'p', hasta: '10:30' })      // hasta las 10:30: la cita empieza 10:30 → no
    ];
    igual(A.aQuienAvisar(cita, espera).map(x => x.id), ['juan', 'jorge'], 'en orden de llegada');
  });

  await prueba('documentos y decisiones de la revisión', () => {
    const tipos = [{ tipo: 'DNI', obligatorio: true }, { tipo: 'RUC', obligatorio: true }, { tipo: 'Sanitario', obligatorio: false }];
    igual(A.documentosFaltantes(tipos, []), ['DNI', 'RUC']);
    igual(A.documentosFaltantes(tipos, [{ tipo: 'DNI', estado: 'pendiente' }, { tipo: 'RUC', estado: 'rechazado' }]), ['RUC'], 'uno rechazado cuenta como faltante');
    assert.ok(A.puedeEnviar({ estado: 'correccion' }, tipos, [{ tipo: 'DNI', estado: 'aceptado' }, { tipo: 'RUC', estado: 'pendiente' }]));
    assert.ok(!A.puedeEnviar({ estado: 'en_revision' }, tipos, [{ tipo: 'DNI', estado: 'aceptado' }, { tipo: 'RUC', estado: 'pendiente' }]));
    assert.ok(A.puedeDecidir('en_revision', 'correccion'));
    assert.ok(A.puedeDecidir('suspendida', 'aprobada'));
    assert.ok(!A.puedeDecidir('borrador', 'aprobada'), 'no se aprueba sin enviar');
    assert.ok(!A.puedeDecidir('rechazada', 'aprobada'));
    assert.ok(A.pideMotivo('rechazada') && A.pideMotivo('correccion') && !A.pideMotivo('aprobada'));
    igual(A.documentoVence({ vence: '2026-11-20' }, '2026-11-01', 30), { dias: 19, vencido: false });
    igual(A.documentoVence({ vence: '2026-10-20' }, '2026-11-01', 30), { dias: -12, vencido: true });
    assert.strictEqual(A.documentoVence({ vence: '2027-06-01' }, '2026-11-01', 30), null);
    assert.match(A.codigoInvitacion(), /^[A-HJ-NP-Z2-9]{8}$/);
  });

  /* ---------- Modo de prueba: el recorrido completo con permisos ---------- */

  const s = ctx.DemoStore(cfg);
  const como = async email => { await s.entrar(email); return s.todo(); };
  const archivo = { name: 'doc.pdf', size: 1000, type: 'application/pdf' };
  ctx.FileReader = function () { this.readAsDataURL = () => { this.result = 'data:application/pdf;base64,AA=='; this.onload(); }; };

  await prueba('cada uno ve sólo lo suyo', async () => {
    let d = await como('yo@ejemplo.com');
    assert.ok(await s.esSuper());
    assert.strictEqual(d.barberias.length, 2, 'el superadministrador ve todas');
    assert.strictEqual(d.citas.length, 0, 'pero no las citas de los clientes');

    d = await como('ana@ejemplo.com');
    igual(d.barberias.map(b => b.nombre), ['Barbería El Clásico'], 'la clienta ve sólo donde está afiliada');
    assert.ok(d.citas.length && d.citas.every(c => c.cliente_email === 'ana@ejemplo.com'), 'y sólo sus citas');
    assert.strictEqual(d.documentos.length, 0, 'no ve documentos');
    igual(d.afiliaciones.map(a => a.cliente_email), ['ana@ejemplo.com']);

    d = await como('pedro@ejemplo.com');
    const pedroId = d.barberos.find(b => b.email === 'pedro@ejemplo.com').id;
    assert.ok(d.citas.every(c => c.barbero_id === pedroId), 'el barbero ve sus citas');

    d = await como('nuevo@ejemplo.com');
    assert.strictEqual(d.barberias.length, 0);
    await rechaza(s.ocupados(d.barberias[0] ? d.barberias[0].id : 'x', A.hoy()), 'permiso');
  });

  await prueba('registro, documentos y revisión de una barbería', async () => {
    await s.entrar('nuevo@ejemplo.com');
    const b = await s.guardarBarberia({ nombre: 'Corte Fino', direccion: 'Calle 1', telefono: '1', cancelar_horas: 2, estado: 'aprobada' });
    assert.strictEqual(b.estado, 'borrador', 'no se puede crear ya aprobada');
    await rechaza(s.enviarARevision(b.id), 'Faltan documentos');
    for (const t of cfg.DOCUMENTOS.filter(t => t.obligatorio)) {
      const ruta = await s.subirArchivo(b.id, archivo);
      await s.guardarDocumento({ barberia_id: b.id, tipo: t.tipo, archivo: ruta, nombre_archivo: 'doc.pdf', vence: t.vence ? '2027-01-01' : null, estado: 'aceptado' });
    }
    let d = await s.todo();
    assert.ok(d.documentos.every(x => x.estado === 'pendiente'), 'el dueño no puede marcar sus documentos como aceptados');
    await rechaza(s.decidir(b.id, 'aprobada'), 'permiso');
    await s.enviarARevision(b.id);
    await rechaza(s.guardarDocumento({ barberia_id: b.id, tipo: 'Otro', archivo: 'x' }), 'Sólo se pueden cambiar');

    d = await como('yo@ejemplo.com');
    assert.ok(d.notificaciones.some(n => n.titulo === 'Nueva barbería para revisar' && n.barberia_id === b.id));
    const doc = d.documentos.find(x => x.barberia_id === b.id);
    await rechaza(s.revisarDocumento(doc.id, 'rechazado', ''), 'qué está mal');
    await s.revisarDocumento(doc.id, 'rechazado', 'La foto está borrosa');
    await rechaza(s.decidir(b.id, 'correccion', ''), 'motivo');
    await s.decidir(b.id, 'correccion', 'Reenvía el documento borroso');

    d = await como('nuevo@ejemplo.com');
    const yo = d.barberias.find(x => x.id === b.id);
    assert.strictEqual(yo.estado, 'correccion');
    assert.strictEqual(yo.motivo, 'Reenvía el documento borroso');
    assert.ok(d.notificaciones.some(n => /requiere corrección/.test(n.titulo) && n.texto === 'Reenvía el documento borroso'));
    await rechaza(s.enviarARevision(b.id), 'Faltan documentos');
    await s.borrarDocumento(doc.id);
    await s.guardarDocumento({ barberia_id: b.id, tipo: doc.tipo, archivo: 'nuevo', nombre_archivo: 'nitida.pdf', vence: doc.vence });
    await s.enviarARevision(b.id);

    await s.entrar('yo@ejemplo.com');
    await s.decidir(b.id, 'aprobada', '');
    d = await s.todo();
    igual(d.revisiones.filter(r => r.barberia_id === b.id).map(r => r.estado), ['en_revision', 'correccion', 'en_revision', 'aprobada']);
    await rechaza(s.decidir(b.id, 'rechazada', 'x'), 'No se puede pasar');
  });

  await prueba('invitación: unirse con el código y reservar', async () => {
    await s.entrar('carlos@ejemplo.com');
    const clasico = (await s.todo()).barberias.find(b => b.nombre === 'Barbería El Clásico');
    await s.entrar('nuevo@ejemplo.com');
    assert.strictEqual(await s.invitacion('NOEXISTE'), null);
    const inv = await s.invitacion(' clasico7 ');
    assert.strictEqual(inv.nombre, 'Barbería El Clásico');
    assert.ok(!inv.ya_afiliado);
    await rechaza(s.reservar({ barberia_id: clasico.id }), 'permiso');
    await rechaza(s.unirme('CLASICO7', ' '), 'nombre');
    assert.strictEqual(await s.unirme('CLASICO7', 'Nico', '999'), clasico.id);
    assert.ok((await s.invitacion('CLASICO7')).ya_afiliado);
    const d = await s.todo();
    assert.ok(d.barberias.some(b => b.id === clasico.id), 'ahora ve la barbería');
    assert.strictEqual(d.citas.length, 0, 'pero no las citas de otros');
    const ocup = await s.ocupados(clasico.id, A.hoy());
    assert.ok(ocup.every(o => !('cliente_nombre' in o) && !('cliente_email' in o)), 'las horas ocupadas no dicen de quién son');

    await s.entrar('carlos@ejemplo.com');
    assert.ok((await s.todo()).notificaciones.some(n => n.titulo === 'Nuevo cliente' && /Nico/.test(n.texto)));
    const viejo = clasico.codigo, nuevo = await s.nuevoCodigo(clasico.id);
    assert.notStrictEqual(nuevo, viejo);
    await s.entrar('nuevo@ejemplo.com');
    assert.strictEqual(await s.invitacion(viejo), null, 'el código anterior deja de servir');
  });

  await prueba('lista de espera: al cancelar se avisa y el primero que reserva se queda', async () => {
    let d = await como('ana@ejemplo.com');
    const cita = d.citas.find(c => c.estado === 'reservada');
    const b = d.barberias[0], fecha = A.fechaDe(new Date(cita.inicio));
    const corte = d.servicios.find(x => x.duracion_min === 30);

    // Jorge ya está esperando ese día (datos de ejemplo); el día está lleno.
    d = await como('jorge@ejemplo.com');
    const barberos = d.barberos.filter(x => x.barberia_id === b.id);
    const ocup = await s.ocupados(b.id, fecha);
    igual(A.horasLibresVarios(barberos, fecha, 30, ocup, { intervalo: 30 }), [], 'el día está lleno');
    await rechaza(s.anotarEspera({ barberia_id: b.id, fecha }), 'Ya estás');
    await rechaza(s.anotarEspera({ barberia_id: b.id, fecha: '2020-01-01' }), 'ya pasó');
    await rechaza(s.reservar({ barberia_id: b.id, barbero_id: cita.barbero_id, servicio_id: corte.id, inicio: cita.inicio }), 'acaba de ocupar');

    // Nico (de la prueba anterior) también se anota, después de Jorge.
    await s.entrar('nuevo@ejemplo.com');
    await s.anotarEspera({ barberia_id: b.id, fecha, barbero_id: null, desde: '15:00', hasta: '' });
    await rechaza(s.anotarEspera({ barberia_id: b.id, fecha, desde: '12:00', hasta: '10:00' }), 'antes');

    // Ana cancela su cita (de la mañana).
    await s.entrar('ana@ejemplo.com');
    await rechaza(s.marcarCita(cita.id, 'completada'), 'permiso');
    await s.cancelarCita(cita.id, 'Me salió un viaje');
    d = await s.todo();
    assert.strictEqual(d.citas.find(c => c.id === cita.id).estado, 'cancelada');

    d = await como('jorge@ejemplo.com');
    const aviso = d.notificaciones.find(n => n.tipo === 'espera');
    assert.ok(aviso, 'Jorge (esperaba de mañana) recibe el aviso');
    assert.strictEqual(aviso.enlace, '#reservar/' + b.id + '/' + fecha);
    assert.strictEqual(d.espera[0].avisos, 1);
    d = await como('nuevo@ejemplo.com');
    assert.ok(!d.notificaciones.some(n => n.tipo === 'espera'), 'Nico sólo quería de tarde: no se le avisa');
    d = await como('carlos@ejemplo.com');
    assert.ok(d.notificaciones.some(n => n.titulo === '❌ Cita cancelada' && /Ana/.test(n.texto)), 'el dueño se entera');
    d = await como('pedro@ejemplo.com');
    assert.ok(d.notificaciones.some(n => n.titulo === '❌ Cita cancelada'), 'y el barbero también');

    await s.entrar('jorge@ejemplo.com');
    const r = await s.reservar({ barberia_id: b.id, barbero_id: cita.barbero_id, servicio_id: corte.id, inicio: cita.inicio, cliente_email: 'ana@ejemplo.com' });
    assert.strictEqual(r.cliente_email, 'jorge@ejemplo.com', 'un cliente sólo reserva para sí mismo');
    assert.strictEqual(r.cliente_nombre, 'Jorge Ríos');
    d = await s.todo();
    assert.strictEqual(d.espera[0].estado, 'atendida', 'sale de la lista de espera al conseguir lugar');
    await s.entrar('nuevo@ejemplo.com');
    await rechaza(s.reservar({ barberia_id: b.id, barbero_id: cita.barbero_id, servicio_id: corte.id, inicio: cita.inicio }), 'acaba de ocupar');
  });

  await prueba('reglas al reservar y cancelar', async () => {
    let d = await como('carlos@ejemplo.com');
    const b = d.barberias.find(x => x.nombre === 'Barbería El Clásico');
    const pedroB = d.barberos.find(x => x.nombre === 'Pedro'), corte = d.servicios.find(x => x.barberia_id === b.id && x.duracion_min === 30);
    let dia = A.sumarDias(A.hoy(), 3);   // después del día lleno de los datos de ejemplo
    while (A.diaSemana(dia) > 4) dia = A.sumarDias(dia, 1);   // de lunes a jueves: 09:00-13:00 y 15:00-19:00
    const base = { barberia_id: b.id, barbero_id: pedroB.id, servicio_id: corte.id };
    await rechaza(s.reservar(Object.assign({}, base, { inicio: iso(dia, '13:30') })), 'no atiende');
    await rechaza(s.reservar(Object.assign({}, base, { inicio: iso(dia, '12:45') })), 'no atiende');
    await rechaza(s.reservar(Object.assign({}, base, { inicio: iso(A.sumarDias(A.hoy(), -1), '10:00') })), 'ya pasó');
    await rechaza(s.reservar(Object.assign({}, base, { inicio: iso(dia, '10:00') })), 'nombre del cliente');

    // El dueño agenda a un cliente que llamó por teléfono y a una clienta del portal.
    const tel = await s.reservar(Object.assign({}, base, { inicio: iso(dia, '10:00'), cliente_nombre: 'Mario (teléfono)' }));
    assert.strictEqual(tel.cliente_email, null);
    const deAna = await s.reservar(Object.assign({}, base, { inicio: iso(dia, '11:00'), cliente_email: 'ANA@ejemplo.com' }));
    assert.strictEqual(deAna.cliente_nombre, 'Ana Torres');
    d = await como('ana@ejemplo.com');
    assert.ok(d.notificaciones.some(n => n.titulo === '📅 Te agendaron una cita'));

    // Ana no puede cancelar una cita que empieza en menos de 2 h (se simula moviéndola).
    const cerca = d.citas.find(c => c.id === deAna.id);
    assert.ok(!A.puedeCancelar(Object.assign({}, cerca, { inicio: new Date(Date.now() + 3600e3).toISOString() }), 2, new Date(), true));

    // La barbería cancela con motivo: Ana se entera.
    await s.entrar('carlos@ejemplo.com');
    await s.cancelarCita(deAna.id, 'Pedro está enfermo');
    d = await como('ana@ejemplo.com');
    assert.ok(d.notificaciones.some(n => n.titulo === '❌ Tu cita fue cancelada' && /Pedro está enfermo/.test(n.texto)));
    await rechaza(s.cancelarCita(deAna.id), 'ya no se puede');

    // Suspendida: no se puede reservar.
    await s.entrar('yo@ejemplo.com');
    await s.decidir(b.id, 'suspendida', 'Licencia vencida');
    await s.entrar('ana@ejemplo.com');
    await rechaza(s.reservar(Object.assign({}, base, { inicio: iso(dia, '16:00') })), 'no está habilitada');
  });

  await prueba('el dueño administra sólo su barbería', async () => {
    let d = await como('sofia@ejemplo.com');
    const navaja = d.barberias.find(b => b.nombre === 'Navaja de Oro');
    d = await como('carlos@ejemplo.com');
    const clasico = d.barberias.find(b => b.nombre === 'Barbería El Clásico');
    await rechaza(s.guardarServicio({ barberia_id: navaja.id, nombre: 'x', duracion_min: 30 }), 'permiso');
    const srv = d.servicios.find(x => x.barberia_id === clasico.id);
    await rechaza(s.guardarServicio(Object.assign({}, srv, { barberia_id: navaja.id })), 'permiso');
    await rechaza(s.borrarBarbero(d.barberos.find(x => x.nombre === 'Pedro').id), 'desactívalo');
    const nuevo = await s.guardarBarbero({ barberia_id: clasico.id, nombre: 'Leo', email: ' LEO@Ejemplo.com ', horario: {}, activo: true });
    assert.strictEqual(nuevo.email, 'leo@ejemplo.com');
    await s.borrarBarbero(nuevo.id);
    await rechaza(s.borrarBarberia(clasico.id), 'permiso');
    await s.marcarLeidas();
    assert.ok((await s.todo()).notificaciones.every(n => n.leida));
  });

  console.log(process.exitCode ? '' : '✓ ' + pruebas + ' pruebas del portal de barberías');
})();
