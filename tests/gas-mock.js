/*
 * Minimal in-memory stand-ins for the Google Apps Script services this project uses,
 * so the real .gs files can be exercised under Node. Test-only; never deployed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function makeWorld() {
  const files = {}; // spreadsheet id -> spreadsheet
  let nextId = 1;

  class Range {
    constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr: nr || 1, nc: nc || 1 }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = [];
        for (let j = 0; j < this.nc; j++) {
          const v = (this.sheet.data[this.r - 1 + i] || [])[this.c - 1 + j];
          row.push(v === undefined ? '' : v);
        }
        out.push(row);
      }
      return out;
    }
    setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => this.sheet.set(this.r + i, this.c + j, v))); return this; }
    setValue(v) { this.sheet.set(this.r, this.c, v); return this; }
    setFontWeight() { return this; }
    setNumberFormat(f) { this.sheet.format = f; return this; }
  }

  class Sheet {
    constructor(name) { this.name = name; this.data = []; this.format = null; }
    set(r, c, v) {
      if (typeof v === 'string' && /^[=+\-@]/.test(v)) throw new Error('FORMULA INJECTION: unescaped cell value ' + JSON.stringify(v));
      if (typeof v === 'string' && v[0] === "'") v = v.slice(1); // Sheets keeps the text, drops the apostrophe
      while (this.data.length < r) this.data.push([]);
      const row = this.data[r - 1];
      while (row.length < c) row.push('');
      row[c - 1] = v;
    }
    getName() { return this.name; }
    getLastRow() { return this.data.length; }
    getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
    getMaxRows() { return Math.max(1000, this.data.length); }
    getMaxColumns() { return Math.max(26, this.getLastColumn()); }
    getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
    getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
    appendRow(row) { const r = this.data.length + 1; row.forEach((v, j) => this.set(r, j + 1, v)); }
    setFrozenRows() { return this; }
  }

  class Spreadsheet {
    constructor(name) { this.id = 'sheet' + (nextId++); this.name = name; this.sheets = [new Sheet('Sheet1')]; }
    getId() { return this.id; }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(n); this.sheets.push(s); return s; }
    getSheets() { return this.sheets.slice(); }
    deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
    setSpreadsheetTimeZone() { }
  }

  const SpreadsheetApp = {
    create(name) { const s = new Spreadsheet(name); files[s.id] = s; return s; },
    openById(id) { if (!files[id]) throw new Error('No spreadsheet ' + id); return files[id]; }
  };
  // Gmail and Calendar stand-ins: everything sent or created is recorded for the tests.
  const mail = [];
  const events = {};
  let eventSeq = 1;
  class CalEvent {
    constructor(owner, title, start, end, opts) {
      Object.assign(this, { id: 'evt' + (eventSeq++) + '@google.com', owner, title, start, end, opts: opts || {}, guests: [], deleted: false });
      this.location = this.opts.location; this.description = this.opts.description;
    }
    getId() { return this.id; }
    setTime(s, e) { this.start = s; this.end = e; return this; }
    setLocation(l) { this.location = l; return this; }
    setDescription(d) { this.description = d; return this; }
    addGuest(g) { this.guests.push(g); return this; }
    getGuestList() { return this.guests.map(g => ({ getEmail: () => g })); }
    deleteEvent() { this.deleted = true; }
  }
  function calendarFor(owner) {
    return {
      owner,
      createEvent(title, start, end, opts) { const e = new CalEvent(owner, title, start, end, opts); events[e.id] = e; return e; },
      getEventById(id) { const e = events[id]; return e && e.owner === owner && !e.deleted ? e : null; }
    };
  }
  return { SpreadsheetApp, files, mail, events, calendarFor };
}

function fmt(date, tz, pattern) {
  // Enough of Java SimpleDateFormat (what Apps Script uses) for this project.
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'long' })
    .formatToParts(date).reduce((o, x) => (o[x.type] = x.value, o), {});
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const h = Number(p.hour);
  const map = {
    yyyy: p.year, MMMM: months[Number(p.month) - 1], MM: p.month, dd: p.day, d: String(Number(p.day)),
    HH: p.hour, hh: String(h % 12 || 12).padStart(2, '0'), h: String(h % 12 || 12), mm: p.minute, ss: p.second,
    EEEE: p.weekday, u: String(days.indexOf(p.weekday) + 1), a: h < 12 ? 'AM' : 'PM'
  };
  return pattern.replace(/yyyy|MMMM|MM|dd|d|HH|hh|h|mm|ss|EEEE|u|a/g, t => map[t]);
}

/** Loads a project folder's .gs files into a fresh context bound to the shared world. */
function loadProject(dir, world, opts) {
  opts = opts || {};
  const props = {};
  const cache = {};
  const user = { email: opts.email || '' };
  const ctx = {
    console: { log() { }, error() { }, info() { } },
    Date, Math, JSON, Object, Array, String, Number, RegExp, Error, Promise,
    SpreadsheetApp: world.SpreadsheetApp,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
    Session: { getActiveUser: () => ({ getEmail: () => user.email }), getEffectiveUser: () => ({ getEmail: () => opts.owner || 'ieo.owner@gmail.com' }) },
    MailApp: { sendEmail: m => { if (world.failMail) throw new Error('Mail quota exceeded'); world.mail.push(Object.assign({ from: user.email || opts.owner || 'ieo.owner@gmail.com' }, m)); } },
    CalendarApp: {
      getDefaultCalendar: () => world.calendarFor(user.email),
      getCalendarById: id => (world.sharedCalendars && world.sharedCalendars[id] && world.sharedCalendars[id].indexOf(user.email) >= 0 ? world.calendarFor('shared:' + id) : null)
    },
    Utilities: {
      formatDate: fmt,
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(s, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b))
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: s => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } })
    },
    HtmlService: {
      XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' }, // the only two values Google supports
      createHtmlOutput: h => htmlOut(h),
      createHtmlOutputFromFile: n => htmlOut(fs.readFileSync(path.join(dir, n + '.html'), 'utf8')),
      createTemplateFromFile: n => {
        const t = {
          evaluate() {
            let src = fs.readFileSync(path.join(dir, n + '.html'), 'utf8');
            src = src.replace(/<\?!=\s*include_\('([^']+)'\)\s*\?>/g, (m, f) => fs.readFileSync(path.join(dir, f + '.html'), 'utf8'));
            src = src.replace(/<\?=\s*siteUrl\s*\?>/g, JSON.stringify(t.siteUrl));
            src = src.replace(/<\?=\s*staffEmail\s*\?>/g, String(t.staffEmail).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
            if (/<\?/.test(src)) throw new Error('Unrendered scriptlet in ' + n);
            return htmlOut(src);
          }
        };
        return t;
      }
    }
  };
  function htmlOut(h) {
    return { html: h, setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode(m) { if (m == null) throw new Error('Argument cannot be null: mode'); return this; }, getContent() { return this.html; } };
  }
  vm.createContext(ctx);
  ['Schema.gs', 'Code.gs'].forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: path.join(dir, f) }));
  return { ctx, props, cache, user };
}

module.exports = { makeWorld, loadProject };
