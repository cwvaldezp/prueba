/*
 * Todo lo que el juego dice en voz alta. Las mismas frases se graban en
 * js/voice-clips.js (con tools/generar-voz.py) para los teléfonos cuyo
 * navegador no tiene voz propia, como la app de Claude en Android.
 */
window.PHRASES = {
  elige: 'Elige tu imagen secreta',
  empieza_juego: 'Que empiece el juego',
  adivina: 'Adivina la palabra',
  tiene: '¿Tu palabra tiene',
  mira_si: 'Mira bien, sí está',
  mira_no: 'Mmm, esa no está',
  no_esta: 'No está, pero igual escríbela.',
  escribe: 'Escribe',
  punto_verde: 'Empieza en el punto verde',
  casi: 'Casi. Inténtalo otra vez',
  excelente: '¡Excelente!',
  te_ayudo: 'Te ayudo. Empieza en el punto verde',
  adivinaron: 'Adivinaron tu palabra:',
  ganaste_es: 'Ganaste. La palabra es',
  ganaste_no: 'Ganaste. No adivinaron tu palabra',
  cayo: 'Se cayó al agua. La palabra era',
  dibuja: 'Dibuja tu imagen secreta',
  primero_dibuja: 'Primero dibuja algo',
  que_dibujaste: '¿Qué dibujaste?'
};

// Categorías para la pista. `say` es lo que se dice en voz alta.
window.CATEGORIES = {
  animal: { icon: '🐾', label: 'Es un animal', say: 'Pista: es un animal' },
  fruta: { icon: '🍎', label: 'Es una fruta', say: 'Pista: es una fruta' },
  comida: { icon: '🍽️', label: 'Es algo de comer', say: 'Pista: es algo de comer' },
  transporte: { icon: '🚗', label: 'Es un transporte', say: 'Pista: es un transporte' },
  naturaleza: { icon: '🌤️', label: 'Está en la naturaleza', say: 'Pista: está en la naturaleza' },
  cosa: { icon: '🧸', label: 'Es una cosa', say: 'Pista: es una cosa' }
};
