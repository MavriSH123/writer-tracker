/* ============================================================
   tests.js — автотесты логики «Писательского трекера»
   Запуск: открыть tests.html (или через headless Chrome).
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.WT.utils;
  var DB = global.WT.db;
  var S = global.WT.stats;

  var results = [];
  var current = { name: '', errors: [] };

  function begin(name) {
    current = { name: name, errors: [] };
    results.push(current);
  }

  function ok(cond, message) {
    if (!cond) current.errors.push(message || 'условие не выполнено');
  }

  function eq(actual, expected, message) {
    if (actual !== expected) {
      current.errors.push((message || 'равенство') + ': получено ' + JSON.stringify(actual) +
        ', ожидалось ' + JSON.stringify(expected));
    }
  }

  function close(actual, expected, message) {
    if (Math.abs(actual - expected) > 0.01) {
      current.errors.push((message || 'приближённое равенство') + ': получено ' + actual +
        ', ожидалось ' + expected);
    }
  }

  /* ---------- Тестовые данные ---------- */

  function makeProject(over) {
    return Object.assign({
      id: 'p1',
      name: 'Тестовый роман',
      description: 'тест',
      genre: 'Фэнтези',
      color: '#6d5ef2',
      targetWords: 10000,
      initialVolume: 1000,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      dailyGoal: 500,
      status: 'active'
    }, over || {});
  }

  function makeEntry(over) {
    return Object.assign({
      id: U.uuid(),
      projectId: 'p1',
      date: '2026-01-01',
      mode: 'daily',
      value: 0,
      note: '',
      createdAt: 1
    }, over || {});
  }

  var P1 = makeProject();
  var E1 = makeEntry({ id: 'e1', date: '2026-01-01', value: 1000, createdAt: 1 });
  var E2 = makeEntry({ id: 'e2', date: '2026-01-02', value: 500, createdAt: 2 });
  var E3 = makeEntry({ id: 'e3', date: '2026-01-04', value: 1500, createdAt: 3 });
  var E4 = makeEntry({ id: 'e4', date: '2026-01-05', mode: 'total', value: 3500, createdAt: 4 });
  var E5 = makeEntry({ id: 'e5', date: '2026-01-06', value: 1000, createdAt: 5 });
  var E6 = makeEntry({ id: 'e6', date: '2026-01-06', mode: 'total', value: 4500, createdAt: 6 });
  var ENTRIES = [E1, E2, E3, E4, E5, E6];

  /* ================= Тесты ================= */

  function testUtils() {
    begin('Утилиты: даты и форматирование');
    eq(U.addDays('2026-01-31', 1), '2026-02-01', 'addDays через границу месяца');
    eq(U.addDays('2026-12-31', 1), '2027-01-01', 'addDays через границу года');
    eq(U.daysBetween('2026-01-01', '2026-12-31'), 364, 'daysBetween в невисокосном году');
    eq(U.daysBetween('2026-01-01', '2026-01-01'), 0, 'daysBetween одного дня');
    eq(U.startOfWeekISO('2026-01-07'), '2026-01-05', 'начало недели — понедельник');
    ok(U.isValidISO('2026-02-28'), 'валидная дата');
    ok(!U.isValidISO('2026-02-30'), 'невалидная дата отклоняется');
    ok(!U.isValidISO('12.05.2026'), 'неверный формат отклоняется');
    eq(U.fmtNum(1500), '1 500', 'формат числа с разделителем');
    eq(U.fmtSigned(-250), '−250', 'формат отрицательного прироста');
    eq(U.fmtSigned(250), '+250', 'формат положительного прироста');
    eq(U.plural(1, 'день', 'дня', 'дней'), 'день', 'plural: 1');
    eq(U.plural(3, 'день', 'дня', 'дней'), 'дня', 'plural: 3');
    eq(U.plural(11, 'день', 'дня', 'дней'), 'дней', 'plural: 11');
  }

  function testSeries() {
    begin('Учёт слов: режимы, дельты, отсутствие двойного счёта');
    var s = S.projectSeries(P1, ENTRIES);

    eq(s.deltas.e1, 1000, 'дельта daily-записи');
    eq(s.deltas.e2, 500, 'дельта второй daily-записи');
    eq(s.deltas.e3, 1500, 'дельта после пропуска дня');
    eq(s.deltas.e4, -500, 'отрицательная дельта при total-записи (сокращение текста)');
    eq(s.deltas.e5, 1000, 'дельта daily перед total');
    eq(s.deltas.e6, 0, 'total-запись того же объёма даёт нулевую дельту');
    eq(s.totalWords, 4500, 'итоговый объём рукописи');
    eq(s.writtenWords, 3500, 'написано сверх начального объёма');
    eq(s.byDate['2026-01-06'].words, 1000, 'нет двойного счёта при смешении режимов');
    eq(s.byDate['2026-01-05'].words, -500, 'день с сокращением');
    eq(s.byDate['2026-01-04'].total, 4000, 'итог на конец дня 04.01');

    // Пересчёт при удалении записи
    var without = ENTRIES.filter(function (e) { return e.id !== 'e4'; });
    var s2 = S.projectSeries(P1, without);
    eq(s2.deltas.e6, -500, 'после удаления записи total-дельта пересчитывается');
    eq(s2.totalWords, 4500, 'итог после пересчёта');

    // Проект 2: пересчёт при редактировании
    var P2 = makeProject({ id: 'p2', initialVolume: 0, endDate: null });
    var c1 = makeEntry({ id: 'c1', projectId: 'p2', date: '2026-01-01', value: 300, createdAt: 1 });
    var c2 = makeEntry({ id: 'c2', projectId: 'p2', date: '2026-01-02', value: 200, createdAt: 2 });
    var c3 = makeEntry({ id: 'c3', projectId: 'p2', date: '2026-01-03', value: 100, createdAt: 3 });
    var s3 = S.projectSeries(P2, [c1, c2, c3]);
    eq(s3.totalWords, 600, 'сумма daily-записей');
    var s4 = S.projectSeries(P2, [c1, c3]);
    eq(s4.totalWords, 400, 'после удаления записи объём уменьшается');
    var s5 = S.projectSeries(P2, [c1, c2, makeEntry({ id: 'c3', projectId: 'p2', date: '2026-01-03', value: 250, createdAt: 3 })]);
    eq(s5.totalWords, 750, 'после редактирования записи объём пересчитывается');
  }

  function testSummary() {
    begin('Статистика проекта (сегодня = 06.01.2026)');
    var stats = S.forProject(P1, ENTRIES, { today: '2026-01-06' });

    eq(stats.totalWords, 4500, 'всего слов');
    eq(stats.wordsToday, 1000, 'написано сегодня');
    eq(stats.progressPercent, 45, 'прогресс цели в %');
    eq(stats.wordsRemaining, 5500, 'слов до цели');
    eq(stats.daysElapsed, 6, 'прошло дней');
    eq(stats.activeDays, 5, 'дней с активностью (words != 0)');
    eq(stats.positiveDays, 4, 'продуктивных дней');
    eq(stats.bestDay.date, '2026-01-04', 'самый продуктивный день');
    eq(stats.bestDay.words, 1500, 'слов в лучший день');
    close(stats.avgPerDay, 3500 / 6, 'среднее в день');
    close(stats.avgPerActiveDay, 3500 / 5, 'среднее за активный день');
    eq(stats.currentStreak, 1, 'текущая серия (вчера был минус)');
    eq(stats.longestStreak, 2, 'самая длинная серия');
    eq(stats.projectedEndDate, '2026-01-16', 'прогноз даты завершения');
    close(stats.requiredPace, 5500 / 360, 'необходимый темп до дедлайна');

    // Серия на другую дату
    var s2 = S.forProject(P1, ENTRIES, { today: '2026-01-02' });
    eq(s2.currentStreak, 2, 'текущая серия из двух дней');
    eq(s2.wordsRemaining, 7500, 'остаток на 02.01');
    eq(s2.progressPercent, 25, 'прогресс на 02.01');

    // Прогноз при нулевом темпе
    var idle = S.forProject(makeProject({ id: 'idle', initialVolume: 0 }), [], { today: '2026-01-10' });
    eq(idle.projectedEndDate, null, 'прогноз невозможен без записей');
    eq(idle.avgPerDay, 0, 'среднее без записей');
  }

  function testTimeline() {
    begin('Лента данных: пропуски дней, агрегация по неделям/месяцам');
    var P2 = makeProject({ id: 'p2', initialVolume: 0, endDate: null });
    var e = [
      makeEntry({ id: 'c1', projectId: 'p2', date: '2026-01-01', value: 300, createdAt: 1 }),
      makeEntry({ id: 'c2', projectId: 'p2', date: '2026-01-02', value: 200, createdAt: 2 }),
      makeEntry({ id: 'c3', projectId: 'p2', date: '2026-01-03', value: 100, createdAt: 3 })
    ];
    var tl = S.buildTimeline([P2], e, { to: '2026-01-06' });

    eq(tl.dates.length, 6, 'лента включает дни без записей');
    eq(tl.words[3], 0, 'день без записи даёт 0 слов');
    eq(tl.words[0], 300, 'первый день');
    eq(tl.totals[5], 600, 'накопленный итог');

    var weeks = S.aggregate(tl, 'week');
    var weekSum = weeks.reduce(function (a, w) { return a + w.value; }, 0);
    eq(weekSum, 600, 'сумма по неделям равна общему объёму');

    var months = S.aggregate(tl, 'month');
    eq(months.length, 1, 'один месяц в периоде');
    eq(months[0].value, 600, 'сумма за месяц');

    var days = S.aggregate(tl, 'day');
    eq(days.length, 6, 'агрегация по дням');
    eq(days[0].label, '01.01', 'подпись дня');
  }

  function testMarathon() {
    begin('Марафоны: прогресс, остаток, темп');
    var P2 = makeProject({ id: 'p2', initialVolume: 0, endDate: null });
    var e = [
      makeEntry({ id: 'c1', projectId: 'p2', date: '2026-01-01', value: 300, createdAt: 1 }),
      makeEntry({ id: 'c2', projectId: 'p2', date: '2026-01-02', value: 200, createdAt: 2 }),
      makeEntry({ id: 'c3', projectId: 'p2', date: '2026-01-03', value: 100, createdAt: 3 })
    ];
    var m = {
      id: 'm1', name: 'Тест-марафон', projectId: 'p2',
      start: '2026-01-01', end: '2026-01-10', targetWords: 3000
    };
    var prog = S.marathonProgress(m, P2, e, { today: '2026-01-06' });

    eq(prog.written, 600, 'написано в окне марафона');
    eq(prog.remaining, 2400, 'осталось слов');
    eq(prog.totalDays, 10, 'длительность марафона');
    eq(prog.daysPassed, 6, 'дней прошло');
    eq(prog.daysLeft, 5, 'дней осталось');
    close(prog.avgPerDay, 100, 'средний темп');
    close(prog.requiredPace, 2400 / 5, 'необходимый темп');
    ok(!prog.isFinished, 'марафон ещё идёт');

    // Слова вне окна не учитываются
    var e2 = e.concat([makeEntry({ id: 'c9', projectId: 'p2', date: '2026-01-11', value: 999, createdAt: 9 })]);
    var prog2 = S.marathonProgress(m, P2, e2, { today: '2026-01-12' });
    eq(prog2.written, 600, 'записи после окончания не считаются');
    ok(prog2.isFinished, 'марафон завершён');
    eq(prog2.requiredPace, null, 'темп не нужен после финиша');
  }

  /* ---------- База данных ---------- */

  function testDb() {
    begin('Хранилище: CRUD, экспорт, импорт, валидация');

    return Promise.resolve()
      .then(function () {
        return Promise.all([
          DB.clearStore('projects'), DB.clearStore('entries'), DB.clearStore('marathons')
        ]);
      })
      .then(function () {
        return DB.put('projects', makeProject({ id: 'tp1', name: 'Проект из теста' }));
      })
      .then(function () {
        return DB.putMany('entries', [
          makeEntry({ id: 'te1', projectId: 'tp1', date: '2026-01-01', value: 100 }),
          makeEntry({ id: 'te2', projectId: 'tp1', date: '2026-01-02', value: 200 })
        ]);
      })
      .then(function () {
        return DB.list('projects');
      })
      .then(function (projects) {
        eq(projects.length, 1, 'проект сохранён');
        eq(projects[0].name, 'Проект из теста', 'название проекта');
        return DB.list('entries');
      })
      .then(function (entries) {
        eq(entries.length, 2, 'записи сохранены');
        return DB.remove('entries', 'te2');
      })
      .then(function () {
        return DB.list('entries');
      })
      .then(function (entries) {
        eq(entries.length, 1, 'запись удалена');
        return DB.dump();
      })
      .then(function (dump) {
        eq(dump.format, 'writer-tracker-backup', 'формат резервной копии');
        ok(Array.isArray(dump.projects) && Array.isArray(dump.entries), 'разделы копии');

        var v = DB.validateBackup(dump);
        ok(v.ok, 'корректная копия проходит проверку');
        eq(v.summary.projects, 1, 'сводка: проекты');

        var bad = DB.validateBackup({ hello: 'world' });
        ok(!bad.ok, 'чужой файл отклоняется');
        ok(bad.errors.length > 0, 'ошибки перечисляются');

        var broken = {
          format: 'writer-tracker-backup', version: 1,
          projects: [{ id: 'x', name: 'X' }],
          entries: [{ id: 'e', projectId: 'x', date: '2026-13-45', value: 'много' }]
        };
        var vb = DB.validateBackup(broken);
        ok(!vb.ok, 'запись с неверной датой отклоняется');
        ok(vb.errors.some(function (m) { return m.indexOf('дата') !== -1; }), 'указана проблема с датой');

        var orphan = {
          format: 'writer-tracker-backup', version: 1,
          projects: [],
          entries: [{ id: 'o', projectId: 'nope', date: '2026-01-01', value: 10, mode: 'daily' }]
        };
        var vo = DB.validateBackup(orphan);
        ok(vo.ok, 'запись без проекта — предупреждение, не ошибка');
        ok(vo.warnings.length > 0, 'предупреждение присутствует');

        return DB.restore(dump, 'replace');
      })
      .then(function (res) {
        eq(res.entries, 1, 'импорт с заменой: записей');
        return DB.dump();
      })
      .then(function (dump2) {
        return DB.restore(dump2, 'merge').then(function () {
          return DB.list('projects');
        });
      })
      .then(function (projects) {
        eq(projects.length, 1, 'повторный импорт не создаёт дубликатов');
        return Promise.all([
          DB.clearStore('projects'), DB.clearStore('entries'), DB.clearStore('marathons')
        ]);
      });
  }

  /* ---------- Интерфейс (рендер) ---------- */

  function testUi() {
    begin('Интерфейс: рендер страниц с тестовыми данными');

    global.WT.state.projects = [
      makeProject({ id: 'p1', name: 'Хроники туманного города' }),
      makeProject({ id: 'p2', name: 'Второй проект', initialVolume: 0, endDate: null, targetWords: 30000 })
    ];
    global.WT.state.entries = ENTRIES.concat([
      makeEntry({ id: 'x1', projectId: 'p2', date: '2026-01-02', value: 400, createdAt: 7 })
    ]);
    global.WT.state.marathons = [{
      id: 'm1', name: 'Январский марафон', projectId: 'p1',
      start: '2026-01-01', end: '2026-01-31', targetWords: 20000,
      createdAt: 1, updatedAt: 1
    }];

    try {
      global.WT.ui.renderAll();
    } catch (e) {
      ok(false, 'исключение при рендере: ' + e.message);
      return;
    }

    var dash = document.getElementById('dash-root');
    ok(dash && dash.innerHTML.length > 500, 'главная страница отрисована');
    ok(dash.innerHTML.indexOf('Всего слов') !== -1, 'карточки статистики на главной');

    var grid = document.getElementById('projects-grid');
    ok(grid.innerHTML.indexOf('Хроники туманного города') !== -1, 'карточка проекта отрисована');

    var entriesWrap = document.getElementById('entries-table-wrap');
    var rows = entriesWrap.querySelectorAll('tbody tr').length;
    eq(rows, 7, 'все записи в таблице');

    var charts = document.getElementById('charts-body');
    eq(charts.querySelectorAll('canvas').length, 4, 'четыре графика построены');

    var calendar = document.getElementById('calendar-body');
    ok(calendar.querySelectorAll('.hm-cell[data-date]').length > 300, 'календарь активности отрисован');

    var marathons = document.getElementById('marathons-grid');
    ok(marathons.innerHTML.indexOf('Январский марафон') !== -1, 'марафон отрисован');

    // Вкладки: каждая страница скрыта/показана корректно
    var pages = document.querySelectorAll('.page');
    var visible = 0;
    pages.forEach(function (p) { if (!p.hidden) visible++; });
    eq(visible, 1, 'показана ровно одна страница');
  }

  /* ================= Запуск ================= */

  function run() {
    // Сохраняем и восстанавливаем данные пользователя
    var backup = null;
    var sumEl = document.getElementById('summary');
    function step(text) {
      if (sumEl) sumEl.textContent = 'STEP: ' + text;
    }

    return DB.init()
      .then(function () {
        step('db-init backend=' + DB.backend);
        return DB.dump();
      })
      .then(function (d) {
        backup = d;
        step('dump ok');
        testUtils();
        testSeries();
        testSummary();
        testTimeline();
        testMarathon();
        step('sync tests ok');
        return testDb();
      })
      .then(function () {
        step('db tests ok');
        testUi();
      })
      .catch(function (err) {
        current.errors.push('ИСКЛЮЧЕНИЕ: ' + (err && err.message ? err.message : err));
      })
      .then(function () {
        // Восстановление исходного состояния
        if (backup) return DB.restore(backup, 'replace').catch(function () {});
      })
      .then(function () {
        var passed = results.filter(function (r) { return r.errors.length === 0; }).length;
        var failed = results.length - passed;
        var lines = results.map(function (r) {
          var status = r.errors.length === 0 ? 'PASS' : 'FAIL';
          return '<div class="' + (status === 'PASS' ? 'pass' : 'fail') + '">[' + status + '] ' +
            U.escapeHtml(r.name) +
            (r.errors.length ? '<br>— ' + r.errors.map(U.escapeHtml).join('<br>— ') : '') +
            '</div>';
        });

        var summary = 'TOTAL: ' + results.length + ' | PASS: ' + passed + ' | FAIL: ' + failed +
          ' | JS-ERRORS: ' + global.__errors.length +
          (global.__errors.length ? ' :: ' + global.__errors.join(' || ') : '');

        var resEl = document.getElementById('results');
        if (resEl) resEl.innerHTML = lines.join('');
        var sumEl = document.getElementById('summary');
        if (sumEl) sumEl.textContent = summary;

        var pre = document.createElement('pre');
        pre.id = 'final-report';
        pre.textContent = summary;
        document.body.appendChild(pre);

        return summary;
      });
  }

  global.WTTests = { run: run };
})(window);