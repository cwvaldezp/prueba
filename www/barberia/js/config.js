/*
 * Configuración del portal de barberías. Mientras SUPABASE_URL esté vacío, el portal funciona en
 * "modo de prueba": guarda todo en este navegador con datos de ejemplo.
 * Para usarlo de verdad, crear un proyecto en https://supabase.com, correr supabase/barberia.sql y copiar aquí
 * Project URL y la clave "anon public" (Settings → API). La clave anon puede ser pública:
 * lo que protege los datos son los permisos de supabase/barberia.sql.
 */
window.BARBERIA_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  NOMBRE: 'Portal de barberías',
  MONEDA: 'USD',          // para mostrar los precios (USD, PEN, MXN, COP, ARS, CLP, EUR…)
  IDIOMA: 'es',

  INTERVALO_MIN: 30,      // cada cuántos minutos se ofrecen horas para reservar
  ANTICIPACION_MIN: 30,   // no se puede reservar con menos de esto de anticipación
  DIAS_RESERVA: 21,       // hasta cuántos días adelante se puede reservar
  CANCELAR_HORAS: 2,      // valor propuesto al crear una barbería (cada barbería lo puede cambiar)
  AVISO_VENCE_DIAS: 30,   // avisar cuando a un documento le falten estos días para vencer

  // Documentos que se piden a cada barbería. "vence": se pide la fecha de vencimiento.
  // No se puede enviar a revisión sin los obligatorios, y el superadministrador ve cuáles faltan.
  DOCUMENTOS: [
    { tipo: 'Documento de identidad del dueño', obligatorio: true, vence: false },
    { tipo: 'Registro tributario (RUC / RFC / NIT)', obligatorio: true, vence: false },
    { tipo: 'Licencia municipal de funcionamiento', obligatorio: true, vence: true },
    { tipo: 'Certificado sanitario', obligatorio: false, vence: true },
    { tipo: 'Foto de la fachada del local', obligatorio: true, vence: false }
  ]
};
