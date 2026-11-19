/* ============================================================
   charts.js — визуализация без внешних библиотек
   Столбчатый график, график объёма рукописи, календарь активности.
   Всё рисуется на canvas / DOM и работает офлайн.
   ============================================================ */
(function (global) {
  'use strict';

  var U = global.WT.utils;

  /* ---------- Подсказки ---------- */

  function tooltipEl() {
    return document.getElementById('chart-tooltip');
  }

  function showTooltip(html, clientX, clientY) {
    var el = tooltipEl();
    if (!el) return;
    el.innerHTML = html;
    el.hidden = false;
    var pad = 14;
    var rect = el.getBoundingClientRect();
    var x = U.clamp(clientX, rect.width / 2 + pad, window.innerWidth - rect.width / 2 - pad);
    var y = clientY;
    if (y - rect.height - pad < 0) {
      el.style.transform = 'translate(-50%, 16px)';
    } else {
      el.style.transform = 'translate(-50%, calc(-100% - 12px))';
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  function hideTooltip() {
    var el = tooltipEl();
    if (el) el.hidden = true;
  }

  /* ---------- Canvas ---------- */

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  }

  function setupCanvas(canvas) {
    var rect = canvas.getBoundingClientRect();
    var dpr = global.devicePixelRatio || 1;
    var width = Math.max(240, rect.width);
    var height = Math.max(160, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, width: width, height: height };
  }

  function niceCeil(v) {
    if (v <= 0) return 1;
    var exp = Math.floor(Math.log10(v));
    var base = Math.pow(10, exp);
    var norm = v / base;
    var nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return nice * base;
  }

  function drawGrid(ctx, padL, padT, w, h, min, max, steps) {
    var border = cssVar('--border');
    var muted = cssVar('--text-faint');
    ctx.font = '11px ' + cssVar('--font');
    ctx.lineWidth = 1;
    for (var s = 0; s <= steps; s++) {
      var value = min + ((max - min) * s) / steps;
      var y = padT + h - ((value - min) / (max - min || 1)) * h;
      ctx.strokeStyle = border;
      ctx.beginPath();
      ctx.moveTo(padL, Math.round(y) + 0.5);
      ctx.lineTo(padL + w, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = muted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(U.fmtCompact(value), padL - 8, y);
    }
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function defaultTip(item) {
    return '<strong>' + U.escapeHtml(item.longLabel || item.label) + '</strong>' +
      '<div class="tip-row"><span class="tip-muted">Написано</span><span>' +
      U.fmtSigned(item.value) + ' сл.</span></div>' +
      (item.total !== undefined
        ? '<div class="tip-row"><span class="tip-muted">Всего в рукописи</span><span>' + U.fmtNum(item.total) + ' сл.</span></div>'
        : '');
  }

  /* ---------- Столбчатый график ---------- */

  function drawBarChart(canvas, items, opts) {
    opts = opts || {};
    var tipFn = opts.tip || defaultTip;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);

    var padL = 46, padR = 8, padT = 12, padB = 30;
    var w = width - padL - padR;
    var h = height - padT - padB;

    var values = items.map(function (i) { return i.value; });
    var rawMax = Math.max.apply(null, values.concat([0]));
    var rawMin = Math.min.apply(null, values.concat([0]));
    var max = niceCeil(rawMax);
    var min = rawMin < 0 ? -niceCeil(Math.abs(rawMin)) : 0;
    if (max === min) max = min + 1;

    drawGrid(ctx, padL, padT, w, h, min, max, 4);

    // Нулевая линия
    var zeroY = padT + h - ((0 - min) / (max - min)) * h;
    ctx.strokeStyle = cssVar('--border-strong');
    ctx.beginPath();
    ctx.moveTo(padL, Math.round(zeroY) + 0.5);
    ctx.lineTo(padL + w, Math.round(zeroY) + 0.5);
    ctx.stroke();

    var n = items.length || 1;
    var slot = w / n;
    var barW = Math.max(2, Math.min(44, slot * 0.62));
    var accent = opts.color || cssVar('--accent');
    var danger = cssVar('--danger');
    var bars = [];

    items.forEach(function (item, i) {
      var x = padL + slot * i + (slot - barW) / 2;
      var y0 = zeroY;
      var y1 = padT + h - ((item.value - min) / (max - min)) * h;
      var top = Math.min(y0, y1);
      var bh = Math.max(Math.abs(y1 - y0), item.value !== 0 ? 2 : 0);

      if (item.value < 0) {
        ctx.fillStyle = danger;
      } else {
        var grad = ctx.createLinearGradient(0, top, 0, top + bh);
        grad.addColorStop(0, accent);
        grad.addColorStop(1, accent + '99');
        ctx.fillStyle = grad;
      }
      if (bh > 0) {
        roundRectPath(ctx, x, top, barW, bh, Math.min(5, barW / 2));
        ctx.fill();
      }
      bars.push({ x: x - slot * 0.2, w: barW + slot * 0.4, item: item, index: i });
    });

    // Подписи оси X
    var labelEvery = Math.max(1, Math.ceil(n / Math.floor(w / 58)));
    ctx.fillStyle = cssVar('--text-faint');
    ctx.font = '10.5px ' + cssVar('--font');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    items.forEach(function (item, i) {
      if (i % labelEvery !== 0 && i !== n - 1) return;
      var x = padL + slot * i + slot / 2;
      ctx.fillText(item.label, x, padT + h + 9);
    });

    canvas._chart = { type: 'bar', bars: bars, tipFn: tipFn };
    bindHover(canvas);
  }

  /* ---------- График объёма рукописи (линия + заливка) ---------- */

  function drawLineChart(canvas, items, opts) {
    opts = opts || {};
    var tipFn = opts.tip || defaultTip;
    var setup = setupCanvas(canvas);
    var ctx = setup.ctx;
    var width = setup.width;
    var height = setup.height;
    ctx.clearRect(0, 0, width, height);

    var padL = 52, padR = 12, padT = 14, padB = 30;
    var w = width - padL - padR;
    var h = height - padT - padB;

    if (!items.length) {
      canvas._chart = { type: 'line', points: [], tipFn: tipFn };
      return;
    }

    var values = items.map(function (i) { return i.value; });
    var max = niceCeil(Math.max.apply(null, values));
    var min = Math.min.apply(null, values);
    var floor = Math.max(0, Math.floor((min - (max - min) * 0.15) / 100) * 100);
    if (max <= floor) max = floor + 1;

    drawGrid(ctx, padL, padT, w, h, floor, max, 4);

    var n = items.length;
    var stepX = n > 1 ? w / (n - 1) : 0;
    var yOf = function (v) {
      return padT + h - ((v - floor) / (max - floor)) * h;
    };

    var points = items.map(function (item, i) {
      return {
        x: n > 1 ? padL + stepX * i : padL + w / 2,
        y: yOf(item.value),
        item: item,
        index: i
      };
    });

    // Заливка
    var grad = ctx.createLinearGradient(0, padT, 0, padT + h);
    var accent = opts.color || cssVar('--accent');
    grad.addColorStop(0, accent + '55');
    grad.addColorStop(1, accent + '05');
    ctx.beginPath();
    ctx.moveTo(points[0].x, padT + h);
    points.forEach(function (p) { ctx.lineTo(p.x, p.y); });
    ctx.lineTo(points[points.length - 1].x, padT + h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Линия
    ctx.beginPath();
    points.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Точки (только если их немного)
    if (n <= 62) {
      points.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = cssVar('--surface');
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = accent;
        ctx.stroke();
      });
    }

    // Подписи X
    var labelEvery = Math.max(1, Math.ceil(n / Math.floor(w / 58)));
    ctx.fillStyle = cssVar('--text-faint');
    ctx.font = '10.5px ' + cssVar('--font');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    items.forEach(function (item, i) {
      if (i % labelEvery !== 0 && i !== n - 1) return;
      ctx.fillText(item.label, points[i].x, padT + h + 9);
    });

    canvas._chart = { type: 'line', points: points, tipFn: tipFn };
    bindHover(canvas);
  }

  /* ---------- Наведение ---------- */

  function bindHover(canvas) {
    if (canvas._hoverBound) return;
    canvas._hoverBound = true;

    canvas.addEventListener('mousemove', function (ev) {
      var chart = canvas._chart;
      if (!chart) return;
      var rect = canvas.getBoundingClientRect();
      var x = ev.clientX - rect.left;
      var y = ev.clientY - rect.top;
      var item = null;

      if (chart.type === 'bar') {
        for (var i = 0; i < chart.bars.length; i++) {
          var b = chart.bars[i];
          if (x >= b.x && x <= b.x + b.w) { item = b.item; break; }
        }
      } else if (chart.type === 'line' && chart.points.length) {
        var best = null;
        var bestDist = Infinity;
        chart.points.forEach(function (p) {
          var d = Math.abs(p.x - x);
          if (d < bestDist) { bestDist = d; best = p; }
        });
        if (best && bestDist < 40) item = best.item;
      }

      if (item) {
        canvas.style.cursor = 'pointer';
        showTooltip(chart.tipFn(item), ev.clientX, ev.clientY);
      } else {
        canvas.style.cursor = 'default';
        hideTooltip();
      }
    });

    canvas.addEventListener('mouseleave', function () {
      hideTooltip();
    });
  }

  /* ---------- Календарь активности (heatmap) ---------- */

  /**
   * opts: { year, wordsByDate, startDate, endDate, dailyGoal, today }
   */
  function heatmap(container, opts) {
    var year = opts.year;
    var wordsByDate = opts.wordsByDate || {};
    var today = opts.today || U.todayISO();
    var dailyGoal = Number(opts.dailyGoal) || 400;

    var jan1 = new Date(year, 0, 1);
    var dec31 = new Date(year, 11, 31);
    var start = U.toISO(jan1);
    var end = U.toISO(dec31);

    // Выравниваем по неделям (Пн–Вс)
    var gridStart = U.startOfWeekISO(start);
    var gridEnd = U.addDays(U.startOfWeekISO(end), 6);

    var cells = [];
    var monthLabels = [];
    var lastMonth = -1;
    var cursor = gridStart;
    var weekIndex = 0;

    while (cursor <= gridEnd) {
      var firstInYearDate = null;
      var weekHasCell = false;

      for (var d = 0; d < 7; d++) {
        var date = U.addDays(cursor, d);
        if (date.slice(0, 4) !== String(year)) {
          cells.push({ empty: true });
          continue;
        }
        if (!firstInYearDate) firstInYearDate = date;
        weekHasCell = true;
        var words = wordsByDate[date] || 0;
        var level = 0;
        if (words > 0) {
          var ratio = words / dailyGoal;
          level = ratio < 0.5 ? 1 : ratio < 1 ? 2 : ratio < 1.5 ? 3 : 4;
        }
        var out = (opts.startDate && date < opts.startDate) || date > today;
        cells.push({ empty: false, date: date, words: words, level: level, out: out });
      }

      if (weekHasCell && firstInYearDate) {
        var monthOfFirst = Number(firstInYearDate.slice(5, 7)) - 1;
        if (monthOfFirst !== lastMonth) {
          monthLabels.push({ week: weekIndex, label: U.MONTHS_NOM[monthOfFirst] });
          lastMonth = monthOfFirst;
        } else {
          monthLabels.push({ week: weekIndex, label: '' });
        }
      } else {
        monthLabels.push({ week: weekIndex, label: '' });
      }

      weekIndex++;
      cursor = U.addDays(cursor, 7);
    }

    var weeksCount = weekIndex;
    var monthHtml = '';
    for (var m = 0; m < weeksCount; m++) {
      var found = '';
      for (var k = 0; k < monthLabels.length; k++) {
        if (monthLabels[k].week === m) { found = monthLabels[k].label; break; }
      }
      monthHtml += '<span>' + U.escapeHtml(found) + '</span>';
    }

    var cellsHtml = cells.map(function (c) {
      if (c.empty) return '<div class="hm-cell empty"></div>';
      var cls = 'hm-cell' + (c.out ? ' out' : c.level > 0 ? ' l' + c.level : '');
      return '<div class="' + cls + '" data-date="' + c.date + '" data-words="' + c.words + '"></div>';
    }).join('');

    container.innerHTML =
      '<div class="heatmap-scroll"><div class="heatmap">' +
        '<div class="hm-weekdays">' +
          '<span>Пн</span><span></span><span>Ср</span><span></span><span>Пт</span><span></span><span></span>' +
        '</div>' +
        '<div class="hm-main">' +
          '<div class="hm-months">' + monthHtml + '</div>' +
          '<div class="hm-grid">' + cellsHtml + '</div>' +
        '</div>' +
      '</div></div>' +
      '<div class="hm-legend">' +
        '<span>Мало</span>' +
        '<div class="hm-cell"></div><div class="hm-cell l1"></div><div class="hm-cell l2"></div>' +
        '<div class="hm-cell l3"></div><div class="hm-cell l4"></div>' +
        '<span>Много</span>' +
        '<span class="muted" style="margin-left:8px">Ориентир цвета — ежедневная цель (' + U.fmtNum(dailyGoal) + ' сл.)</span>' +
      '</div>';

    // Подсказки
    if (!container._heatBound) {
      container._heatBound = true;
      container.addEventListener('mousemove', function (ev) {
        var cell = ev.target.closest ? ev.target.closest('.hm-cell[data-date]') : null;
        if (!cell) { hideTooltip(); return; }
        var date = cell.getAttribute('data-date');
        var wordsNum = Number(cell.getAttribute('data-words')) || 0;
        var html = '<strong>' + U.escapeHtml(U.fmtDate(date)) + '</strong>' +
          '<div class="tip-row"><span class="tip-muted">Написано</span><span>' +
          U.fmtSigned(wordsNum) + ' сл.</span></div>' +
          '<div class="tip-row"><span class="tip-muted">Статус дня</span><span>' +
          (wordsNum > 0 ? 'активность' : wordsNum < 0 ? 'сокращение' : 'без записей') + '</span></div>';
        showTooltip(html, ev.clientX, ev.clientY);
      });
      container.addEventListener('mouseleave', hideTooltip);
    }
  }

  /* ---------- Перерисовка при смене размера / темы ---------- */

  var redrawList = [];

  function register(canvas, drawFn) {
    canvas._redraw = drawFn;
    if (redrawList.indexOf(canvas) === -1) redrawList.push(canvas);
  }

  function redrawAll() {
    redrawList = redrawList.filter(function (c) { return document.body.contains(c); });
    redrawList.forEach(function (c) {
      if (typeof c._redraw === 'function') c._redraw();
    });
  }

  global.WT.charts = {
    drawBarChart: drawBarChart,
    drawLineChart: drawLineChart,
    heatmap: heatmap,
    register: register,
    redrawAll: redrawAll,
    hideTooltip: hideTooltip
  };
})(window);