// Audio fayllar IndexedDB'da, spektakl tuzilmasi localStorage'da saqlanadi.
window.AZStore = (() => {
  const DB_NAME = 'az_arena';
  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('audio'); r.result.createObjectStore('kv'); };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return dbp;
  }

  async function tx(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
    });
  }

  const putAudio = (key, blob) => tx('audio', 'readwrite', (s) => s.put(blob, key));
  const getAudio = (key) => tx('audio', 'readonly', (s) => s.get(key));
  const delAudio = (key) => tx('audio', 'readwrite', (s) => s.delete(key));
  const allAudioKeys = () => tx('audio', 'readonly', (s) => s.getAllKeys());
  const kvSet = (key, v) => tx('kv', 'readwrite', (s) => s.put(v, key));
  const kvGet = (key) => tx('kv', 'readonly', (s) => s.get(key));

  const SHOW_KEY = 'az_show_v1';
  function loadShow() {
    try { return JSON.parse(localStorage.getItem(SHOW_KEY)); } catch (_) { return null; }
  }
  let saveT = null;
  function saveShow(show) {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try { localStorage.setItem(SHOW_KEY, JSON.stringify(show)); } catch (e) { console.warn(e); }
    }, 150);
  }

  return { putAudio, getAudio, delAudio, allAudioKeys, kvSet, kvGet, loadShow, saveShow };
})();
