/**
 * RTU IEO staff panel (staff only).
 *
 * Deploy as a web app:  Execute as: User accessing the web app
 *                       Who has access: Anyone with a Google account
 *                       (or "Anyone within rtu.edu.ph" if the IEO uses an RTU Workspace account)
 *
 * Two locks protect student records:
 *   1. Every call checks the signed in email against STAFF_EMAILS (script property).
 *   2. The panel runs as the signed in user, so Google also requires that user to have
 *      been given access to the IEO spreadsheet. Share the sheet only with IEO staff.
 *
 * Script properties to set (Project Settings > Script properties):
 *   SHEET_ID      the IEO spreadsheet ID printed by setup() in the intake project
 *   STAFF_EMAILS  comma separated list of authorized IEO Google accounts
 *   SITE_URL      the public GitHub Pages address, e.g. https://USER.github.io/rtu-ieo-intake/
 */

function doGet() {
  var email = currentEmail_();
  if (!isStaff_(email)) {
    var denied = HtmlService.createHtmlOutput(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.5">' +
      '<h1 style="font-size:1.4rem">IEO staff panel</h1>' +
      '<p>This page is only for authorized staff of the RTU Inclusive Education Office.</p>' +
      '<p>You are signed in as <strong>' + escapeHtml_(email || 'an unknown account') + '</strong>, which is not on the staff list. ' +
      'If you are IEO staff, ask the Associate Director to add this account.</p></body>');
    return denied.setTitle('IEO staff panel').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  var t = HtmlService.createTemplateFromFile('Panel');
  t.staffEmail = email;
  t.siteUrl = String(PropertiesService.getScriptProperties().getProperty('SITE_URL') || '');
  return t.evaluate()
    .setTitle('IEO staff panel')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
}

/** Used by Panel.html to pull in F003Sheet.html (the shared F003 printable sheet). */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ---------------- access control ---------------- */

function currentEmail_() {
  return String(Session.getActiveUser().getEmail() || '').toLowerCase();
}

function isStaff_(email) {
  if (!email) return false;
  var list = String(PropertiesService.getScriptProperties().getProperty('STAFF_EMAILS') || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
  return list.indexOf(email) >= 0;
}

function requireStaff_() {
  var email = currentEmail_();
  if (!isStaff_(email)) throw new Error('Not authorized. This account is not on the IEO staff list.');
  return email;
}

/** Runs a write action under a lock and records it in the audit log. */
function staffWrite_(caseId, action, fn) {
  var email = requireStaff_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var c = ieoFindCase_(caseId);
    if (!c) throw new Error('Case ' + caseId + ' was not found.');
    var result = fn(c, email);
    ieoAudit_(email, action, caseId, result && result._audit || '');
    if (result) delete result._audit;
    return result;
  } finally {
    lock.releaseLock();
  }
}

function touch_(c, email, changes) {
  changes.updated_at = ieoNow_();
  changes.updated_by = email;
  ieoUpdate_('Cases', c._row, changes);
}

function parseList_(s) { return String(s || '').split(';').map(function (x) { return x.trim(); }).filter(String); }

/* ---------------- reads ---------------- */

function getConfig() {
  requireStaff_();
  return {
    stages: IEO.STAGES,
    categories: IEO.CATEGORIES,
    documents: IEO.DOCUMENTS,
    professions: IEO.PROFESSIONS,
    f003Docs: IEO.F003_DOCS,
    sessionLabels: IEO.SESSION_LABELS,
    linkValidDays: IEO.LINK_VALID_DAYS
  };
}

function listCases() {
  requireStaff_();
  return ieoReadAll_('Cases').map(function (c) {
    return {
      case_id: c.case_id, created_at: c.created_at, stage: c.stage, student_name: c.student_name,
      student_no: c.student_no, program: c.program, department: c.department,
      referral_source: c.referral_source, updated_at: c.updated_at
    };
  }).reverse();
}

function getCase(caseId) {
  var email = requireStaff_();
  var c = ieoFindCase_(caseId);
  if (!c) throw new Error('Case ' + caseId + ' was not found.');
  var byCase = function (tab) { return ieoReadAll_(tab).filter(function (r) { return String(r.case_id) === String(caseId); }); };
  var categories = parseList_(c.categories);
  var received = parseList_(c.documents_received);
  var portfolios = byCase('F002_Portfolios');
  var waivers = byCase('F002_Waivers');
  ieoAudit_(email, 'CASE_VIEWED', caseId, '');
  delete c.link_hash;
  return {
    caseRecord: c,
    referral: byCase('F001_Referrals')[0] || null,
    portfolio: portfolios[portfolios.length - 1] || null,
    waiver: waivers[waivers.length - 1] || null,
    f003: byCase('F003_Referrals'),
    sessions: byCase('Sessions'),
    notes: byCase('CaseNotes').reverse(),
    categories: categories,
    received: received,
    evaluation: ieoEvaluateDocuments_(categories, received),
    linkActive: !!c.link_purpose && !ieoLinkExpired_(c)
  };
}

/* ---------------- Stage: Identify the Risk and Opportunity ---------------- */

function saveRiskNote(caseId, note) {
  return staffWrite_(caseId, 'RISK_NOTE_SAVED', function (c, email) {
    if (c.stage === 'CLOSED') throw new Error('This case is closed.');
    var s = ieoClean_(note, IEO.MAX_LONG_TEXT);
    if (!s) throw new Error('Write the risk and opportunity note first.');
    touch_(c, email, { risk_opportunity_note: s });
    return { ok: true };
  });
}

/* ---------------- Stage: Submission of Required Documents ---------------- */

function saveDocuments(caseId, categories, received) {
  return staffWrite_(caseId, 'DOCUMENTS_UPDATED', function (c, email) {
    if (['RECEIVED', 'DOCS_PENDING'].indexOf(c.stage) < 0) throw new Error('Documents can only be changed before the interview stage.');
    var cats = (categories || []).filter(function (k) { return IEO.CATEGORIES.hasOwnProperty(k); });
    var valid = {};
    cats.forEach(function (k) { IEO.DOCUMENTS[k].docs.forEach(function (d) { valid[d.id] = true; }); });
    var docs = (received || []).filter(function (d) { return valid[d]; });
    var ev = ieoEvaluateDocuments_(cats, docs);
    touch_(c, email, {
      categories: cats.join('; '),
      documents_received: docs.join('; '),
      documents_complete: ev.complete ? 'Yes' : 'No'
    });
    return { ok: true, evaluation: ev, _audit: 'categories=' + cats.join(',') + ' docs=' + docs.join(',') };
  });
}

/** Documents incomplete: the student is asked to submit them (IP, PDL) or given F003 (neurodivergent, physical or sensory). */
function markDocumentsPending(caseId) {
  return staffWrite_(caseId, 'DOCUMENTS_PENDING', function (c, email) {
    if (['RECEIVED', 'DOCS_PENDING'].indexOf(c.stage) < 0) throw new Error('This case is past the documents stage.');
    if (!c.risk_opportunity_note) throw new Error('Save the risk and opportunity note first.');
    var ev = ieoEvaluateDocuments_(parseList_(c.categories), parseList_(c.documents_received));
    if (ev.complete) throw new Error('All required documents are already checked. Proceed to the interview instead.');
    touch_(c, email, { stage: 'DOCS_PENDING' });
    return { ok: true, _audit: 'missing: ' + ev.missing.join(' | ') };
  });
}

/** Record and print RTU-OVPAA-IEO-F003 for this case. */
function issueF003(caseId, form) {
  return staffWrite_(caseId, 'F003_ISSUED', function (c, email) {
    if (['RECEIVED', 'DOCS_PENDING'].indexOf(c.stage) < 0) throw new Error('F003 is issued only while documents are incomplete.');
    var ev = ieoEvaluateDocuments_(parseList_(c.categories), parseList_(c.documents_received));
    if (!ev.f003Eligible) throw new Error('F003 applies when a student with a neurodivergent condition or a physical or sensory impairment has no clinical diagnosis yet.');
    form = form || {};
    var prof = ieoClean_(form.to_profession);
    if (IEO.PROFESSIONS.indexOf(prof) < 0) throw new Error('Choose physician, psychiatrist, or psychologist.');
    var docs = (form.docs_requested || []).filter(function (d) { return IEO.F003_DOCS.indexOf(d) >= 0; });
    if (docs.indexOf(IEO.F003_DOCS[0]) < 0) docs.unshift(IEO.F003_DOCS[0]);
    var now = ieoNow_();
    var rec = {
      f003_id: 'F003-' + Utilities.formatDate(new Date(), IEO.TIMEZONE, 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 900 + 100),
      case_id: c.case_id, recorded_at: now, recorded_by: email,
      date_issued: Utilities.formatDate(new Date(), IEO.TIMEZONE, 'yyyy-MM-dd'),
      to_name: ieoClean_(form.to_name), to_profession: prof,
      to_institution: ieoClean_(form.to_institution), to_address: ieoClean_(form.to_address),
      s_name: c.student_name, s_program: c.program, s_student_no: c.student_no,
      docs_requested: docs.join('; '), remarks: ieoClean_(form.remarks, IEO.MAX_LONG_TEXT),
      issued_by: ieoClean_(form.issued_by) || email, issued_designation: ieoClean_(form.issued_designation),
      consent: 'Yes'
    };
    ieoAppend_('F003_Referrals', rec);
    touch_(c, email, { stage: 'DOCS_PENDING', f003_issued_count: Number(c.f003_issued_count || 0) + 1 });
    rec.docs_requested = docs;
    rec.ok = true;
    rec._audit = rec.f003_id;
    return rec;
  });
}

/* ---------------- Stage: Needs Assessment Interview and Student Portfolio ---------------- */

/** The SOP rule: the process may not push forward without the required documents. */
function proceedToInterview(caseId) {
  return staffWrite_(caseId, 'INTERVIEW_SCHEDULED', function (c, email) {
    if (['RECEIVED', 'DOCS_PENDING'].indexOf(c.stage) < 0) throw new Error('This case is not at the documents stage.');
    if (!c.risk_opportunity_note) throw new Error('Save the risk and opportunity note first.');
    var ev = ieoEvaluateDocuments_(parseList_(c.categories), parseList_(c.documents_received));
    if (!ev.complete) throw new Error('The process may not push forward without the required documents. Missing: ' + ev.missing.join('; '));
    var token = ieoNewToken_();
    touch_(c, email, { stage: 'INTERVIEW', link_hash: ieoHash_(token), link_purpose: 'portfolio', link_issued_at: ieoNow_() });
    return { ok: true, link: siteLink_('f002.html', token) };
  });
}

/** Makes a fresh link (the old one stops working). Allowed for the portfolio and the waiver. */
function reissueLink(caseId) {
  return staffWrite_(caseId, 'LINK_REISSUED', function (c, email) {
    var purpose = c.stage === 'INTERVIEW' ? 'portfolio' : (c.stage === 'WAIVER_PENDING' ? 'waiver' : '');
    if (!purpose) throw new Error('A student link is only used while waiting for the portfolio or the waiver.');
    var token = ieoNewToken_();
    touch_(c, email, { link_hash: ieoHash_(token), link_purpose: purpose, link_issued_at: ieoNow_() });
    return { ok: true, link: siteLink_('f002.html', token), purpose: purpose, _audit: purpose };
  });
}

function saveSession(caseId, s) {
  return staffWrite_(caseId, 'SESSION_SAVED', function (c, email) {
    if (['INTERVIEW', 'PORTFOLIO_SUBMITTED', 'ISP', 'WAIVER_PENDING', 'WAIVER_SIGNED'].indexOf(c.stage) < 0) {
      throw new Error('Sessions are recorded from the interview stage onward.');
    }
    s = s || {};
    if (IEO.SESSION_LABELS.indexOf(s.session) < 0) throw new Error('Unknown session.');
    if (s.date && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw new Error('Enter a valid date.');
    if (s.time_started && !/^\d{2}:\d{2}$/.test(s.time_started)) throw new Error('Enter a valid start time.');
    if (s.time_ended && !/^\d{2}:\d{2}$/.test(s.time_ended)) throw new Error('Enter a valid end time.');
    var rec = {
      case_id: c.case_id, session: s.session, date: ieoClean_(s.date), time_started: ieoClean_(s.time_started),
      time_ended: ieoClean_(s.time_ended), attended_by: ieoClean_(s.attended_by), entered_by: email, entered_at: ieoNow_()
    };
    var existing = ieoReadAll_('Sessions').filter(function (r) { return String(r.case_id) === String(c.case_id) && r.session === s.session; })[0];
    if (existing) {
      var ch = Object.assign({}, rec); delete ch.case_id; delete ch.session;
      ieoUpdate_('Sessions', existing._row, ch);
    } else {
      ieoAppend_('Sessions', rec);
    }
    return { ok: true, _audit: s.session };
  });
}

function addCaseNote(caseId, note) {
  return staffWrite_(caseId, 'CASE_NOTE_ADDED', function (c, email) {
    var s = ieoClean_(note, IEO.MAX_LONG_TEXT);
    if (!s) throw new Error('Write the case note first.');
    ieoAppend_('CaseNotes', { case_id: c.case_id, written_at: ieoNow_(), author: email, note: s });
    return { ok: true };
  });
}

/* ---------------- Stage: Do they require educational assistance? ---------------- */

function recordDecision(caseId, needsAssistance) {
  return staffWrite_(caseId, 'DECISION_RECORDED', function (c, email) {
    if (c.stage !== 'PORTFOLIO_SUBMITTED') throw new Error('Record the decision after the student portfolio is submitted.');
    var now = ieoNow_();
    if (needsAssistance === true) {
      touch_(c, email, { stage: 'ISP', decision: 'Yes: proceed with Formulation of ISP (SOP-OVPAA-IEO-02)', decision_at: now, decision_by: email, link_hash: '', link_purpose: '' });
      return { ok: true, _audit: 'Yes, ISP' };
    }
    if (needsAssistance === false) {
      var token = ieoNewToken_();
      touch_(c, email, {
        stage: 'WAIVER_PENDING', decision: 'No educational assistance needed: waiver section unlocked',
        decision_at: now, decision_by: email, waiver_unlocked_at: now,
        link_hash: ieoHash_(token), link_purpose: 'waiver', link_issued_at: now
      });
      return { ok: true, link: siteLink_('f002.html', token), _audit: 'No, waiver unlocked' };
    }
    throw new Error('Choose yes or no.');
  });
}

/* ---------------- End of Process ---------------- */

function closeCase(caseId, reason) {
  return staffWrite_(caseId, 'CASE_CLOSED', function (c, email) {
    if (c.stage === 'CLOSED') throw new Error('This case is already closed.');
    var done = c.stage === 'ISP' || c.stage === 'WAIVER_SIGNED';
    var r = ieoClean_(reason, 1000);
    if (!done && !r) throw new Error('This case has not reached a decision. Give the reason for closing it (for example, the student withdrew).');
    touch_(c, email, { stage: 'CLOSED', closed_at: ieoNow_(), close_reason: done ? (r || 'Completed') : r, link_hash: '', link_purpose: '' });
    return { ok: true, _audit: r || 'Completed' };
  });
}

/* ---------------- helpers ---------------- */

function siteLink_(page, token) {
  var base = String(PropertiesService.getScriptProperties().getProperty('SITE_URL') || '');
  if (!base) throw new Error('SITE_URL script property is not set.');
  if (base.slice(-1) !== '/') base += '/';
  // The token goes after "#" so it is never sent to GitHub's servers or written to their logs.
  return base + page + '#t=' + token;
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; });
}
