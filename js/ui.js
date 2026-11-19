/* ============================================================
   ui.js — интерфейс: страницы, карточки, формы, модалки, тосты
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.WT.utils;
  var S = global.WT.stats;
  var C = global.WT.charts;

  var esc = U.escapeHtml;

  /* ================= Вспомогательное ================= */

  function state() { return global.WT.state; }

  function getProject(id) {
    return state().projects.find(function (p) { return p.id === id; }) || null;
  }

  function visibleProjects() {
    return state().projects.filter(function (p) { return p.status !== 'archived'; });
  }

  function selectedProjects(id) {
    if (!id || id === 'all') return visibleProjects();
    var p = getProject(id);
    return p ? [p] : [];
  }

  var STATUS_LABEL = { active: 'Активный', completed: 'Завершён', archived: 'В архиве' };
  var STATUS_CLASS = { active: 'badge-active', completed: 'badge-completed', archived: 'badge-archived' };

  function statusBadge(status) {
    return '<span class="badge ' + (STATUS_CLASS[status] || 'badge-archived') + '">' +
      esc(STATUS_LABEL[status] || status) + '</span>';
  }

  function progressBar(percent, opts) {
    opts = opts || {};
    var p = U.clamp(percent, 0, 100);
    var cls = percent >= 100 ? 'success' : percent < 25 && opts.warnLow ? 'warning' : '';
    return '<div class="progress' + (opts.thin ? ' progress-thin' : '') + '">' +
      '<div class="progress-bar ' + cls + '" style="width:' + p.toFixed(1) + '%"></div></div>';
  }

  function projectSelect(id, value, allowAll, attrs) {
    var html = '<select id="' + id + '"' + (attrs || '') + '>';
    if (allowAll) {
      html += '<option value="all"' + (value === 'all' ? ' selected' : '') + '>Все проекты</option>';
    }
    visibleProjects().forEach(function (p) {
      html += '<option value="' + esc(p.id) + '"' + (p.id === value ? ' selected' : '') + '>' +
        esc(p.name) + '</option>';
    });
    html += '</select>';
    return html;
  }

  /* ================= Тосты ================= */

  var TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><circle cx="12" cy="16.3" r="0.4" fill="currentColor"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3.5l9 16H3l9-16z"/><path d="M12 9.5v4"/><circle cx="12" cy="16.3" r="0.4" fill="currentColor"/></svg>'
  };

  function toast(message, type, title) {
    type = type || 'success';
    var root = document.getElementById('toast-root');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML =
      '<span class="toast-icon">' + (TOAST_ICONS[type] || TOAST_ICONS.success) + '</span>' +
      '<div>' + (title ? '<strong>' + esc(title) + '</strong>' : '') + esc(message) + '</div>';
    root.appendChild(el);
    setTimeout(function () {
      el.classList.add('removing');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 260);
    }, 3600);
  }

  /* ================= Модальные окна ================= */

  function openModal(opts) {
    closeModal();
    var root = document.getElementById('modal-root');
    var back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML =
      '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title || '') + '">' +
        '<div class="modal-head">' +
          '<h3 class="modal-title">' + esc(opts.title || '') + '</h3>' +
          '<button class="icon-btn" type="button" data-close="1" aria-label="Закрыть">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (opts.foot ? '<div class="modal-foot">' + opts.foot + '</div>' : '') +
      '</div>';
    root.appendChild(back);

    back.addEventListener('click', function (ev) {
      if (ev.target === back || ev.target.closest('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', escClose);
    return back;
  }

  function escClose(ev) {
    if (ev.key === 'Escape') closeModal();
  }

  function closeModal() {
    var root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
    document.removeEventListener('keydown', escClose);
    C.hideTooltip();
  }

  /**
   * Диалог подтверждения. Возвращает Promise<boolean>.
   * opts.requireText — если задан, пользователь должен ввести этот текст.
   */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var needText = opts.requireText || null;
      var body =
        '<p class="muted">' + esc(opts.message || '') + '</p>' +
        (needText
          ? '<div class="field" style="margin-top:14px"><span>Введите «' + esc(needText) + '» для подтверждения</span>' +
            '<input type="text" id="confirm-text" placeholder="' + esc(needText) + '" autocomplete="off"></div>'
          : '');

      var back = openModal({
        title: opts.title || 'Подтверждение',
        body: body,
        foot:
          '<button class="btn btn-ghost" type="button" data-close="1">' + esc(opts.cancelText || 'Отмена') + '</button>' +
          '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" type="button" id="confirm-ok">' +
          esc(opts.confirmText || 'Подтвердить') + '</button>'
      });

      var okBtn = back.querySelector('#confirm-ok');
      var input = back.querySelector('#confirm-text');
      if (input) {
        okBtn.disabled = true;
        okBtn.style.opacity = '0.5';
        input.addEventListener('input', function () {
          var ok = input.value.trim() === needText;
          okBtn.disabled = !ok;
          okBtn.style.opacity = ok ? '1' : '0.5';
        });
        setTimeout(function () { input.focus(); }, 60);
      } else {
        setTimeout(function () { okBtn.focus(); }, 60);
      }

      function cleanup(result) {
        okBtn.removeEventListener('click', onOk);
        closeModal();
        resolve(result);
      }
      function onOk() {
        if (okBtn.disabled) return;
        cleanup(true);
      }
      okBtn.addEventListener('click', onOk);
      back.addEventListener('click', function (ev) {
        if (ev.target === back || ev.target.closest('[data-close]')) cleanup(false);
      });
    });
  }

  /* ================= Тема ================= */

  function applyTheme(theme) {
    var resolved = theme;
    if (theme === 'system') {
      resolved = (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    try {
      global.localStorage.setItem('writer-tracker-theme', theme || 'system');
    } catch (e) { /* приватный режим */ }
    var icon = document.getElementById('theme-icon');
    if (icon) {
      icon.innerHTML = resolved === 'dark'
        ? '<path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z"/>'
        : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.9 4.9l1.4 1.4"/><path d="M17.7 17.7l1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.9 19.1l1.4-1.4"/><path d="M17.7 6.3l1.4-1.4"/>';
    }
  }

  /* ================= Рендер всех страниц ================= */

  function renderAll() {
    renderDashboard();
    renderProjects();
    renderEntries();
    renderCharts();
    renderCalendar();
    renderMarathons();
    renderSettings();
    fillProjectSelects();
  }

  /* ---------- Главная ---------- */

  function renderDashboard() {
    var root = document.getElementById('dash-root');
    if (!root) return;
    var st = state();

    var projects = visibleProjects();
    var currentId = st.dashProjectId;
    if (currentId && currentId !== 'all' && !getProject(currentId)) currentId = 'all';
    if (!currentId) {
      var firstActive = projects.find(function (p) { return p.status === 'active'; });
      currentId = firstActive ? firstActive.id : (projects.length ? projects[0].id : 'all');
    }
    st.dashProjectId = currentId;

    if (!projects.length) {
      root.innerHTML =
        '<div class="page-head"><div><h2 class="page-heading">Добро пожаловать!</h2>' +
        '<p class="muted">' + esc(U.fmtDate(U.todayISO())) + '</p></div></div>' +
        '<div class="empty-state">' +
          '<div class="empty-icon"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div>' +
          '<h3>Создайте первый литературный проект</h3>' +
          '<p>Укажите цель по количеству слов, даты и ежедневный темп — а трекер будет считать прогресс, серии и прогноз.</p>' +
          '<button class="btn btn-primary" data-action="new-project" type="button">Создать проект</button>' +
        '</div>';
      return;
    }

    var isAll = currentId === 'all';
    var sel = isAll ? visibleProjects().filter(function (p) { return p.status !== 'archived'; }) : [getProject(currentId)];
    var stats = S.forProjects(sel, st.entries);
    var target = stats.targetWords;
    var pct = stats.progressPercent;

    var html = '';

    /* Шапка */
    html +=
      '<div class="page-head">' +
        '<div>' +
          '<h2 class="page-heading">Добро пожаловать!</h2>' +
          '<p class="muted">' + esc(U.fmtDate(U.todayISO())) + ' · ' +
            (isAll ? 'сводка по всем проектам' : esc(getProject(currentId).name)) + '</p>' +
        '</div>' +
        '<div class="page-head-actions">' +
          '<label class="field-inline"><span>Проект</span>' +
            '<select id="dash-project" data-project-select>' +
              '<option value="all"' + (isAll ? ' selected' : '') + '>Все проекты</option>' +
              projects.map(function (p) {
                return '<option value="' + esc(p.id) + '"' + (!isAll && p.id === currentId ? ' selected' : '') + '>' + esc(p.name) + '</option>';
              }).join('') +
            '</select>' +
          '</label>' +
          '<button class="btn btn-soft" data-action="new-entry" type="button">Добавить результат</button>' +
        '</div>' +
      '</div>';

    /* Карточки статистики */
    html += '<div class="stat-grid">' +
      statCard('Всего слов', U.fmtNum(stats.totalWords), 'цель: ' + U.fmtNum(target) + ' сл.', 'var(--accent)') +
      statCard('Написано сегодня', U.fmtNum(stats.wordsToday),
        'вчера: ' + U.fmtSigned(stats.wordsYesterday) + ' сл.', 'var(--success)') +
      statCard('Прогресс цели', U.fmtPercent(pct), progressBar(pct, { thin: true }), 'var(--info)') +
      statCard('До завершения', U.fmtNum(stats.wordsRemaining),
        stats.wordsRemaining > 0 ? 'осталось написать' : 'цель достигнута!', 'var(--warning)') +
      statCard('Среднее в день', U.fmtNum(stats.avgPerDay),
        'за активный день: ' + U.fmtNum(stats.avgPerActiveDay), 'var(--accent)') +
      statCard('Серия дней', U.fmtNum(stats.currentStreak),
        'лучшая серия: ' + U.fmtNum(stats.longestStreak) + ' ' + U.plural(stats.longestStreak, 'день', 'дня', 'дней'),
        'var(--danger)') +
      '</div>';

    /* Цель + мини-график */
    html += '<div class="grid-2">';

    html += '<div class="card">' +
      '<h3 class="card-title">Цель и ежедневный темп</h3>' +
      '<div class="goal-ring-wrap">' +
        '<div class="goal-ring">' +
          '<svg width="116" height="116" viewBox="0 0 116 116">' +
            '<circle class="ring-track" cx="58" cy="58" r="50" fill="none" stroke-width="11"></circle>' +
            '<circle class="ring-value" cx="58" cy="58" r="50" fill="none" stroke-width="11" ' +
              'stroke-dasharray="314.16" stroke-dashoffset="' + (314.16 * (1 - U.clamp(pct, 0, 100) / 100)).toFixed(1) + '"></circle>' +
          '</svg>' +
          '<div class="goal-ring-label">' + U.fmtPercent(pct, 0) + '</div>' +
        '</div>' +
        '<div style="flex:1;min-width:210px">' +
          factRow('Написано', U.fmtNum(stats.writtenWords) + ' сл.') +
          factRow('Начальный объём', U.fmtNum(stats.initial) + ' сл.') +
          factRow('Ежедневная цель', U.fmtNum(stats.dailyGoal) + ' сл.') +
          factRow('Сегодня от цели', (stats.dailyGoal > 0
            ? (stats.wordsToday >= stats.dailyGoal
              ? '<span class="delta-pos">выполнено</span>'
              : U.fmtNum(stats.dailyGoal - stats.wordsToday) + ' сл. осталось')
            : '—')) +
        '</div>' +
      '</div>' +
      '<div style="margin-top:14px">' + progressBar(pct) +
        '<div class="progress-meta"><span>' + U.fmtNum(stats.totalWords) + ' из ' + U.fmtNum(target) + ' сл.</span>' +
        '<span>' + U.fmtPercent(pct) + '</span></div>' +
      '</div>' +
    '</div>';

    html += '<div class="chart-card">' +
      '<div class="chart-head"><div><div class="chart-title">Активность за 14 дней</div>' +
      '<div class="chart-sub">написанные слова по дням</div></div></div>' +
      '<div class="chart-canvas-box"><canvas class="chart" id="chart-mini"></canvas></div>' +
    '</div>';

    html += '</div>';

    /* Прогноз + быстрая форма */
    html += '<div class="grid-2">';

    html += '<div class="card">' +
      '<h3 class="card-title">Прогноз и продуктивность</h3>' +
      '<div class="storage-list">' +
        factRow('Прогнозируемая дата завершения', stats.projectedEndDate === 'done'
          ? '<span class="delta-pos">цель достигнута</span>'
          : stats.projectedEndDate
            ? esc(U.fmtDate(stats.projectedEndDate)) + ' <span class="muted small">(' + esc(U.relativeDay(stats.projectedEndDate)) + ')</span>'
            : '<span class="muted">недостаточно данных</span>') +
        factRow('Нужный темп до даты', stats.requiredPace
          ? U.fmtNum(stats.requiredPace) + ' сл./день'
          : '<span class="muted">укажите дату завершения</span>') +
        factRow('Дней с активностью', U.fmtNum(stats.activeDays) + ' из ' + U.fmtNum(stats.daysElapsed)) +
        factRow('Самый продуктивный день', stats.bestDay.date
          ? esc(U.fmtDate(stats.bestDay.date)) + ' · ' + U.fmtSigned(stats.bestDay.words) + ' сл.'
          : '<span class="muted">пока нет</span>') +
        factRow('Дней до дедлайна', stats.endDate
          ? (U.daysBetween(U.todayISO(), stats.endDate) >= 0
            ? U.fmtNum(U.daysBetween(U.todayISO(), stats.endDate) + 1) + ' ' + U.plural(U.daysBetween(U.todayISO(), stats.endDate) + 1, 'день', 'дня', 'дней')
            : '<span class="delta-neg">срок прошёл</span>')
          : '<span class="muted">не задан</span>') +
      '</div>' +
    '</div>';

    html += '<div class="card">' +
      '<h3 class="card-title">Быстрая запись</h3>' +
      '<p class="muted small">Внесите результат дня прямо отсюда.</p>' +
      '<form id="quick-entry-form" data-form="entry" style="margin-top:12px">' +
        entryFormFields({ compact: true, projectId: isAll ? '' : currentId }) +
        '<button class="btn btn-primary" type="submit" style="width:100%">Сохранить запись</button>' +
      '</form>' +
    '</div>';

    html += '</div>';

    /* Прогресс проектов */
    html += '<div class="card"><h3 class="card-title">Проекты</h3><div class="storage-list">';
    projects.slice(0, 6).forEach(function (p) {
      var ps = S.forProject(p, st.entries);
      html += '<div style="padding:10px 0;border-bottom:1px dashed var(--border)">' +
        '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:7px">' +
          '<div style="display:flex;gap:9px;align-items:center;min-width:0">' +
            '<span class="project-dot" style="background:' + esc(p.color) + '"></span>' +
            '<strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.name) + '</strong>' +
            statusBadge(p.status) +
          '</div>' +
          '<div class="small muted nowrap">' + U.fmtNum(ps.totalWords) + ' / ' + U.fmtNum(p.targetWords) + ' сл. · ' + U.fmtPercent(ps.progressPercent, 0) + '</div>' +
        '</div>' +
        progressBar(ps.progressPercent, { thin: true }) +
      '</div>';
    });
    html += '</div></div>';

    root.innerHTML = html;

    // Мини-график
    var canvas = document.getElementById('chart-mini');
    if (canvas) {
      var tl = S.buildTimeline(sel, st.entries);
      var todayISO = U.todayISO();
      var from = U.addDays(todayISO, -13);
      var items = S.aggregate(tl, 'day').filter(function (it) {
        return it.date >= from && it.date <= todayISO;
      });
      var draw = function () {
        C.drawBarChart(canvas, items, { color: '#6d5ef2' });
      };
      draw();
      C.register(canvas, draw);
    }

    bindEntryPreview(root.querySelector('#quick-entry-form'));
  }

  function statCard(label, value, sub, color, subClass) {
    return '<div class="stat-card" style="--stat-color:' + color + '">' +
      '<div class="stat-label">' + esc(label) + '</div>' +
      '<div class="stat-value">' + value + '</div>' +
      (sub ? '<div class="stat-sub ' + (subClass || '') + '">' + sub + '</div>' : '') +
      '</div>';
  }

  function factRow(label, value) {
    return '<div class="storage-row"><span class="muted">' + esc(label) + '</span><span><strong>' + value + '</strong></span></div>';
  }

  /* ---------- Проекты ---------- */

  function renderProjects() {
    var grid = document.getElementById('projects-grid');
    if (!grid) return;
    var filter = state().projectsFilter || 'active';
    var list = state().projects.filter(function (p) {
      return filter === 'all' ? true : p.status === filter;
    });
    list.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="empty-icon"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg></div>' +
        '<h3>Здесь пока пусто</h3>' +
        '<p>Создайте литературный проект, чтобы начать учёт слов и отслеживать прогресс.</p>' +
        '<button class="btn btn-primary" data-action="new-project" type="button">Создать проект</button>' +
        '</div>';
      return;
    }

    grid.innerHTML = list.map(function (p) {
      var ps = S.forProject(p, state().entries);
      return '<article class="project-card" style="--pc-color:' + esc(p.color) + '">' +
        '<div class="project-card-head">' +
          '<div style="min-width:0">' +
            '<div class="project-card-title">' + esc(p.name) + '</div>' +
            (p.genre ? '<div class="project-genre">' + esc(p.genre) + '</div>' : '') +
          '</div>' +
          statusBadge(p.status) +
        '</div>' +
        (p.description ? '<div class="project-desc">' + esc(p.description) + '</div>' : '') +
        '<div>' +
          progressBar(ps.progressPercent) +
          '<div class="progress-meta"><span>' + U.fmtNum(ps.totalWords) + ' из ' + U.fmtNum(p.targetWords) + ' сл.</span>' +
          '<span>' + U.fmtPercent(ps.progressPercent) + '</span></div>' +
        '</div>' +
        '<div class="project-facts">' +
          '<div class="fact"><strong>' + U.fmtNum(ps.wordsToday) + '</strong>сегодня</div>' +
          '<div class="fact"><strong>' + U.fmtNum(p.dailyGoal) + '</strong>цель в день</div>' +
          '<div class="fact"><strong>' + U.fmtNum(ps.avgPerDay) + '</strong>среднее / день</div>' +
          '<div class="fact"><strong>' + (p.endDate ? esc(U.fmtDate(p.endDate, 'short')) : '—') + '</strong>дедлайн</div>' +
        '</div>' +
        '<div class="project-actions">' +
          '<button class="btn btn-soft btn-sm" data-action="new-entry" data-id="' + esc(p.id) + '" type="button">Запись</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="edit-project" data-id="' + esc(p.id) + '" type="button">Изменить</button>' +
          (p.status !== 'archived'
            ? '<button class="btn btn-ghost btn-sm" data-action="archive-project" data-id="' + esc(p.id) + '" type="button">В архив</button>'
            : '<button class="btn btn-ghost btn-sm" data-action="unarchive-project" data-id="' + esc(p.id) + '" type="button">Вернуть</button>') +
          '<button class="icon-btn danger" data-action="delete-project" data-id="' + esc(p.id) + '" type="button" aria-label="Удалить проект">' +
            '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"/><path d="M6 7l1 13h10l1-13"/></svg>' +
          '</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  /* ---------- Записи ---------- */

  function renderEntries() {
    var wrap = document.getElementById('entries-table-wrap');
    var summary = document.getElementById('entries-summary');
    if (!wrap) return;

    var st = state();
    var filter = st.entriesFilter || { project: 'all', mode: 'all', search: '' };

    var rows = S.allEntryRows(state().projects, state().entries).filter(function (r) {
      if (filter.project !== 'all' && r.projectId !== filter.project) return false;
      if (filter.mode !== 'all' && r.mode !== filter.mode) return false;
      if (filter.search) {
        var q = filter.search.toLowerCase();
        var hay = (r.note || '') + ' ' + r.date + ' ' + U.fmtDate(r.date) + ' ' + (r.projectName || '');
        if (hay.toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });

    var shown = rows.slice(0, 150);
    var sumDelta = rows.reduce(function (acc, r) { return acc + r.delta; }, 0);

    if (summary) {
      summary.innerHTML = '<div class="stat-grid" style="margin-bottom:16px">' +
        statCard('Записей', U.fmtNum(rows.length), 'показано: ' + U.fmtNum(shown.length), 'var(--accent)') +
        statCard('Суммарный прирост', U.fmtSigned(sumDelta) + ' сл.', 'по отфильтрованным записям',
          sumDelta >= 0 ? 'var(--success)' : 'var(--danger)') +
        statCard('Активных дней', U.fmtNum(uniqueDates(rows).length), 'уникальные даты', 'var(--info)') +
        '</div>';
    }

    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-state">' +
        '<div class="empty-icon"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></div>' +
        '<h3>Записей пока нет</h3>' +
        '<p>Добавьте первый результат — за день или общий объём рукописи.</p>' +
        '<button class="btn btn-primary" data-action="new-entry" type="button">Новая запись</button>' +
        '</div>';
      return;
    }

    wrap.innerHTML = '<div class="table-wrap"><table class="responsive-table">' +
      '<thead><tr>' +
        '<th>Дата</th><th>Проект</th><th>Режим</th>' +
        '<th class="num">Введено</th><th class="num">Зачтено</th><th>Заметка</th><th></th>' +
      '</tr></thead><tbody>' +
      shown.map(function (r) {
        var deltaCls = r.delta > 0 ? 'delta-pos' : r.delta < 0 ? 'delta-neg' : 'delta-zero';
        return '<tr>' +
          '<td data-label="Дата"><strong>' + esc(U.fmtDate(r.date)) + '</strong>' +
            '<div class="small muted">' + esc(U.relativeDay(r.date)) + '</div></td>' +
          '<td data-label="Проект"><span style="display:inline-flex;gap:7px;align-items:center">' +
            '<span class="project-dot" style="background:' + esc(r.projectColor || '#888') + '"></span>' + esc(r.projectName) + '</span></td>' +
          '<td data-label="Режим"><span class="badge ' + (r.mode === 'total' ? 'badge-info' : 'badge-archived') + '">' +
            (r.mode === 'total' ? 'Общий объём' : 'За день') + '</span></td>' +
          '<td class="num" data-label="Введено">' + U.fmtNum(r.value) + '</td>' +
          '<td class="num" data-label="Зачтено"><span class="' + deltaCls + '">' + U.fmtSigned(r.delta) + '</span></td>' +
          '<td data-label="Заметка"><span class="muted">' + (r.note ? esc(r.note) : '—') + '</span></td>' +
          '<td data-label="Действия"><div class="row-actions">' +
            '<button class="icon-btn" data-action="edit-entry" data-id="' + esc(r.id) + '" type="button" aria-label="Редактировать">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
            '</button>' +
            '<button class="icon-btn danger" data-action="delete-entry" data-id="' + esc(r.id) + '" type="button" aria-label="Удалить">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2"/><path d="M6 7l1 13h10l1-13"/></svg>' +
            '</button>' +
          '</div></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      (rows.length > shown.length
        ? '<p class="muted small" style="margin-top:12px">Показаны первые ' + shown.length + ' записей из ' + rows.length + '. Уточните фильтры, чтобы увидеть остальные.</p>'
        : '');
  }

  function uniqueDates(rows) {
    var set = {};
    rows.forEach(function (r) { set[r.date] = true; });
    return Object.keys(set);
  }

  /* ---------- Графики ---------- */

  function sliceTimeline(timeline, from, to) {
    var dates = [], words = [], totals = [], byDate = {};
    timeline.dates.forEach(function (d, i) {
      if (d < from) return;
      if (to && d > to) return;
      dates.push(d);
      words.push(timeline.words[i]);
      totals.push(timeline.totals[i]);
      byDate[d] = { words: timeline.words[i], total: timeline.totals[i] };
    });
    if (!dates.length) return null;
    return {
      start: dates[0],
      end: dates[dates.length - 1],
      initial: timeline.initial,
      dates: dates,
      words: words,
      totals: totals,
      byDate: byDate,
      totalWords: totals[totals.length - 1],
      writtenWords: words.reduce(function (a, b) { return a + b; }, 0)
    };
  }

  function renderCharts() {
    var body = document.getElementById('charts-body');
    if (!body) return;
    var st = state();
    var cfg = st.chartsCfg || (st.chartsCfg = { project: 'all', period: '30', agg: 'day' });

    var projects = selectedProjects(cfg.project);
    if (!projects.length) {
      body.innerHTML = '<div class="empty-state"><h3>Нет данных для графиков</h3>' +
        '<p>Создайте проект и добавьте записи, чтобы увидеть аналитику.</p></div>';
      return;
    }

    var full = S.buildTimeline(projects, st.entries);
    var today = U.todayISO();
    var from = cfg.period === 'all' ? full.start : U.addDays(today, -(Number(cfg.period) - 1));
    var to = cfg.period === 'all' ? full.end : today;
    var slice = sliceTimeline(full, U.maxISO(from, full.start), to) || {
      dates: [today], words: [0], totals: [full.totalWords], byDate: {}, writtenWords: 0, start: today, end: today
    };

    var periodLabel = cfg.period === 'all' ? 'за всё время' : 'за ' + cfg.period + ' ' + U.plural(Number(cfg.period), 'день', 'дня', 'дней');
    var aggLabel = cfg.agg === 'day' ? 'по дням' : cfg.agg === 'week' ? 'по неделям' : 'по месяцам';

    var activeDays = slice.dates.filter(function (d, i) { return slice.words[i] > 0; }).length;
    var best = { date: null, words: 0 };
    slice.dates.forEach(function (d, i) {
      if (slice.words[i] > best.words) best = { date: d, words: slice.words[i] };
    });

    var html = '<div class="stat-grid">' +
      statCard('Написано за период', U.fmtSigned(slice.writtenWords) + ' сл.', periodLabel, 'var(--accent)') +
      statCard('Лучший день периода', best.date ? U.fmtSigned(best.words) + ' сл.' : '—',
        best.date ? esc(U.fmtDate(best.date)) : 'нет активности', 'var(--success)') +
      statCard('Активных дней', U.fmtNum(activeDays) + ' из ' + U.fmtNum(slice.dates.length),
        'среднее: ' + U.fmtNum(slice.dates.length ? slice.writtenWords / slice.dates.length : 0) + ' сл./день', 'var(--info)') +
      statCard('Объём рукописи', U.fmtNum(slice.totalWords) + ' сл.', 'на конец периода', 'var(--warning)') +
      '</div>';

    html += '<div class="charts-grid">' +
      '<div class="chart-card full">' +
        '<div class="chart-head"><div><div class="chart-title">Написанные слова</div>' +
        '<div class="chart-sub">' + esc(periodLabel + ' · ' + aggLabel) + '</div></div></div>' +
        '<div class="chart-canvas-box"><canvas class="chart tall" id="chart-words"></canvas></div>' +
      '</div>' +
      '<div class="chart-card full">' +
        '<div class="chart-head"><div><div class="chart-title">Динамика объёма рукописи</div>' +
        '<div class="chart-sub">общее количество слов в проекте на конец дня</div></div></div>' +
        '<div class="chart-canvas-box"><canvas class="chart tall" id="chart-total"></canvas></div>' +
      '</div>' +
      '<div class="chart-card">' +
        '<div class="chart-head"><div><div class="chart-title">По неделям</div>' +
        '<div class="chart-sub">сумма слов за неделю</div></div></div>' +
        '<div class="chart-canvas-box"><canvas class="chart" id="chart-week"></canvas></div>' +
      '</div>' +
      '<div class="chart-card">' +
        '<div class="chart-head"><div><div class="chart-title">По месяцам</div>' +
        '<div class="chart-sub">сумма слов за месяц</div></div></div>' +
        '<div class="chart-canvas-box"><canvas class="chart" id="chart-month"></canvas></div>' +
      '</div>' +
    '</div>';

    body.innerHTML = html;

    var dayItems = S.aggregate(slice, cfg.agg === 'day' ? 'day' : cfg.agg);
    var totalItems = slice.dates.map(function (d, i) {
      return {
        key: d, date: d, label: U.fmtDate(d, 'short').slice(0, 5), longLabel: U.fmtDate(d),
        value: slice.totals[i], total: slice.totals[i], words: slice.words[i]
      };
    });
    var weekItems = S.aggregate(slice, 'week');
    var monthItems = S.aggregate(slice, 'month');

    var tipWords = function (item) {
      return '<strong>' + esc(item.longLabel || item.label) + '</strong>' +
        '<div class="tip-row"><span class="tip-muted">Написано</span><span>' + U.fmtSigned(item.value) + ' сл.</span></div>' +
        (item.days > 1 ? '<div class="tip-row"><span class="tip-muted">Дней в периоде</span><span>' + item.days + '</span></div>' : '') +
        (item.total !== undefined ? '<div class="tip-row"><span class="tip-muted">Всего в рукописи</span><span>' + U.fmtNum(item.total) + ' сл.</span></div>' : '');
    };

    var tipTotal = function (item) {
      return '<strong>' + esc(item.longLabel) + '</strong>' +
        '<div class="tip-row"><span class="tip-muted">Объём рукописи</span><span>' + U.fmtNum(item.value) + ' сл.</span></div>' +
        '<div class="tip-row"><span class="tip-muted">Написано за день</span><span>' + U.fmtSigned(item.words || 0) + ' сл.</span></div>';
    };

    setupChart('chart-words', function (canvas) {
      C.drawBarChart(canvas, dayItems, { tip: tipWords });
    });
    setupChart('chart-total', function (canvas) {
      C.drawLineChart(canvas, totalItems, { tip: tipTotal });
    });
    setupChart('chart-week', function (canvas) {
      C.drawBarChart(canvas, weekItems.slice(-14), { tip: tipWords, color: '#22b3a6' });
    });
    setupChart('chart-month', function (canvas) {
      C.drawBarChart(canvas, monthItems.slice(-12), { tip: tipWords, color: '#e0803c' });
    });
  }

  function setupChart(id, drawFn) {
    var canvas = document.getElementById(id);
    if (!canvas) return;
    var draw = function () { drawFn(canvas); };
    draw();
    C.register(canvas, draw);
  }

  /* ---------- Календарь ---------- */

  function renderCalendar() {
    var body = document.getElementById('calendar-body');
    if (!body) return;
    var st = state();
    var cfg = st.calendarCfg || (st.calendarCfg = { project: 'all', year: new Date().getFullYear() });

    var projects = selectedProjects(cfg.project);
    if (!projects.length) {
      body.innerHTML = '<div class="empty-state"><h3>Нет данных</h3><p>Создайте проект и добавьте записи.</p></div>';
      return;
    }

    var timeline = S.buildTimeline(projects, st.entries);
    var summary = S.forProjects(projects, st.entries);
    var dailyGoal = projects.reduce(function (a, p) { return a + (Number(p.dailyGoal) || 0); }, 0) || 400;

    // Статистика по месяцам выбранного года
    var year = Number(cfg.year);
    var monthRows = [];
    for (var m = 1; m <= 12; m++) {
      var key = year + '-' + U.pad(m);
      var days = 0, total = 0, active = 0, maxDay = 0;
      timeline.dates.forEach(function (d, i) {
        if (d.slice(0, 7) !== key) return;
        days++;
        total += timeline.words[i];
        if (timeline.words[i] > 0) active++;
        if (timeline.words[i] > maxDay) maxDay = timeline.words[i];
      });
      monthRows.push({ key: key, total: total, active: active, days: days, maxDay: maxDay });
    }
    var yearTotal = monthRows.reduce(function (a, r) { return a + r.total; }, 0);
    var yearActive = monthRows.reduce(function (a, r) { return a + r.active; }, 0);

    var html = '<div class="stat-grid">' +
      statCard('Написано в ' + year, U.fmtSigned(yearTotal) + ' сл.', 'суммарный прирост за год', 'var(--accent)') +
      statCard('Активных дней в году', U.fmtNum(yearActive), 'из ' + U.fmtNum(timeline.dates.filter(function (d) { return d.slice(0, 4) === String(year); }).length) + ' прошедших дней', 'var(--success)') +
      statCard('Текущая серия', U.fmtNum(summary.currentStreak) + ' ' + U.plural(summary.currentStreak, 'день', 'дня', 'дней'),
        'лучшая: ' + U.fmtNum(summary.longestStreak), 'var(--info)') +
      statCard('Среднее в день', U.fmtNum(summary.avgPerDay) + ' сл.', 'за активный день: ' + U.fmtNum(summary.avgPerActiveDay), 'var(--warning)') +
      '</div>';

    html += '<div class="heatmap-card">' +
      '<div class="chart-head" style="margin-bottom:12px"><div>' +
      '<div class="chart-title">Календарь активности ' + year + '</div>' +
      '<div class="chart-sub">наведите на квадрат, чтобы увидеть статистику дня</div></div></div>' +
      '<div id="heatmap-wrap"></div></div>';

    html += '<div class="table-wrap"><table class="responsive-table month-table">' +
      '<thead><tr><th>Месяц</th><th class="num">Написано</th><th class="num">Активных дней</th>' +
      '<th class="num">Среднее / день</th><th class="num">Лучший день</th></tr></thead><tbody>' +
      monthRows.map(function (r) {
        return '<tr>' +
          '<td data-label="Месяц">' + esc(U.fmtMonth(r.key)) + '</td>' +
          '<td class="num" data-label="Написано"><span class="' + (r.total > 0 ? 'delta-pos' : r.total < 0 ? 'delta-neg' : '') + '">' + U.fmtSigned(r.total) + '</span></td>' +
          '<td class="num" data-label="Активных дней">' + r.active + '</td>' +
          '<td class="num" data-label="Среднее">' + U.fmtNum(r.days ? r.total / r.days : 0) + '</td>' +
          '<td class="num" data-label="Лучший день">' + (r.maxDay > 0 ? U.fmtNum(r.maxDay) : '—') + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';

    body.innerHTML = html;

    var wordsByDate = {};
    timeline.dates.forEach(function (d, i) { wordsByDate[d] = timeline.words[i]; });
    var wrap = document.getElementById('heatmap-wrap');
    if (wrap) {
      C.heatmap(wrap, {
        year: year,
        wordsByDate: wordsByDate,
        dailyGoal: dailyGoal,
        startDate: projects.reduce(function (acc, p) {
          return p.startDate ? (acc ? U.minISO(acc, p.startDate) : p.startDate) : acc;
        }, null),
        today: U.todayISO()
      });
    }
  }

  /* ---------- Марафоны ---------- */

  function renderMarathons() {
    var grid = document.getElementById('marathons-grid');
    if (!grid) return;
    var list = state().marathons.slice().sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state">' +
        '<div class="empty-icon"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 21V4"/><path d="M4 5h11l-1.5 4L15 13H4"/><circle cx="18" cy="18" r="3"/></svg></div>' +
        '<h3>Марафонов пока нет</h3>' +
        '<p>Создайте личный челлендж: задайте количество слов, срок и проект — трекер рассчитает прогресс и нужный темп.</p>' +
        '<button class="btn btn-primary" data-action="new-marathon" type="button">Создать марафон</button>' +
        '</div>';
      return;
    }

    grid.innerHTML = list.map(function (m) {
      var project = m.projectId ? getProject(m.projectId) : null;
      var prog = S.marathonProgress(m, project, state().entries);
      var status = prog.isFinished
        ? '<span class="badge ' + (prog.progressPercent >= 100 ? 'badge-completed' : 'badge-warning') + '">' + (prog.progressPercent >= 100 ? 'Завершён' : 'Срок истёк') + '</span>'
        : prog.isPending
          ? '<span class="badge badge-info">Ожидает старта</span>'
          : '<span class="badge badge-active">Идёт</span>';

      return '<article class="marathon-card">' +
        '<div class="marathon-title">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 21V4"/><path d="M4 5h11l-1.5 4L15 13H4"/><circle cx="18" cy="18" r="3"/></svg>' +
          esc(m.name) + '</div>' +
        '<div class="marathon-meta">' + status +
          '<span class="badge badge-archived">' + esc(U.fmtDate(m.start, 'short')) + ' — ' + esc(U.fmtDate(m.end, 'short')) + '</span>' +
          (project ? '<span class="badge badge-info"><span class="project-dot" style="background:' + esc(project.color) + '"></span>' + esc(project.name) + '</span>' : '') +
        '</div>' +
        '<div>' + progressBar(prog.progressPercent) +
          '<div class="progress-meta"><span>' + U.fmtNum(prog.written) + ' из ' + U.fmtNum(prog.target) + ' сл.</span>' +
          '<span>' + U.fmtPercent(prog.progressPercent) + '</span></div>' +
        '</div>' +
        '<div class="marathon-stats">' +
          '<div class="fact"><strong>' + U.fmtNum(prog.remaining) + '</strong>слов осталось</div>' +
          '<div class="fact"><strong>' + U.fmtNum(prog.daysLeft) + '</strong>дней осталось</div>' +
          '<div class="fact"><strong>' + (prog.requiredPace ? U.fmtNum(prog.requiredPace) : '—') + '</strong>нужный темп / день</div>' +
          '<div class="fact"><strong>' + U.fmtNum(prog.avgPerDay) + '</strong>среднее / день</div>' +
          '<div class="fact"><strong>' + U.fmtNum(prog.daysPassed) + '</strong>дней прошло</div>' +
          '<div class="fact"><strong>' + U.fmtNum(prog.totalDays) + '</strong>всего дней</div>' +
        '</div>' +
        '<div class="marathon-actions">' +
          '<button class="btn btn-ghost btn-sm" data-action="edit-marathon" data-id="' + esc(m.id) + '" type="button">Изменить</button>' +
          '<button class="btn btn-ghost btn-sm" data-action="delete-marathon" data-id="' + esc(m.id) + '" type="button">Удалить</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  /* ---------- Настройки ---------- */

  function renderSettings() {
    var info = document.getElementById('storage-info');
    if (!info) return;
    var st = state();

    var backendLabel = global.WT.db.backend === 'indexeddb'
      ? 'IndexedDB (основное хранилище)'
      : 'localStorage (аварийный режим)';

    info.innerHTML = '<div class="storage-list">' +
      factRow('Хранилище', backendLabel) +
      factRow('Проектов', U.fmtNum(st.projects.length)) +
      factRow('Записей', U.fmtNum(st.entries.length)) +
      factRow('Марафонов', U.fmtNum(st.marathons.length)) +
      '</div>' +
      '<p class="muted small" style="margin-top:10px">Данные не отправляются в интернет и существуют только в этом браузере. Регулярно сохраняйте резервную копию.</p>';

    // Тема
    U.qsa('#theme-options input').forEach(function (input) {
      input.checked = input.value === (st.settings.theme || 'system');
    });
  }

  /* ---------- Заполнение селектов проектов ---------- */

  function fillProjectSelects() {
    U.qsa('select[data-project-select]').forEach(function (sel) {
      if (sel.id === 'dash-project') return; // рендерится на главной
      var current = sel.value;
      var allowAll = sel.getAttribute('data-allow-all') === '1';
      var html = '';
      if (allowAll) html += '<option value="all">Все проекты</option>';
      visibleProjects().forEach(function (p) {
        html += '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>';
      });
      sel.innerHTML = html;
      if (current && (current === 'all' || getProject(current))) sel.value = current;
    });
  }

  /* ================= Формы ================= */

  var COLORS = ['#6d5ef2', '#22b3a6', '#e0803c', '#e11d48', '#0e7ab8', '#8b5cf6', '#12a05c', '#d97706', '#9333ea', '#475569'];
  var GENRES = ['Фэнтези', 'Научная фантастика', 'Детектив', 'Роман', 'Триллер', 'Ужасы', 'Приключения', 'Историческая проза', 'Любовный роман', 'Молодёжная проза', 'Биография / Мемуары', 'Публицистика', 'Поэзия', 'Сказка', 'Другое'];

  function entryFormFields(opts) {
    opts = opts || {};
    var e = opts.entry || {};
    var projectId = opts.projectId !== undefined ? opts.projectId : (e.projectId || '');
    var mode = e.mode || 'daily';
    var compact = !!opts.compact;

    return '' +
      '<div class="field"><span>Проект</span>' + projectSelect('entry-project', projectId, false) + '</div>' +
      '<div class="form-grid">' +
        '<div class="field"><span>Дата</span>' +
          '<input type="date" id="entry-date" value="' + esc(e.date || U.todayISO()) + '" required></div>' +
        '<div class="field"><span>Количество слов</span>' +
          '<input type="number" id="entry-value" value="' + (e.value !== undefined ? esc(e.value) : '') + '" step="1" placeholder="например, 1500" required></div>' +
      '</div>' +
      (compact ? '' :
        '<div class="field"><span>Режим учёта</span><div class="mode-switch">' +
          '<label class="mode-option"><input type="radio" name="entry-mode" value="daily"' + (mode === 'daily' ? ' checked' : '') + '>' +
            '<span><strong>Написано за день</strong><small>Укажите прирост слов за выбранную дату.</small></span></label>' +
          '<label class="mode-option"><input type="radio" name="entry-mode" value="total"' + (mode === 'total' ? ' checked' : '') + '>' +
            '<span><strong>Общий объём рукописи</strong><small>Введите текущее число слов — прирост рассчитается сам.</small></span></label>' +
        '</div></div>') +
      (compact ?
        '<div class="field"><span>Режим</span>' +
          '<select id="entry-mode-select">' +
            '<option value="daily"' + (mode === 'daily' ? ' selected' : '') + '>Написано за день</option>' +
            '<option value="total"' + (mode === 'total' ? ' selected' : '') + '>Общий объём рукописи</option>' +
          '</select></div>' +
        '<div class="field"><span>Заметка</span><input type="text" id="entry-note" value="' + esc(e.note || '') + '" placeholder="Например: глава 4"></div>'
        :
        '<div class="field"><span>Заметка</span>' +
          '<input type="text" id="entry-note" value="' + esc(e.note || '') + '" placeholder="Необязательно: о чём писали, сколько глав и т. п."></div>') +
      '<div class="hint" id="entry-preview">Выберите проект и укажите количество слов — приложение покажет, сколько слов будет засчитано.</div>';
  }

  function readEntryForm(form, entryId) {
    var projectId = form.querySelector('#entry-project').value;
    var date = form.querySelector('#entry-date').value;
    var valueRaw = form.querySelector('#entry-value').value;
    var note = (form.querySelector('#entry-note') || {}).value || '';
    var modeInput = form.querySelector('input[name="entry-mode"]:checked');
    var modeSelect = form.querySelector('#entry-mode-select');
    var mode = modeInput ? modeInput.value : (modeSelect ? modeSelect.value : 'daily');
    return {
      id: entryId || U.uuid(),
      projectId: projectId,
      date: date,
      mode: mode,
      value: Number(valueRaw),
      note: note.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function simulateEntry(project, draft) {
    var others = state().entries.filter(function (e) { return e.id !== draft.id; });
    var s = S.projectSeries(project, others.concat([draft]));
    return { delta: s.deltas[draft.id], totalWords: s.totalWords };
  }

  function bindEntryPreview(form, entryId) {
    if (!form) return;
    var preview = form.querySelector('#entry-preview');
    if (!preview) return;

    var update = function () {
      var draft = readEntryForm(form, entryId || U.uuid());
      var project = getProject(draft.projectId);
      if (!project) {
        preview.innerHTML = 'Выберите проект, чтобы рассчитать прирост.';
        return;
      }
      if (!U.isValidISO(draft.date)) {
        preview.innerHTML = 'Укажите корректную дату.';
        return;
      }
      if (!isFinite(draft.value)) {
        preview.innerHTML = 'Введите количество слов.';
        return;
      }
      var sim = simulateEntry(project, draft);
      preview.innerHTML = 'Будет засчитано: <strong>' + U.fmtSigned(sim.delta) + ' сл.</strong> · ' +
        'объём рукописи станет: <strong>' + U.fmtNum(sim.totalWords) + ' сл.</strong>';
    };

    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();
  }

  function openEntryForm(opts) {
    opts = opts || {};
    var entry = opts.entry || null;
    var defaultProject = opts.projectId || (state().dashProjectId !== 'all' ? state().dashProjectId : '') ||
      (visibleProjects()[0] ? visibleProjects()[0].id : '');

    if (!visibleProjects().length) {
      toast('Сначала создайте литературный проект.', 'warning');
      openProjectForm();
      return;
    }

    var back = openModal({
      title: entry ? 'Редактирование записи' : 'Новая запись',
      body: '<form id="entry-form" data-form="entry">' +
        entryFormFields({ entry: entry, projectId: entry ? entry.projectId : defaultProject }) +
        '</form>',
      foot:
        '<button class="btn btn-ghost" type="button" data-close="1">Отмена</button>' +
        '<button class="btn btn-primary" type="submit" form="entry-form">' + (entry ? 'Сохранить' : 'Добавить') + '</button>'
    });

    var form = back.querySelector('#entry-form');
    bindEntryPreview(form, entry ? entry.id : null);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var draft = readEntryForm(form, entry ? entry.id : null);
      if (entry) draft.createdAt = entry.createdAt;

      if (!draft.projectId) { toast('Выберите проект.', 'error'); return; }
      if (!U.isValidISO(draft.date)) { toast('Укажите корректную дату.', 'error'); return; }
      if (!isFinite(draft.value)) { toast('Введите количество слов числом.', 'error'); return; }
      if (draft.mode === 'total' && draft.value < 0) {
        toast('Общий объём рукописи не может быть отрицательным.', 'error');
        return;
      }

      var project = getProject(draft.projectId);
      var sim = simulateEntry(project, draft);

      if (entry) {
        global.WT.actions.saveEntry(draft, 'Запись обновлена: ' + U.fmtSigned(sim.delta) + ' сл.');
      } else {
        global.WT.actions.saveEntry(draft, 'Запись сохранена: ' + U.fmtSigned(sim.delta) + ' сл. за ' + U.fmtDate(draft.date, 'medium'));
      }
      closeModal();
    });
  }

  function openProjectForm(projectId) {
    var p = projectId ? getProject(projectId) : null;
    var isNew = !p;
    var data = p || {
      name: '', description: '', genre: '', color: COLORS[0],
      targetWords: 50000, initialVolume: 0,
      startDate: U.todayISO(), endDate: '', dailyGoal: 500, status: 'active'
    };

    var body = '<form id="project-form">' +
      '<div class="field"><span>Название проекта</span>' +
        '<input type="text" id="p-name" value="' + esc(data.name) + '" placeholder="Например: «Хроники туманного города»" required></div>' +
      '<div class="form-grid">' +
        '<div class="field"><span>Жанр</span>' +
          '<input type="text" id="p-genre" list="genres-list" value="' + esc(data.genre) + '" placeholder="Фэнтези, роман…">' +
          '<datalist id="genres-list">' + GENRES.map(function (g) { return '<option value="' + esc(g) + '">'; }).join('') + '</datalist></div>' +
        '<div class="field"><span>Статус</span><select id="p-status">' +
          '<option value="active"' + (data.status === 'active' ? ' selected' : '') + '>Активный</option>' +
          '<option value="completed"' + (data.status === 'completed' ? ' selected' : '') + '>Завершённый</option>' +
          '<option value="archived"' + (data.status === 'archived' ? ' selected' : '') + '>Архивный</option>' +
        '</select></div>' +
      '</div>' +
      '<div class="field"><span>Описание</span>' +
        '<textarea id="p-desc" placeholder="Заметки о сюжете, героях, задачах проекта…">' + esc(data.description) + '</textarea></div>' +
      '<div class="field"><span>Цветовая метка</span><div class="color-picker" id="p-colors">' +
        COLORS.map(function (c) {
          return '<button type="button" class="color-dot' + (c === data.color ? ' selected' : '') + '" ' +
            'data-color="' + c + '" style="background:' + c + '" aria-label="Цвет ' + c + '"></button>';
        }).join('') +
        '<input type="hidden" id="p-color" value="' + esc(data.color) + '">' +
      '</div></div>' +
      '<div class="form-grid">' +
        '<div class="field"><span>Целевое количество слов</span>' +
          '<input type="number" id="p-target" value="' + esc(data.targetWords) + '" min="1" step="500"></div>' +
        '<div class="field"><span>Начальный объём текста</span>' +
          '<input type="number" id="p-initial" value="' + esc(data.initialVolume) + '" min="0" step="100"></div>' +
        '<div class="field"><span>Дата начала</span>' +
          '<input type="date" id="p-start" value="' + esc(data.startDate) + '"></div>' +
        '<div class="field"><span>Планируемая дата завершения</span>' +
          '<input type="date" id="p-end" value="' + esc(data.endDate || '') + '"></div>' +
        '<div class="field"><span>Ежедневная цель, слов</span>' +
          '<input type="number" id="p-daily" value="' + esc(data.dailyGoal) + '" min="0" step="50"></div>' +
      '</div>' +
      '<div class="hint">Если рукопись уже начата, укажите её текущий объём в поле «Начальный объём текста». Дальше записи будут считаться относительно него.</div>' +
      '</form>';

    var back = openModal({
      title: isNew ? 'Новый литературный проект' : 'Редактирование проекта',
      body: body,
      wide: true,
      foot:
        '<button class="btn btn-ghost" type="button" data-close="1">Отмена</button>' +
        '<button class="btn btn-primary" type="submit" form="project-form">' + (isNew ? 'Создать проект' : 'Сохранить') + '</button>'
    });

    // Выбор цвета
    back.querySelector('#p-colors').addEventListener('click', function (ev) {
      var dot = ev.target.closest('.color-dot');
      if (!dot) return;
      U.qsa('.color-dot', back).forEach(function (d) { d.classList.remove('selected'); });
      dot.classList.add('selected');
      back.querySelector('#p-color').value = dot.getAttribute('data-color');
    });

    back.querySelector('#project-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = back.querySelector('#p-name').value.trim();
      if (!name) { toast('Укажите название проекта.', 'error'); return; }

      var startDate = back.querySelector('#p-start').value || U.todayISO();
      var endDate = back.querySelector('#p-end').value || null;
      if (!U.isValidISO(startDate)) { toast('Некорректная дата начала.', 'error'); return; }
      if (endDate && !U.isValidISO(endDate)) { toast('Некорректная дата завершения.', 'error'); return; }
      if (endDate && endDate < startDate) {
        toast('Дата завершения не может быть раньше даты начала.', 'error');
        return;
      }

      var payload = {
        id: p ? p.id : U.uuid(),
        name: name,
        description: back.querySelector('#p-desc').value.trim(),
        genre: back.querySelector('#p-genre').value.trim(),
        color: back.querySelector('#p-color').value || COLORS[0],
        targetWords: Math.max(1, Number(back.querySelector('#p-target').value) || 50000),
        initialVolume: Math.max(0, Number(back.querySelector('#p-initial').value) || 0),
        startDate: startDate,
        endDate: endDate,
        dailyGoal: Math.max(0, Number(back.querySelector('#p-daily').value) || 0),
        status: back.querySelector('#p-status').value,
        createdAt: p ? p.createdAt : Date.now(),
        updatedAt: Date.now()
      };

      global.WT.actions.saveProject(payload);
      closeModal();
      toast(isNew ? 'Проект «' + name + '» создан.' : 'Проект «' + name + '» обновлён.', 'success');
    });
  }

  function openMarathonForm(marathonId) {
    var m = marathonId ? state().marathons.find(function (x) { return x.id === marathonId; }) : null;
    var isNew = !m;
    if (!visibleProjects().length) {
      toast('Сначала создайте проект, чтобы привязать марафон.', 'warning');
      return;
    }
    var data = m || {
      name: '', projectId: visibleProjects()[0].id,
      start: U.todayISO(), end: U.addDays(U.todayISO(), 30),
      targetWords: 30000, note: ''
    };

    var body = '<form id="marathon-form">' +
      '<div class="field"><span>Название марафона</span>' +
        '<input type="text" id="m-name" value="' + esc(data.name) + '" placeholder="Например: «Ноябрьский марафон 30 000 слов»" required></div>' +
      '<div class="field"><span>Проект</span>' + projectSelect('m-project', data.projectId, false) + '</div>' +
      '<div class="form-grid">' +
        '<div class="field"><span>Дата начала</span><input type="date" id="m-start" value="' + esc(data.start) + '"></div>' +
        '<div class="field"><span>Дата окончания</span><input type="date" id="m-end" value="' + esc(data.end) + '"></div>' +
        '<div class="field"><span>Целевое количество слов</span>' +
          '<input type="number" id="m-target" value="' + esc(data.targetWords) + '" min="1" step="500"></div>' +
        '<div class="field"><span>Заметка</span><input type="text" id="m-note" value="' + esc(data.note || '') + '" placeholder="Необязательно"></div>' +
      '</div>' +
      '<div class="hint">В зачёт марафона идут слова, написанные в выбранном проекте в период с даты начала по дату окончания.</div>' +
      '</form>';

    var back = openModal({
      title: isNew ? 'Новый писательский марафон' : 'Редактирование марафона',
      body: body,
      foot:
        '<button class="btn btn-ghost" type="button" data-close="1">Отмена</button>' +
        '<button class="btn btn-primary" type="submit" form="marathon-form">' + (isNew ? 'Создать' : 'Сохранить') + '</button>'
    });

    back.querySelector('#marathon-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = back.querySelector('#m-name').value.trim();
      var start = back.querySelector('#m-start').value;
      var end = back.querySelector('#m-end').value;
      if (!name) { toast('Укажите название марафона.', 'error'); return; }
      if (!U.isValidISO(start) || !U.isValidISO(end)) { toast('Укажите корректные даты.', 'error'); return; }
      if (end < start) { toast('Дата окончания должна быть не раньше даты начала.', 'error'); return; }

      var payload = {
        id: m ? m.id : U.uuid(),
        name: name,
        projectId: back.querySelector('#m-project').value,
        start: start,
        end: end,
        targetWords: Math.max(1, Number(back.querySelector('#m-target').value) || 10000),
        note: back.querySelector('#m-note').value.trim(),
        createdAt: m ? m.createdAt : Date.now(),
        updatedAt: Date.now()
      };

      global.WT.actions.saveMarathon(payload);
      closeModal();
      toast(isNew ? 'Марафон «' + name + '» создан.' : 'Марафон обновлён.', 'success');
    });
  }

  /* ================= Экспорт модуля ================= */

  global.WT.ui = {
    toast: toast,
    openModal: openModal,
    closeModal: closeModal,
    confirmDialog: confirmDialog,
    applyTheme: applyTheme,
    renderAll: renderAll,
    renderDashboard: renderDashboard,
    renderProjects: renderProjects,
    renderEntries: renderEntries,
    renderCharts: renderCharts,
    renderCalendar: renderCalendar,
    renderMarathons: renderMarathons,
    renderSettings: renderSettings,
    fillProjectSelects: fillProjectSelects,
    openEntryForm: openEntryForm,
    openProjectForm: openProjectForm,
    openMarathonForm: openMarathonForm,
    getProject: getProject,
    visibleProjects: visibleProjects
  };
})(window);