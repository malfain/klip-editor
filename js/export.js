/* Klip — ekspor video (canvas + MediaRecorder) & layar Ekspor */
(function () {
  var I = K.ic, VM = K.vm;

  var RES = { '480p': 480, '720p': 720, '1080p': 1080, '2K': 1440, '4K': 2160 };
  var BASE_MBPS = { '480p': 2.5, '720p': 5, '1080p': 8, '2K': 16, '4K': 35 };
  var QMUL = { rendah: 0.6, disarankan: 1, tinggi: 1.5 };

  function pickMime() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    var cands = [
      ['video/mp4;codecs=avc3.640028,mp4a.40.2', 'mp4', 'MP4 (H.264)'],
      ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4', 'MP4 (H.264)'],
      ['video/mp4;codecs=avc1,mp4a', 'mp4', 'MP4 (H.264)'],
      ['video/mp4', 'mp4', 'MP4'],
      ['video/webm;codecs=vp9,opus', 'webm', 'WebM (VP9)'],
      ['video/webm;codecs=vp8,opus', 'webm', 'WebM (VP8)'],
      ['video/webm', 'webm', 'WebM']
    ];
    for (var i = 0; i < cands.length; i++) {
      try { if (MediaRecorder.isTypeSupported(cands[i][0])) return { mime: cands[i][0], ext: cands[i][1], label: cands[i][2] }; } catch (e) { /* lanjut */ }
    }
    return null;
  }

  function outSize(p, res) {
    var a = VM.aspect(p), base = RES[res];
    var w, h;
    if (a >= 1) { h = base; w = base * a; } else { w = base; h = base / a; }
    return { w: Math.round(w / 2) * 2, h: Math.round(h / 2) * 2 };
  }
  function bitrate(cfg) { return BASE_MBPS[cfg.res] * (Number(cfg.fps) / 30) * QMUL[cfg.quality] * 1e6; }
  function estimateBytes(p, cfg) {
    var audio = cfg.audio ? 128000 : 0;
    return (bitrate(cfg) + audio) / 8 * VM.total(p);
  }

  function waitEv(el, ev) {
    return new Promise(function (res, rej) {
      function ok() { el.removeEventListener(ev, ok); el.removeEventListener('error', bad); res(); }
      function bad() { el.removeEventListener(ev, ok); el.removeEventListener('error', bad); rej(new Error('Media gagal dimuat')); }
      el.addEventListener(ev, ok); el.addEventListener('error', bad);
    });
  }

  function drawText(ctx, x, W, H) {
    var g = VM.textGeom(x, H);
    var fam = getComputedStyle(document.documentElement).getPropertyValue('--font-heading') || 'sans-serif';
    ctx.font = (x.style === 'title' ? '700 ' : '400 ') + g.fs + 'px ' + fam;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var lines = x.text.split('\n');
    var lh = g.fs * 1.15;
    var tw = Math.max.apply(null, lines.map(function (l) { return ctx.measureText(l).width; }));
    var padX = g.fs * (x.style === 'title' ? 0.45 : 0.5), padY = g.fs * 0.2;
    var bw = tw + padX * 2, bh = lines.length * lh + padY * 2;
    var cy = g.y * H;
    var top = x.pos === 'atas' ? cy : x.pos === 'tengah' ? cy - bh / 2 : cy - bh;
    var left = W / 2 - bw / 2;
    if (x.style === 'title') {
      ctx.lineWidth = Math.max(2, g.fs * 0.08);
      ctx.strokeStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = g.fs * 0.15; ctx.shadowOffsetY = g.fs * 0.05;
      ctx.strokeRect(left, top, bw, bh);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      var r = g.fs * 0.3;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(left, top, bw, bh, r); else ctx.rect(left, top, bw, bh);
      ctx.fill();
    }
    ctx.fillStyle = '#fff';
    lines.forEach(function (l, i) { ctx.fillText(l, W / 2, top + padY + lh * (i + 0.5)); });
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  }

  /* Render waktu-nyata. Kembalikan {promise, cancel} */
  function render(p, cfg, onProgress) {
    var fmt = pickMime();
    if (!fmt) return { promise: Promise.reject(new Error('Peramban ini belum mendukung ekspor video. Coba Chrome, Edge, atau Safari terbaru.')), cancel: function () {} };
    var size = outSize(p, cfg.res);
    var fps = Number(cfg.fps);
    var canvas = document.createElement('canvas');
    canvas.width = size.w; canvas.height = size.h;
    var ctx = canvas.getContext('2d');
    var total = VM.total(p);
    var cancelled = false, rafId = 0;
    var vEl = document.createElement('video');
    vEl.playsInline = true; vEl.preload = 'auto';
    var aEl = null, actx = null, vGain = null, mGain = null;
    var musicDur = p.music && K.media.get(p.music.mediaId) ? K.media.get(p.music.mediaId).duration : 0;
    var stream = canvas.captureStream(fps);
    var tracks = stream.getVideoTracks().slice();
    if (cfg.audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      var dest = actx.createMediaStreamDestination();
      vGain = actx.createGain();
      actx.createMediaElementSource(vEl).connect(vGain); vGain.connect(dest);
      if (p.music) {
        aEl = new Audio(K.media.url(p.music.mediaId));
        aEl.preload = 'auto';
        mGain = actx.createGain(); mGain.gain.value = p.music.volume;
        actx.createMediaElementSource(aEl).connect(mGain); mGain.connect(dest);
      }
      tracks = tracks.concat(dest.stream.getAudioTracks());
    } else {
      vEl.muted = true;
    }
    var rec = new MediaRecorder(new MediaStream(tracks), {
      mimeType: fmt.mime, videoBitsPerSecond: Math.round(bitrate(cfg)), audioBitsPerSecond: 128000
    });
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };

    var curClip = null, curOff = 0;
    function frame() {
      if (cancelled) return;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size.w, size.h);
      if (curClip && vEl.readyState >= 2) {
        var vw = vEl.videoWidth, vh = vEl.videoHeight;
        var s = Math.min(size.w / vw, size.h / vh);
        var dw = vw * s, dh = vh * s, dx = (size.w - dw) / 2, dy = (size.h - dh) / 2;
        K.filters.drawFiltered(ctx, size.w, size.h, K.filters.ops(curClip.filter, curClip.strength), function () {
          ctx.drawImage(vEl, dx, dy, dw, dh);
        });
        var T = curOff + (vEl.currentTime - curClip.start) / curClip.speed;
        VM.textsAt(p, T).forEach(function (x) { drawText(ctx, x, size.w, size.h); });
        onProgress(K.clamp(T / total, 0, 1));
      }
    }

    function playClip(i) {
      var c = p.clips[i];
      curClip = null;
      var url = K.media.url(c.mediaId);
      var ready = vEl.getAttribute('src') === url ? Promise.resolve() : (vEl.setAttribute('src', url), waitEv(vEl, 'loadeddata'));
      return ready.then(function () {
        vEl.currentTime = c.start;
        return waitEv(vEl, 'seeked');
      }).then(function () {
        if (cancelled) return;
        vEl.playbackRate = c.speed;
        if (vGain) vGain.gain.value = p.muted ? 0 : c.volume;
        curClip = c;
        /* mulai/lanjut merekam hanya saat bingkai klip siap — tanpa layar hitam */
        if (rec.state === 'inactive') rec.start(1000);
        else if (rec.state === 'paused') rec.resume();
        if (aEl && aEl.paused && curOff < musicDur) aEl.play().catch(function () {});
        return vEl.play().then(function () {
          return new Promise(function (res) {
            /* pakai timer (bukan rAF) agar tetap berjalan walau tab sempat tersembunyi */
            var iv = setInterval(function () {
              if (cancelled || vEl.currentTime >= c.end - 0.02 || vEl.ended) { clearInterval(iv); vEl.pause(); res(); }
            }, 15);
            vEl.addEventListener('ended', function () { clearInterval(iv); res(); }, { once: true });
          });
        });
      }).then(function () {
        if (rec.state === 'recording' && i < p.clips.length - 1) rec.pause();
        if (aEl) aEl.pause();
      });
    }

    var promise = (actx && actx.resume ? actx.resume() : Promise.resolve()).then(function () {
      rafId = setInterval(frame, Math.max(10, Math.floor(1000 / fps / 1.5)));
      var offs = VM.offsets(p);
      var i = 0;
      function next() {
        if (cancelled || i >= p.clips.length) return Promise.resolve();
        curOff = offs[i];
        if (aEl) { try { aEl.currentTime = curOff; } catch (e) { /* abaikan */ } }
        return playClip(i).then(function () { i++; return next(); });
      }
      return next();
    }).then(function () {
      return new Promise(function (res) {
        if (rec.state === 'inactive') return res();
        if (rec.state === 'paused') rec.resume();
        rec.onstop = function () { res(); };
        setTimeout(function () { if (rec.state !== 'inactive') rec.stop(); else res(); }, 150);
      });
    }).then(function () {
      cleanup();
      if (cancelled) throw new Error('cancelled');
      var type = fmt.mime.split(';')[0];
      return { blob: new Blob(chunks, { type: type }), ext: fmt.ext, w: size.w, h: size.h };
    }, function (e) { cleanup(); throw e; });

    function cleanup() {
      clearInterval(rafId);
      try { vEl.pause(); vEl.removeAttribute('src'); vEl.load(); } catch (e) { /* abaikan */ }
      if (aEl) { aEl.pause(); aEl.removeAttribute('src'); }
      stream.getTracks().forEach(function (t) { t.stop(); });
      if (actx && actx.close) actx.close();
    }

    return {
      promise: promise,
      cancel: function () {
        cancelled = true;
        try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { /* abaikan */ }
        vEl.pause(); if (aEl) aEl.pause();
        vEl.dispatchEvent(new Event('ended'));
      }
    };
  }

  K.exporter = { pickMime: pickMime, render: render, estimateBytes: estimateBytes, outSize: outSize };

  /* ---------- Layar Ekspor ---------- */
  K.screens['export'] = {
    mount: function (app, params) {
      var el = document.createElement('section');
      el.className = 'screen safe-top';
      app.appendChild(el);
      var st = { phase: 'setup', pct: 0, job: null, result: null, url: null, wakeLock: null };
      var p = null;

      K.projects.get(params.id).then(function (proj) {
        if (!proj) { K.go('home'); return; }
        p = proj;
        p.exportCfg = Object.assign({ res: '1080p', fps: '30', quality: 'disarankan', audio: true }, p.exportCfg || {});
        return K.media.loadAll(K.projects.mediaIds(p)).then(draw);
      }).catch(function (e) { K.toast(e.message); K.go('home'); });

      function header() {
        return '<header class="nav-header"><button class="nav-back" data-back>' + I('back') + '<span>Editor</span></button>' +
          '<span class="nav-title">Ekspor video</span><span style="width:44px"></span></header>' +
          '<section class="exp-head"><div class="exp-thumb" style="background-image:url(' + (p.thumb || '') + ')"></div>' +
          '<div style="display:flex;flex-direction:column;gap:4px;min-width:0"><span style="font-size:16px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + K.esc(p.name) + '</span>' +
          '<span class="muted tnum" style="font-size:13px">Durasi ' + K.fmtTime(VM.total(p)) + ' · ' + sizeLabel() + '</span></div></section>';
      }
      function sizeLabel() { var s = outSize(p, p.exportCfg.res); return s.w + '×' + s.h; }
      function group(key, label, hint, opts) {
        return '<fieldset><legend><span>' + label + '</span><span>' + hint + '</span></legend><div class="seg">' +
          opts.map(function (o) { return '<button data-k="' + key + '" data-v="' + o[0] + '" aria-pressed="' + (p.exportCfg[key] === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div></fieldset>';
      }

      function draw() {
        var cfg = p.exportCfg;
        var fmt = pickMime();
        var html = header();
        if (st.phase === 'setup') {
          html += '<main class="exp-main">' +
            group('res', 'Resolusi', cfg.res === '4K' || cfg.res === '2K' ? 'Butuh waktu & memori lebih' : 'Disarankan 1080p', [['480p', '480p'], ['720p', '720p'], ['1080p', '1080p'], ['2K', '2K'], ['4K', '4K']]) +
            group('fps', 'Frame rate', 'fps', [['24', '24'], ['25', '25'], ['30', '30'], ['50', '50'], ['60', '60']]) +
            group('quality', 'Kualitas', 'Bitrate', [['rendah', 'Rendah'], ['disarankan', 'Disarankan'], ['tinggi', 'Tinggi']]) +
            '<div class="group"><div class="group-row"><label for="sw-audio">Sertakan audio<small>Suara klip dan musik latar</small></label>' +
            '<span class="switch"><input id="sw-audio" type="checkbox"' + (cfg.audio ? ' checked' : '') + '><span></span></span></div>' +
            '<div class="group-row"><span class="lbl">Format<small>Ekspor berjalan waktu-nyata — biarkan layar tetap menyala</small></span><span class="muted" style="white-space:nowrap">' + (fmt ? fmt.label : 'Tidak didukung') + '</span></div></div>' +
            '</main><footer class="exp-foot safe-bottom"><div style="display:flex;justify-content:space-between;font-size:13px" class="muted"><span>Perkiraan ukuran</span>' +
            '<span class="tnum" style="color:var(--foreground);font-weight:600">± ' + K.fmtMB(estimateBytes(p, cfg)) + '</span></div>' +
            '<button class="btn btn-primary btn-lg" data-start style="width:100%"' + (fmt ? '' : ' disabled') + '>Ekspor ' + cfg.res + '</button></footer>';
        } else if (st.phase === 'running') {
          html += '<main class="center-col"><span class="big-pct" data-pct>' + Math.round(st.pct * 100) + '%</span>' +
            '<div class="progress" role="progressbar" aria-label="Progres ekspor" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(st.pct * 100) + '"><span data-bar style="width:' + (st.pct * 100) + '%"></span></div>' +
            '<span class="muted" style="font-size:14px">Mengekspor ' + cfg.res + ' · ' + cfg.fps + ' fps. Jangan tutup aplikasi, pindah tab, atau kunci layar.</span></main>' +
            '<footer class="safe-bottom" style="padding:12px 24px"><button class="btn btn-outline btn-lg" data-cancel style="width:100%">Batalkan ekspor</button></footer>';
        } else {
          var r = st.result;
          html += '<main class="center-col" style="gap:12px"><video class="done-video" controls playsinline src="' + st.url + '"></video>' +
            '<span role="status" style="font-family:var(--font-heading);font-size:22px;font-weight:600;display:flex;align-items:center;gap:8px"><span style="color:var(--success);display:flex">' + I('check') + '</span>Video siap</span>' +
            '<span class="badge badge-success">' + r.ext.toUpperCase() + ' · ' + r.w + '×' + r.h + ' · ' + K.fmtMB(r.blob.size) + '</span></main>' +
            '<section style="padding:0 20px 14px"><h2 style="margin:0 0 12px;font-size:14px;font-weight:600" class="muted">Simpan atau bagikan</h2><div class="share-grid">' +
            '<button data-dl>' + I('download', 22) + '<span>Unduh</span></button>' +
            '<button data-share>' + I('share', 22) + '<span>Bagikan</span></button>' +
            '<button data-replay>' + I('replay', 22) + '<span>Putar</span></button></div></section>' +
            '<footer class="safe-bottom" style="display:flex;gap:10px;padding:12px 24px;border-top:1px solid var(--border)">' +
            '<button class="btn btn-secondary btn-lg" data-again style="flex:1">Ekspor lagi</button><button class="btn btn-primary btn-lg" data-done style="flex:1">Selesai</button></footer>';
        }
        el.innerHTML = html;
        bind();
      }

      function fileName() { return (p.name || 'klip').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.' + st.result.ext; }

      function bind() {
        K.$('[data-back]', el).addEventListener('click', function () { if (st.job) st.job.cancel(); K.go('video', { id: p.id }); });
        K.$$('[data-k]', el).forEach(function (b) {
          b.addEventListener('click', function () { p.exportCfg[b.dataset.k] = b.dataset.v; K.projects.save(p); draw(); });
        });
        var sw = K.$('#sw-audio', el);
        if (sw) sw.addEventListener('change', function () { p.exportCfg.audio = sw.checked; K.projects.save(p); draw(); });
        var start = K.$('[data-start]', el);
        if (start) start.addEventListener('click', run);
        var cancel = K.$('[data-cancel]', el);
        if (cancel) cancel.addEventListener('click', function () { if (st.job) st.job.cancel(); });
        var dl = K.$('[data-dl]', el);
        if (dl) dl.addEventListener('click', function () { K.download(st.result.blob, fileName()); K.toast('Mengunduh ' + fileName()); });
        var sh = K.$('[data-share]', el);
        if (sh) sh.addEventListener('click', function () {
          K.shareFile(st.result.blob, fileName()).then(function (ok) { if (!ok) { K.download(st.result.blob, fileName()); K.toast('Berbagi tidak didukung — video diunduh'); } });
        });
        var rp = K.$('[data-replay]', el);
        if (rp) rp.addEventListener('click', function () { var v = K.$('.done-video', el); v.currentTime = 0; v.play(); });
        var ag = K.$('[data-again]', el);
        if (ag) ag.addEventListener('click', function () { st.phase = 'setup'; draw(); });
        var dn = K.$('[data-done]', el);
        if (dn) dn.addEventListener('click', function () { K.go('home'); });
      }

      function run() {
        st.phase = 'running'; st.pct = 0; draw();
        if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { st.wakeLock = w; }, function () {});
        st.job = render(p, p.exportCfg, function (f) {
          st.pct = f;
          var pc = K.$('[data-pct]', el), bar = K.$('[data-bar]', el);
          if (pc) pc.textContent = Math.round(f * 100) + '%';
          if (bar) { bar.style.width = (f * 100) + '%'; bar.parentNode.setAttribute('aria-valuenow', Math.round(f * 100)); }
        });
        st.job.promise.then(function (r) {
          st.job = null; releaseWake();
          if (st.url) URL.revokeObjectURL(st.url);
          st.result = r; st.url = URL.createObjectURL(r.blob); st.phase = 'done'; draw();
        }, function (e) {
          st.job = null; releaseWake();
          st.phase = 'setup'; draw();
          if (e.message !== 'cancelled') K.toast(e.message || 'Ekspor gagal'); else K.toast('Ekspor dibatalkan');
        });
      }
      function releaseWake() { if (st.wakeLock) { st.wakeLock.release().catch(function () {}); st.wakeLock = null; } }

      return {
        destroy: function () {
          if (st.job) st.job.cancel();
          releaseWake();
          if (st.url) setTimeout(function () { URL.revokeObjectURL(st.url); }, 1000);
        }
      };
    }
  };
})();
