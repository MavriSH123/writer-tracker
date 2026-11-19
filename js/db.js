/* ============================================================
   db.js — локальное хранилище
   Основной бэкенд: IndexedDB. Резервный: localStorage
   (нужен для запуска через file:// в отдельных браузерах).
   Также: экспорт/импорт резервных копий в JSON.
   ============================================================ */
(function (global) {
  'use strict';

  var DB_NAME = 'writer-tracker';
  var DB_VERSION = 1;
  var LS_KEY = 'writer-tracker-data';
  var STORES = ['projects', 'entries', 'marathons'];

  var backend = null;      // 'indexeddb' | 'localstorage'
  var idb = null;          // открытая база IndexedDB
  var lsCache = null;      // кеш для localStorage-бэкенда

  /* ================= Инициализация ================= */

  var OPEN_TIMEOUT_MS = 2500;
  var SANITY_TIMEOUT_MS = 4000;

  function rejectAfter(ms, message) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () { reject(new Error(message)); }, ms);
    });
  }

  function init() {
    return Promise.race([
      openIDB(),
      rejectAfter(OPEN_TIMEOUT_MS, 'Хранилище IndexedDB не ответило за ' + OPEN_TIMEOUT_MS + ' мс')
    ])
      .then(function (db) {
        idb = db;
        // Проверяем, что транзакции реально выполняются (защита от «зависшего» хранилища)
        return Promise.race([
          list('projects').then(function () { return 'indexeddb'; }),
          rejectAfter(SANITY_TIMEOUT_MS, 'Транзакция IndexedDB не ответила за ' + SANITY_TIMEOUT_MS + ' мс')
        ]);
      })
      .then(function (be) {
        backend = be;
        return backend;
      })
      .catch(function () {
        backend = 'localstorage';
        lsCache = readLS();
        return backend;
      });
  }

  function openIDB() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('IndexedDB недоступен'));
        return;
      }
      var req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('entries')) {
          var st = db.createObjectStore('entries', { keyPath: 'id' });
          st.createIndex('projectId', 'projectId', { unique: false });
          st.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('marathons')) {
          db.createObjectStore('marathons', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Не удалось открыть IndexedDB')); };
      req.onblocked = function () { reject(new Error('База данных заблокирована другой вкладкой')); };
    });
  }

  function readLS() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      if (!raw) return { projects: [], entries: [], marathons: [], settings: {} };
      var data = JSON.parse(raw);
      return {
        projects: Array.isArray(data.projects) ? data.projects : [],
        entries: Array.isArray(data.entries) ? data.entries : [],
        marathons: Array.isArray(data.marathons) ? data.marathons : [],
        settings: data.settings && typeof data.settings === 'object' ? data.settings : {}
      };
    } catch (e) {
      return { projects: [], entries: [], marathons: [], settings: {} };
    }
  }

  function writeLS() {
    global.localStorage.setItem(LS_KEY, JSON.stringify(lsCache));
  }

  /* ================= Базовые операции ================= */

  function list(store) {
    if (backend === 'localstorage') {
      return Promise.resolve((lsCache[store] || []).map(clone));
    }
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(store, 'readonly');
      var req = tx.objectStore(store).getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function put(store, obj) {
    if (backend === 'localstorage') {
      var arr = lsCache[store] || (lsCache[store] = []);
      var idx = arr.findIndex(function (x) { return x.id === obj.id; });
      if (idx >= 0) arr[idx] = clone(obj); else arr.push(clone(obj));
      writeLS();
      return Promise.resolve(obj);
    }
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(store, 'readwrite');
      tx.objectStore(store).put(obj);
      tx.oncomplete = function () { resolve(obj); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function putMany(store, items) {
    var self = this;
    if (backend === 'localstorage') {
      items.forEach(function (obj) {
        var arr = lsCache[store] || (lsCache[store] = []);
        var idx = arr.findIndex(function (x) { return x.id === obj.id; });
        if (idx >= 0) arr[idx] = clone(obj); else arr.push(clone(obj));
      });
      writeLS();
      return Promise.resolve(items);
    }
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(store, 'readwrite');
      var os = tx.objectStore(store);
      items.forEach(function (obj) { os.put(obj); });
      tx.oncomplete = function () { resolve(items); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function remove(store, id) {
    if (backend === 'localstorage') {
      var arr = lsCache[store] || [];
      lsCache[store] = arr.filter(function (x) { return x.id !== id; });
      writeLS();
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(store, 'readwrite');
      tx.objectStore(store).delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function clearStore(store) {
    if (backend === 'localstorage') {
      lsCache[store] = [];
      writeLS();
      return Promise.resolve();
    }
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  /* ---------- Настройки (хранилище meta) ---------- */

  function getSettings() {
    if (backend === 'localstorage') {
      return Promise.resolve(clone(lsCache.settings || {}));
    }
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction('meta', 'readonly');
      var req = tx.objectStore('meta').get('settings');
      req.onsuccess = function () {
        resolve(req.result && req.result.value ? clone(req.result.value) : {});
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  function saveSettings(value) {
    if (backend === 'localstorage') {
      lsCache.settings = clone(value || {});
      writeLS();
      return Promise.resolve(value);
    }
    return new Promise(function (resolve, reject) {
      var tx = idb.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key: 'settings', value: value || {} });
      tx.oncomplete = function () { resolve(value); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* ================= Экспорт / импорт ================= */

  var BACKUP_FORMAT = 'writer-tracker-backup';
  var BACKUP_VERSION = 1;

  function dump() {
    return Promise.all([list('projects'), list('entries'), list('marathons'), getSettings()])
      .then(function (res) {
        return {
          format: BACKUP_FORMAT,
          version: BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          settings: res[3] || {},
          projects: res[0],
          entries: res[1],
          marathons: res[2]
        };
      });
  }

  /**
   * Проверка структуры резервной копии.
   * Возвращает { ok, errors, warnings, summary }
   */
  function validateBackup(data) {
    var errors = [];
    var warnings = [];

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      errors.push('Файл не содержит JSON-объект.');
      return { ok: false, errors: errors, warnings: warnings, summary: null };
    }

    if (data.format !== BACKUP_FORMAT) {
      errors.push('Неизвестный формат файла: ожидался «' + BACKUP_FORMAT + '».');
    }
    if (typeof data.version !== 'number') {
      warnings.push('Не указана версия формата — будет предпринята попытка чтения как версии 1.');
    } else if (data.version > BACKUP_VERSION) {
      warnings.push('Файл создан более новой версией приложения (v' + data.version + '). Некоторые данные могут быть проигнорированы.');
    }

    ['projects', 'entries', 'marathons'].forEach(function (key) {
      if (data[key] === undefined) {
        warnings.push('Раздел «' + key + '» отсутствует — будет считан пустым.');
      } else if (!Array.isArray(data[key])) {
        errors.push('Раздел «' + key + '» должен быть массивом.');
      }
    });

    if (errors.length) return { ok: false, errors: errors, warnings: warnings, summary: null };

    var projects = data.projects || [];
    var entries = data.entries || [];
    var marathons = data.marathons || [];
    var projectIds = {};

    projects.forEach(function (p, i) {
      if (!p || typeof p !== 'object') {
        errors.push('Проект #' + (i + 1) + ': неверный формат записи.');
        return;
      }
      if (!p.id) errors.push('Проект #' + (i + 1) + ': отсутствует идентификатор.');
      if (!p.name || typeof p.name !== 'string') errors.push('Проект #' + (i + 1) + ': отсутствует название.');
      if (p.id) projectIds[p.id] = true;
    });

    entries.forEach(function (e, i) {
      if (!e || typeof e !== 'object') {
        errors.push('Запись #' + (i + 1) + ': неверный формат.');
        return;
      }
      if (!e.id) errors.push('Запись #' + (i + 1) + ': отсутствует идентификатор.');
      if (!e.projectId) errors.push('Запись #' + (i + 1) + ': не указан проект.');
      else if (!projectIds[e.projectId]) warnings.push('Запись #' + (i + 1) + ': проект не найден в файле.');
      if (!isValidDate(e.date)) errors.push('Запись #' + (i + 1) + ': неверная дата «' + e.date + '».');
      if (typeof e.value !== 'number' || !isFinite(e.value)) errors.push('Запись #' + (i + 1) + ': неверное количество слов.');
      if (e.mode !== 'daily' && e.mode !== 'total') warnings.push('Запись #' + (i + 1) + ': неизвестный режим, будет использован «за день».');
    });

    marathons.forEach(function (m, i) {
      if (!m || typeof m !== 'object') {
        errors.push('Марафон #' + (i + 1) + ': неверный формат.');
        return;
      }
      if (!m.id) errors.push('Марафон #' + (i + 1) + ': отсутствует идентификатор.');
      if (!m.name) errors.push('Марафон #' + (i + 1) + ': отсутствует название.');
      if (m.start && !isValidDate(m.start)) errors.push('Марафон #' + (i + 1) + ': неверная дата начала.');
      if (m.end && !isValidDate(m.end)) errors.push('Марафон #' + (i + 1) + ': неверная дата окончания.');
    });

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      summary: {
        projects: projects.length,
        entries: entries.length,
        marathons: marathons.length,
        exportedAt: data.exportedAt || null
      }
    };
  }

  function isValidDate(iso) {
    return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !isNaN(new Date(iso).getTime());
  }

  /**
   * Применение резервной копии.
   * mode: 'replace' — полная замена; 'merge' — объединение по id (записи из файла победнее обновляют).
   */
  function restore(data, mode) {
    var v = validateBackup(data);
    if (!v.ok) return Promise.reject(new Error('Файл не прошёл проверку: ' + v.errors[0]));

    var projects = normalize(data.projects, projectDefaults);
    var entries = normalize(data.entries, entryDefaults);
    var marathons = normalize(data.marathons, marathonDefaults);
    var settings = data.settings && typeof data.settings === 'object' ? data.settings : {};

    if (mode === 'replace') {
      return Promise.all([
        clearStore('projects'), clearStore('entries'), clearStore('marathons')
      ]).then(function () {
        return Promise.all([
          putMany('projects', projects),
          putMany('entries', entries),
          putMany('marathons', marathons),
          saveSettings(settings)
        ]);
      }).then(function () {
        return { projects: projects.length, entries: entries.length, marathons: marathons.length };
      });
    }

    // merge: объединяем по id
    return Promise.all([list('projects'), list('entries'), list('marathons')]).then(function (cur) {
      var merged = [
        mergeById(cur[0], projects),
        mergeById(cur[1], entries),
        mergeById(cur[2], marathons)
      ];
      return Promise.all([
        putMany('projects', merged[0]),
        putMany('entries', merged[1]),
        putMany('marathons', merged[2])
      ]).then(function () {
        return {
          projects: merged[0].length,
          entries: merged[1].length,
          marathons: merged[2].length
        };
      });
    });
  }

  function mergeById(current, incoming) {
    var map = {};
    var out = [];
    current.forEach(function (item) {
      map[item.id] = item;
      out.push(item);
    });
    incoming.forEach(function (item) {
      if (map[item.id]) {
        var idx = out.indexOf(map[item.id]);
        out[idx] = item;
      } else {
        out.push(item);
      }
    });
    return out;
  }

  function normalize(arr, defaulter) {
    return (arr || []).map(function (item) {
      return defaulter(item);
    });
  }

  function projectDefaults(p) {
    return Object.assign({
      id: WT.utils.uuid(),
      name: 'Без названия',
      description: '',
      genre: '',
      color: '#6d5ef2',
      targetWords: 50000,
      initialVolume: 0,
      startDate: WT.utils.todayISO(),
      endDate: null,
      dailyGoal: 500,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, p || {});
  }

  function entryDefaults(e) {
    return Object.assign({
      id: WT.utils.uuid(),
      projectId: null,
      date: WT.utils.todayISO(),
      mode: 'daily',
      value: 0,
      note: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, e || {});
  }

  function marathonDefaults(m) {
    return Object.assign({
      id: WT.utils.uuid(),
      name: 'Марафон',
      projectId: null,
      start: WT.utils.todayISO(),
      end: WT.utils.addDays(WT.utils.todayISO(), 30),
      targetWords: 30000,
      note: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, m || {});
  }

  /* ================= Экспорт модуля ================= */

  global.WT = global.WT || {};
  global.WT.db = {
    init: init,
    list: list,
    put: put,
    putMany: putMany,
    remove: remove,
    clearStore: clearStore,
    getSettings: getSettings,
    saveSettings: saveSettings,
    dump: dump,
    validateBackup: validateBackup,
    restore: restore,
    projectDefaults: projectDefaults,
    entryDefaults: entryDefaults,
    marathonDefaults: marathonDefaults,
    get backend() { return backend; }
  };
})(window);