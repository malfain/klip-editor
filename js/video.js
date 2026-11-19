/* Klip — editor video: pratinjau, linimasa, alat klip/teks/musik */
(function () {
  var I = K.ic;

  /* ---------- Model bantu (dipakai juga oleh ekspor) ---------- */
  K.vm = {
    clipDur: function (c) { return (c.end - c.start) / c.speed; },
    total: function (p) { return p.clips.reduce(function (s, c) { return s + K.vm.clipDur(c); }, 0); },
    offsets: function (p) {
      var o = [], acc = 0;
      p.clips.forEach(function (c) { o.push(acc); acc += K.vm.clipDur(c); });
      return o;
    },
    clipAt: function (p, t) {
      var offs = K.vm.offsets(p);
      for (var i = 0; i < p.clips.length; i++) {
        if (t < offs[i] + K.vm.clipDur(p.clips[i]) - 1e-4) return { i: i, off: offs[i], clip: p.clips[i] };
      }
      var last = p.clips.length - 1;
      return last >= 0 ? { i: last, off: offs[last], clip: p.clips[last] } : null;
    },
    aspect: function (p) {
      var m = p.clips[0] && K.media.get(p.clips[0].mediaId);
      return m ? m.width / m.height : 16 / 9;
    },
    textsAt: function (p, t) { return p.texts.filter(function (x) { return t >= x.start && t < x.start + x.dur; }); },
    textGeom: function (x, H) {
      /* ukuran & posisi relatif tinggi bingkai — sama untuk pratinjau dan ekspor */
      var fs = (x.style === 'title' ? 0.085 : 0.05) * H;
      var y = x.pos === 'atas' ? 0.12 : x.pos === 'tengah' ? 0.5 : 0.88;
      return { fs: fs, y: y };
    },
    thumbAt: function (m, s) {
      if (!m || !m.thumbs || !m.thumbs.length) return '';
      return m.thumbs[Math.min(m.thumbs.length - 1, Math.max(0, Math.floor(s / m.step)))];
    }
  };
  var VM = K.vm;

  K.screens.video = {
    mount: function (app, params) {
      var el = document.createElement('section');
      el.className = 'screen safe-top';
      el.innerHTML = '<div class="center-col"><div class="spinner" style="border-color:var(--secondary);border-top-color:var(--primary)"></div></div>';
      app.appendChild(el);
      var ed = { destroyed: false };
      K.projects.get(params.id).then(function (p) {
        if (!p) { K.toast('Proyek tidak ditemukan'); K.go('home'); return; }
        var ids = K.projects.mediaIds(p);
        return K.media.loadAll(ids).then(function () {
          if (!ed.destroyed) Object.assign(ed, editor(el, p, params));
        });
      }).catch(function (e) { K.toast(e.message); K.go('home'); });
      return { destroy: function () { ed.destroyed = true; if (ed.cleanup) ed.cleanup(); } };
    }
  };

  function editor(el, p, params) {
    var S = { t: 0, playing: false, pps: 50, sel: null, undo: [], redo: [], drag: null };
    var vid, music, raf = 0, loadedClip = -1, loadToken = 0, saveTimer = 0, lastScroll = -1;

    el.innerHTML =
      '<header class="ve-header">' +
      '<button class="icon-btn" aria-label="Tutup proyek" data-close>' + I('close') + '</button>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
      '<button class="btn btn-secondary" data-res style="font-size:13px;font-weight:500"></button>' +
      '<button class="btn btn-primary" data-export style="font-size:13px">Ekspor</button></div></header>' +
      '<section class="stage" aria-label="Pratinjau"><div class="stage-frame"><video playsinline preload="auto"></video><div class="overlays"></div></div></section>' +
      '<div class="transport"><span class="tnum" style="font-size:13px;min-width:96px"><strong data-cur style="font-weight:600">00:00</strong><span class="muted" data-tot> / 00:00</span></span>' +
      '<button class="icon-btn" aria-label="Putar" data-play style="width:48px;height:48px;border-radius:50%">' + I('play') + '</button>' +
      '<div style="display:flex;gap:2px;min-width:96px;justify-content:flex-end"><button class="icon-btn" aria-label="Urungkan" data-undo>' + I('undo') + '</button>' +
      '<button class="icon-btn" aria-label="Ulangi" data-redo>' + I('redo') + '</button>' +
      '<button class="icon-btn" aria-label="Layar penuh" data-full>' + I('full', 20) + '</button></div></div>' +
      '<section class="timeline" aria-label="Linimasa"><div class="tl-scroll"><div class="tl-inner"></div></div>' +
      '<button data-mute aria-pressed="false" style="position:absolute;left:8px;top:30px;width:52px;height:56px;border:0;border-radius:8px;background:var(--secondary);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11px;color:var(--muted-foreground);z-index:5"></button>' +
      '<div class="playhead" aria-hidden="true"></div></section>' +
      '<nav class="toolbar safe-bottom" aria-label="Alat"></nav>';

    vid = K.$('video', el);
    var frame = K.$('.stage-frame', el);
    var stage = K.$('.stage', el);
    var overlays = K.$('.overlays', el);
    var scroller = K.$('.tl-scroll', el);
    var inner = K.$('.tl-inner', el);
    var toolbar = K.$('.toolbar', el);
    var playBtn = K.$('[data-play]', el);
    music = new Audio();
    music.preload = 'auto';

    /* ---------- Simpan & riwayat ---------- */
    function snap() { return JSON.stringify({ clips: p.clips, texts: p.texts, music: p.music, muted: p.muted }); }
    function restore(s) { var o = JSON.parse(s); p.clips = o.clips; p.texts = o.texts; p.music = o.music; p.muted = o.muted; }
    function pushUndo(s) { S.undo.push(s); if (S.undo.length > 60) S.undo.shift(); S.redo = []; }
    function commit(fn) { var s = snap(); fn(); if (snap() !== s) pushUndo(s); changed(); }
    function changed() {
      var total = VM.total(p);
      if (S.t > total) S.t = Math.max(0, total - 0.01);
      if (S.sel && !findSel()) S.sel = null;
      renderAll();
      seek(S.t);
      scheduleSave();
    }
    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 500);
    }
    function save() {
      var c = p.clips[0];
      if (c) p.thumb = VM.thumbAt(K.media.get(c.mediaId), c.start);
      return K.projects.save(p);
    }
    function undo() { if (!S.undo.length) return; S.redo.push(snap()); restore(S.undo.pop()); changed(); }
    function redo() { if (!S.redo.length) return; S.undo.push(snap()); restore(S.redo.pop()); changed(); }

    function findSel() {
      if (!S.sel) return null;
      if (S.sel.type === 'clip') return p.clips.filter(function (c) { return c.id === S.sel.id; })[0] || null;
      if (S.sel.type === 'text') return p.texts.filter(function (x) { return x.id === S.sel.id; })[0] || null;
      if (S.sel.type === 'music') return p.music;
      return null;
    }
    function select(type, id) { S.sel = type ? { type: type, id: id } : null; renderTimeline(); renderTools(); }

    /* ---------- Pratinjau ---------- */
    function layoutFrame() {
      var sw = stage.clientWidth, sh = stage.clientHeight, a = VM.aspect(p);
      var w = sw, h = sw / a;
      if (h > sh) { h = sh; w = sh * a; }
      frame.style.width = Math.round(w) + 'px';
      frame.style.height = Math.round(h) + 'px';
      renderOverlays();
    }
    var overlayKey = '';
    function renderOverlays() {
      var H = frame.clientHeight;
      var active = VM.textsAt(p, S.t).filter(function (x) { return x.text.trim(); });
      var key = H + '|' + JSON.stringify(active);
      if (key === overlayKey) return;
      overlayKey = key;
      overlays.innerHTML = active.map(function (x) {
        var g = VM.textGeom(x, H);
        var tr = x.pos === 'atas' ? 'none' : x.pos === 'tengah' ? 'translateY(-50%)' : 'translateY(-100%)';
        return '<div class="overlay-text ' + x.style + '" style="top:' + (g.y * 100) + '%;transform:' + tr + '"><span style="font-size:' + g.fs.toFixed(1) + 'px">' + K.esc(x.text) + '</span></div>';
      }).join('');
    }
    function applyClipProps(c) {
      vid.style.filter = K.filters.css(K.filters.ops(c.filter, c.strength));
      vid.playbackRate = c.speed;
      vid.volume = K.clamp(c.volume, 0, 1);
      vid.muted = !!p.muted || c.volume === 0;
    }
    function ensureClip(i) {
      var c = p.clips[i];
      var url = K.media.url(c.mediaId);
      if (vid.getAttribute('src') === url) { loadedClip = i; return Promise.resolve(false); }
      loadedClip = i;
      vid.setAttribute('src', url);
      return new Promise(function (res) {
        if (vid.readyState >= 1) return res(true);
        vid.addEventListener('loadedmetadata', function h() { vid.removeEventListener('loadedmetadata', h); res(true); });
      });
    }
    function seek(t) {
      if (!p.clips.length) return;
      var total = VM.total(p);
      S.t = K.clamp(t, 0, total);
      var at = VM.clipAt(p, S.t);
      var tok = ++loadToken;
      ensureClip(at.i).then(function (fresh) {
        if (tok !== loadToken) return;
        applyClipProps(at.clip);
        var target = at.clip.start + (S.t - at.off) * at.clip.speed;
        if (fresh || Math.abs(vid.currentTime - target) > 0.02) vid.currentTime = Math.min(target, at.clip.end - 0.01);
      });
      if (p.music && !S.playing) {
        var md = K.media.get(p.music.mediaId);
        if (md && S.t < md.duration) music.currentTime = S.t;
      }
      updateClock();
      renderOverlays();
    }
    function updateClock() {
      K.$('[data-cur]', el).textContent = K.fmtTime(S.t);
      K.$('[data-tot]', el).textContent = ' / ' + K.fmtTime(VM.total(p));
    }
    function scrollToT() {
      var x = Math.round(S.t * S.pps);
      lastScroll = x;
      scroller.scrollLeft = x;
    }

    function play() {
      if (!p.clips.length) return;
      var total = VM.total(p);
      if (S.t >= total - 0.05) S.t = 0;
      S.playing = true;
      playBtn.innerHTML = I('pause'); playBtn.setAttribute('aria-label', 'Jeda');
      var at = VM.clipAt(p, S.t);
      var tok = ++loadToken;
      ensureClip(at.i).then(function () {
        if (tok !== loadToken || !S.playing) return;
        applyClipProps(at.clip);
        vid.currentTime = at.clip.start + (S.t - at.off) * at.clip.speed;
        return vid.play();
      }).then(function () { startMusic(); }).catch(function () { pause(); K.toast('Video tidak dapat diputar'); });
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    }
    function startMusic() {
      if (!p.music || !S.playing) return;
      var md = K.media.get(p.music.mediaId);
      if (!md || S.t >= md.duration) return;
      music.volume = K.clamp(p.music.volume, 0, 1);
      music.currentTime = S.t;
      music.play().catch(function () { /* diblokir */ });
    }
    function pause() {
      S.playing = false;
      loadToken++;
      cancelAnimationFrame(raf);
      vid.pause(); music.pause();
      playBtn.innerHTML = I('play'); playBtn.setAttribute('aria-label', 'Putar');
    }
    function tick() {
      if (!S.playing) return;
      var c = p.clips[loadedClip];
      if (c && !vid.seeking && vid.readyState >= 2) {
        var offs = VM.offsets(p);
        var t = offs[loadedClip] + (vid.currentTime - c.start) / c.speed;
        if (vid.currentTime >= c.end - 0.03 || vid.ended) {
          var next = loadedClip + 1;
          if (next >= p.clips.length) {
            S.t = VM.total(p); pause(); updateClock(); scrollToT(); renderOverlays(); return;
          }
          S.t = offs[next];
          var tok = ++loadToken;
          vid.pause();
          ensureClip(next).then(function () {
            if (tok !== loadToken || !S.playing) return;
            var nc = p.clips[next];
            applyClipProps(nc);
            vid.currentTime = nc.start;
            return vid.play();
          }).catch(function () { pause(); });
        } else {
          S.t = Math.max(S.t, t);
          updateClock();
          scrollToT();
          renderOverlays();
        }
      }
      raf = requestAnimationFrame(tick);
    }

    /* ---------- Linimasa ---------- */
    function rulerStep() {
      var steps = [1, 2, 5, 10, 15, 30, 60, 120];
      for (var i = 0; i < steps.length; i++) if (steps[i] * S.pps >= 70) return steps[i];
      return 300;
    }
    function renderTimeline() {
      var pad = Math.round(scroller.clientWidth / 2);
      var total = VM.total(p);
      var offs = VM.offsets(p);
      var html = '';
      /* penggaris */
      var st = rulerStep();
      html += '<div class="tl-ruler" style="left:' + pad + 'px;width:' + Math.ceil(total * S.pps) + 'px">';
      for (var r = 0; r <= total + 0.001; r += st) {
        html += '<span style="left:' + (r * S.pps) + 'px">' + K.fmtTime(r) + '</span>';
        if (r + st / 2 <= total) html += '<span style="left:' + ((r + st / 2) * S.pps) + 'px">·</span>';
      }
      html += '</div>';
      /* klip */
      var selClip = S.sel && S.sel.type === 'clip' ? S.sel.id : null;
      var selLeft = 0, selW = 0;
      /* selama menyeret tepi kiri, klip ini & berikutnya tetap di tempat (tepi mengikuti jari) */
      var dragIdx = -1, dragShift = 0;
      if (S.drag && S.drag.side === 'l') {
        p.clips.forEach(function (c, i) {
          if (c.id === S.drag.id) { dragIdx = i; dragShift = (c.start - S.drag.origStart) / c.speed * S.pps; }
        });
      }
      p.clips.forEach(function (c, i) {
        var m = K.media.get(c.mediaId);
        var left = pad + offs[i] * S.pps;
        var w = VM.clipDur(c) * S.pps;
        if (dragIdx >= 0 && i >= dragIdx) left += dragShift;
        var tileW = m ? m.step / c.speed * S.pps : 50;
        var stride = Math.max(1, Math.ceil(40 / tileW));
        var tiles = '';
        if (m) {
          var k0 = Math.floor(c.start / m.step), k1 = Math.ceil(c.end / m.step);
          for (var k = k0; k < k1; k += stride) {
            var tl = (k * m.step - c.start) / c.speed * S.pps;
            tiles += '<i style="position:absolute;left:' + tl.toFixed(1) + 'px;width:' + (tileW * stride + 1).toFixed(1) + 'px;background-image:url(' + VM.thumbAt(m, k * m.step) + ')"></i>';
          }
        }
        var sel = c.id === selClip;
        if (sel) { selLeft = left; selW = w; }
        html += '<button class="clip' + (sel ? ' sel' : '') + '" data-clip="' + c.id + '" aria-label="Klip ' + (i + 1) + ', ' + K.fmtSec(VM.clipDur(c)) + '" aria-pressed="' + sel + '" style="position:absolute;top:30px;left:' + left.toFixed(1) + 'px;width:' + Math.max(4, w - 2).toFixed(1) + 'px">' +
          '<span class="tiles" style="left:0;right:0;position:absolute">' + tiles + '</span>' +
          (w > 50 ? '<em class="dur">' + K.fmtSec(VM.clipDur(c)) + '</em>' : '') +
          (c.speed !== 1 && w > 40 ? '<em class="spd">' + String(c.speed).replace('.', ',') + '×</em>' : '') + '</button>';
      });
      if (selClip) {
        html += '<div class="handle l" data-h="l" aria-hidden="true" style="left:' + (selLeft - 14).toFixed(1) + 'px"></div>';
        html += '<div class="handle r" data-h="r" aria-hidden="true" style="left:' + (selLeft + selW - 2).toFixed(1) + 'px"></div>';
      }
      html += '<button class="add-clip" data-add aria-label="Tambah klip" style="left:' + (pad + total * S.pps + 14) + 'px">' + I('plus') + '</button>';
      /* teks */
      var rows = [], top = 96;
      var texts = p.texts.slice().sort(function (a, b) { return a.start - b.start; });
      texts.forEach(function (x) {
        var row = 0;
        while (rows[row] !== undefined && rows[row] > x.start + 0.01) row++;
        rows[row] = x.start + x.dur;
        var sel = S.sel && S.sel.type === 'text' && S.sel.id === x.id;
        html += '<button class="lane-item text' + (sel ? ' sel' : '') + '" data-text="' + x.id + '" style="top:' + (top + row * 30) + 'px;left:' + (pad + x.start * S.pps).toFixed(1) + 'px;width:' + Math.max(24, x.dur * S.pps - 2).toFixed(1) + 'px">' +
          I('text', 12) + K.esc(x.text.split('\n')[0]) + '</button>';
      });
      var mtop = top + Math.max(rows.length, p.texts.length ? 1 : 0) * 30 + (p.texts.length ? 4 : 0);
      if (p.music) {
        var md = K.media.get(p.music.mediaId);
        var mlen = Math.min(md ? md.duration : 0, total);
        var sel = S.sel && S.sel.type === 'music';
        var mw = Math.max(30, mlen * S.pps - 2);
        var bars = Math.max(4, Math.floor(mw / 4));
        var wave = '';
        if (md && md.peaks) {
          var frac = mlen / md.duration;
          for (var b = 0; b < bars; b++) {
            var pk = md.peaks[Math.min(md.peaks.length - 1, Math.floor(b / bars * frac * md.peaks.length))];
            wave += '<i style="height:' + Math.max(8, Math.round(pk * 90)) + '%"></i>';
          }
        }
        html += '<button class="lane-item music' + (sel ? ' sel' : '') + '" data-music style="top:' + mtop + 'px;left:' + pad + 'px;width:' + mw.toFixed(1) + 'px">' +
          '<span class="wave" aria-hidden="true">' + wave + '</span><b>' + K.esc(p.music.name) + '</b></button>';
        mtop += 40;
      }
      inner.style.width = (pad * 2 + total * S.pps + 70) + 'px';
      inner.style.minHeight = Math.max(210, mtop + 10) + 'px';
      inner.innerHTML = html;
      var muteBtn = K.$('[data-mute]', el);
      muteBtn.setAttribute('aria-pressed', p.muted ? 'true' : 'false');
      muteBtn.style.color = p.muted ? 'var(--primary)' : 'var(--muted-foreground)';
      muteBtn.innerHTML = I(p.muted ? 'mute' : 'volume', 16) + '<span>' + (p.muted ? 'Suara mati' : 'Bisukan') + '</span>';
      bindTimeline();
      scrollToT();
    }

    function bindTimeline() {
      K.$$('[data-clip]', inner).forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = b.dataset.clip;
          select(S.sel && S.sel.id === id ? null : 'clip', id);
        });
      });
      K.$$('[data-text]', inner).forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var x = p.texts.filter(function (o) { return o.id === b.dataset.text; })[0];
          select('text', x.id);
          if (S.t < x.start || S.t >= x.start + x.dur) { S.t = x.start + 0.01; seek(S.t); scrollToT(); }
        });
      });
      var mb = K.$('[data-music]', inner);
      if (mb) mb.addEventListener('click', function (e) { e.stopPropagation(); select('music', 'm'); });
      K.$('[data-add]', inner).addEventListener('click', function (e) { e.stopPropagation(); addClips(); });
      K.$$('[data-h]', inner).forEach(function (h) { h.addEventListener('pointerdown', startTrim); });
    }

    function startTrim(e) {
      e.preventDefault(); e.stopPropagation();
      pause();
      var c = findSel(); if (!c) return;
      var side = e.currentTarget.dataset.h;
      var m = K.media.get(c.mediaId);
      var before = snap();
      S.drag = { id: c.id, side: side, x: e.clientX, origStart: c.start, origEnd: c.end };
      var offs = VM.offsets(p), idx = p.clips.indexOf(c);
      function move(ev) {
        var ds = (ev.clientX - S.drag.x) / S.pps * c.speed;
        if (side === 'l') c.start = K.clamp(S.drag.origStart + ds, 0, c.end - 0.2);
        else c.end = K.clamp(S.drag.origEnd + ds, c.start + 0.2, m.duration);
        renderTimeline();
        var edge = side === 'l' ? offs[idx] + 0.001 : offs[idx] + VM.clipDur(c) - 0.02;
        if (side === 'l') {
          /* pratinjau bingkai tepi kiri */
          ensureClip(idx).then(function () { applyClipProps(c); vid.currentTime = c.start; });
        } else {
          ensureClip(idx).then(function () { applyClipProps(c); vid.currentTime = Math.max(c.start, c.end - 0.03); });
        }
        S.t = Math.max(0, edge);
        updateClock();
      }
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        S.drag = null;
        if (snap() !== before) pushUndo(before);
        changed();
      }
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    var scrollRaf = 0;
    scroller.addEventListener('scroll', function () {
      if (Math.abs(scroller.scrollLeft - lastScroll) < 1.5) return;
      lastScroll = -1;
      if (S.playing) pause();
      cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(function () {
        S.t = K.clamp(scroller.scrollLeft / S.pps, 0, VM.total(p));
        seek(S.t);
      });
    }, { passive: true });
    inner.addEventListener('click', function (e) { if (e.target === inner) select(null); });
    scroller.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      S.pps = K.clamp(S.pps * (e.deltaY < 0 ? 1.15 : 0.87), 8, 300);
      renderTimeline();
    }, { passive: false });
    /* cubit untuk zoom */
    var pinch = null;
    scroller.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) pinch = { d: Math.abs(e.touches[0].clientX - e.touches[1].clientX), pps: S.pps };
    }, { passive: true });
    scroller.addEventListener('touchmove', function (e) {
      if (!pinch || e.touches.length !== 2) return;
      var d = Math.abs(e.touches[0].clientX - e.touches[1].clientX);
      if (pinch.d > 10) { S.pps = K.clamp(pinch.pps * d / pinch.d, 8, 300); renderTimeline(); }
    }, { passive: true });
    scroller.addEventListener('touchend', function () { pinch = null; }, { passive: true });

    /* ---------- Alat ---------- */
    function toolBtn(id, icon, label, extra) {
      return '<button class="tool' + (extra || '') + '" data-tool="' + id + '">' + I(icon) + '<span>' + label + '</span></button>';
    }
    function renderTools() {
      var html = '';
      var s = S.sel;
      if (!s) {
        html = toolBtn('editclip', 'edit', 'Edit klip') + toolBtn('add', 'plus', 'Tambah') + toolBtn('text', 'text', 'Teks') +
          toolBtn('music', 'music', 'Musik') + toolBtn('filter', 'filter', 'Filter') + toolBtn('speed', 'speed', 'Kecepatan') + toolBtn('split', 'split', 'Pisahkan');
      } else {
        html = '<button class="tool" data-tool="back" aria-label="Kembali ke alat utama" style="min-width:40px;color:var(--muted-foreground)">' + I('back', 20) + '</button>';
        if (s.type === 'clip') html += toolBtn('split', 'split', 'Pisahkan') + toolBtn('speed', 'speed', 'Kecepatan') + toolBtn('volume', 'volume', 'Volume') +
          toolBtn('filter', 'filter', 'Filter') + toolBtn('dup', 'copy', 'Duplikat') + toolBtn('left', 'back', 'Geser kiri') + toolBtn('right', 'redo', 'Geser kanan') + toolBtn('del', 'trash', 'Hapus', ' danger');
        else if (s.type === 'text') html += toolBtn('edittext', 'edit', 'Edit teks') + toolBtn('dup', 'copy', 'Duplikat') + toolBtn('del', 'trash', 'Hapus', ' danger');
        else html += toolBtn('mvol', 'volume', 'Volume') + toolBtn('mreplace', 'music', 'Ganti') + toolBtn('del', 'trash', 'Hapus', ' danger');
      }
      toolbar.innerHTML = html;
      K.$$('[data-tool]', toolbar).forEach(function (b) { b.addEventListener('click', function () { runTool(b.dataset.tool); }); });
      K.$('[data-undo]', el).disabled = !S.undo.length;
      K.$('[data-redo]', el).disabled = !S.redo.length;
    }
    function selectClipAtPlayhead() {
      var at = VM.clipAt(p, S.t);
      if (at) select('clip', at.clip.id);
      return at && at.clip;
    }
    function runTool(id) {
      pause();
      var c;
      switch (id) {
        case 'back': select(null); break;
        case 'editclip': selectClipAtPlayhead(); break;
        case 'add': addClips(); break;
        case 'text': addText(); break;
        case 'music': if (p.music) select('music', 'm'); else pickMusic(); break;
        case 'filter': c = S.sel && S.sel.type === 'clip' ? findSel() : selectClipAtPlayhead(); if (c) filterSheet(c); break;
        case 'speed': c = S.sel && S.sel.type === 'clip' ? findSel() : selectClipAtPlayhead(); if (c) speedSheet(c); break;
        case 'volume': volumeSheet(findSel()); break;
        case 'split': split(); break;
        case 'dup': duplicate(); break;
        case 'left': case 'right': moveClip(id === 'left' ? -1 : 1); break;
        case 'del': removeSel(); break;
        case 'edittext': textSheet(findSel()); break;
        case 'mvol': musicSheet(); break;
        case 'mreplace': pickMusic(); break;
      }
    }

    function split() {
      var at = VM.clipAt(p, S.t);
      if (!at) return;
      var c = at.clip;
      var s = c.start + (S.t - at.off) * c.speed;
      if (s - c.start < 0.1 || c.end - s < 0.1) { K.toast('Geser penanda ke tengah klip untuk memisahkan'); return; }
      commit(function () {
        var n = Object.assign({}, c, { id: K.uid(), start: s });
        c.end = s;
        p.clips.splice(at.i + 1, 0, n);
        S.sel = { type: 'clip', id: n.id };
      });
      renderTools();
      K.toast('Klip dipisahkan');
    }
    function duplicate() {
      var o = findSel(); if (!o) return;
      commit(function () {
        if (S.sel.type === 'clip') {
          var i = p.clips.indexOf(o);
          var n = Object.assign({}, o, { id: K.uid() });
          p.clips.splice(i + 1, 0, n); S.sel = { type: 'clip', id: n.id };
        } else if (S.sel.type === 'text') {
          var nt = Object.assign({}, o, { id: K.uid(), start: o.start + o.dur });
          p.texts.push(nt); S.sel = { type: 'text', id: nt.id };
        }
      });
      renderTools();
    }
    function moveClip(dir) {
      var o = findSel(); if (!o) return;
      var i = p.clips.indexOf(o), j = i + dir;
      if (j < 0 || j >= p.clips.length) return;
      commit(function () { p.clips.splice(i, 1); p.clips.splice(j, 0, o); });
    }
    function removeSel() {
      var s = S.sel; if (!s) return;
      if (s.type === 'clip' && p.clips.length <= 1) { K.toast('Proyek perlu minimal satu klip'); return; }
      commit(function () {
        if (s.type === 'clip') p.clips = p.clips.filter(function (c) { return c.id !== s.id; });
        else if (s.type === 'text') p.texts = p.texts.filter(function (x) { return x.id !== s.id; });
        else p.music = null;
        S.sel = null;
      });
      renderTools();
    }
    function addClips() {
      K.pickFiles('pick-video').then(function (files) {
        if (!files.length) return;
        return K.importMany(files).then(function (recs) {
          var vids = recs.filter(function (r) { return r.kind === 'video'; });
          if (!vids.length) return;
          commit(function () {
            vids.forEach(function (r) { p.clips.push({ id: K.uid(), mediaId: r.id, start: 0, end: r.duration, speed: 1, volume: 1, filter: 'asli' }); });
          });
          K.toast(vids.length + ' klip ditambahkan');
        });
      });
    }
    function pickMusic() {
      K.pickFiles('pick-audio').then(function (files) {
        if (!files.length) return;
        return K.importMany(files).then(function (recs) {
          var a = recs.filter(function (r) { return r.kind === 'audio'; })[0];
          if (!a) return;
          commit(function () { p.music = { mediaId: a.id, name: a.name, volume: p.music ? p.music.volume : 0.8 }; S.sel = { type: 'music', id: 'm' }; });
          music.src = K.media.url(a.id);
          renderTools();
        });
      });
    }
    function addText() {
      var total = VM.total(p);
      var start = S.t > total - 1 ? Math.max(0, total - 3) : S.t;
      var x = { id: K.uid(), text: '', start: start, dur: Math.min(3, Math.max(0.5, total - start)), style: 'title', pos: 'atas' };
      var before = snap();
      p.texts.push(x);
      S.sel = { type: 'text', id: x.id };
      S.t = start + 0.01;
      renderAll(); seek(S.t);
      textSheet(x, before, true);
    }

    /* ---------- Panel ---------- */
    function liveSheet(title, body, bind, before) {
      var s0 = before || snap();
      K.sheet({
        title: title, body: body,
        onOpen: function (sh) { bind(sh); },
        onClose: function () {
          /* teks kosong tidak disimpan */
          p.texts = p.texts.filter(function (x) { return x.text.trim(); });
          if (S.sel && !findSel()) S.sel = null;
          if (snap() !== s0) pushUndo(s0);
          renderAll(); seek(S.t); scheduleSave();
        }
      });
    }
    function rangeRow(id, label, min, max, step, val, fmt) {
      return '<div class="slider-row"><label for="' + id + '">' + label + '</label><input id="' + id + '" class="range" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '"><output for="' + id + '">' + fmt(val) + '</output></div>';
    }
    function bindRange(sh, id, fmt, onInput) {
      var r = K.$('#' + id, sh), o = r.nextElementSibling;
      K.setFill(r);
      r.addEventListener('input', function () { K.setFill(r); o.textContent = fmt(+r.value); onInput(+r.value); });
      return r;
    }
    function speedSheet(c) {
      var fmt = function (v) { return String(Math.round(v * 100) / 100).replace('.', ',') + '×'; };
      var presets = [0.5, 1, 1.5, 2, 3];
      liveSheet('Kecepatan',
        rangeRow('spd', 'Kecepatan', 0.25, 4, 0.05, c.speed, fmt) +
        '<div class="pad"><div class="seg" role="group" aria-label="Preset kecepatan">' + presets.map(function (v) { return '<button data-v="' + v + '" aria-pressed="' + (c.speed === v) + '">' + fmt(v) + '</button>'; }).join('') + '</div></div>' +
        '<p class="muted pad" style="margin:0;font-size:12px" data-info></p>',
        function (sh) {
          var info = K.$('[data-info]', sh);
          function upd() { info.textContent = 'Durasi klip: ' + K.fmtSec(VM.clipDur(c)); renderTimeline(); updateClock(); }
          var r = bindRange(sh, 'spd', fmt, function (v) { c.speed = v; syncSeg(); upd(); });
          function syncSeg() { K.$$('[data-v]', sh).forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.v === c.speed)); }); }
          K.$$('[data-v]', sh).forEach(function (b) {
            b.addEventListener('click', function () { c.speed = +b.dataset.v; r.value = c.speed; r.dispatchEvent(new Event('input')); });
          });
          upd();
        });
    }
    function volumeSheet(c) {
      var fmt = function (v) { return Math.round(v) + '%'; };
      liveSheet('Volume klip', rangeRow('vol', 'Volume', 0, 100, 1, Math.round(c.volume * 100), fmt) +
        '<p class="muted pad" style="margin:0;font-size:12px">' + (p.muted ? 'Semua suara asli sedang dibisukan — ketuk "Suara mati" di linimasa untuk menyalakan.' : '0% membisukan klip ini saja.') + '</p>',
        function (sh) { bindRange(sh, 'vol', fmt, function (v) { c.volume = v / 100; applyClipProps(c); }); });
    }
    function filterSheet(c) {
      var m = K.media.get(c.mediaId);
      var th = VM.thumbAt(m, c.start);
      var fmt = function (v) { return Math.round(v); };
      liveSheet('Filter',
        rangeRow('fst', 'Kekuatan', 0, 100, 1, c.strength == null ? 100 : c.strength, fmt) +
        '<div class="chips">' + K.filters.PRESETS.map(function (f) {
          return '<button class="chip-filter" data-f="' + f.id + '" aria-pressed="' + (c.filter === f.id) + '"><i style="background-image:url(' + th + ');filter:' + K.filters.css(K.filters.ops(f.id, 100)) + '"></i><span>' + f.name + '</span></button>';
        }).join('') + '</div>' +
        '<div class="pad"><button class="btn btn-secondary" data-all style="width:100%">Terapkan ke semua klip</button></div>',
        function (sh) {
          bindRange(sh, 'fst', fmt, function (v) { c.strength = v; applyClipProps(c); });
          K.$$('[data-f]', sh).forEach(function (b) {
            b.addEventListener('click', function () {
              c.filter = b.dataset.f; applyClipProps(c);
              K.$$('[data-f]', sh).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
            });
          });
          K.$('[data-all]', sh).addEventListener('click', function () {
            p.clips.forEach(function (o) { o.filter = c.filter; o.strength = c.strength; });
            K.toast('Filter diterapkan ke ' + p.clips.length + ' klip');
          });
        });
    }
    function textSheet(x, before, isNew) {
      var total = VM.total(p);
      var fmt = function (v) { return String(Math.round(v * 10) / 10).replace('.', ',') + ' dtk'; };
      var seg = function (name, opts, cur) {
        return '<div class="seg" role="group" aria-label="' + name + '">' + opts.map(function (o) { return '<button data-' + name + '="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
      };
      liveSheet(isNew ? 'Tambah teks' : 'Edit teks',
        '<div class="field"><label for="tx" class="sr-only">Isi teks</label><textarea id="tx" class="input" maxlength="140" placeholder="Ketik teks…" autofocus></textarea></div>' +
        '<div class="field"><span>Gaya</span>' + seg('st', [['title', 'Judul'], ['caption', 'Keterangan']], x.style) + '</div>' +
        '<div class="field"><span>Posisi</span>' + seg('pos', [['atas', 'Atas'], ['tengah', 'Tengah'], ['bawah', 'Bawah']], x.pos) + '</div>' +
        rangeRow('tdur', 'Durasi', 0.5, Math.max(0.5, Math.min(20, total - x.start)), 0.1, x.dur, fmt),
        function (sh) {
          var ta = K.$('#tx', sh); ta.value = x.text;
          ta.addEventListener('input', function () { x.text = ta.value; renderOverlays(); renderTimeline(); });
          ['st', 'pos'].forEach(function (k) {
            K.$$('[data-' + k + ']', sh).forEach(function (b) {
              b.addEventListener('click', function () {
                if (k === 'st') x.style = b.dataset.st; else x.pos = b.dataset.pos;
                K.$$('[data-' + k + ']', sh).forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
                renderOverlays();
              });
            });
          });
          bindRange(sh, 'tdur', fmt, function (v) { x.dur = v; renderTimeline(); });
        }, before);
    }
    function musicSheet() {
      var fmt = function (v) { return Math.round(v) + '%'; };
      liveSheet('Musik latar', rangeRow('mv', 'Volume', 0, 100, 1, Math.round(p.music.volume * 100), fmt) +
        '<p class="muted pad" style="margin:0;font-size:12px">' + K.esc(p.music.name) + ' — diputar dari awal video dan berhenti di akhir.</p>',
        function (sh) { bindRange(sh, 'mv', fmt, function (v) { p.music.volume = v / 100; music.volume = K.clamp(p.music.volume, 0, 1); }); });
    }

    /* ---------- Render & ikatan ---------- */
    function renderAll() {
      var c0 = p.clips[0];
      var m0 = c0 && K.media.get(c0.mediaId);
      K.$('[data-res]', el).textContent = (p.exportCfg ? p.exportCfg.res : '1080p') + ' · ' + (p.exportCfg ? p.exportCfg.fps : '30') + ' fps';
      layoutFrame();
      renderTimeline();
      renderTools();
      updateClock();
      if (!m0) frame.style.background = '#000';
    }

    K.$('[data-close]', el).addEventListener('click', function () { save().then(function () { K.go('home'); }); });
    K.$('[data-export]', el).addEventListener('click', function () { pause(); save().then(function () { K.go('export', { id: p.id }); }); });
    K.$('[data-res]', el).addEventListener('click', function () { pause(); save().then(function () { K.go('export', { id: p.id }); }); });
    playBtn.addEventListener('click', function () { if (S.playing) pause(); else play(); });
    K.$('[data-undo]', el).addEventListener('click', function () { pause(); undo(); });
    K.$('[data-redo]', el).addEventListener('click', function () { pause(); redo(); });
    K.$('[data-full]', el).addEventListener('click', function () {
      if (frame.requestFullscreen) frame.requestFullscreen().catch(function () {});
      else if (vid.webkitEnterFullscreen) vid.webkitEnterFullscreen();
    });
    K.$('[data-mute]', el).addEventListener('click', function () {
      commit(function () { p.muted = !p.muted; });
      K.toast(p.muted ? 'Suara asli dibisukan' : 'Suara asli dinyalakan');
    });
    vid.addEventListener('click', function () { if (S.playing) pause(); else play(); });
    function onKey(e) {
      if (e.target.closest && e.target.closest('input,textarea,.sheet')) return;
      if (e.code === 'Space') { e.preventDefault(); if (S.playing) pause(); else play(); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); pause(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); removeSel(); }
    }
    document.addEventListener('keydown', onKey);
    function onResize() { layoutFrame(); renderTimeline(); }
    window.addEventListener('resize', onResize);
    function onHide() { if (document.hidden) { pause(); save(); } }
    document.addEventListener('visibilitychange', onHide);

    if (p.music) music.src = K.media.url(p.music.mediaId);
    renderAll();
    seek(0);

    if (params.tool === 'text') addText();
    else if (params.tool === 'music') pickMusic();
    else if (params.tool === 'speed') { var c0 = selectClipAtPlayhead(); if (c0) speedSheet(c0); }

    return {
      cleanup: function () {
        pause();
        clearTimeout(saveTimer); save();
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onHide);
        vid.removeAttribute('src'); vid.load();
        music.removeAttribute('src');
      }
    };
  }
})();
