/* ============================================================
   stats.js — учёт слов и статистические расчёты

   Модель данных:
   Каждая запись — событие: либо «написано N слов за дату» (daily),
   либо «общий объём рукописи стал N» (total). Итоговый объём
   пересчитывается последовательно, поэтому режимы можно смешивать
   без двойного счёта: total-запись задаёт уровень рукописи,
   daily-запись прибавляет к нему.
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.WT.utils;

  /* ---------- Последовательный пересчёт одного проекта ---------- */

  function projectSeries(project, entries) {
    var list = (entries || [])
      .filter(function (e) { return e.projectId === project.id; })
      .slice()
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });

    var initial = Number(project.initialVolume) || 0;
    var running = initial;
    var deltas = {};       // id записи -> зачтённый прирост
    var byDate = {};       // дата -> { words, total }
    var firstDate = null;
    var lastDate = null;

    list.forEach(function (e) {
      var delta;
      if (e.mode === 'total') {
        delta = e.value - running;
        running = e.value;
      } else {
        delta = Number(e.value) || 0;
        running += delta;
      }
      deltas[e.id] = delta;

      var row = byDate[e.date] || (byDate[e.date] = { words: 0, total: 0 });
      row.words += delta;

      firstDate = firstDate ? U.minISO(firstDate, e.date) : e.date;
      lastDate = lastDate ? U.maxISO(lastDate, e.date) : e.date;
    });

    // Итоговый объём на конец каждого дня
    var runningTotal = initial;
    Object.keys(byDate).sort().forEach(function (date) {
      runningTotal += byDate[date].words;
      byDate[date].total = runningTotal;
    });

    return {
      entries: list,
      deltas: deltas,
      byDate: byDate,
      initial: initial,
      totalWords: running,
      writtenWords: running - initial,
      firstDate: firstDate,
      lastDate: lastDate
    };
  }

  /* ---------- Агрегированная лента по нескольким проектам ---------- */

  function buildTimeline(projects, entries, opts) {
    opts = opts || {};
    var wordsByDate = {};
    var initial = 0;
    var start = null;
    var end = null;
    var today = U.todayISO();

    (projects || []).forEach(function (p) {
      var s = projectSeries(p, entries);
      initial += s.initial;
      Object.keys(s.byDate).forEach(function (date) {
        wordsByDate[date] = (wordsByDate[date] || 0) + s.byDate[date].words;
      });

      var pStart = p.startDate || s.firstDate;
      if (pStart) start = start ? U.minISO(start, pStart) : pStart;
      if (s.firstDate) start = start ? U.minISO(start, s.firstDate) : s.firstDate;
      if (s.lastDate) end = end ? U.maxISO(end, s.lastDate) : s.lastDate;
    });

    if (!start) start = today;
    if (!end) end = today;
    end = U.maxISO(end, today);
    end = U.maxISO(end, start);
    if (opts.from) start = U.maxISO(start, opts.from);
    if (opts.to) end = U.minISO(end, opts.to);

    var dates = [];
    var words = [];
    var totals = [];
    var byDate = {};
    var running = initial;

    // Защита от чрезмерно длинных интервалов
    var maxDays = 4000;
    var cursor = start;
    for (var i = 0; i < maxDays && cursor <= end; i++) {
      var w = wordsByDate[cursor] || 0;
      running += w;
      dates.push(cursor);
      words.push(w);
      totals.push(running);
      byDate[cursor] = { words: w, total: running };
      cursor = U.addDays(cursor, 1);
    }

    return {
      start: start,
      end: end,
      initial: initial,
      dates: dates,
      words: words,
      totals: totals,
      byDate: byDate,
      totalWords: running,
      writtenWords: running - initial
    };
  }

  /* ---------- Сводка статистики ---------- */

  function summarize(timeline, opts) {
    opts = opts || {};
    var today = opts.today || U.todayISO();
    var targetWords = Number(opts.targetWords) || 0;
    var dailyGoal = Number(opts.dailyGoal) || 0;
    var endDate = opts.endDate || null;
    var startDate = opts.startDate || timeline.start;

    var totalWords = timeline.totalWords;
    var initial = timeline.initial;

    // Учитываем только записи до «сегодня»: будущие даты не влияют на текущий объём
    var totalAtToday = initial;
    var activeDays = 0;
    var positiveDays = 0;
    var bestDay = { date: null, words: 0 };
    var sumPositive = 0;
    var writtenUntilToday = 0;

    timeline.dates.forEach(function (date, i) {
      if (date > today) return;
      var w = timeline.words[i];
      totalAtToday += w;
      writtenUntilToday += w;
      if (w !== 0) activeDays++;
      if (w > 0) {
        positiveDays++;
        sumPositive += w;
        if (w > bestDay.words) bestDay = { date: date, words: w };
      }
    });

    totalWords = totalAtToday;
    var writtenWords = writtenUntilToday;

    var wordsToday = timeline.byDate[today] ? timeline.byDate[today].words : 0;
    var yesterday = U.addDays(today, -1);
    var wordsYesterday = timeline.byDate[yesterday] ? timeline.byDate[yesterday].words : 0;

    var progressPercent = targetWords > 0 ? (totalWords / targetWords) * 100 : 0;
    var wordsRemaining = Math.max(0, targetWords - totalWords);

    // Средние
    var daysElapsed = Math.max(1, U.daysBetween(startDate, today) + 1);

    var avgPerDay = writtenWords / daysElapsed;
    var avgPerActiveDay = activeDays > 0 ? writtenWords / activeDays : 0;

    // Серии продуктивных дней (words > 0)
    var currentStreak = 0;
    var longestStreak = 0;
    var run = 0;
    timeline.dates.forEach(function (date, i) {
      if (date > today) return;
      if (timeline.words[i] > 0) {
        run++;
        if (run > longestStreak) longestStreak = run;
      } else {
        run = 0;
      }
    });

    // Текущая серия: идём от сегодня назад
    var idxToday = timeline.dates.indexOf(today);
    if (idxToday >= 0) {
      var startIdx = idxToday;
      if (timeline.words[idxToday] <= 0) startIdx = idxToday - 1; // вчера допускается
      for (var i = startIdx; i >= 0; i--) {
        if (timeline.words[i] > 0) currentStreak++;
        else break;
      }
    }

    // Прогноз завершения
    var projectedEndDate = null;
    if (wordsRemaining <= 0) {
      projectedEndDate = 'done';
    } else if (avgPerDay > 0) {
      projectedEndDate = U.addDays(today, Math.ceil(wordsRemaining / avgPerDay));
    }

    // Необходимый темп
    var requiredPace = null;
    var daysLeft = null;
    if (endDate && wordsRemaining > 0) {
      daysLeft = U.daysBetween(today, endDate) + 1;
      if (daysLeft > 0) {
        requiredPace = wordsRemaining / daysLeft;
      }
    }

    return {
      startDate: startDate,
      today: today,
      initial: initial,
      totalWords: totalWords,
      writtenWords: writtenWords,
      targetWords: targetWords,
      dailyGoal: dailyGoal,
      endDate: endDate,
      wordsToday: wordsToday,
      wordsYesterday: wordsYesterday,
      todayDiff: wordsToday - wordsYesterday,
      progressPercent: progressPercent,
      wordsRemaining: wordsRemaining,
      daysElapsed: daysElapsed,
      activeDays: activeDays,
      positiveDays: positiveDays,
      sumPositive: sumPositive,
      avgPerDay: avgPerDay,
      avgPerActiveDay: avgPerActiveDay,
      bestDay: bestDay,
      currentStreak: currentStreak,
      longestStreak: longestStreak,
      projectedEndDate: projectedEndDate,
      requiredPace: requiredPace,
      daysLeft: daysLeft
    };
  }

  /* ---------- Публичные обёртки ---------- */

  function forProject(project, entries, opts) {
    var timeline = buildTimeline([project], entries);
    opts = opts || {};
    return summarize(timeline, {
      today: opts.today,
      targetWords: project.targetWords,
      dailyGoal: project.dailyGoal,
      endDate: project.endDate,
      startDate: project.startDate || timeline.start
    });
  }

  function forProjects(projects, entries, opts) {
    projects = projects || [];
    var timeline = buildTimeline(projects, entries);
    var targetWords = 0;
    var dailyGoal = 0;
    var minStart = null;
    var maxEnd = null;
    projects.forEach(function (p) {
      targetWords += Number(p.targetWords) || 0;
      dailyGoal += Number(p.dailyGoal) || 0;
      if (p.startDate) minStart = minStart ? U.minISO(minStart, p.startDate) : p.startDate;
      if (p.endDate) maxEnd = maxEnd ? U.maxISO(maxEnd, p.endDate) : p.endDate;
    });
    return summarize(timeline, Object.assign({
      targetWords: targetWords,
      dailyGoal: dailyGoal,
      startDate: minStart || timeline.start,
      endDate: maxEnd
    }, opts || {}));
  }

  /* ---------- Строки журнала с зачтённым приростом ---------- */

  function entryRows(project, entries) {
    var s = projectSeries(project, entries);
    return s.entries.map(function (e) {
      return Object.assign({}, e, { delta: s.deltas[e.id] });
    }).reverse(); // новые сверху
  }

  function allEntryRows(projects, entries) {
    var byId = {};
    (projects || []).forEach(function (p) { byId[p.id] = p; });
    var rows = [];
    (entries || []).forEach(function (e) {
      var p = byId[e.projectId];
      if (!p) return;
      var s = projectSeries(p, entries);
      rows.push(Object.assign({}, e, {
        delta: s.deltas[e.id],
        projectName: p.name,
        projectColor: p.color
      }));
    });
    rows.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    return rows;
  }

  /* ---------- Агрегация для графиков ---------- */

  /**
   * mode: 'day' | 'week' | 'month'
   * Возвращает элементы: { key, label, value, sub, date }
   */
  function aggregate(timeline, mode) {
    var items = [];
    if (mode === 'day') {
      timeline.dates.forEach(function (date, i) {
        items.push({
          key: date,
          date: date,
          label: U.fmtDate(date, 'short').slice(0, 5),
          longLabel: U.fmtDate(date),
          value: timeline.words[i],
          total: timeline.totals[i],
          days: 1
        });
      });
      return items;
    }

    var groups = {};
    var order = [];
    timeline.dates.forEach(function (date, i) {
      var key = mode === 'week' ? U.weekKey(date) : U.monthKey(date);
      if (!groups[key]) {
        groups[key] = { key: key, value: 0, total: 0, days: 0, first: date, last: date };
        order.push(key);
      }
      var g = groups[key];
      g.value += timeline.words[i];
      g.total = timeline.totals[i];
      g.days++;
      g.last = date;
    });

    order.forEach(function (key) {
      var g = groups[key];
      items.push({
        key: key,
        date: g.first,
        label: mode === 'week'
          ? U.fmtDate(g.first, 'short').slice(0, 5)
          : U.MONTHS_NOM[Number(g.first.slice(5, 7)) - 1].slice(0, 3),
        longLabel: mode === 'week'
          ? 'Неделя ' + U.fmtWeekRange(g.first)
          : U.fmtMonth(key),
        value: g.value,
        total: g.total,
        days: g.days
      });
    });
    return items;
  }

  /* ---------- Прогресс марафона ---------- */

  function marathonProgress(marathon, project, entries, opts) {
    var today = (opts && opts.today) || U.todayISO();
    var written = 0;
    var days = [];

    if (project) {
      var s = projectSeries(project, entries);
      var from = marathon.start;
      var to = U.minISO(marathon.end, today);
      if (from <= to) {
        var cursor = from;
        while (cursor <= to) {
          var row = s.byDate[cursor];
          var w = row ? row.words : 0;
          written += w;
          days.push({ date: cursor, words: w });
          cursor = U.addDays(cursor, 1);
        }
      }
    }

    var target = Number(marathon.targetWords) || 0;
    var remaining = Math.max(0, target - written);
    var totalDays = U.daysBetween(marathon.start, marathon.end) + 1;
    var daysPassed = U.clamp(U.daysBetween(marathon.start, today) + 1, 0, totalDays);
    var daysLeft = U.clamp(U.daysBetween(today, marathon.end) + 1, 0, totalDays);
    var isFinished = today > marathon.end;
    var isPending = today < marathon.start;

    var requiredPace = null;
    if (!isFinished && remaining > 0 && daysLeft > 0) requiredPace = remaining / daysLeft;

    return {
      written: written,
      remaining: remaining,
      target: target,
      progressPercent: target > 0 ? (written / target) * 100 : 0,
      totalDays: totalDays,
      daysPassed: daysPassed,
      daysLeft: daysLeft,
      avgPerDay: daysPassed > 0 ? written / daysPassed : 0,
      requiredPace: requiredPace,
      isFinished: isFinished,
      isPending: isPending,
      days: days
    };
  }

  global.WT.stats = {
    projectSeries: projectSeries,
    buildTimeline: buildTimeline,
    summarize: summarize,
    forProject: forProject,
    forProjects: forProjects,
    entryRows: entryRows,
    allEntryRows: allEntryRows,
    aggregate: aggregate,
    marathonProgress: marathonProgress
  };
})(window);