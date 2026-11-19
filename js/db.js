/* Klip — penyimpanan IndexedDB: media (blob) & proyek */
K.db = (function () {
  var dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var req = indexedDB.open('klip', 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, mode);
        var st = t.objectStore(store);
        var out = fn(st);
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }
  return {
    put: function (store, val) { return tx(store, 'readwrite', function (st) { st.put(val); }); },
    get: function (store, id) { return tx(store, 'readonly', function (st) { return st.get(id); }); },
    del: function (store, id) { return tx(store, 'readwrite', function (st) { st.delete(id); }); },
    all: function (store) { return tx(store, 'readonly', function (st) { return st.getAll(); }); },
    clear: function () {
      return tx('media', 'readwrite', function (st) { st.clear(); }).then(function () {
        return tx('projects', 'readwrite', function (st) { st.clear(); });
      });
    }
  };
})();

K.projects = {
  list: function () {
    return K.db.all('projects').then(function (arr) {
      return (arr || []).sort(function (a, b) { return b.updated - a.updated; });
    });
  },
  save: function (p) { p.updated = Date.now(); return K.db.put('projects', p); },
  get: function (id) { return K.db.get('projects', id); },
  remove: function (p) {
    var ids = K.projects.mediaIds(p);
    return K.db.del('projects', p.id).then(function () {
      return K.projects.list().then(function (rest) {
        var used = {};
        rest.forEach(function (o) { K.projects.mediaIds(o).forEach(function (m) { used[m] = 1; }); });
        return Promise.all(ids.filter(function (m) { return !used[m]; }).map(function (m) {
          K.media.forget(m);
          return K.db.del('media', m);
        }));
      });
    });
  },
  mediaIds: function (p) {
    var ids = [];
    if (p.type === 'photo') ids.push(p.mediaId);
    else {
      (p.clips || []).forEach(function (c) { if (ids.indexOf(c.mediaId) < 0) ids.push(c.mediaId); });
      if (p.music) ids.push(p.music.mediaId);
    }
    return ids;
  }
};
