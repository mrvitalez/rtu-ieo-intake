/**
 * RTU IEO intake endpoint (public, write only).
 *
 * Deploy as a web app:  Execute as: Me (the IEO Google account)
 *                       Who has access: Anyone
 *
 * What this endpoint can do:
 *   POST submit_f001   create a case from a Referral Slip (F001)
 *   POST submit_f002   submit a Student Portfolio (F002), only with a valid staff issued link;
 *                      can be repeated to make changes until the decision is recorded
 *   POST save_f002     save F002 progress (after the Data Privacy Consent) before submitting
 *   POST load_f002     give the link holder their own saved F002 answers back
 *   POST submit_waiver save the ISP waiver, only after staff marked "No educational assistance needed"
 *   POST submit_f004   a referred student requests a Referral Form for Clinical Diagnosis (F004);
 *                      the F003 itself is issued only by staff in the staff panel
 *   GET  programs      programs and colleges for the F001 dropdown (never the heads' names or emails)
 *   GET  status        tell a link holder whether their portfolio or waiver is open (no personal data)
 *   GET  ping          health check for the site configuration
 *
 * Script properties (Project Settings > Script properties):
 *   SHEET_ID         set automatically by setup()
 *   ALERT_EMAILS     optional, comma separated: who gets an email when a form is submitted
 *                    (once a case has a case manager, that case's alerts go to the case manager)
 *   STAFF_PANEL_URL  optional, the staff panel web app URL, included in alert emails
 *
 * It never returns another person's records. The only data it gives back is a student's own saved
 * portfolio answers, to the holder of that student's personal link. Staff read data only through the staff panel.
 */

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'status') return json_(linkStatus_(p.t));
    if (p.action === 'programs') return json_(programList_());
    return json_({ ok: true, service: 'rtu-ieo-intake' });
  } catch (err) {
    return json_({ ok: false, error: 'The service is unavailable right now. Please try again later.' });
  }
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'The form data could not be read. Please reload the page and try again.' });
  }
  // Honeypot: real people never fill the hidden "website" field.
  if (body.website) return json_({ ok: true, ref: 'received' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'Many forms are being submitted right now. Please try again in a minute.' });
  }
  try {
    if (!underRateLimit_()) {
      return json_({ ok: false, error: 'Many forms are being submitted right now. Please try again in a minute.' });
    }
    var data = body.data || {};
    switch (body.action) {
      case 'submit_f001': return json_(submitF001_(data));
      case 'submit_f002': return json_(submitF002_(body.token, data));
      case 'save_f002': return json_(saveF002Draft_(body.token, data));
      case 'load_f002': return json_(loadF002_(body.token));
      case 'submit_waiver': return json_(submitWaiver_(body.token, data));
      case 'submit_f004': return json_(submitF004_(data));
      default: return json_({ ok: false, error: 'Unknown form.' });
    }
  } catch (err) {
    console.error(err && err.stack || err);
    return json_({ ok: false, error: 'The form could not be saved. Please try again, or contact the Inclusive Education Office.' });
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- F001 Referral Slip ---------------- */

function submitF001_(d) {
  var v = new Validator_(d);
  v.text('s_name', true).text('s_program', true).text('s_department', true)
    .text('s_student_no', false).email('s_email', true).date('s_birthday', false).number('s_age', false, 10, 99)
    .oneOf('s_sex', IEO.SEX, false)
    .manyOf('reasons', IEO.REFERRAL_REASONS.concat(IEO.REFERRAL_REASONS_PREVIOUS), true)
    .text('r_name', true).text('r_contact', false).text('r_department', false)
    .email('r_email', false).text('r_designation', false)
    .oneOf('r_source', IEO.REFERRAL_SOURCES, true)
    .longText('observations', false).text('attest_name', true).text('client_datetime', false)
    .mustBeTrue('consent');
  if (v.out.s_program === 'Other') {
    v.text('s_program_other', true);
    v.out.s_program = v.out.s_program_other;
  } else if (v.out.s_program) {
    var known = ieoFindProgram_(v.out.s_program);
    if (known && known.college) v.out.s_department = known.college; // keep department consistent with the list
  }
  delete v.out.s_program_other;
  if (v.list('reasons').indexOf('Others') >= 0) v.text('reason_other', true); else v.out.reason_other = '';
  if (v.out.r_source === 'Others') v.text('r_source_other', true); else v.out.r_source_other = '';
  if (!v.out.r_contact && !v.out.r_email) v.fail('r_contact', 'Give a contact number or an email address so the IEO can reach you.');
  if (v.out.attest_name && v.out.r_name && norm_(v.out.attest_name) !== norm_(v.out.r_name)) {
    v.fail('attest_name', 'Type your name exactly as written in "Name" under Referring Person.');
  }
  if (!v.ok()) return v.result();

  var o = v.out;
  var caseId = nextCaseId_();
  var now = ieoNow_();
  ieoAppend_('F001_Referrals', Object.assign({ case_id: caseId, submitted_at: now }, o, {
    reasons: v.list('reasons').join('; '),
    consent: 'Yes'
  }));
  ieoAppend_('Cases', {
    case_id: caseId, created_at: now, stage: 'RECEIVED',
    student_name: o.s_name, student_no: o.s_student_no, program: o.s_program, department: o.s_department,
    student_email: o.s_email.toLowerCase(),
    referral_source: o.r_source === 'Others' ? 'Others: ' + o.r_source_other : o.r_source,
    documents_complete: 'No', f003_issued_count: 0, followup_status: 'NOT_STARTED',
    updated_at: now, updated_by: 'F001 public form'
  });
  ieoAudit_('public', 'F001_SUBMITTED', caseId, 'Referral slip received from source ' + o.r_source);
  notifyStaff_('New referral slip', caseId, [
    'A new Referral Slip for Needs Assessment (RTU-OVPAA-IEO-F001) was received.',
    'Referred by: ' + (o.r_source === 'Others' ? 'Others' : o.r_source),
    'Next step: review the reason for referral and assign a case manager, who emails the referred student to submit the required documents (follow up attempt 1).'
  ]);
  return { ok: true, ref: caseId, submittedAt: now };
}

/* ---------------- F002 Student Portfolio ---------------- */

/** The portfolio stays open for saving and editing from the interview stage until the decision is recorded. */
function portfolioCase_(token) {
  var c = ieoFindCaseByToken_(token);
  if (!c || c.link_purpose !== 'portfolio' || ieoLinkExpired_(c)) {
    return { error: 'This portfolio link is not valid or has expired. Ask the Inclusive Education Office for a new link.' };
  }
  if (['INTERVIEW', 'PORTFOLIO_SUBMITTED'].indexOf(c.stage) < 0) {
    return { error: 'This portfolio can no longer be changed because the Inclusive Education Office has recorded its decision.' };
  }
  return { c: c };
}

function validateF002_(d) {
  var v = new Validator_(d);
  v.text('course', true).text('last_name', true).text('first_name', true).text('middle_name', false)
    .text('nickname', false).text('present_address', true).text('provincial_address', false)
    .number('age', true, 10, 99).oneOf('sex', IEO.SEX, true).text('civil_status', true)
    .text('religion', false).text('nationality', true).text('telephone', false).text('mobile', true)
    .email('email', true).text('pwd_id', false)
    .oneOf('ip_member', ['Yes', 'No'], true)
    .text('emergency_name', true).text('emergency_relationship', true)
    .text('emergency_address', true).text('emergency_contact', true)
    .text('elem_school', false).year('elem_year', false)
    .text('jhs_school', false).year('jhs_year', false)
    .text('shs_school', false).year('shs_year', false).text('shs_track', false).text('shs_strand', false)
    .manyOf('disabilities', IEO.DISABILITIES, false)
    .longText('medications', false).longText('precautions', false)
    .mustBeTrue('photo_note_ack').mustBeTrue('disclaimer_ack').mustBeTrue('consent')
    .text('signature_name', true);
  if (v.out.ip_member === 'Yes') {
    v.manyOf('ip_groups', IEO.IP_GROUPS, true);
    if (v.list('ip_groups').indexOf('Others') >= 0) v.text('ip_other', true); else v.out.ip_other = '';
  } else { v.out.ip_groups = []; v.out.ip_other = ''; }
  if (v.list('disabilities').indexOf('Others') >= 0) v.text('disability_other', true); else v.out.disability_other = '';
  return v;
}

/** One row per case: the student's saved or submitted portfolio. */
function savePortfolioRow_(c, v, status, now) {
  var rec = Object.assign({}, v.out, {
    ip_groups: v.list('ip_groups').join('; '),
    disabilities: v.list('disabilities').join('; '),
    photo_note_ack: v.out.photo_note_ack ? 'Yes' : '', disclaimer_ack: v.out.disclaimer_ack ? 'Yes' : '', consent: 'Yes',
    status: status, last_saved_at: now
  });
  var existing = ieoReadAll_('F002_Portfolios').filter(function (r) { return String(r.case_id) === String(c.case_id); }).pop();
  if (existing) {
    if (status === 'Submitted' && !existing.submitted_at) rec.submitted_at = now;
    ieoUpdate_('F002_Portfolios', existing._row, rec);
    return existing;
  }
  rec.case_id = c.case_id;
  rec.submitted_at = status === 'Submitted' ? now : '';
  ieoAppend_('F002_Portfolios', rec);
  return null;
}

/** Final submit. Can be repeated to make changes until the decision is recorded. */
function submitF002_(token, d) {
  var pc = portfolioCase_(token);
  if (pc.error) return { ok: false, error: pc.error };
  var c = pc.c;
  var v = validateF002_(d);
  if (!v.ok()) return v.result();
  var now = ieoNow_();
  var resubmit = c.stage === 'PORTFOLIO_SUBMITTED';
  savePortfolioRow_(c, v, 'Submitted', now);
  ieoUpdate_('Cases', c._row, { stage: 'PORTFOLIO_SUBMITTED', portfolio_submitted_at: resubmit ? c.portfolio_submitted_at : now, updated_at: now, updated_by: 'F002 student link' });
  ieoAudit_('student link', resubmit ? 'F002_UPDATED' : 'F002_SUBMITTED', c.case_id, resubmit ? 'Student portfolio changed after submitting' : 'Student portfolio submitted');
  notifyStaff_(resubmit ? 'Student portfolio updated' : 'Student portfolio submitted', c.case_id, [
    resubmit ? 'The student changed their Student Portfolio Form for Inclusive Education (RTU-OVPAA-IEO-F002) after submitting it.'
      : 'The student submitted the Student Portfolio Form for Inclusive Education (RTU-OVPAA-IEO-F002).',
    'Next step: complete the needs assessment interview and record whether the student requires educational assistance.'
  ]);
  return { ok: true, ref: c.case_id, submittedAt: now, updated: resubmit };
}

/** Save progress without the required answers. Needs the Data Privacy Consent first. Not after submitting. */
function saveF002Draft_(token, d) {
  var pc = portfolioCase_(token);
  if (pc.error) return { ok: false, error: pc.error };
  var c = pc.c;
  if (c.stage === 'PORTFOLIO_SUBMITTED') {
    return { ok: false, error: 'You already submitted your portfolio. To change it, edit your answers and submit again.' };
  }
  var v = validateF002_(d);
  if (!v.out.consent) {
    return { ok: false, error: 'Some answers need attention.', fields: { consent: 'Tick the Data Privacy Consent at the bottom of the form to save your progress.' } };
  }
  var now = ieoNow_();
  savePortfolioRow_(c, v, 'Draft', now);
  ieoAudit_('student link', 'F002_DRAFT_SAVED', c.case_id, 'Student saved progress');
  return { ok: true, ref: c.case_id, savedAt: now };
}

/** Returns the student's own saved answers to the holder of their personal link. */
function loadF002_(token) {
  var pc = portfolioCase_(token);
  if (pc.error) return { ok: false, error: pc.error };
  var row = ieoReadAll_('F002_Portfolios').filter(function (r) { return String(r.case_id) === String(pc.c.case_id); }).pop();
  if (!row) return { ok: true, data: null };
  var data = {};
  IEO.SHEETS.F002_Portfolios.forEach(function (k) {
    if (['case_id', 'submitted_at', 'status', 'last_saved_at'].indexOf(k) >= 0) return;
    var val = row[k] == null ? '' : String(row[k]);
    if (k === 'ip_groups' || k === 'disabilities') data[k] = val ? val.split('; ') : [];
    else if (['photo_note_ack', 'disclaimer_ack', 'consent'].indexOf(k) >= 0) data[k] = val === 'Yes';
    else data[k] = val;
  });
  return { ok: true, data: data, status: row.status || 'Submitted', lastSavedAt: row.last_saved_at || row.submitted_at, submittedAt: row.submitted_at };
}

/* ---------------- F002 ISP Waiver ---------------- */

function submitWaiver_(token, d) {
  var c = ieoFindCaseByToken_(token);
  if (!c || c.link_purpose !== 'waiver' || ieoLinkExpired_(c) || c.stage !== 'WAIVER_PENDING') {
    return { ok: false, error: 'The waiver is not open for this link. The Individualized Support Plan waiver opens only after the Inclusive Education Office records that no educational assistance is needed.' };
  }
  var v = new Validator_(d);
  v.text('waiver_name', true).year('ay_start', true).year('ay_end', true)
    .oneOf('semester', IEO.SEMESTERS, true).text('signature_name', true).mustBeTrue('consent');
  if (v.out.ay_start && v.out.ay_end && Number(v.out.ay_end) !== Number(v.out.ay_start) + 1) {
    v.fail('ay_end', 'The academic year should run one year, for example 2026 to 2027.');
  }
  if (v.out.waiver_name && v.out.signature_name && norm_(v.out.waiver_name) !== norm_(v.out.signature_name)) {
    v.fail('signature_name', 'Type your name exactly as written in the first line of the waiver.');
  }
  if (!v.ok()) return v.result();
  var now = ieoNow_();
  ieoAppend_('F002_Waivers', Object.assign({ case_id: c.case_id, signed_at: now }, v.out, { consent: 'Yes' }));
  ieoUpdate_('Cases', c._row, { stage: 'WAIVER_SIGNED', waiver_signed_at: now, link_hash: '', link_purpose: '', updated_at: now, updated_by: 'F002 waiver link' });
  ieoAudit_('student link', 'WAIVER_SIGNED', c.case_id, 'ISP waiver signed');
  notifyStaff_('ISP waiver signed', c.case_id, [
    'The student signed the Individualized Support Plan waiver.',
    'Next step: close the case (End of Process).'
  ]);
  return { ok: true, ref: c.case_id, submittedAt: now };
}

/* ---------------- F004 Request for Referral Form for Clinical Diagnosis ---------------- */

/**
 * A referred student asks the IEO for a Referral Form for Required Documents (F003).
 * The request is attached to the case by reference number. The reply is the same whether
 * or not the case exists, so the form cannot be used to check who has been referred.
 * The F003 itself is issued only by staff, from the staff panel.
 */
function submitF004_(d) {
  var v = new Validator_(d);
  v.text('case_id', true).text('s_name', true).text('s_student_no', false).email('s_email', true)
    .oneOf('to_profession', IEO.PROFESSIONS, true).text('to_name', false).text('to_institution', false)
    .text('to_address', false).longText('notes', false).mustBeTrue('consent');
  if (v.out.case_id) v.out.case_id = v.out.case_id.toUpperCase();
  if (v.out.case_id && !/^IEO-\d{4}-\d{4,}$/.test(v.out.case_id)) v.fail('case_id', 'Use the reference number format IEO-2026-0001. It is in the email from the IEO.');
  if (!v.ok()) return v.result();
  var o = v.out;
  var now = ieoNow_();
  var id = 'F004-' + Utilities.formatDate(new Date(), IEO.TIMEZONE, 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
  var c = ieoFindCase_(o.case_id);
  var emailMatches = !!(c && c.student_email && String(c.student_email).toLowerCase() === o.s_email.toLowerCase());
  ieoAppend_('F004_Requests', Object.assign({ request_id: id, submitted_at: now }, o, {
    case_found: c ? 'Yes' : 'No', email_matches: emailMatches ? 'Yes' : 'No', consent: 'Yes', status: 'Pending'
  }));
  if (c && emailMatches) ieoMarkFollowUpResponded_(c, 'Student sent F004 request ' + id, 'F004 public form');
  ieoAudit_('public', 'F004_SUBMITTED', o.case_id, id + (c ? '' : ' (no such case)') + (c && !emailMatches ? ' (email does not match)' : ''));
  notifyStaff_('Request for Referral Form for Clinical Diagnosis', o.case_id, [
    'A student asked for a Referral Form for Required Documents (RTU-OVPAA-IEO-F003) through F004.',
    c ? (emailMatches ? 'It is attached to the case.' : 'The email given does not match the case. Check before issuing.')
      : 'No case has this reference number. Find the student in the F004_Requests tab.',
    'Next step: issue the F003 from the staff panel and have the student pick it up at the IEO.'
  ]);
  return { ok: true, ref: id, submittedAt: now };
}

/* ---------------- program list (public) ---------------- */

function programList_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('programs');
  if (hit) return JSON.parse(hit);
  var out = { ok: true, programs: ieoPrograms_().map(function (p) { return { college: p.college, program: p.program }; }) };
  cache.put('programs', JSON.stringify(out), 600);
  return out;
}

/* ---------------- link status (no personal data) ---------------- */

function linkStatus_(token) {
  var c = ieoFindCaseByToken_(token);
  if (!c || ieoLinkExpired_(c)) return { ok: true, valid: false };
  return {
    ok: true,
    valid: true,
    portfolioOpen: c.link_purpose === 'portfolio' && (c.stage === 'INTERVIEW' || c.stage === 'PORTFOLIO_SUBMITTED'),
    portfolioSubmitted: c.link_purpose === 'portfolio' && c.stage === 'PORTFOLIO_SUBMITTED',
    waiverOpen: c.link_purpose === 'waiver' && c.stage === 'WAIVER_PENDING'
  };
}

/* ---------------- staff email alerts ---------------- */

/**
 * Emails the IEO staff listed in the ALERT_EMAILS script property.
 * For privacy the email carries only the reference number and the next step,
 * never the student's name or any answers. A failed email never blocks a submission.
 */
function notifyStaff_(what, caseId, lines) {
  try {
    var props = PropertiesService.getScriptProperties();
    var to = String(props.getProperty('ALERT_EMAILS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
    // Once a case has a case manager, its alerts go to them instead of the general alert list.
    var existing = caseId ? ieoFindCase_(caseId) : null;
    if (existing && existing.case_manager) to = [String(existing.case_manager)];
    if (!to.length) return;
    var panel = String(props.getProperty('STAFF_PANEL_URL') || '');
    var body = lines.concat([
      '',
      'Reference no.: ' + caseId,
      'Received: ' + ieoNow_() + ' (Philippine time)',
      '',
      panel ? 'Open the IEO staff panel to review it: ' + panel : 'Open the IEO staff panel to review it.',
      '',
      'For privacy, student details are not included in this email.',
      'RTU Inclusive Education Office intake system (SOP-OVPAA-IEO-01)'
    ]).join('\n');
    MailApp.sendEmail({ to: to.join(','), subject: 'IEO: ' + what + ' (' + caseId + ')', body: body, name: 'RTU IEO Intake' });
  } catch (err) {
    console.error('Alert email failed: ' + err);
  }
}

/* ---------------- helpers ---------------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function norm_(s) { return String(s || '').replace(/^'/, '').replace(/\s+/g, ' ').trim().toLowerCase(); }

function underRateLimit_() {
  var cache = CacheService.getScriptCache();
  var key = 'rate:' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(n), 120);
  return n <= IEO.MAX_SUBMISSIONS_PER_MINUTE;
}

function nextCaseId_() {
  var props = PropertiesService.getScriptProperties();
  var year = Utilities.formatDate(new Date(), IEO.TIMEZONE, 'yyyy');
  var key = 'CASE_SEQ_' + year;
  var n = Number(props.getProperty(key) || 0) + 1;
  props.setProperty(key, String(n));
  return 'IEO-' + year + '-' + ('000' + n).slice(-4);
}

/** Collects cleaned values and field errors. */
function Validator_(data) {
  this.data = data || {};
  this.out = {};
  this.errors = {};
}
Validator_.prototype.fail = function (k, msg) { if (!this.errors[k]) this.errors[k] = msg; return this; };
Validator_.prototype.ok = function () { return Object.keys(this.errors).length === 0; };
Validator_.prototype.result = function () {
  return { ok: false, error: 'Some answers need attention.', fields: this.errors };
};
Validator_.prototype.list = function (k) { return Array.isArray(this.out[k]) ? this.out[k] : []; };
Validator_.prototype.text = function (k, required) {
  var s = ieoClean_(this.data[k], IEO.MAX_TEXT);
  this.out[k] = s;
  if (required && !s) this.fail(k, 'This is required.');
  return this;
};
Validator_.prototype.longText = function (k, required) {
  var s = ieoClean_(this.data[k], IEO.MAX_LONG_TEXT);
  this.out[k] = s;
  if (required && !s) this.fail(k, 'This is required.');
  return this;
};
Validator_.prototype.email = function (k, required) {
  this.text(k, required);
  if (this.out[k] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.out[k])) this.fail(k, 'Enter a valid email address.');
  return this;
};
Validator_.prototype.date = function (k, required) {
  this.text(k, required);
  if (this.out[k] && !/^\d{4}-\d{2}-\d{2}$/.test(this.out[k])) this.fail(k, 'Enter a valid date.');
  return this;
};
Validator_.prototype.year = function (k, required) {
  this.text(k, required);
  if (this.out[k] && !/^(19|20)\d{2}$/.test(this.out[k])) this.fail(k, 'Enter a four digit year.');
  return this;
};
Validator_.prototype.number = function (k, required, min, max) {
  this.text(k, required);
  var s = this.out[k];
  if (s && (!/^\d+$/.test(s) || Number(s) < min || Number(s) > max)) this.fail(k, 'Enter a number from ' + min + ' to ' + max + '.');
  return this;
};
Validator_.prototype.oneOf = function (k, allowed, required) {
  var s = ieoClean_(this.data[k]);
  if (s && allowed.indexOf(s) < 0) { this.fail(k, 'Choose one of the listed options.'); s = ''; }
  this.out[k] = s;
  if (required && !s) this.fail(k, 'Choose an option.');
  return this;
};
Validator_.prototype.manyOf = function (k, allowed, required) {
  var raw = this.data[k];
  var arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  var clean = [];
  for (var i = 0; i < arr.length; i++) {
    var s = String(arr[i]);
    if (allowed.indexOf(s) < 0) { this.fail(k, 'Choose from the listed options.'); continue; }
    if (clean.indexOf(s) < 0) clean.push(s);
  }
  this.out[k] = clean;
  if (required && !clean.length) this.fail(k, 'Select at least one.');
  return this;
};
Validator_.prototype.mustBeTrue = function (k) {
  var v = this.data[k];
  this.out[k] = v === true || v === 'true' || v === 'on' || v === 'Yes';
  if (!this.out[k]) this.fail(k, 'Please read and agree to continue.');
  return this;
};

/* ---------------- one time setup (run from the editor) ---------------- */

/**
 * Creates the IEO spreadsheet (or completes an existing one set in SHEET_ID),
 * adds every tab with headers, formats all cells as plain text so student
 * numbers and phone numbers keep their leading zeros, and saves SHEET_ID.
 * Safe to run more than once.
 */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('RTU IEO Intake Records (SOP-OVPAA-IEO-01)');
  ss.setSpreadsheetTimeZone(IEO.TIMEZONE);
  Object.keys(IEO.SHEETS).forEach(function (name) {
    var headers = IEO.SHEETS[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var existing = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    headers.forEach(function (h) { if (existing.indexOf(h) < 0) existing.push(h); });
    sh.getRange(1, 1, 1, existing.length).setValues([existing]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(existing.length, sh.getMaxColumns())).setNumberFormat('@');
  });
  var first = ss.getSheetByName('Sheet1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);
  props.setProperty('SHEET_ID', ss.getId());
  ieoPrograms_(); // fills an empty Programs tab from the IEO list
  if (!props.getProperty('ALERT_EMAILS')) {
    var me = Session.getEffectiveUser().getEmail();
    if (me) props.setProperty('ALERT_EMAILS', me);
  }
  console.log('IEO spreadsheet ready: ' + ss.getUrl());
  console.log('SHEET_ID = ' + ss.getId() + '  (copy this into the staff panel project)');
  return ss.getId();
}
