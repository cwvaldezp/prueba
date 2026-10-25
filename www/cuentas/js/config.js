/*
 * Configuración del portal. Mientras SUPABASE_URL esté vacío, el portal funciona en
 * "modo de prueba": guarda todo en este navegador con datos de ejemplo.
 * Para usarlo de verdad, crear un proyecto en https://supabase.com y copiar aquí
 * Project URL y la clave "anon public" (Settings → API). La clave anon puede ser pública:
 * lo que protege los datos son los permisos de supabase/esquema.sql.
 */
window.CUENTAS_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  MONEDA: 'USD',        // moneda que se propone al crear una cuenta (USD, ARS, MXN, PEN, CLP, COP, EUR…)
  IDIOMA: 'es',         // para mostrar fechas y montos
  CSV_SEPARADOR: ';',   // Excel en español usa ';' y coma decimal; en México o EE. UU., ',' y '.'
  CSV_DECIMAL: ',',
  AVISO_CONTRATO_DIAS: 60  // avisar cuando falten estos días para que venza un contrato
};
