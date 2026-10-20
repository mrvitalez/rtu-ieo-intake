/* Shared behaviour for the IEO intake forms. No data is stored in the browser. */
(function () {
  'use strict';

  var CONSENT_HTML =
    '<p>By accepting this Data Privacy Statement, I (as “Data Subject”) grant my free, voluntary and unconditional consent to the collection and processing of all Personal Data to the information database system of the Rizal Technological University by whatever means in accordance with Republic Act (R.A.) 10173, otherwise known as the “Data Privacy Act of 2012” of the Republic of the Philippines, including its Implementing Rules and Regulations (IRR) as well as all other guidelines and issuances by the National Privacy Commission (NPC). I also consent to the following:</p>' +
    '<ol>' +
    '<li>The University may collect personal data during my application for admission purposes.</li>' +
    '<li>My personal information can be accessed and used only by authorized personnel and officials connected to the University for legitimate purposes only.</li>' +
    '<li>The University may share or disclose some of my personal information to others in its process to deliver necessary services for the stakeholders and the institution, including but not limited to:' +
    '<ol type="a">' +
    '<li>sharing information for accreditation purposes (Accrediting Agency of Chartered Colleges and Universities in the Philippines (AACCUP).</li>' +
    '<li>conducting research or surveys for purposes of institutional development.</li>' +
    '<li>inclusive education functions and services.</li>' +
    '<li>other legitimate processes of the University.</li>' +
    '</ol></li></ol>' +
    '<p>I hereby declare that all the information provided are true and accurate to the best of my knowledge. I hereby attest to the completeness and accuracy of all the information that I have provided.</p>' +
    '<p>I am fully aware that any false information provided may lead to my automatic dismissal and I will comply with all the terms and conditions set by your University.</p>';

  /* ---------- text size control ---------- */
  function setupTextSize() {
    var root = document.documentElement;
    var saved = null;
    try { saved = localStorage.getItem('ieo-text-size'); } catch (e) { /* storage blocked */ }
    if (saved) root.setAttribute('data-text', saved);
    var buttons = document.querySelectorAll('[data-text-size]');
    function sync() {
      var cur = root.getAttribute('data-text') || 'normal';
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-text-size') === cur)); });
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-text-size');
        if (v === 'normal') root.removeAttribute('data-text'); else root.setAttribute('data-text', v);
        try { localStorage.setItem('ieo-text-size', v); } catch (e) { /* ignore */ }
        sync();
      });
    });
    sync();
  }

  /* ---------- consent blocks ---------- */
  function fillConsent() {
    document.querySelectorAll('[data-consent]').forEach(function (box) {
      var name = box.getAttribute('data-consent') || 'consent';
      var intro = box.innerHTML;
      box.innerHTML = '<div class="statement">' + intro + CONSENT_HTML + '</div>' +
        '<div class="field agree-field"><label class="choice agree"><input type="checkbox" name="' + name + '" id="' + name + '" required> ' +
        '<span>I have read the Data Privacy Consent and I agree to it.</span></label></div>';
    });
  }

  /* ---------- conditional sections ---------- */
  function valuesOf(form, name) {
    var els = form.querySelectorAll('[name="' + name + '"]');
    var out = [];
    els.forEach(function (el) {
      if ((el.type === 'checkbox' || el.type === 'radio')) { if (el.checked) out.push(el.value); }
      else if (el.value) out.push(el.value);
    });
    return out;
  }

  function setupConditionals(form) {
    var targets = form.querySelectorAll('[data-show-if]');
    function update() {
      targets.forEach(function (t) {
        var parts = t.getAttribute('data-show-if').split('=');
        var show = valuesOf(form, parts[0]).indexOf(parts.slice(1).join('=')) >= 0;
        t.hidden = !show;
        t.querySelectorAll('input, select, textarea').forEach(function (el) { el.disabled = !show; });
      });
    }
    form.addEventListener('change', update);
    update();
  }

  /* ---------- reading ---------- */
  function readForm(form) {
    var data = {};
    var seen = {};
    form.querySelectorAll('[name]').forEach(function (el) {
      var n = el.name;
      if (!n || el.disabled || seen[n]) return;
      seen[n] = true;
      var all = form.querySelectorAll('[name="' + n + '"]');
      if (el.type === 'checkbox' && (all.length > 1 || el.hasAttribute('data-multi'))) {
        data[n] = valuesOf(form, n);
      } else if (el.type === 'checkbox') {
        data[n] = el.checked;
      } else if (el.type === 'radio') {
        data[n] = valuesOf(form, n)[0] || '';
      } else {
        data[n] = el.value.trim();
      }
    });
    return data;
  }

  /* ---------- validation display ---------- */
  function fieldContainer(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    if (!el) return null;
    return el.closest('[data-group]') || el.closest('.field') || el.parentElement;
  }

  function labelFor(form, name) {
    var c = fieldContainer(form, name);
    var el = form.querySelector('[name="' + name + '"]');
    if (c && c.hasAttribute('data-label')) return c.getAttribute('data-label');
    if (el && el.id) {
      var l = form.querySelector('label[for="' + el.id + '"]');
      if (l) return l.textContent.replace(/\*|\(optional\)/g, '').trim();
    }
    var lg = c && c.querySelector('legend, .group-label');
    if (lg) return lg.textContent.replace(/\*/g, '').trim();
    return name;
  }

  function clearErrors(form) {
    form.querySelectorAll('.error-text[data-for]').forEach(function (e) { e.remove(); });
    form.querySelectorAll('[aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); });
    var s = form.querySelector('.error-summary');
    if (s) s.remove();
  }

  function showErrors(form, errors, summaryTitle) {
    clearErrors(form);
    var names = Object.keys(errors);
    if (!names.length) return;
    var summary = document.createElement('div');
    summary.className = 'error-summary';
    summary.setAttribute('role', 'alert');
    summary.setAttribute('tabindex', '-1');
    var list = '';
    names.forEach(function (n) {
      var els = form.querySelectorAll('[name="' + n + '"]');
      var c = fieldContainer(form, n);
      var id = 'err-' + n.replace(/[^a-z0-9_-]/gi, '');
      if (c) {
        var p = document.createElement('p');
        p.className = 'error-text';
        p.id = id;
        p.setAttribute('data-for', n);
        p.textContent = errors[n];
        c.appendChild(p);
      }
      els.forEach(function (el) {
        el.setAttribute('aria-invalid', 'true');
        var d = (el.getAttribute('aria-describedby') || '').split(' ').filter(function (x) { return x && x !== id; });
        d.push(id);
        el.setAttribute('aria-describedby', d.join(' '));
      });
      var target = els[0] ? (els[0].id || '') : '';
      list += '<li>' + (target ? '<a href="#' + target + '">' : '') + escapeHtml(labelFor(form, n)) + ': ' + escapeHtml(errors[n]) + (target ? '</a>' : '') + '</li>';
    });
    summary.innerHTML = '<h2>' + escapeHtml(summaryTitle || 'Some answers need attention') + '</h2><ul>' + list + '</ul>';
    summary.addEventListener('click', function (ev) {
      var a = ev.target.closest('a');
      if (!a) return;
      ev.preventDefault();
      var t = document.getElementById(a.getAttribute('href').slice(1));
      if (t) { t.focus(); t.scrollIntoView({ block: 'center' }); }
    });
    var anchor = form.querySelector('[data-error-anchor]') || form.firstElementChild;
    form.insertBefore(summary, anchor);
    summary.focus();
  }

  function validateRequired(form) {
    var errors = {};
    form.querySelectorAll('[required]').forEach(function (el) {
      if (el.disabled || errors[el.name]) return;
      if (el.type === 'checkbox' || el.type === 'radio') {
        if (!valuesOf(form, el.name).length) {
          errors[el.name] = el.name.indexOf('consent') === 0 || el.name.indexOf('_ack') > 0 ? 'Please read and agree to continue.' : 'Choose an option.';
        }
      } else if (!el.value.trim()) {
        errors[el.name] = 'This is required.';
      } else if (el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim())) {
        errors[el.name] = 'Enter a valid email address.';
      }
    });
    form.querySelectorAll('[data-required-group]').forEach(function (g) {
      var n = g.getAttribute('data-required-group');
      var anyEnabled = Array.prototype.some.call(form.querySelectorAll('[name="' + n + '"]'), function (e) { return !e.disabled; });
      if (anyEnabled && !valuesOf(form, n).length) errors[n] = 'Select at least one.';
    });
    form.querySelectorAll('input[type="email"]').forEach(function (el) {
      if (!el.disabled && el.value.trim() && !errors[el.name] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim())) errors[el.name] = 'Enter a valid email address.';
    });
    form.querySelectorAll('[data-pattern]').forEach(function (el) {
      if (!el.disabled && el.value.trim() && !errors[el.name] && !new RegExp(el.getAttribute('data-pattern')).test(el.value.trim())) {
        errors[el.name] = el.getAttribute('data-pattern-message') || 'Check this answer.';
      }
    });
    return errors;
  }

  /* ---------- backend ---------- */
  function endpoint() { return (window.IEO_CONFIG && window.IEO_CONFIG.ENDPOINT_URL) || ''; }

  function post(payload) {
    if (!endpoint()) return Promise.reject(new Error('NOT_CONNECTED'));
    // text/plain keeps this a simple request, which Apps Script web apps accept from any site.
    return fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    }).then(function (r) { return r.json(); });
  }

  function get(params) {
    if (!endpoint()) return Promise.reject(new Error('NOT_CONNECTED'));
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(endpoint() + (endpoint().indexOf('?') >= 0 ? '&' : '?') + q, { redirect: 'follow' }).then(function (r) { return r.json(); });
  }

  /**
   * Wires a form: required checks, optional extra checks, posting, and server field errors.
   * opts: { action, token(), extraValidate(data) -> errors, onSuccess(result, data), button }
   */
  function wireForm(form, opts) {
    var btn = opts.button || form.querySelector('button[type="submit"]');
    var label = btn ? btn.innerHTML : '';
    form.setAttribute('novalidate', '');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var errors = validateRequired(form);
      var data = readForm(form);
      if (opts.extraValidate) {
        var more = opts.extraValidate(data) || {};
        Object.keys(more).forEach(function (k) { if (!errors[k]) errors[k] = more[k]; });
      }
      if (Object.keys(errors).length) { showErrors(form, errors); return; }
      clearErrors(form);
      if (!endpoint()) {
        showNotice(form, 'warn', 'Preview mode',
          'Every answer passed the checks, but this form is not connected to the Inclusive Education Office yet, so nothing was sent. ' +
          'The office sets this up when the system goes live.');
        return;
      }
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending'; }
      var payload = { action: opts.action, data: data, website: (form.querySelector('[name="website"]') || {}).value || '' };
      if (opts.token) payload.token = opts.token();
      delete payload.data.website;
      post(payload).then(function (res) {
        if (res && res.ok) { opts.onSuccess(res, data); return; }
        if (res && res.fields) { showErrors(form, res.fields, res.error); return; }
        showNotice(form, 'error', 'Not sent', (res && res.error) || 'The form could not be sent. Please try again.');
      }).catch(function () {
        showNotice(form, 'error', 'Not sent', 'The form could not reach the Inclusive Education Office. Check your internet connection and try again. Your answers are still on this page.');
      }).then(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = label; }
      });
    });
  }

  function showNotice(form, kind, title, text) {
    var old = form.querySelector('.form-notice');
    if (old) old.remove();
    var box = document.createElement('div');
    box.className = 'callout ' + kind + ' form-notice';
    box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    box.setAttribute('tabindex', '-1');
    box.innerHTML = '<h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(text) + '</p>';
    var actions = form.querySelector('.actions');
    form.insertBefore(box, actions);
    box.focus();
  }

  /* ---------- small helpers ---------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function nowText() {
    var d = new Date();
    try {
      return d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (e) { return d.toString(); }
  }

  function startClock(el) {
    if (!el) return;
    var tick = function () { el.value = nowText(); };
    tick();
    setInterval(tick, 15000);
  }

  function ageFrom(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
    var b = new Date(isoDate + 'T00:00:00');
    var n = new Date();
    var a = n.getFullYear() - b.getFullYear();
    if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
    return a > 0 && a < 120 ? String(a) : '';
  }

  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  document.addEventListener('DOMContentLoaded', function () {
    setupTextSize();
    fillConsent();
    document.querySelectorAll('form[data-ieo-form]').forEach(setupConditionals);
    document.querySelectorAll('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });
  });

  window.IEOForms = {
    readForm: readForm, wireForm: wireForm, showErrors: showErrors, clearErrors: clearErrors,
    showNotice: showNotice, escapeHtml: escapeHtml, nowText: nowText, startClock: startClock,
    ageFrom: ageFrom, norm: norm, get: get, post: post, endpoint: endpoint, setupConditionals: setupConditionals
  };
})();
