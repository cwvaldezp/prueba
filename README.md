# ¡Que no se caiga! 🏊

El juego del ahorcado para niños que están aprendiendo a escribir. Funciona en **Android y iPhone/iPad**
(es una app web instalable, y también se puede empaquetar como app nativa con Capacitor).

## Cómo se juega

**🖼️ Yo elijo la imagen** (turno del niño)
1. El niño elige una imagen secreta (🐱, 🐶, 🚗…) y aparecen las rayitas de las letras.
2. El otro jugador dice una letra y el niño la toca en el teclado.
3. El niño responde **"✅ ¡Sí está!"** o **"❌ No está"**. Si se equivoca, el juego le corrige con cariño.
4. Si la letra está, **el niño la tiene que escribir**: aparece un caminito con un punto verde 🟢
   donde empieza cada trazo, una flecha y un dedito 👆 que le enseña el movimiento.
   Cuando la termina, **su propia letra se coloca sobre las rayitas** correspondientes.
5. Si no está, se va dibujando el chico o la chica en el trampolín. Con 6 errores… ¡se cae a la piscina! 💦

**🙈 Yo adivino** (turno del adulto de esconder): el juego elige una imagen al azar, el niño dice letras
y, cuando acierta, también las escribe.

El juego dice las letras en voz alta ("¿Tu palabra tiene la ge?").

## Probarlo en la computadora

```bash
npm start          # o: cd www && python3 -m http.server 8080
```
Abrir http://localhost:8080

## Instalar en el teléfono (lo más fácil)

1. Publicar la carpeta `www/` en cualquier hosting con HTTPS. Este repo trae una acción de GitHub
   (`.github/workflows/pages.yml`) que la publica en **GitHub Pages** al hacer push a `main`
   (activar en *Settings → Pages → Source: GitHub Actions*).
2. En el teléfono abrir la página y:
   - **iPhone/iPad (Safari):** Compartir → *Agregar a pantalla de inicio*.
   - **Android (Chrome):** menú ⋮ → *Instalar app*.

Queda con su ícono y funciona sin internet.

## App nativa (Play Store / App Store)

```bash
npm install
npx cap add android   # requiere Android Studio
npx cap add ios       # requiere una Mac con Xcode
npm run android       # o: npm run ios
```

## Personalizar

- **Imágenes y palabras:** `www/js/words.js` (palabra en MAYÚSCULAS, sin tildes, y un emoji).
- **Forma y orden de los trazos de cada letra:** `www/js/letters.js`.
- **Número de errores permitidos:** `MAX_ERRORS` en `www/js/figure.js`.
- **Qué tan exigente es al escribir:** `TOLERANCE` y `COVERAGE_OK` en `www/js/tracer.js`.
