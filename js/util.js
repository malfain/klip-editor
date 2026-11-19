/* Klip — utilitas bersama */
var K = window.K = { screens: {} };

K.$ = function (sel, root) { return (root || document).querySelector(sel); };
K.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

K.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};

K.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
K.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

K.fmtTime = function (sec) {
  sec = Math.max(0, sec || 0);
  var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
};
K.fmtSec = function (sec) { return (Math.round(sec * 10) / 10).toString().replace('.', ',') + ' dtk'; };
K.fmtMB = function (bytes) {
  var mb = bytes / 1048576;
  return mb >= 100 ? Math.round(mb) + ' MB' : (Math.round(mb * 10) / 10).toString().replace('.', ',') + ' MB';
};
K.fmtAgo = function (ts) {
  var d = (Date.now() - ts) / 1000;
  if (d < 60) return 'Baru saja';
  if (d < 3600) return Math.floor(d / 60) + ' menit lalu';
  if (d < 86400) return Math.floor(d / 3600) + ' jam lalu';
  if (d < 172800) return 'Kemarin';
  return Math.floor(d / 86400) + ' hari lalu';
};

var P = function (d, extra) {
  return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + d + '</svg>';
};
K.icons = {
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  close: P('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: P('<path d="m15 18-6-6 6-6"/>'),
  search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  photo: P('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
  video: P('<rect x="2" y="5" width="15" height="14" rx="3"/><path d="m17 10 5-3v10l-5-3"/>'),
  crop: P('<path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2"/>'),
  text: P('<path d="M5 5h14M12 5v14"/>'),
  caption: P('<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 13h4M13 13h5M6 16h8"/>'),
  music: P('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  speed: P('<path d="M12 13l4-4M4 18a9 9 0 1 1 16 0"/>'),
  volume: P('<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  mute: P('<path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/>'),
  split: P('<path d="M6 3v18M6 12h12M14 8l4 4-4 4"/>'),
  filter: P('<path d="M9 8a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM15 6a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/>'),
  adjust: P('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4"/>'),
  copy: P('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
  trash: P('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  play: '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  undo: P('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', ' width="20" height="20"'),
  redo: P('<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>', ' width="20" height="20"'),
  full: P('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  edit: P('<path d="m4 20 4-4M14.5 4.5l5 5L9 20H4v-5z"/>'),
  grid: P('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  check: P('<path d="m5 12 5 5 9-10"/>'),
  share: P('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/>'),
  download: P('<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 11l5 5 5-5M12 4v12"/>'),
  sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  contrast: P('<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/>'),
  drop: P('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
  temp: P('<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'),
  palette: P('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.5-1-1.5-1-2.5s.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5z"/><circle cx="7.5" cy="11.5" r=".5"/><circle cx="10.5" cy="7.5" r=".5"/><circle cx="15.5" cy="8.5" r=".5"/>'),
  rotate: P('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  flip: P('<path d="M12 3v18M8 7 3 12l5 5V7zM16 7l5 5-5 5V7z"/>'),
  folder: P('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  replay: P('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="m10 9 5 3-5 3z"/>')
};
K.ic = function (name, size) {
  var s = K.icons[name] || '';
  if (size) s = s.replace(/width="\d+" height="\d+"/, 'width="' + size + '" height="' + size + '"');
  return s;
};

/* Toast & loading */
K.toast = function (msg, ms) {
  var app = K.$('#app');
  var old = K.$('.toast', app); if (old) old.remove();
  var t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  app.appendChild(t);
  setTimeout(function () { t.remove(); }, ms || 2400);
};
K.loading = function (msg) {
  var el = document.createElement('div');
  el.className = 'loading';
  el.innerHTML = '<div class="spinner"></div><span></span>';
  el.querySelector('span').textContent = msg || 'Memuat…';
  K.$('#app').appendChild(el);
  return { set: function (m) { el.querySelector('span').textContent = m; }, done: function () { el.remove(); } };
};

/* Bottom sheet. opts: {title, body (html), onOpen(sheetEl, close), onClose, done:boolean} */
K.sheet = function (opts) {
  var app = K.$('#app');
  var back = document.createElement('div');
  back.className = 'sheet-backdrop';
  var sh = document.createElement('div');
  sh.className = 'sheet safe-bottom';
  sh.setAttribute('role', 'dialog');
  sh.setAttribute('aria-modal', 'true');
  sh.setAttribute('aria-label', opts.title || 'Panel');
  sh.innerHTML = (opts.title ? '<div class="sheet-head"><h2>' + K.esc(opts.title) + '</h2>' +
    '<button class="btn btn-ghost" data-close>' + (opts.doneLabel || 'Selesai') + '</button></div>' : '') +
    '<div class="sheet-body">' + (opts.body || '') + '</div>';
  app.appendChild(back); app.appendChild(sh);
  var closed = false;
  function close() {
    if (closed) return; closed = true;
    back.remove(); sh.remove();
    document.removeEventListener('keydown', onKey);
    if (opts.onClose) opts.onClose();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', close);
  K.$$('[data-close]', sh).forEach(function (b) { b.addEventListener('click', close); });
  if (opts.onOpen) opts.onOpen(sh, close);
  var f = sh.querySelector('[autofocus]'); if (f) setTimeout(function () { f.focus(); }, 50);
  return { el: sh, close: close };
};

/* Action sheet: items [{label, danger, run}] */
K.actions = function (title, items) {
  var body = '<div class="action-list">' + items.map(function (it, i) {
    return '<button data-i="' + i + '"' + (it.danger ? ' class="danger"' : '') + '>' + K.esc(it.label) + '</button>';
  }).join('') + '<button data-cancel style="font-weight:600">Batal</button></div>';
  K.sheet({
    title: null, body: (title ? '<p class="muted" style="margin:6px 16px 0;text-align:center;font-size:13px">' + K.esc(title) + '</p>' : '') + body,
    onOpen: function (sh, close) {
      K.$$('[data-i]', sh).forEach(function (b) {
        b.addEventListener('click', function () { close(); items[+b.dataset.i].run(); });
      });
      K.$('[data-cancel]', sh).addEventListener('click', close);
    }
  });
};

K.confirm = function (msg, okLabel, danger) {
  return new Promise(function (res) {
    var done = false;
    K.sheet({
      title: null,
      body: '<p style="margin:12px 24px 4px;text-align:center;font-size:15px">' + K.esc(msg) + '</p><div class="action-list">' +
        '<button data-ok' + (danger ? ' class="danger"' : '') + '>' + K.esc(okLabel || 'Lanjutkan') + '</button>' +
        '<button data-no style="font-weight:600">Batal</button></div>',
      onOpen: function (sh, close) {
        K.$('[data-ok]', sh).addEventListener('click', function () { done = true; close(); res(true); });
        K.$('[data-no]', sh).addEventListener('click', close);
      },
      onClose: function () { if (!done) res(false); }
    });
  });
};

K.prompt = function (title, value) {
  return new Promise(function (res) {
    var inp = null;
    K.sheet({
      title: title, doneLabel: 'Simpan',
      body: '<div class="field"><input class="input" maxlength="80" autofocus></div>',
      onOpen: function (sh, close) {
        inp = K.$('input', sh); inp.value = value || '';
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') close(); });
      },
      onClose: function () { res(inp && inp.value.trim() ? inp.value.trim() : null); }
    });
  });
};

K.pickFiles = function (id) {
  return new Promise(function (res) {
    var inp = document.getElementById(id);
    inp.value = '';
    inp.onchange = function () { res(Array.prototype.slice.call(inp.files || [])); };
    inp.click();
  });
};

K.download = function (blob, name) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
};

K.shareFile = function (blob, name) {
  try {
    var file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file], title: name }).then(function () { return true; }, function () { return true; });
    }
  } catch (e) { /* tidak didukung */ }
  return Promise.resolve(false);
};

K.setFill = function (range) {
  var min = +range.min, max = +range.max;
  range.style.setProperty('--fill', ((range.value - min) / (max - min) * 100) + '%');
};
