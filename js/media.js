/* Klip — impor media: video (thumbnail), gambar, audio (gelombang) */
K.media = (function () {
  var cache = {}; /* id -> {rec, url} */

  function waitEvent(el, ev, errEv) {
    return new Promise(function (res, rej) {
      function ok() { cleanup(); res(); }
      function bad() { cleanup(); rej(new Error('Media tidak dapat dibaca')); }
      function cleanup() { el.removeEventListener(ev, ok); el.removeEventListener(errEv || 'error', bad); }
      el.addEventListener(ev, ok);
      el.addEventListener(errEv || 'error', bad);
    });
  }

  function videoInfo(url, onStep) {
    var v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
    v.src = url;
    var info = {};
    return waitEvent(v, 'loadedmetadata').then(function () {
      info.duration = isFinite(v.duration) ? v.duration : 0;
      info.width = v.videoWidth || 1280; info.height = v.videoHeight || 720;
      if (!info.duration) throw new Error('Durasi video tidak terbaca');
      var step = Math.max(1, Math.ceil(info.duration / 60));
      info.step = step;
      info.thumbs = [];
      var th = 112, tw = Math.round(th * info.width / info.height);
      tw = K.clamp(tw, 60, 200);
      var c = document.createElement('canvas'); c.width = tw; c.height = th;
      var ctx = c.getContext('2d');
      var times = [];
      for (var t = 0; t < info.duration; t += step) times.push(Math.min(t + 0.05, info.duration - 0.05));
      var i = 0;
      function next() {
        if (i >= times.length) return Promise.resolve();
        v.currentTime = times[i];
        return waitEvent(v, 'seeked').then(function () {
          ctx.drawImage(v, 0, 0, tw, th);
          info.thumbs.push(c.toDataURL('image/jpeg', 0.6));
          i++;
          if (onStep) onStep(i / times.length);
          return next();
        });
      }
      return next();
    }).then(function () { v.removeAttribute('src'); v.load(); return info; });
  }

  function imageInfo(url) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var s = 160 / Math.max(img.naturalWidth, img.naturalHeight);
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res({ width: img.naturalWidth, height: img.naturalHeight, thumbs: [c.toDataURL('image/jpeg', 0.7)] });
      };
      img.onerror = function () { rej(new Error('Gambar tidak dapat dibaca')); };
      img.src = url;
    });
  }

  function audioInfo(blob) {
    var AC = window.AudioContext || window.webkitAudioContext;
    return blob.arrayBuffer().then(function (buf) {
      var ac = new AC();
      return new Promise(function (res, rej) { ac.decodeAudioData(buf, res, rej); }).then(function (ab) {
        var ch = ab.getChannelData(0), n = 200, size = Math.floor(ch.length / n), peaks = [], max = 0;
        for (var i = 0; i < n; i++) {
          var m = 0;
          for (var j = i * size; j < (i + 1) * size; j += 64) { var a = Math.abs(ch[j]); if (a > m) m = a; }
          peaks.push(m); if (m > max) max = m;
        }
        if (ac.close) ac.close();
        return { duration: ab.duration, peaks: peaks.map(function (p) { return max ? Math.round(p / max * 100) / 100 : 0; }) };
      });
    });
  }

  function importFile(file, onStep) {
    var kind = file.type.indexOf('video') === 0 ? 'video' : file.type.indexOf('image') === 0 ? 'image' : file.type.indexOf('audio') === 0 ? 'audio' : null;
    if (!kind) {
      if (/\.(mp4|mov|webm|m4v|mkv)$/i.test(file.name)) kind = 'video';
      else if (/\.(jpe?g|png|webp|gif|heic)$/i.test(file.name)) kind = 'image';
      else if (/\.(mp3|m4a|wav|aac|ogg)$/i.test(file.name)) kind = 'audio';
    }
    if (!kind) return Promise.reject(new Error('Jenis berkas tidak didukung: ' + file.name));
    var url = URL.createObjectURL(file);
    var p = kind === 'video' ? videoInfo(url, onStep) : kind === 'image' ? imageInfo(url) : audioInfo(file);
    return p.then(function (info) {
      var rec = Object.assign({ id: K.uid(), kind: kind, name: file.name, size: file.size, type: file.type, blob: file }, info);
      cache[rec.id] = { rec: rec, url: url };
      return K.db.put('media', rec).then(function () { return rec; });
    }, function (e) { URL.revokeObjectURL(url); throw e; });
  }

  function load(id) {
    if (cache[id]) return Promise.resolve(cache[id].rec);
    return K.db.get('media', id).then(function (rec) {
      if (!rec) throw new Error('Media hilang dari penyimpanan');
      cache[id] = { rec: rec, url: URL.createObjectURL(rec.blob) };
      return rec;
    });
  }

  return {
    importFile: importFile,
    load: load,
    loadAll: function (ids) { return Promise.all(ids.map(load)); },
    get: function (id) { return cache[id] ? cache[id].rec : null; },
    url: function (id) { return cache[id] ? cache[id].url : ''; },
    forget: function (id) { if (cache[id]) { URL.revokeObjectURL(cache[id].url); delete cache[id]; } }
  };
})();
