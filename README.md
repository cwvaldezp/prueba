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

## Mis números 🔢 (`www/numeros/`)

Una segunda página, hermana de [Mi abecedario](https://github.com/cwvaldezp/abecedario-guiado), para
practicar **los números**. Se publica junto al juego, en `…/numeros/`, y también se instala como app aparte.

1. Toca **▶️ ¡A escribir!**. Aparece el número (por ejemplo **3 tres 🐱**) y la voz dice "tres. Escribe el tres".
2. El niño repasa el número por el caminito (punto verde 🟢, flecha y dedito 👆). Garabatos e ir y venir no cuentan.
3. **Después de escribirlo, lo cuenta.** Aparecen 3 gatitos en filas de 5 (como los dedos de una mano);
   al tocar cada uno se marca y la voz cuenta "uno, dos, tres… ¡Son tres gatitos!". En el cero aparece una
   canasta vacía: "el cero es cuando no hay nada".
4. Cada número gana una estrella ⭐; al completar la ronda se desbloquea el **premio** (video), igual que en el abecedario.

**Para adultos** (se entra resolviendo una multiplicación), además de lo que ya tenía el abecedario:
- **Qué números:** 1 al 5, 0 al 10 o **0 al 20** (los de dos cifras se escriben cifra por cifra).
- **Orden:** 1, 2, 3… en orden, o **salteados** (primero salen los que todavía no tienen estrella y después
  los que más le cuestan).
- **Contar los dibujitos** sí/no, y **caminito ancho** (3–4 años) o **angosto** (5 años o más).
- **Los que más le cuestan:** se anota cuántas veces se le borró el trazo en cada número y se muestran los más difíciles.

Trazos, nombres, dibujitos y frases: `www/numeros/js/numbers.js`. Después de cambiar frases o dibujitos,
regrabar la voz con `python3 tools/generar-voz-numeros.py`. Prueba de la revisión: `node tests/revision-numeros.js`.

## Mis cuentas 🏠 (`www/cuentas/`)

Un portal para llevar **las cuentas personales y las de los inmuebles que administro**. Se publica junto al
juego, en `…/cuentas/`, y se puede instalar en el teléfono como app (Compartir → *Agregar a pantalla de inicio*).

- **Tres tipos de movimiento:** *ingreso* (alquiler, sueldo), *gasto* (luz, impuestos, arreglos) y *egreso*
  (dinero que sale sin ser gasto: la transferencia a la dueña, un retiro, el ahorro).
- **Por cada cuenta o inmueble:** ingresos, gastos, comisión de administración (si tiene), resultado, egresos y
  **saldo en caja**, es decir, lo que falta entregar a la dueña. Por mes, por año o de todo el historial, con
  el saldo anterior, el detalle por categoría y un gráfico de los últimos 12 meses.
- **Total de todas las cuentas** en el resumen (separado por moneda si hay más de una).
- **La dueña entra con su correo y ve sólo su inmueble** (o lo suyo y nada más). Se le puede dar acceso de
  *sólo ver* o de *ver y cargar movimientos*.
- **Cobros y pagos fijos:** alquiler, expensas o la entrega mensual. El resumen avisa lo que falta registrar
  cada mes y se registra con un toque.
- **Comprobantes:** a cada movimiento se le puede adjuntar la foto o el PDF de la factura o el recibo.
- **Aviso cuando se acerca el fin de un contrato** de alquiler.
- **Estado de cuenta para imprimir o guardar en PDF** y **exportar a Excel (CSV)**.
- Cuentas **archivadas** para los inmuebles que ya no administro, sin perder el historial.

### Probarlo
Abrir `…/cuentas/` (o `npm start` y http://localhost:8080/cuentas/). Mientras no esté configurado, funciona en
**modo de prueba**: trae datos de ejemplo, guarda sólo en ese navegador y deja cambiar arriba entre
"Yo (administrador)" y "María (dueña)" para ver lo que ve cada uno.

### Ponerlo a funcionar de verdad (una sola vez, gratis)
Los datos y los usuarios quedan en [Supabase](https://supabase.com) (plan gratuito).
1. Crear una cuenta en Supabase y un proyecto nuevo.
2. En **SQL Editor** pegar todo `supabase/esquema.sql` y tocar **Run**. Crea las tablas, los permisos (cada uno
   ve sólo lo suyo) y el lugar para los comprobantes.
3. En **Authentication → URL Configuration** poner como *Site URL* la dirección del portal
   (por ejemplo `https://cwvaldezp.github.io/prueba/cuentas/`). Dejar activado *Confirm email* en
   **Authentication → Providers → Email**: así nadie puede crear un usuario con el correo de otra persona.
4. En **Settings → API** copiar *Project URL* y la clave *anon public* a `www/cuentas/js/config.js`
   (ahí también se elige la moneda y el formato del CSV) y subir el cambio.
5. Entrar al portal, **Crear mi usuario**, confirmar el correo y tocar **Ser el administrador**
   (sólo lo puede hacer el primero).
6. Crear las cuentas (en **Cuentas**). En cada inmueble que no es mío: **Dar acceso** con el correo de la
   dueña. Ella crea su usuario con ese correo (o pide un enlace para entrar sin contraseña) y ve sólo lo suyo.

Prueba de los cálculos y permisos del modo de prueba: `node tests/cuentas.js`.
