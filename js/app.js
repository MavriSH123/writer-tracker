/* ============================================================
   app.js — инициализация, состояние, действия, обработчики событий
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.WT.utils;
  var DB = global.WT.db;
  var UI = global.WT.ui;
  var S = global.WT.stats;

  /* ================= Состояние ================= */

  var state = {
    projects: [],
    entries: [],
    marathons: [],
    settings: { theme: 'system' },
    page: 'dashboard',
    dashProjectId: null,
    projectsFilter: 'active',
    entriesFilter: { project: 'all', mode: 'all', search: '' },
    chartsCfg: { project: 'all', period: '30', agg: 'day' },
    calendarCfg: { project: 'all', year: new Date().getFullYear() }
  };
  global.WT.state = state;

  /* ================= Загрузка и сохранение ================= */

  function loadData() {
    return Promise.all([DB.list('projects'), DB.list('entries'), DB.list('marathons'), DB.getSettings()])
      .then(function (res) {
        state.projects = res[0] || [];
        state.entries = res[1] || [];
        state.marathons = res[2] || [];
        state.settings = Object.assign({ theme: 'system' }, res[3] || {});
      });
  }

  function refresh() {
    return loadData().then(function () {
      UI.renderAll();
    });
  }

  /* ================= Действия ================= */

  var actions = {
    saveProject: function (payload) {
      return DB.put('projects', payload).then(refresh);
    },

    deleteProject: function (id) {
      var project = UI.getProject(id);
      if (!project) return Promise.resolve();
      var entriesCount = state.entries.filter(function (e) { return e.projectId === id; }).length;

      return UI.confirmDialog({
        title: 'Удалить проект?',
        message: 'Проект «' + project.name + '» и все его записи (' + entriesCount + ' ' +
          U.plural(entriesCount, 'запись', 'записи', 'записей') + ') будут удалены без возможности восстановления. ' +
          'Рекомендуем сначала сделать резервную копию.',
        confirmText: 'Удалить навсегда',
        danger: true,
        requireText: project.name
      }).then(function (ok) {
        if (!ok) return;
        var removes = [DB.remove('projects', id)];
        state.entries.forEach(function (e) {
          if (e.projectId === id) removes.push(DB.remove('entries', e.id));
        });
        state.marathons.forEach(function (m) {
          if (m.projectId === id) {
            removes.push(DB.put('marathons', Object.assign({}, m, { projectId: null })));
          }
        });
        return Promise.all(removes).then(function () {
          if (state.dashProjectId === id) state.dashProjectId = null;
          return refresh();
        }).then(function () {
          UI.toast('Проект «' + project.name + '» удалён.', 'success');
        });
      });
    },

    setProjectStatus: function (id, status) {
      var project = UI.getProject(id);
      if (!project) return Promise.resolve();
      return DB.put('projects', Object.assign({}, project, { status: status, updatedAt: Date.now() }))
        .then(refresh)
        .then(function () {
          UI.toast(status === 'archived'
            ? 'Проект «' + project.name + '» перемещён в архив.'
            : 'Проект «' + project.name + '» снова активен.', 'success');
        });
    },

    saveEntry: function (payload, message) {
      return DB.put('entries', payload).then(refresh).then(function () {
        if (message) UI.toast(message, 'success');
      });
    },

    deleteEntry: function (id) {
      var entry = state.entries.find(function (e) { return e.id === id; });
      if (!entry) return Promise.resolve();
      return UI.confirmDialog({
        title: 'Удалить запись?',
        message: 'Запись от ' + U.fmtDate(entry.date) + ' (' + U.fmtNum(entry.value) + ' сл.) будет удалена. ' +
          'Статистика и объём рукописи пересчитаются автоматически.',
        confirmText: 'Удалить запись',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        return DB.remove('entries', id).then(refresh).then(function () {
          UI.toast('Запись удалена.', 'success');
        });
      });
    },

    saveMarathon: function (payload) {
      return DB.put('marathons', payload).then(refresh);
    },

    deleteMarathon: function (id) {
      var m = state.marathons.find(function (x) { return x.id === id; });
      if (!m) return Promise.resolve();
      return UI.confirmDialog({
        title: 'Удалить марафон?',
        message: 'Марафон «' + m.name + '» будет удалён. Записи проектов останутся нетронутыми.',
        confirmText: 'Удалить марафон',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        return DB.remove('marathons', id).then(refresh).then(function () {
          UI.toast('Марафон удалён.', 'success');
        });
      });
    },

    setTheme: function (theme) {
      state.settings.theme = theme;
      UI.applyTheme(theme);
      return DB.saveSettings(state.settings).then(function () {
        UI.renderSettings();
      });
    },

    exportBackup: function () {
      return DB.dump().then(function (data) {
        var json = JSON.stringify(data, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var stamp = U.todayISO();
        a.href = url;
        a.download = 'writer-tracker-backup-' + stamp + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        UI.toast('Резервная копия сохранена: ' + a.download, 'success', 'Экспорт завершён');
      });
    },

    importBackup: function (data, mode) {
      return DB.restore(data, mode).then(function (res) {
        return refresh().then(function () {
          UI.toast('Импортировано: проектов — ' + res.projects + ', записей — ' + res.entries +
            ', марафонов — ' + res.marathons + '.', 'success', 'Импорт завершён');
        });
      });
    },

    loadDemo: function () {
      var today = U.todayISO();
      var existing = state.projects.find(function (p) { return p.id === 'demo-1'; });
      if (existing) {
        UI.toast('Демо-данные уже загружены.', 'warning');
        return Promise.resolve();
      }
      var demoProject = DB.projectDefaults({
        id: 'demo-1',
        name: 'Демо: Хроники туманного города',
        description: 'Учебный проект с записями за последние 30 дней — можно редактировать или удалить.',
        genre: 'Фэнтези',
        color: '#6d5ef2',
        targetWords: 50000,
        initialVolume: 3200,
        startDate: U.addDays(today, -29),
        endDate: U.addDays(today, 45),
        dailyGoal: 800,
        status: 'active'
      });

      var entries = [];
      var seed = 42;
      function rnd() {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      }

      for (var i = 29; i >= 0; i--) {
        var date = U.addDays(today, -i);
        var skip = rnd() < 0.22;           // некоторые дни без записи
        if (skip) continue;
        var words = Math.round(350 + rnd() * 1100);
        if (i === 0) words = Math.round(300 + rnd() * 500);
        entries.push(DB.entryDefaults({
          id: U.uuid(),
          projectId: demoProject.id,
          date: date,
          mode: 'daily',
          value: words,
          note: i % 7 === 0 ? 'Планёрка по сюжету' : '',
          createdAt: Date.now() - i * 86400000
        }));
      }

      var marathon = DB.marathonDefaults({
        id: U.uuid(),
        name: 'Марафон «30 дней письма»',
        projectId: demoProject.id,
        start: U.addDays(today, -10),
        end: U.addDays(today, 20),
        targetWords: 25000,
        note: 'Демонстрационный марафон'
      });

      return Promise.all([
        DB.put('projects', demoProject),
        DB.putMany('entries', entries),
        DB.put('marathons', marathon)
      ]).then(refresh).then(function () {
        UI.toast('Демо-проект и записи добавлены.', 'success', 'Демо-данные готовы');
      });
    },

    wipeAll: function () {
      return UI.confirmDialog({
        title: 'Удалить все данные?',
        message: 'Будут безвозвратно удалены все проекты, записи и марафоны с этого устройства. ' +
          'Действие нельзя отменить. Рекомендуем сначала скачать резервную копию.',
        confirmText: 'Удалить всё',
        danger: true,
        requireText: 'УДАЛИТЬ'
      }).then(function (ok) {
        if (!ok) return;
        return Promise.all([
          DB.clearStore('projects'), DB.clearStore('entries'), DB.clearStore('marathons')
        ]).then(function () {
          state.dashProjectId = null;
          return refresh();
        }).then(function () {
          UI.toast('Все данные удалены.', 'success');
        });
      });
    }
  };
  global.WT.actions = actions;

  /* ================= Навигация ================= */

  var PAGE_TITLES = {
    dashboard: 'Главная',
    projects: 'Проекты',
    entries: 'Записи',
    charts: 'Графики',
    calendar: 'Календарь',
    marathons: 'Марафоны',
    settings: 'Настройки'
  };

  function navigate(page, skipHash) {
    if (!PAGE_TITLES[page]) page = 'dashboard';
    state.page = page;

    U.qsa('.page').forEach(function (section) {
      section.hidden = section.id !== 'page-' + page;
    });
    U.qsa('.nav-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-page') === page);
    });

    var title = document.getElementById('page-title');
    if (title) title.textContent = PAGE_TITLES[page];
    document.title = PAGE_TITLES[page] + ' · Писательский трекер';

    closeSidebar();
    if (!skipHash) {
      try { location.hash = '#/' + page; } catch (e) { /* file:// */ }
    }

    // Перерисовываем активную страницу (данные могли измениться)
    if (page === 'charts') UI.renderCharts();
    if (page === 'calendar') UI.renderCalendar();
    global.WT.charts.redrawAll();
  }

  function closeSidebar() {
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.hidden = true;
  }

  function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;
    var open = sidebar.classList.toggle('open');
    if (backdrop) backdrop.hidden = !open;
  }

  /* ================= Обработчики событий ================= */

  function on(id, event, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(event, fn);
    return el;
  }

  function bindEvents() {
    // Навигация
    on('main-nav', 'click', function (ev) {
      var btn = ev.target.closest('.nav-item');
      if (!btn) return;
      navigate(btn.getAttribute('data-page'));
    });

    on('menu-btn', 'click', toggleSidebar);
    on('sidebar-backdrop', 'click', closeSidebar);

    // Тема
    on('theme-btn', 'click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      actions.setTheme(current === 'dark' ? 'light' : 'dark');
      UI.toast('Тема изменена.', 'success');
    });

    // Быстрое добавление
    on('quick-add-btn', 'click', function () {
      UI.openEntryForm();
    });
    on('add-entry-btn', 'click', function () {
      UI.openEntryForm();
    });
    on('add-project-btn', 'click', function () {
      UI.openProjectForm();
    });
    on('add-marathon-btn', 'click', function () {
      UI.openMarathonForm();
    });

    // Делегирование действий в контенте
    on('content', 'click', function (ev) {
      var el = ev.target.closest('[data-action]');
      if (!el) return;
      var action = el.getAttribute('data-action');
      var id = el.getAttribute('data-id');

      switch (action) {
        case 'new-project':
          UI.openProjectForm();
          break;
        case 'edit-project':
          UI.openProjectForm(id);
          break;
        case 'archive-project':
          actions.setProjectStatus(id, 'archived');
          break;
        case 'unarchive-project':
          actions.setProjectStatus(id, 'active');
          break;
        case 'delete-project':
          actions.deleteProject(id);
          break;
        case 'new-entry':
          UI.openEntryForm({ projectId: id || undefined });
          break;
        case 'edit-entry':
          editEntry(id);
          break;
        case 'delete-entry':
          actions.deleteEntry(id);
          break;
        case 'new-marathon':
          UI.openMarathonForm();
          break;
        case 'edit-marathon':
          UI.openMarathonForm(id);
          break;
        case 'delete-marathon':
          actions.deleteMarathon(id);
          break;
      }
    });

    // Быстрая форма на главной
    on('dash-root', 'submit', function (ev) {
      var form = ev.target.closest('form[data-form="entry"]');
      if (!form) return;
      ev.preventDefault();
      handleQuickEntry(form);
    });

    on('dash-root', 'change', function (ev) {
      if (ev.target.id === 'dash-project') {
        state.dashProjectId = ev.target.value;
        UI.renderDashboard();
      }
    });

    // Фильтр проектов
    on('projects-filter', 'click', function (ev) {
      var pill = ev.target.closest('.pill');
      if (!pill) return;
      U.qsa('.pill', ev.currentTarget).forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      state.projectsFilter = pill.getAttribute('data-status');
      UI.renderProjects();
    });

    // Фильтры записей
    var entriesWrap = on('page-entries', 'change', function (ev) {
      if (ev.target.id === 'entries-project-filter') {
        state.entriesFilter.project = ev.target.value;
        UI.renderEntries();
      }
      if (ev.target.id === 'entries-mode-filter') {
        state.entriesFilter.mode = ev.target.value;
        UI.renderEntries();
      }
    });
    var searchTimer = null;
    if (entriesWrap) entriesWrap.addEventListener('input', function (ev) {
      if (ev.target.id !== 'entries-search') return;
      clearTimeout(searchTimer);
      var value = ev.target.value;
      searchTimer = setTimeout(function () {
        state.entriesFilter.search = value;
        UI.renderEntries();
      }, 220);
    });

    // Графики
    var chartsPage = on('page-charts', 'change', function (ev) {
      if (ev.target.id === 'charts-project') {
        state.chartsCfg.project = ev.target.value;
        UI.renderCharts();
      }
    });
    if (chartsPage) chartsPage.addEventListener('click', function (ev) {
      var periodBtn = ev.target.closest('#charts-period .pill');
      if (periodBtn) {
        U.qsa('#charts-period .pill').forEach(function (p) { p.classList.remove('active'); });
        periodBtn.classList.add('active');
        state.chartsCfg.period = periodBtn.getAttribute('data-period');
        UI.renderCharts();
        return;
      }
      var aggBtn = ev.target.closest('#charts-aggregation .pill');
      if (aggBtn) {
        U.qsa('#charts-aggregation .pill').forEach(function (p) { p.classList.remove('active'); });
        aggBtn.classList.add('active');
        state.chartsCfg.agg = aggBtn.getAttribute('data-agg');
        UI.renderCharts();
      }
    });

    // Календарь
    var calendarPage = on('page-calendar', 'change', function (ev) {
      if (ev.target.id === 'calendar-project') {
        state.calendarCfg.project = ev.target.value;
        UI.renderCalendar();
      }
      if (ev.target.id === 'calendar-year') {
        state.calendarCfg.year = Number(ev.target.value);
        UI.renderCalendar();
      }
    });
    if (calendarPage) { /* обработчик установлен выше */ }

    // Настройки
    on('theme-options', 'change', function (ev) {
      if (ev.target.name !== 'theme') return;
      actions.setTheme(ev.target.value);
      UI.toast('Тема оформления применена.', 'success');
    });

    on('export-btn', 'click', function () {
      actions.exportBackup();
    });

    on('demo-btn', 'click', function () {
      actions.loadDemo();
    });

    on('wipe-btn', 'click', function () {
      actions.wipeAll();
    });

    on('import-file', 'change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (file) handleImportFile(file);
      ev.target.value = '';
    });

    // Хэш-маршрутизация
    window.addEventListener('hashchange', function () {
      var page = (location.hash || '').replace('#/', '');
      if (PAGE_TITLES[page] && page !== state.page) navigate(page, true);
    });

    // Перерисовка графиков при изменении размера окна
    window.addEventListener('resize', U.debounce(function () {
      global.WT.charts.redrawAll();
    }, 180));

    // Смена системной темы (с защитой для старых браузеров)
    if (global.matchMedia) {
      var themeQuery = global.matchMedia('(prefers-color-scheme: dark)');
      var onSchemeChange = function () {
        if (state.settings.theme === 'system') UI.applyTheme('system');
      };
      if (typeof themeQuery.addEventListener === 'function') {
        themeQuery.addEventListener('change', onSchemeChange);
      } else if (typeof themeQuery.addListener === 'function') {
        themeQuery.addListener(onSchemeChange);
      }
    }
  }

  /* ---------- Быстрая запись с главной ---------- */

  function handleQuickEntry(form) {
    var projectId = form.querySelector('#entry-project').value;
    var date = form.querySelector('#entry-date').value;
    var value = Number(form.querySelector('#entry-value').value);
    var note = (form.querySelector('#entry-note') || {}).value || '';
    var modeEl = form.querySelector('#entry-mode-select');
    var mode = modeEl ? modeEl.value : 'daily';

    if (!projectId) { UI.toast('Выберите проект.', 'error'); return; }
    if (!U.isValidISO(date)) { UI.toast('Укажите корректную дату.', 'error'); return; }
    if (!isFinite(value)) { UI.toast('Введите количество слов числом.', 'error'); return; }
    if (mode === 'total' && value < 0) { UI.toast('Общий объём не может быть отрицательным.', 'error'); return; }

    var payload = DB.entryDefaults({
      id: U.uuid(),
      projectId: projectId,
      date: date,
      mode: mode,
      value: value,
      note: note.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    var project = UI.getProject(projectId);
    var others = state.entries.slice();
    var series = S.projectSeries(project, others.concat([payload]));
    var delta = series.deltas[payload.id];

    actions.saveEntry(payload, 'Запись сохранена: ' + U.fmtSigned(delta) + ' сл. за ' + U.fmtDate(date, 'medium'));
  }

  /* ---------- Импорт файла ---------- */

  function handleImportFile(file) {
    var preview = document.getElementById('import-preview');
    var reader = new FileReader();

    reader.onerror = function () {
      preview.className = 'import-preview bad';
      preview.textContent = 'Не удалось прочитать файл.';
    };

    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(reader.result);
      } catch (e) {
        preview.className = 'import-preview bad';
        preview.innerHTML = '<strong>Файл не является корректным JSON.</strong><div class="small muted">' +
          esc(e.message) + '</div>';
        UI.toast('Ошибка чтения JSON.', 'error');
        return;
      }

      var v = DB.validateBackup(data);
      if (!v.ok) {
        preview.className = 'import-preview bad';
        preview.innerHTML = '<strong>Файл не прошёл проверку:</strong><ul>' +
          v.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
        UI.toast('Структура файла некорректна.', 'error');
        return;
      }

      var mode = (document.querySelector('input[name="import-mode"]:checked') || {}).value || 'merge';
      var s = v.summary;

      preview.className = 'import-preview ok';
      preview.innerHTML =
        '<strong>Файл проверен и готов к импорту.</strong>' +
        '<ul>' +
          '<li>Проектов: ' + s.projects + '</li>' +
          '<li>Записей: ' + s.entries + '</li>' +
          '<li>Марафонов: ' + s.marathons + '</li>' +
          (s.exportedAt ? '<li>Дата экспорта: ' + esc(new Date(s.exportedAt).toLocaleString('ru-RU')) + '</li>' : '') +
        '</ul>' +
        (v.warnings.length ? '<div class="small" style="margin-bottom:10px">⚠ ' + v.warnings.map(esc).join('<br>⚠ ') + '</div>' : '') +
        '<button class="btn btn-primary btn-sm" type="button" id="import-confirm">Импортировать (' +
          (mode === 'replace' ? 'полная замена' : 'объединение') + ')</button>';

      preview.querySelector('#import-confirm').addEventListener('click', function () {
        var currentMode = (document.querySelector('input[name="import-mode"]:checked') || {}).value || 'merge';

        var guard = currentMode === 'replace'
          ? UI.confirmDialog({
              title: 'Заменить все текущие данные?',
              message: 'Все существующие проекты, записи и марафоны будут удалены и заменены данными из файла. ' +
                'Действие необратимо.',
              confirmText: 'Заменить данные',
              danger: true,
              requireText: 'ЗАМЕНИТЬ'
            })
          : UI.confirmDialog({
              title: 'Импортировать данные?',
              message: 'Данные из файла будут объединены с текущими: записи с совпадающими идентификаторами будут обновлены, ' +
                'новые — добавлены. Существующие записи не удаляются.',
              confirmText: 'Импортировать'
            });

        guard.then(function (ok) {
          if (!ok) return;
          actions.importBackup(data, currentMode).then(function () {
            preview.className = 'import-preview';
            preview.innerHTML = '<strong>Импорт успешно завершён.</strong>';
          }).catch(function (err) {
            preview.className = 'import-preview bad';
            preview.innerHTML = '<strong>Ошибка импорта:</strong> ' + esc(err.message);
            UI.toast('Ошибка импорта.', 'error');
          });
        });
      });
    };

    reader.readAsText(file);
  }

  function editEntry(id) {
    var entry = state.entries.find(function (e) { return e.id === id; });
    if (!entry) return;
    UI.openEntryForm({ entry: entry });
  }

  function esc(value) {
    return U.escapeHtml(value);
  }

  /* ================= Заполнение селекта годов ================= */

  function fillYearSelect() {
    var sel = document.getElementById('calendar-year');
    if (!sel) return;
    var current = new Date().getFullYear();
    var years = [];
    var earliest = current;
    state.projects.forEach(function (p) {
      if (p.startDate) {
        var y = Number(p.startDate.slice(0, 4));
        if (y && y < earliest) earliest = y;
      }
    });
    state.entries.forEach(function (e) {
      var y = Number(String(e.date).slice(0, 4));
      if (y && y < earliest) earliest = y;
    });
    for (var y = current; y >= earliest; y--) years.push(y);

    var value = state.calendarCfg.year;
    sel.innerHTML = years.map(function (y) {
      return '<option value="' + y + '"' + (y === value ? ' selected' : '') + '>' + y + '</option>';
    }).join('');
    if (!years.length) sel.innerHTML = '<option value="' + current + '">' + current + '</option>';
    if (years.indexOf(value) === -1) state.calendarCfg.year = years[0] || current;
  }

  /* ================= Инициализация ================= */

  function init() {
    var savedTheme = 'system';
    try {
      savedTheme = global.localStorage.getItem('writer-tracker-theme') || 'system';
    } catch (e) { /* приватный режим */ }
    UI.applyTheme(savedTheme);

    DB.init().then(function () {
      return loadData();
    }).then(function () {
      UI.applyTheme(state.settings.theme || 'system');
      fillYearSelect();
      UI.renderAll();
      bindEvents();

      // Стартовая страница из хэша
      var page = (location.hash || '').replace('#/', '');
      navigate(PAGE_TITLES[page] ? page : 'dashboard', !!page);

      if (!state.projects.length) {
        UI.toast('Создайте первый проект, чтобы начать учёт слов.', 'warning', 'Добро пожаловать!');
      }
    }).catch(function (err) {
      UI.toast('Не удалось инициализировать хранилище: ' + err.message, 'error', 'Ошибка запуска');
    });
  }

  // Пересчёт селекта годов при изменении данных
  var origRefresh = refresh;
  refresh = function () {
    return origRefresh().then(function () {
      fillYearSelect();
    });
  };
  global.WT.refresh = refresh;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);