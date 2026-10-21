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

// Categorías para la pista (en este orden se muestran al elegir). `say` es lo que se dice
// en voz alta y `name` el título del grupo al elegir imagen.
window.CATEGORIES = {
  animal: { icon: '🐾', label: 'Es un animal', name: 'Animales', say: 'Pista: es un animal' },
  fruta: { icon: '🍎', label: 'Es una fruta', name: 'Frutas', say: 'Pista: es una fruta' },
  verdura: { icon: '🥕', label: 'Es una verdura', name: 'Verduras', say: 'Pista: es una verdura' },
  comida: { icon: '🍽️', label: 'Es algo de comer', name: 'Comida', say: 'Pista: es algo de comer' },
  ropa: { icon: '👕', label: 'Es ropa', name: 'Ropa', say: 'Pista: es ropa' },
  cuerpo: { icon: '✋', label: 'Es parte del cuerpo', name: 'Cuerpo', say: 'Pista: es parte del cuerpo' },
  juguete: { icon: '🧸', label: 'Es un juguete', name: 'Juguetes', say: 'Pista: es un juguete' },
  instrumento: { icon: '🎵', label: 'Es un instrumento musical', name: 'Instrumentos', say: 'Pista: es un instrumento musical' },
  casa: { icon: '🏠', label: 'Está en la casa', name: 'Casa', say: 'Pista: está en la casa' },
  transporte: { icon: '🚗', label: 'Es un transporte', name: 'Transportes', say: 'Pista: es un transporte' },
  naturaleza: { icon: '🌤️', label: 'Está en la naturaleza', name: 'Naturaleza', say: 'Pista: está en la naturaleza' }
};
