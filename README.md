# ¡Que no se caiga! 🏊

El juego del ahorcado para niños que están aprendiendo a escribir. Funciona en **Android y iPhone/iPad**
(es una app web instalable, y también se puede empaquetar como app nativa con Capacitor).

## Cómo se juega

**🖼️ Yo elijo la imagen** (turno del niño)
1. El niño elige una imagen secreta (🐱, 🐶, 🚗…) y aparecen las rayitas de las letras.
2. El otro jugador dice una letra y el niño la toca en el teclado.
3. El niño responde **"✅ ¡Sí está!"** o **"❌ No está"**. Si se equivoca, el juego le corrige con cariño.
4. **Esté o no la letra, el niño la tiene que escribir** (así practica todas): aparece un caminito con un punto verde 🟢
   donde empieza cada trazo, una flecha y un dedito 👆 que le enseña el movimiento.
   Cuando la termina, **su propia letra se coloca sobre las rayitas** correspondientes.
5. Si no está, su letra se pone **abajo con una ✗ roja** y se va dibujando el chico o la chica en el trampolín. Con 6 errores… ¡se cae a la piscina! 💦

**✏️ Dibujar mi imagen**: en la lista de imágenes, la primera opción permite que el niño **dibuje** su
imagen secreta con colores. Después un adulto escribe qué es (por ejemplo "piña") y salen las rayitas.

**🙈 Yo adivino** (turno del adulto de esconder): el juego elige una imagen al azar, el niño dice letras
y, cuando acierta, también las escribe.

### Opciones en la pantalla de inicio
- **📷 Foto:** se toma una selfie (o se elige una foto) del que juega y su cara aparece en el niño o niña del
  trampolín. Se encuadra arrastrando y acercando; se guarda sólo en ese aparato y se quita con ✖.
- **ABC / abc / cursiva:** escribir en mayúsculas, minúsculas o cursiva (letra ligada, minúsculas), cada una
  con sus renglones y su forma de trazarse.
- **👆 Con caminito / ✏️ Libre:** con caminito, el niño repasa cada trazo guiado. En modo libre escribe la
  letra solo, como en su pizarra, y toca **Listo**. Si no le sale, el juego le muestra el caminito para
  que la repase. También puede pedir **Ayuda** en cualquier momento.

Al adivinar aparece una **pista** con la categoría; al tocarla se escucha. Hay 109 imágenes en 11 categorías
(animales, frutas, verduras, comida, ropa, cuerpo, juguetes, instrumentos, casa, transportes y naturaleza).

El juego dice las letras en voz alta ("¿Tu palabra tiene la ge?").

### Voz
Si el navegador tiene voz en español (Chrome, Safari) se usa esa. Si no (por ejemplo la app de Claude en
Android), se tocan las grabaciones de `www/js/voice-clips.js`, hechas con la voz "carlfm" de
[Piper](https://github.com/rhasspy/piper) (dominio público). Al cambiar frases o palabras hay que
regrabarlas: `pip install piper-tts` y `python3 tools/generar-voz.py`.

## Probarlo en la computadora

```bash
npm start          # o: cd www && python3 -m http.server 8080
```
Abrir http://localhost:8080

## Instalar en el teléfono (lo más fácil)

1. Publicar la carpeta `www/` en cualquier hosting con HTTPS. Este repo trae una acción de GitHub
   (`.github/workflows/pages.yml`) que la publica en **GitHub Pages** cada vez que cambia la rama principal
   (activar en *Settings → Pages → Source: GitHub Actions*).
2. En el teléfono abrir la página y:
   - **iPhone/iPad (Safari):** Compartir → *Agregar a pantalla de inicio*.
   - **Android (Chrome):** menú ⋮ → *Instalar app*.

Queda con su ícono y funciona sin internet.

## App de Android (APK)

GitHub arma el APK solo (`.github/workflows/android.yml`) cada vez que cambia el juego y lo deja en:
**https://github.com/cwvaldezp/prueba/releases/download/android/que-no-se-caiga.apk**

Para instalarlo, abrir ese enlace desde el teléfono Android, descargar y abrir el archivo, y permitir
"instalar apps de fuentes desconocidas" cuando lo pida. Las versiones nuevas se instalan encima.

La clave de firma (`tools/android/que-no-se-caiga.keystore`) es sólo para esta app familiar; no sirve para
publicar en Play Store. Para armarlo en una computadora con Android Studio: `npm install` y `npm run android`.

## Personalizar

- **Imágenes y palabras:** `www/js/words.js` (palabra en MAYÚSCULAS, sin tildes, un emoji y su categoría);
  después regrabar la voz con `python3 tools/generar-voz.py`.
- **Forma y orden de los trazos de cada letra (mayúsculas, minúsculas y cursiva):** `www/js/letters.js`.
- **Número de errores permitidos:** `MAX_ERRORS` en `www/js/figure.js`.
- **Cómo se revisa la letra:**
  - *Con caminito*: cada trazo debe empezar en el punto verde, avanzar hacia la flecha sin ir y venir, llegar
    hasta el final y sin tinta de más (garabatos). Si no, se pone rojo y se borra.
  - *Libre*: la letra se ajusta a tamaño y posición y se compara su forma; tiene que estar cada trazo, sin
    tinta de más, y no puede parecerse más a otra letra (así una b no pasa por d ni una o por a).
  - Prueba automática con escritura simulada y garabatos: `node tests/revision-letras.js`.
- **Qué tan exigente es al escribir:** las constantes al inicio de `www/js/tracer.js`.
