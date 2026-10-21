/*
 * Dibujo del niño o niña en el trampolín. Con cada error aparece una parte
 * más del cuerpo; cuando está completo... ¡se cae a la piscina!
 */
(function () {
  var MAX_ERRORS = 6;
  var uid = 0;

  // photo (opcional): selfie recortada en cuadrado, como data URL; reemplaza la cara dibujada.
  function figureSVG(errors, gender, fallen, photo) {
    var girl = gender === 'chica';
    var worried = errors >= MAX_ERRORS - 2;
    var skin = '#f5c99b', shirt = girl ? '#ff6fa8' : '#3b8beb', pants = girl ? '#ff6fa8' : '#2c3e70';
    var p = [];

    // 1. Cabeza con cara y pelo
    if (errors >= 1) {
      var hair = girl
        ? '<circle cx="104" cy="62" r="7" fill="#7a3e12"/><circle cx="136" cy="62" r="7" fill="#7a3e12"/>' +
          '<path d="M104 70 a16 16 0 0 1 32 0 q-16 -8 -32 0z" fill="#7a3e12"/>'
        : '<path d="M104 70 a16 16 0 0 1 32 0 q-8 -6 -16 -3 q-8 -3 -16 3z" fill="#4a2a0a"/>';
      var mouth = worried
        ? '<path d="M114 81 q6 -5 12 0" stroke="#333" stroke-width="2" fill="none" stroke-linecap="round"/>'
        : '<path d="M114 78 q6 6 12 0" stroke="#333" stroke-width="2" fill="none" stroke-linecap="round"/>';
      var sweat = worried ? '<circle cx="137" cy="62" r="2.8" fill="#7fd3ff"/>' : '';
      if (photo) {
        var id = 'cara' + (++uid);
        p.push(
          '<g class="part"><clipPath id="' + id + '"><circle cx="120" cy="66" r="22"/></clipPath>' +
          '<image href="' + photo + '" x="98" y="44" width="44" height="44" clip-path="url(#' + id + ')" preserveAspectRatio="xMidYMid slice"/>' +
          '<circle cx="120" cy="66" r="22" fill="none" stroke="' + shirt + '" stroke-width="2.5"/>' + sweat + '</g>'
        );
      } else {
        p.push(
          '<g class="part">' + '<circle cx="120" cy="72" r="16" fill="' + skin + '"/>' + hair +
          '<circle cx="114" cy="72" r="2.2" fill="#333"/><circle cx="126" cy="72" r="2.2" fill="#333"/>' +
          sweat + mouth + '</g>'
        );
      }
    }
    // 2. Cuerpo
    if (errors >= 2) {
      p.push(girl
        ? '<path class="part" d="M112 88 h16 l8 30 h-32z" fill="' + shirt + '"/>'
        : '<rect class="part" x="110" y="88" width="20" height="30" rx="5" fill="' + shirt + '"/>');
    }
    // 3 y 4. Brazos
    var armUp = worried ? -14 : 0;
    if (errors >= 3) p.push('<line class="part" x1="111" y1="94" x2="94" y2="' + (110 + armUp * 2) + '" stroke="' + skin + '" stroke-width="6" stroke-linecap="round"/>');
    if (errors >= 4) p.push('<line class="part" x1="129" y1="94" x2="146" y2="' + (110 + armUp * 2) + '" stroke="' + skin + '" stroke-width="6" stroke-linecap="round"/>');
    // 5 y 6. Piernas
    if (errors >= 5) p.push('<line class="part" x1="115" y1="118" x2="111" y2="139" stroke="' + pants + '" stroke-width="7" stroke-linecap="round"/>');
    if (errors >= 6) p.push('<line class="part" x1="125" y1="118" x2="129" y2="139" stroke="' + pants + '" stroke-width="7" stroke-linecap="round"/>');

    var splash = fallen
      ? '<g class="splash"><circle cx="110" cy="176" r="6" fill="#bfe9ff"/><circle cx="130" cy="170" r="5" fill="#bfe9ff"/>' +
        '<circle cx="95" cy="168" r="4" fill="#bfe9ff"/><circle cx="145" cy="178" r="4" fill="#bfe9ff"/>' +
        '<text x="120" y="160" text-anchor="middle" font-size="16" font-weight="bold" fill="#1677c9">¡SPLASH!</text></g>'
      : '';

    return (
      '<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" aria-label="Errores: ' + errors + ' de ' + MAX_ERRORS + '">' +
      '<rect width="200" height="220" fill="#dff3ff"/>' +
      '<circle cx="172" cy="30" r="14" fill="#ffd84d"/>' +
      // Trampolín
      '<rect x="24" y="140" width="10" height="80" fill="#8d6e63"/>' +
      '<rect x="14" y="138" width="130" height="8" rx="3" fill="#ff9f43"/>' +
      // Piscina
      '<rect x="0" y="182" width="200" height="38" fill="#4fc3f7"/>' +
      '<path d="M0 182 q12 -6 25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0 t25 0" fill="none" stroke="#fff" stroke-width="2"/>' +
      '<g class="kid' + (fallen ? ' falling' : '') + '">' + p.join('') + '</g>' + splash +
      '</svg>'
    );
  }

  window.MAX_ERRORS = MAX_ERRORS;
  window.figureSVG = figureSVG;
})();
