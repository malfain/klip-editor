/* Klip — Beranda, Proyek, Pengaturan */
(function () {
  var I = K.ic;
  /* Link tetap ke rilis terbaru di GitHub (nama aset harus selalu Klip.apk) */
  K.APK_URL = 'https://github.com/malfain/klip-editor/releases/latest/download/Klip.apk';

  function tabbar(active) {
    var tabs = [['home', 'edit', 'Edit'], ['projects', 'grid', 'Proyek'], ['settings', 'gear', 'Pengaturan']];
    return '<nav class="tabbar safe-bottom" aria-label="Navigasi utama">' + tabs.map(function (t) {
      return '<button data-tab="' + t[0] + '"' + (t[0] === active ? ' aria-current="page"' : '') + '>' + I(t[1]) + '<span>' + t[2] + '</span></button>';
    }).join('') + '</nav>';
  }
  function bindTabs(root) {
    K.$$('[data-tab]', root).forEach(function (b) {
      b.addEventListener('click', function () { if (!b.hasAttribute('aria-current')) K.go(b.dataset.tab); });
    });
  }

  function projMeta(p) {
    if (p.type === 'photo') {
      var m = K.media.get(p.mediaId);
      return (m ? m.width + '×' + m.height + ' · ' : '') + K.fmtAgo(p.updated);
    }
    var dur = (p.clips || []).reduce(function (s, c) { return s + (c.end - c.start) / c.speed; }, 0);
    return K.fmtTime(dur) + ' · ' + (p.clips || []).length + ' klip · ' + K.fmtAgo(p.updated);
  }

  function projRow(p) {
    var th = p.thumb ? ' style="background-image:url(' + p.thumb + ')"' : '';
    return '<div class="proj">' +
      '<button class="proj-open" data-open="' + p.id + '"><span class="thumb"' + th + '><span class="kind">' + (p.type === 'photo' ? 'FOTO' : 'VIDEO') + '</span></span>' +
      '<span class="proj-meta"><b>' + K.esc(p.name) + '</b><span>' + K.esc(projMeta(p)) + '</span></span></button>' +
      '<button class="icon-btn muted" aria-label="Opsi proyek ' + K.esc(p.name) + '" data-more="' + p.id + '" style="color:var(--muted-foreground)">' + I('more') + '</button></div>';
  }

  function bindProjects(root, list, rerender) {
    K.$$('[data-open]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var p = list.filter(function (x) { return x.id === b.dataset.open; })[0];
        if (p) K.openProject(p);
      });
    });
    K.$$('[data-more]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var p = list.filter(function (x) { return x.id === b.dataset.more; })[0];
        if (!p) return;
        K.actions(p.name, [
          { label: 'Buka', run: function () { K.openProject(p); } },
          { label: 'Ganti nama', run: function () {
            K.prompt('Ganti nama proyek', p.name).then(function (n) {
              if (n) { p.name = n; K.projects.save(p).then(rerender); }
            });
          } },
          { label: 'Duplikat', run: function () {
            var c = JSON.parse(JSON.stringify(p)); c.id = K.uid(); c.name = p.name + ' (salinan)';
            K.projects.save(c).then(rerender);
          } },
          { label: 'Hapus proyek', danger: true, run: function () {
            K.confirm('Hapus "' + p.name + '"? Media yang tidak dipakai proyek lain juga dihapus dari perangkat ini.', 'Hapus', true).then(function (ok) {
              if (ok) K.projects.remove(p).then(function () { K.toast('Proyek dihapus'); rerender(); });
            });
          } }
        ]);
      });
    });
  }

  function loadMediaFor(list) {
    var ids = list.filter(function (p) { return p.type === 'photo'; }).map(function (p) { return p.mediaId; });
    return K.media.loadAll(ids).catch(function () { return []; });
  }

  K.screens.home = {
    mount: function (app) {
      var el = document.createElement('section');
      el.className = 'screen safe-top';
      var quick = [
        ['video', 'video', 'Edit video'], ['photo', 'photo', 'Edit foto'], ['crop', 'crop', 'Potong foto'],
        ['filter', 'filter', 'Filter foto'], ['text', 'caption', 'Teks video'], ['music', 'music', 'Musik latar'],
        ['speed', 'speed', 'Kecepatan']
      ];
      el.innerHTML =
        '<header class="home-header"><div style="display:flex;align-items:center;gap:8px"><h1 class="home-title" style="margin:0">Klip</h1><span class="badge badge-info">Pro</span></div>' +
        '<button class="icon-btn" aria-label="Pengaturan" data-go="settings">' + I('gear') + '</button></header>' +
        '<main class="home-main">' +
        '<button class="cta" data-new>' + '<span class="cta-icon">' + I('plus', 26) + '</span><span><strong>Proyek baru</strong><small>Pilih video atau foto dari galeri</small></span></button>' +
        '<section style="display:flex;flex-direction:column;gap:12px"><h2 class="section-h">Alat cepat</h2><div class="quick">' +
        quick.map(function (q) { return '<button data-quick="' + q[0] + '">' + I(q[1]) + '<span>' + q[2] + '</span></button>'; }).join('') +
        '</div></section>' +
        '<section style="display:flex;flex-direction:column;gap:12px"><div style="display:flex;align-items:center;justify-content:space-between"><h2 class="section-h">Proyek terbaru</h2>' +
        '<button class="btn-link" data-go="projects">Lihat semua</button></div><div class="recent" style="display:flex;flex-direction:column;gap:12px"></div></section>' +
        '</main>' + tabbar('home');
      app.appendChild(el);
      bindTabs(el);
      K.$$('[data-go]', el).forEach(function (b) { b.addEventListener('click', function () { K.go(b.dataset.go); }); });
      K.$('[data-new]', el).addEventListener('click', function () { K.startNew('any'); });
      K.$$('[data-quick]', el).forEach(function (b) {
        b.addEventListener('click', function () {
          var q = b.dataset.quick;
          if (q === 'video') K.startNew('video');
          else if (q === 'photo') K.startNew('photo');
          else if (q === 'crop') K.startNew('photo', { mode: 'potong' });
          else if (q === 'filter') K.startNew('photo', { mode: 'filter' });
          else K.startNew('video', { tool: q });
        });
      });
      function render() {
        K.projects.list().then(function (list) {
          return loadMediaFor(list).then(function () {
            var box = K.$('.recent', el);
            var top = list.slice(0, 4);
            box.innerHTML = top.length ? top.map(projRow).join('') :
              '<div class="empty">Belum ada proyek.<br>Ketuk <b>Proyek baru</b> untuk mulai mengedit — semua diproses di perangkat ini, tidak ada yang diunggah.</div>';
            bindProjects(box, top, render);
          });
        });
      }
      render();
      return {};
    }
  };

  K.screens.projects = {
    mount: function (app) {
      var el = document.createElement('section');
      el.className = 'screen safe-top';
      el.innerHTML = '<header class="home-header"><h1 class="home-title" style="margin:0">Proyek</h1>' +
        '<button class="icon-btn" aria-label="Proyek baru" data-new>' + I('plus') + '</button></header>' +
        '<div style="padding:0 24px 12px"><label class="sr-only" for="q">Cari proyek</label><input id="q" class="input" type="search" placeholder="Cari proyek" style="background:var(--card);border:0"></div>' +
        '<main class="home-main"><div class="seg" role="group" aria-label="Jenis"><button aria-pressed="true" data-k="all">Semua</button><button aria-pressed="false" data-k="video">Video</button><button aria-pressed="false" data-k="photo">Foto</button></div>' +
        '<div class="list" style="display:flex;flex-direction:column;gap:12px"></div></main>' + tabbar('projects');
      app.appendChild(el);
      bindTabs(el);
      K.$('[data-new]', el).addEventListener('click', function () { K.startNew('any'); });
      var kind = 'all', q = '';
      K.$$('[data-k]', el).forEach(function (b) {
        b.addEventListener('click', function () {
          kind = b.dataset.k;
          K.$$('[data-k]', el).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          render();
        });
      });
      K.$('#q', el).addEventListener('input', function (e) { q = e.target.value.toLowerCase(); render(); });
      function render() {
        K.projects.list().then(function (list) {
          return loadMediaFor(list).then(function () {
            var f = list.filter(function (p) {
              return (kind === 'all' || p.type === kind) && (!q || p.name.toLowerCase().indexOf(q) >= 0);
            });
            var box = K.$('.list', el);
            box.innerHTML = f.length ? f.map(projRow).join('') : '<div class="empty">' + (list.length ? 'Tidak ada proyek yang cocok.' : 'Belum ada proyek.') + '</div>';
            bindProjects(box, f, render);
          });
        });
      }
      render();
      return {};
    }
  };

  K.screens.settings = {
    mount: function (app) {
      var el = document.createElement('section');
      el.className = 'screen safe-top';
      var th = K.theme.get();
      var fmt = K.exporter ? K.exporter.pickMime() : null;
      el.innerHTML = '<header class="home-header"><h1 class="home-title" style="margin:0">Pengaturan</h1></header>' +
        '<main class="home-main">' +
        '<section style="display:flex;flex-direction:column;gap:10px"><h2 class="section-h" style="font-size:15px;color:var(--muted-foreground);font-weight:600">Tampilan</h2>' +
        '<div class="seg" role="group" aria-label="Tema"><button data-th="auto" aria-pressed="' + (th === 'auto') + '">Otomatis</button><button data-th="light" aria-pressed="' + (th === 'light') + '">Terang</button><button data-th="dark" aria-pressed="' + (th === 'dark') + '">Gelap</button></div></section>' +
        '<section style="display:flex;flex-direction:column;gap:10px"><h2 class="section-h" style="font-size:15px;color:var(--muted-foreground);font-weight:600">Penyimpanan</h2>' +
        '<div class="group"><div class="group-row"><span class="lbl">Terpakai<small>Proyek & media disimpan di peramban ini</small></span><span class="tnum muted" data-used>…</span></div>' +
        '<div class="group-row"><span class="lbl">Format ekspor video<small>Tergantung dukungan peramban</small></span><span class="muted">' + (fmt ? fmt.label : 'Tidak didukung') + '</span></div>' +
        '<div class="group-row"><button class="btn-link danger" data-clear style="padding:0">Hapus semua proyek</button></div></div></section>' +
        (K.isApp() ? '' :
          '<section style="display:flex;flex-direction:column;gap:10px"><h2 class="section-h" style="font-size:15px;color:var(--muted-foreground);font-weight:600">Aplikasi Android</h2>' +
          '<div class="group"><div class="group-row"><span class="lbl">Klip untuk Android<small>Bisa dipakai offline, hasil langsung tersimpan ke Galeri. Setelah mengunduh, izinkan "Instal dari sumber tidak dikenal".</small></span></div>' +
          '<div class="group-row"><a class="btn btn-primary" data-apk href="' + K.APK_URL + '" rel="noopener" style="width:100%">' + I('download', 20) + 'Unduh aplikasi Android (APK)</a></div></div></section>') +
        '<section style="display:flex;flex-direction:column;gap:10px"><h2 class="section-h" style="font-size:15px;color:var(--muted-foreground);font-weight:600">Tentang</h2>' +
        '<div class="group"><div class="group-row"><span class="lbl">Klip 1.0<small>Editor video & foto. Semua pemrosesan terjadi di perangkat Anda — tidak ada berkas yang diunggah.</small></span></div></div></section>' +
        '</main>' + tabbar('settings');
      app.appendChild(el);
      bindTabs(el);
      K.$$('[data-th]', el).forEach(function (b) {
        b.addEventListener('click', function () {
          K.theme.set(b.dataset.th);
          K.$$('[data-th]', el).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        });
      });
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(function (e) { K.$('[data-used]', el).textContent = K.fmtMB(e.usage || 0); });
      } else K.$('[data-used]', el).textContent = '—';
      K.$('[data-clear]', el).addEventListener('click', function () {
        K.confirm('Hapus semua proyek dan media dari perangkat ini? Tindakan ini tidak bisa dibatalkan.', 'Hapus semua', true).then(function (ok) {
          if (ok) K.db.clear().then(function () { K.toast('Semua proyek dihapus'); K.go('settings'); });
        });
      });
      return {};
    }
  };
})();
