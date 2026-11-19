/* Klip — filter: string CSS untuk pratinjau, matriks warna untuk ekspor */
K.filters = (function () {
  var PRESETS = [
    { id: 'asli', name: 'Asli' },
    { id: 'hangat', name: 'Hangat' },
    { id: 'sejuk', name: 'Sejuk' },
    { id: 'vintage', name: 'Vintage' },
    { id: 'mono', name: 'Mono' },
    { id: 'cerah', name: 'Cerah' },
    { id: 'drama', name: 'Drama' }
  ];

  /* daftar operasi [nama, nilai] untuk preset pada kekuatan k (0..1) */
  function presetOps(id, k) {
    switch (id) {
      case 'hangat': return [['sepia', 0.3 * k], ['saturate', 1 + 0.35 * k]];
      case 'sejuk': return [['hue-rotate', 18 * k], ['saturate', 1 - 0.15 * k], ['brightness', 1 + 0.05 * k]];
      case 'vintage': return [['sepia', 0.55 * k], ['contrast', 1 - 0.12 * k], ['brightness', 1 + 0.05 * k]];
      case 'mono': return [['grayscale', k], ['contrast', 1 + 0.1 * k]];
      case 'cerah': return [['brightness', 1 + 0.15 * k], ['saturate', 1 + 0.45 * k]];
      case 'drama': return [['contrast', 1 + 0.4 * k], ['brightness', 1 - 0.12 * k], ['saturate', 1 + 0.1 * k]];
      default: return [];
    }
  }

  /* penyesuaian: {kecerahan, kontras, saturasi, suhu, rona} masing-masing -50..50 */
  function adjustOps(v) {
    if (!v) return [];
    var ops = [];
    if (v.kecerahan) ops.push(['brightness', 1 + v.kecerahan / 100]);
    if (v.kontras) ops.push(['contrast', 1 + v.kontras / 100]);
    if (v.saturasi) ops.push(['saturate', 1 + v.saturasi / 50]);
    if (v.suhu > 0) ops.push(['sepia', v.suhu / 80]);
    if (v.suhu < 0) ops.push(['hue-rotate', -v.suhu * 0.5]);
    if (v.rona) ops.push(['hue-rotate', v.rona * 1.2]);
    return ops;
  }

  function ops(filterId, strength, adj) {
    return presetOps(filterId, (strength == null ? 100 : strength) / 100).concat(adjustOps(adj));
  }

  function css(o) {
    if (!o.length) return 'none';
    return o.map(function (x) {
      var v = Math.round(x[1] * 1000) / 1000;
      return x[0] + '(' + v + (x[0] === 'hue-rotate' ? 'deg' : '') + ')';
    }).join(' ');
  }

  /* matriks 3x4 (baris r,g,b: 3 koefisien + offset 0..1) */
  var I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
  function m3(a) { return [[a[0], a[1], a[2], 0], [a[3], a[4], a[5], 0], [a[6], a[7], a[8], 0]]; }
  function opMatrix(name, a) {
    var c, s, n;
    switch (name) {
      case 'brightness': return [[a, 0, 0, 0], [0, a, 0, 0], [0, 0, a, 0]];
      case 'contrast': n = 0.5 - 0.5 * a; return [[a, 0, 0, n], [0, a, 0, n], [0, 0, a, n]];
      case 'saturate': return m3([
        0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a,
        0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a,
        0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a]);
      case 'grayscale': n = 1 - Math.min(1, a); return m3([
        0.2126 + 0.7874 * n, 0.7152 - 0.7152 * n, 0.0722 - 0.0722 * n,
        0.2126 - 0.2126 * n, 0.7152 + 0.2848 * n, 0.0722 - 0.0722 * n,
        0.2126 - 0.2126 * n, 0.7152 - 0.7152 * n, 0.0722 + 0.9278 * n]);
      case 'sepia': n = 1 - Math.min(1, a); return m3([
        0.393 + 0.607 * n, 0.769 - 0.769 * n, 0.189 - 0.189 * n,
        0.349 - 0.349 * n, 0.686 + 0.314 * n, 0.168 - 0.168 * n,
        0.272 - 0.272 * n, 0.534 - 0.534 * n, 0.131 + 0.869 * n]);
      case 'hue-rotate': c = Math.cos(a * Math.PI / 180); s = Math.sin(a * Math.PI / 180); return m3([
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072]);
    }
    return I;
  }
  function compose(A, B) { /* B setelah A */
    var M = [];
    for (var i = 0; i < 3; i++) {
      M.push([]);
      for (var j = 0; j < 4; j++) {
        var v = B[i][0] * A[0][j] + B[i][1] * A[1][j] + B[i][2] * A[2][j];
        if (j === 3) v += B[i][3];
        M[i].push(v);
      }
    }
    return M;
  }
  function matrix(o) {
    return o.reduce(function (M, x) { return compose(M, opMatrix(x[0], x[1])); }, I);
  }
  function applyMatrix(ctx, w, h, M) {
    var img = ctx.getImageData(0, 0, w, h), d = img.data;
    var o0 = M[0][3] * 255, o1 = M[1][3] * 255, o2 = M[2][3] * 255;
    for (var p = 0; p < d.length; p += 4) {
      var r = d[p], g = d[p + 1], b = d[p + 2];
      d[p] = M[0][0] * r + M[0][1] * g + M[0][2] * b + o0;
      d[p + 1] = M[1][0] * r + M[1][1] * g + M[1][2] * b + o1;
      d[p + 2] = M[2][0] * r + M[2][1] * g + M[2][2] * b + o2;
    }
    ctx.putImageData(img, 0, 0);
  }

  /* Apakah ctx.filter benar-benar berfungsi? (Safari lama tidak) */
  var nativeOK = null;
  function canvasFilterSupported() {
    if (nativeOK !== null) return nativeOK;
    try {
      var c = document.createElement('canvas'); c.width = c.height = 1;
      var x = c.getContext('2d');
      x.filter = 'grayscale(1)';
      x.fillStyle = '#ff0000'; x.fillRect(0, 0, 1, 1);
      var d = x.getImageData(0, 0, 1, 1).data;
      nativeOK = Math.abs(d[0] - d[1]) < 10;
    } catch (e) { nativeOK = false; }
    return nativeOK;
  }

  /* Gambar sumber ke ctx dengan filter. draw(ctx) melakukan drawImage. */
  function drawFiltered(ctx, w, h, o, draw) {
    if (!o.length) { draw(); return; }
    if (canvasFilterSupported()) {
      ctx.filter = css(o); draw(); ctx.filter = 'none';
    } else {
      draw(); applyMatrix(ctx, w, h, matrix(o));
    }
  }

  return { PRESETS: PRESETS, ops: ops, css: css, matrix: matrix, drawFiltered: drawFiltered, canvasFilterSupported: canvasFilterSupported };
})();
