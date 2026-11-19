/* ============================================================
   utils.js — общие утилиты: даты, числа, форматирование, DOM
   ============================================================ */
(function (global) {
  'use strict';

  var DAY_MS = 86400000;

  var MONTHS_GEN = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  var MONTHS_NOM = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  var WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  /* ---------- Идентификаторы ---------- */
  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* ---------- Даты (работаем со строками YYYY-MM-DD) ---------- */
  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function toISO(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function parseISO(iso) {
    var p = String(iso || '').split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function isValidISO(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return false;
    var d = parseISO(iso);
    return !isNaN(d.getTime()) && toISO(d) === iso;
  }

  function todayISO() {
    return toISO(new Date());
  }

  function addDays(iso, n) {
    var d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function daysBetween(a, b) {
    return Math.round((parseISO(b) - parseISO(a)) / DAY_MS);
  }

  function minISO(a, b) {
    return a <= b ? a : b;
  }

  function maxISO(a, b) {
    return a >= b ? a : b;
  }

  /* Начало недели — понедельник */
  function startOfWeekISO(iso) {
    var d = parseISO(iso);
    var day = (d.getDay() + 6) % 7; // 0 = Пн
    d.setDate(d.getDate() - day);
    return toISO(d);
  }

  function monthKey(iso) {
    return String(iso).slice(0, 7);
  }

  function weekKey(iso) {
    return startOfWeekISO(iso);
  }

  function fmtDate(iso, style) {
    if (!iso) return '—';
    var d = parseISO(iso);
    if (isNaN(d.getTime())) return '—';
    if (style === 'short') return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
    if (style === 'medium') return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()];
    return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtMonth(monthKeyStr) {
    var p = String(monthKeyStr).split('-');
    return MONTHS_NOM[Number(p[1]) - 1] + ' ' + p[0];
  }

  function fmtWeekRange(startISO) {
    return fmtDate(startISO, 'medium') + ' – ' + fmtDate(addDays(startISO, 6), 'medium');
  }

  function relativeDay(iso) {
    var diff = daysBetween(todayISO(), iso);
    if (diff === 0) return 'сегодня';
    if (diff === -1) return 'вчера';
    if (diff === 1) return 'завтра';
    return diff < 0 ? Math.abs(diff) + ' дн. назад' : 'через ' + diff + ' дн.';
  }

  /* ---------- Числа ---------- */
  function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    var rounded = Math.round(Number(n));
    return rounded.toLocaleString('ru-RU').replace(/\u00A0/g, ' ');
  }

  function fmtSigned(n) {
    var v = Math.round(Number(n) || 0);
    if (v > 0) return '+' + fmtNum(v);
    if (v < 0) return '−' + fmtNum(Math.abs(v));
    return '0';
  }

  function fmtCompact(n) {
    var v = Number(n) || 0;
    var abs = Math.abs(v);
    var sign = v < 0 ? '−' : '';
    if (abs >= 1000000) return sign + trimZero((abs / 1000000).toFixed(1)) + ' млн';
    if (abs >= 1000) return sign + trimZero((abs / 1000).toFixed(abs >= 10000 ? 0 : 1)) + ' тыс';
    return sign + String(Math.round(abs));
  }

  function trimZero(s) {
    return s.replace(/\.0$/, '');
  }

  function fmtPercent(n, digits) {
    var v = Number(n) || 0;
    return v.toFixed(digits === undefined ? 1 : digits).replace(/\.0+$/, '').replace('.', ',') + '%';
  }

  function plural(n, one, few, many) {
    var a = Math.abs(Math.round(Number(n) || 0)) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  function words(n) {
    return fmtNum(n) + ' ' + plural(n, 'слово', 'слова', 'слов');
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  /* ---------- DOM / безопасность ---------- */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, ms);
    };
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  global.WT = global.WT || {};
  global.WT.utils = {
    DAY_MS: DAY_MS,
    MONTHS_NOM: MONTHS_NOM,
    MONTHS_GEN: MONTHS_GEN,
    WEEKDAYS_SHORT: WEEKDAYS_SHORT,
    uuid: uuid,
    pad: pad,
    toISO: toISO,
    parseISO: parseISO,
    isValidISO: isValidISO,
    todayISO: todayISO,
    addDays: addDays,
    daysBetween: daysBetween,
    minISO: minISO,
    maxISO: maxISO,
    startOfWeekISO: startOfWeekISO,
    monthKey: monthKey,
    weekKey: weekKey,
    fmtDate: fmtDate,
    fmtMonth: fmtMonth,
    fmtWeekRange: fmtWeekRange,
    relativeDay: relativeDay,
    fmtNum: fmtNum,
    fmtSigned: fmtSigned,
    fmtCompact: fmtCompact,
    fmtPercent: fmtPercent,
    plural: plural,
    words: words,
    clamp: clamp,
    escapeHtml: escapeHtml,
    debounce: debounce,
    qs: qs,
    qsa: qsa
  };
})(window);