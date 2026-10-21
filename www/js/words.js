/*
 * Lista de imágenes del juego. Para agregar una nueva basta con añadir
 * una línea { word: 'PALABRA', emoji: '🙂', cat: 'animal' } (palabra en MAYÚSCULAS y sin
 * tildes; cat es la categoría de la pista, ver CATEGORIES en js/phrases.js). Después
 * hay que volver a grabar la voz: python3 tools/generar-voz.py
 */
window.WORDS = [
  { word: 'GATO', emoji: '🐱', cat: 'animal' },
  { word: 'PERRO', emoji: '🐶', cat: 'animal' },
  { word: 'PEZ', emoji: '🐟', cat: 'animal' },
  { word: 'OSO', emoji: '🐻', cat: 'animal' },
  { word: 'MONO', emoji: '🐵', cat: 'animal' },
  { word: 'RANA', emoji: '🐸', cat: 'animal' },
  { word: 'PATO', emoji: '🦆', cat: 'animal' },
  { word: 'VACA', emoji: '🐮', cat: 'animal' },
  { word: 'CERDO', emoji: '🐷', cat: 'animal' },
  { word: 'ABEJA', emoji: '🐝', cat: 'animal' },
  { word: 'PULPO', emoji: '🐙', cat: 'animal' },
  { word: 'TORTUGA', emoji: '🐢', cat: 'animal' },
  { word: 'BALLENA', emoji: '🐳', cat: 'animal' },
  { word: 'CABALLO', emoji: '🐴', cat: 'animal' },
  { word: 'POLLITO', emoji: '🐤', cat: 'animal' },
  { word: 'SOL', emoji: '☀️', cat: 'naturaleza' },
  { word: 'LUNA', emoji: '🌙', cat: 'naturaleza' },
  { word: 'NUBE', emoji: '☁️', cat: 'naturaleza' },
  { word: 'ESTRELLA', emoji: '⭐', cat: 'naturaleza' },
  { word: 'FLOR', emoji: '🌸', cat: 'naturaleza' },
  { word: 'CASA', emoji: '🏠', cat: 'cosa' },
  { word: 'UVA', emoji: '🍇', cat: 'fruta' },
  { word: 'PERA', emoji: '🍐', cat: 'fruta' },
  { word: 'PIÑA', emoji: '🍍', cat: 'fruta' },
  { word: 'FRESA', emoji: '🍓', cat: 'fruta' },
  { word: 'MANZANA', emoji: '🍎', cat: 'fruta' },
  { word: 'HELADO', emoji: '🍦', cat: 'comida' },
  { word: 'TORTA', emoji: '🎂', cat: 'comida' },
  { word: 'AUTO', emoji: '🚗', cat: 'transporte' },
  { word: 'TREN', emoji: '🚂', cat: 'transporte' },
  { word: 'BARCO', emoji: '⛵', cat: 'transporte' },
  { word: 'COHETE', emoji: '🚀', cat: 'transporte' },
  { word: 'PELOTA', emoji: '⚽', cat: 'cosa' },
  { word: 'GLOBO', emoji: '🎈', cat: 'cosa' },
  { word: 'REGALO', emoji: '🎁', cat: 'cosa' },
  { word: 'LIBRO', emoji: '📖', cat: 'cosa' }
];
