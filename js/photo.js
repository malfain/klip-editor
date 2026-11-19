/* Klip — editor foto: filter, penyesuaian, potong/putar */
(function () {
  var I = K.ic;
  var RATIOS = [
    { id: 'bebas', name: 'Asli', r: 0, w: 22, h: 16 }, { id: '1:1', name: '1:1', r: 1, w: 18, h: 18 },
    { id: '4:5', name: '4:5', r: 4 / 5, w: 16, h: 20 }, { id: '9:16', name: '9:16', r: 9 / 16, w: 12, h: 21 },
    { id: '16:9', name: '16:9', r: 16 / 9, w: 24, h: 14 }, { id: '3:4', name: '3:4', r: 3 / 4, w: 15, h: 20 },
    { id: '4:3', name: '4:3', r: 4 / 3, w: 20, h: 15 }
  ];
  var TOOLS = [
    { id: 'kecerahan', name: 'Kecerahan', icon: 'sun' }, { id: 'kontras', name: 'Kontras', icon: 'contrast' },
    { id: 'saturasi', name: 'Saturasi', icon: 'drop' }, { id: 'suhu', name: 'Suhu', icon: 'temp' },
    { id: 'rona', name: 'Rona', icon: 'palette' }
  ];

  /* Gambar foto (diputar, dibalik, dipotong) ke kanvas pada skala tertentu */
  function renderGeom(canvas, img, scale, p) {
    var ow = img.naturalWidth * scale, oh = img.naturalHeight * scale;
    var rot = ((p.rotate || 0) % 360 + 360) % 360;
    var rw = rot % 180 ? oh : ow, rh = rot % 180 ? ow : oh;
    var ratio = (RATIOS.filter(function (r) { return r.id === p.ratio; })[0] || RATIOS[0]).r;
    var cw = rw, ch = rh;
    if (ratio) { if (rw / rh > ratio) { ch = rh; cw = rh * ratio; } else { cw = rw; ch = rw / ratio; } }
    canvas.width = Math.max(1, Math.round(cw)); canvas.height = Math.max(1, Math.round(ch));
    var ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rot * Math.PI / 180);
    if (p.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -ow / 2, -oh / 2, ow, oh);
    ctx.restore();
    return ctx;
  }
  function ops(p) { return K.filters.ops(p.filter, p.strength, p.adj); }

  function renderFinal(img, p, maxSide) {
    var s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    var g = document.createElement('canvas');
    renderGeom(g, img, s, p);
    var out = document.createElement('canvas');
    out.width = g.width; out.height = g.height;
    var ctx = out.getContext('2d');
    K.filters.drawFiltered(ctx, out.width, out.height, ops(p), function () { ctx.drawImage(g, 0, 0); });
    return out;
  }

  K.screens.photo = {
    mount: function (app, params) {
      var el = document.createElement('section');
      el.className = 'screen safe-top';
      el.innerHTML = '<div class="center-col"><div class="spinner" style="border-color:var(--secondary);border-top-color:var(--primary)"></div></div>';
      app.appendChild(el);
      var alive = true, saveTimer = 0, p = null, img = null, mode = params.mode || 'filter', tool = 'kecerahan';

      K.projects.get(params.id).then(function (proj) {
        if (!proj) { K.go('home'); return; }
        p = proj;
        return K.media.load(p.mediaId).then(function () {
          return new Promise(function (res, rej) {
            img = new Image();
            img.onload = res; img.onerror = function () { rej(new Error('Foto gagal dimuat')); };
            img.src = K.media.url(p.mediaId);
          });
        }).then(function () { if (alive) build(); });
      }).catch(function (e) { K.toast(e.message); K.go('home'); });

      var canvas, stageBox;
      function build() {
        el.innerHTML =
          '<header class="nav-header"><button class="nav-back" data-back>' + I('back') + '<span>Beranda</span></button>' +
          '<span class="nav-title">Edit foto</span><button class="btn btn-primary" data-save style="padding:0 18px">Simpan</button></header>' +
          '<section class="photo-stage" aria-label="Foto"><canvas role="img" aria-label="Pratinjau foto"></canvas></section>' +
          '<div class="tabs"><div class="seg" role="tablist" aria-label="Mode edit">' +
          [['filter', 'Filter'], ['sesuaikan', 'Sesuaikan'], ['potong', 'Potong']].map(function (m) {
            return '<button role="tab" data-mode="' + m[0] + '" aria-pressed="' + (mode === m[0]) + '" aria-selected="' + (mode === m[0]) + '">' + m[1] + '</button>';
          }).join('') + '</div></div>' +
          '<section class="photo-panel" role="tabpanel"></section>' +
          '<div class="photo-foot safe-bottom"><button class="btn btn-ghost" data-reset>Atur ulang</button><span class="muted" style="font-size:12px" data-sum></span></div>';
        canvas = K.$('canvas', el);
        stageBox = K.$('.photo-stage', el);
        K.$('[data-back]', el).addEventListener('click', function () { save().then(function () { K.go('home'); }); });
        K.$('[data-save]', el).addEventListener('click', saveSheet);
        K.$('[data-reset]', el).addEventListener('click', function () {
          p.filter = 'asli'; p.strength = 80; p.adj = { kecerahan: 0, kontras: 0, saturasi: 0, suhu: 0, rona: 0 };
          p.ratio = 'bebas'; p.rotate = 0; p.flip = false;
          changed(true); panel();
        });
        K.$$('[data-mode]', el).forEach(function (b) {
          b.addEventListener('click', function () {
            mode = b.dataset.mode;
            K.$$('[data-mode]', el).forEach(function (x) { var on = x === b; x.setAttribute('aria-pressed', on); x.setAttribute('aria-selected', on); });
            panel();
          });
        });
        drawGeom(); drawFilter(); panel(); summary();
      }

      function drawGeom() {
        var maxSide = 1400;
        var s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        renderGeom(canvas, img, s, p);
      }
      function drawFilter() { canvas.style.filter = K.filters.css(ops(p)); }
      function summary() {
        var f = K.filters.PRESETS.filter(function (x) { return x.id === p.filter; })[0];
        var n = Object.keys(p.adj).filter(function (k) { return p.adj[k] !== 0; }).length;
        K.$('[data-sum]', el).textContent = 'Filter ' + f.name + ' · ' + n + ' penyesuaian' + (p.ratio !== 'bebas' ? ' · ' + p.ratio : '');
      }
      function changed(geom) {
        if (geom) drawGeom();
        drawFilter(); summary();
        clearTimeout(saveTimer); saveTimer = setTimeout(save, 600);
      }
      function save() {
        if (!p || !img) return Promise.resolve();
        var t = renderFinal(img, p, 160);
        p.thumb = t.toDataURL('image/jpeg', 0.7);
        return K.projects.save(p);
      }

      function rangeRow(id, label, min, max, val) {
        return '<div class="slider-row"><label for="' + id + '">' + label + '</label><input id="' + id + '" class="range" type="range" min="' + min + '" max="' + max + '" value="' + val + '"><output for="' + id + '">' + val + '</output></div>';
      }
      function bindRange(id, fn) {
        var r = K.$('#' + id, el), o = r.nextElementSibling;
        K.setFill(r);
        r.addEventListener('input', function () { K.setFill(r); o.textContent = r.value; fn(+r.value); });
      }

      function panel() {
        var box = K.$('.photo-panel', el);
        var m = K.media.get(p.mediaId);
        var th = m && m.thumbs ? m.thumbs[0] : '';
        if (mode === 'filter') {
          box.innerHTML = '<div style="display:flex;flex-direction:column;gap:14px">' + rangeRow('kekuatan', 'Kekuatan', 0, 100, p.strength) +
            '<div class="chips">' + K.filters.PRESETS.map(function (f) {
              return '<button class="chip-filter" data-f="' + f.id + '" aria-pressed="' + (p.filter === f.id) + '"><i style="background-image:url(' + th + ');filter:' + K.filters.css(K.filters.ops(f.id, 100)) + '"></i><span>' + f.name + '</span></button>';
            }).join('') + '</div></div>';
          bindRange('kekuatan', function (v) { p.strength = v; changed(); });
          K.$$('[data-f]', box).forEach(function (b) {
            b.addEventListener('click', function () {
              p.filter = b.dataset.f; changed();
              K.$$('[data-f]', box).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            });
          });
        } else if (mode === 'sesuaikan') {
          var cur = TOOLS.filter(function (t) { return t.id === tool; })[0];
          box.innerHTML = '<div style="display:flex;flex-direction:column;gap:14px">' + rangeRow('nilai', cur.name, -50, 50, p.adj[tool]) +
            '<div class="round-tools">' + TOOLS.map(function (t) {
              var dot = p.adj[t.id] !== 0 ? ' •' : '';
              return '<button data-t="' + t.id + '" aria-pressed="' + (t.id === tool) + '"><i>' + I(t.icon, 22) + '</i><span>' + t.name + dot + '</span></button>';
            }).join('') + '</div></div>';
          bindRange('nilai', function (v) { p.adj[tool] = v; changed(); });
          K.$$('[data-t]', box).forEach(function (b) { b.addEventListener('click', function () { tool = b.dataset.t; panel(); }); });
          K.$('#nilai', box).addEventListener('dblclick', function () { p.adj[tool] = 0; changed(); panel(); });
        } else {
          box.innerHTML = '<div style="display:flex;flex-direction:column;gap:14px"><div class="ratio-row">' + RATIOS.map(function (r) {
            return '<button data-r="' + r.id + '" aria-pressed="' + (p.ratio === r.id) + '"><i style="width:' + r.w + 'px;height:' + r.h + 'px"></i><span>' + r.name + '</span></button>';
          }).join('') + '</div><div style="display:flex;gap:10px;padding:0 16px">' +
            '<button class="btn btn-secondary" data-rot style="flex:1">' + I('rotate', 20) + 'Putar 90°</button>' +
            '<button class="btn btn-secondary" data-flip style="flex:1" aria-pressed="' + !!p.flip + '">' + I('flip', 20) + 'Balik</button></div></div>';
          K.$$('[data-r]', box).forEach(function (b) {
            b.addEventListener('click', function () {
              p.ratio = b.dataset.r; changed(true);
              K.$$('[data-r]', box).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            });
          });
          K.$('[data-rot]', box).addEventListener('click', function () { p.rotate = ((p.rotate || 0) + 90) % 360; changed(true); });
          K.$('[data-flip]', box).addEventListener('click', function (e) { p.flip = !p.flip; e.currentTarget.setAttribute('aria-pressed', p.flip); changed(true); });
        }
      }

      function exportBlob() {
        var ld = K.loading('Menyimpan foto…');
        return new Promise(function (res) {
          setTimeout(function () {
            var out = renderFinal(img, p, 6000);
            out.toBlob(function (b) { ld.done(); res(b); }, 'image/jpeg', 0.92);
          }, 30);
        });
      }
      function fname() { return (p.name || 'foto').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.jpg'; }
      function saveSheet() {
        save();
        var items = [{ label: K.isApp() ? 'Simpan ke Galeri' : 'Unduh JPG', run: function () { exportBlob().then(function (b) { K.download(b, fname()); if (!K.isApp()) K.toast('Foto tersimpan · ' + K.fmtMB(b.size)); }); } }];
        if (navigator.canShare || K.isApp()) items.push({ label: 'Bagikan', run: function () {
          exportBlob().then(function (b) { K.shareFile(b, fname()).then(function (ok) { if (!ok) { K.download(b, fname()); K.toast('Berbagi tidak didukung — foto diunduh'); } }); });
        } });
        K.actions('Hasil disimpan dalam resolusi penuh', items);
      }

      return { destroy: function () { alive = false; clearTimeout(saveTimer); save(); } };
    }
  };
})();
