/* RTU-OVPAA-IEO-F002 Student Portfolio Form for Inclusive Education, with the ISP waiver */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var F = window.IEOForms;
  var gate = document.getElementById('gate');
  var portfolio = document.getElementById('f002');
  var waiver = document.getElementById('waiver');
  var done = document.getElementById('done');

  // Opening a different link in the same tab only changes the part after '#'; start over.
  window.addEventListener('hashchange', function () { location.reload(); });

  var hash = location.hash.replace(/^#/, '');
  var preview = hash === 'preview';
  var tokenMatch = /(?:^|&)t=([a-f0-9]{64})(?:&|$)/.exec(hash);
  var token = tokenMatch ? tokenMatch[1] : '';

  F.startClock(document.getElementById('sig_datetime'));
  F.startClock(document.getElementById('w_datetime'));

  function showGate(kind, title, html) {
    gate.className = 'callout ' + kind;
    gate.innerHTML = '<h2>' + F.escapeHtml(title) + '</h2>' + html;
    gate.hidden = false;
    gate.focus();
  }

  function open(form) {
    gate.hidden = true;
    form.hidden = false;
  }

  if (preview) {
    window.IEO_CONFIG.ENDPOINT_URL = ''; // a preview never sends anything
    showGate('warn', 'Preview of the form',
      '<p>This is a preview for reviewing the form. Nothing you type here is sent. Students open this form from the link the Inclusive Education Office gives them.</p>');
    portfolio.hidden = false;
    waiver.hidden = false;
  } else if (!token) {
    showGate('info', 'This form opens from your IEO link',
      '<p>The Student Portfolio Form is filled in during the needs assessment, after your required documents are complete. ' +
      'The Inclusive Education Office gives you a personal link to it.</p>' +
      '<p>Not yet referred? Start with the <a href="f001.html">Referral Slip for Needs Assessment</a>. ' +
      'Want to know which documents to prepare? See <a href="requirements.html">required documents</a>.</p>');
  } else if (!F.endpoint()) {
    showGate('warn', 'Not connected yet',
      '<p>This form is not connected to the Inclusive Education Office yet. Please contact the office.</p>');
  } else {
    F.get({ action: 'status', t: token }).then(function (s) {
      if (!s || !s.ok) throw new Error('status');
      if (!s.valid) {
        showGate('error', 'This link has expired or is no longer valid',
          '<p>Ask the Inclusive Education Office for a new link. Links stay valid for 30 days.</p>');
      } else if (s.portfolioOpen) {
        open(portfolio);
      } else if (s.waiverOpen) {
        open(waiver);
        document.getElementById('waiver_name').focus();
      } else {
        showGate('info', 'Nothing to fill in right now',
          '<p>Your portfolio has been received. If the Inclusive Education Office needs anything else from you, it will contact you.</p>');
      }
    }).catch(function () {
      showGate('error', 'Could not check your link',
        '<p>Check your internet connection and reload this page. If it keeps happening, contact the Inclusive Education Office.</p>');
    });
  }

  function finish(res, title, text) {
    portfolio.hidden = true;
    waiver.hidden = true;
    gate.hidden = true;
    document.getElementById('done-title').textContent = title;
    document.getElementById('done-text').textContent = text;
    document.getElementById('done-ref').textContent = res.ref;
    document.getElementById('done-time').textContent = F.nowText();
    done.hidden = false;
    window.scrollTo(0, 0);
    done.focus();
  }

  F.wireForm(portfolio, {
    action: 'submit_f002',
    token: function () { return token; },
    extraValidate: function (d) {
      var e = {};
      var sig = F.norm(d.signature_name);
      if (sig && (sig.indexOf(F.norm(d.first_name)) < 0 || sig.indexOf(F.norm(d.last_name)) < 0)) {
        e.signature_name = 'Type your full name, including your first and last name as written above.';
      }
      if (d.age && (!/^\d+$/.test(d.age) || +d.age < 10 || +d.age > 99)) e.age = 'Enter an age from 10 to 99.';
      return e;
    },
    onSuccess: function (res) {
      finish(res, 'Student portfolio submitted', 'Thank you. The Inclusive Education Office has your portfolio and will continue your needs assessment with you.');
    }
  });

  F.wireForm(waiver, {
    action: 'submit_waiver',
    token: function () { return token; },
    extraValidate: function (d) {
      var e = {};
      if (d.ay_start && d.ay_end && +d.ay_end !== +d.ay_start + 1) e.ay_end = 'The academic year should run one year, for example 2026 to 2027.';
      if (d.waiver_name && d.signature_name && F.norm(d.waiver_name) !== F.norm(d.signature_name)) {
        e.signature_name = 'Type your name exactly as written in the first line of the waiver.';
      }
      return e;
    },
    onSuccess: function (res) {
      finish(res, 'Waiver signed', 'The Inclusive Education Office has your signed Individualized Support Plan waiver.');
    }
  });
});
