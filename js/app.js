/* Klip — router, tema, alur proyek baru */
(function () {
  var current = null;

  K.screens = K.screens || {};

  K.go = function (name, params) {
    if (current && current.destroy) current.destroy();
    var app = K.$('#app');
    app.innerHTML = '';
    var scr = K.screens[name];
    current = scr.mount(app, params || {}) || {};
    try { sessionStorage.setItem('klip-last', JSON.stringify({ name: name, id: params && params.id })); } catch (e) { /* abaikan */ }
  };

  /* Tema: auto / light / dark */
  K.theme = {
    get: function () { try { return localStorage.getItem('klip-theme') || 'auto'; } catch (e) { return 'auto'; } },
    set: function (t) {
      try { localStorage.setItem('klip-theme', t); } catch (e) { /* abaikan */ }
      K.theme.apply();
    },
    apply: function () {
      var t = K.theme.get();
      if (t === 'auto') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', t);
    }
  };

  function projectName(prefix) {
    var d = new Date();
    var bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()];
    return prefix + ' ' + d.getDate() + ' ' + bln + ' ' + (d.getHours() < 10 ? '0' : '') + d.getHours() + '.' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  }

  K.importMany = function (files) {
    var ld = K.loading('Mengimpor media…');
    var out = [];
    var i = 0;
    function next() {
      if (i >= files.length) return Promise.resolve(out);
      var f = files[i];
      ld.set('Mengimpor ' + (i + 1) + ' dari ' + files.length + '…');
      return K.media.importFile(f, function (p) {
        ld.set('Mengimpor ' + (i + 1) + ' dari ' + files.length + ' · ' + Math.round(p * 100) + '%');
      }).then(function (rec) { out.push(rec); i++; return next(); }, function (e) {
        K.toast(e.message); i++; return next();
      });
    }
    return next().then(function (r) { ld.done(); return r; }, function (e) { ld.done(); throw e; });
  };

  K.newVideoProject = function (recs, opts) {
    var videos = recs.filter(function (r) { return r.kind === 'video'; });
    if (!videos.length) return Promise.resolve(null);
    var p = {
      id: K.uid(), type: 'video', name: projectName('Video'), created: Date.now(),
      clips: videos.map(function (r) {
        return { id: K.uid(), mediaId: r.id, start: 0, end: r.duration, speed: 1, volume: 1, filter: 'asli' };
      }),
      texts: [], music: null, muted: false,
      exportCfg: { res: '1080p', fps: '30', quality: 'disarankan', audio: true }
    };
    return K.projects.save(p).then(function () { K.go('video', { id: p.id, tool: opts && opts.tool }); return p; });
  };

  K.newPhotoProject = function (rec, opts) {
    var p = {
      id: K.uid(), type: 'photo', name: projectName('Foto'), created: Date.now(), mediaId: rec.id,
      filter: 'asli', strength: 80, adj: { kecerahan: 0, kontras: 0, saturasi: 0, suhu: 0, rona: 0 },
      ratio: 'bebas', rotate: 0, flip: false
    };
    return K.projects.save(p).then(function () { K.go('photo', { id: p.id, mode: opts && opts.mode }); return p; });
  };

  /* mode: 'any' | 'video' | 'photo' ; opts diteruskan ke editor */
  K.startNew = function (mode, opts) {
    var input = mode === 'video' ? 'pick-video' : mode === 'photo' ? 'pick-image' : 'pick-media';
    K.pickFiles(input).then(function (files) {
      if (!files.length) return;
      return K.importMany(files).then(function (recs) {
        if (!recs.length) return;
        var img = recs.filter(function (r) { return r.kind === 'image'; })[0];
        var vids = recs.filter(function (r) { return r.kind === 'video'; });
        if (vids.length) return K.newVideoProject(recs, opts);
        if (img) return K.newPhotoProject(img, opts);
        K.toast('Pilih berkas video atau foto');
      });
    }).catch(function (e) { K.toast(e.message || 'Gagal mengimpor'); });
  };

  K.openProject = function (p) {
    K.go(p.type === 'photo' ? 'photo' : 'video', { id: p.id });
  };

  K.theme.apply();
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', K.theme.apply);
  }

  /* Pulihkan layar terakhir saat dimuat ulang */
  var last = null;
  try { last = JSON.parse(sessionStorage.getItem('klip-last') || 'null'); } catch (e) { last = null; }
  if (last && last.id && (last.name === 'video' || last.name === 'photo')) {
    K.projects.get(last.id).then(function (p) { if (p) K.openProject(p); else K.go('home'); }, function () { K.go('home'); });
  } else {
    K.go('home');
  }
})();
