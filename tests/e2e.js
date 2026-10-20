/*
 * Browser run of the whole SOP flow with Playwright against tests/server.js.
 * Usage: node tests/e2e.js [screenshot-dir]
 */
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { start } = require('./server');

const PORT = 8766;
const BASE = 'http://localhost:' + PORT + '/';
const SHOTS = process.argv[2] || '';
let n = 0;
async function shot(page, name, full) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, String(++n).padStart(2, '0') + '-' + name + '.png'), fullPage: !!full });
}

(async () => {
  const srv = await start(PORT);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; window.confirm = () => true; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const step = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message.split('\n')[0]); process.exitCode = 1; } };

  await step('home page renders the SOP flow and links', async () => {
    await page.goto(BASE);
    assert.strictEqual(await page.locator('.flow > li').count(), 7);
    await shot(page, 'home', true);
  });

  await step('F001: empty submit shows an error summary that takes focus', async () => {
    await page.goto(BASE + 'f001.html');
    await page.click('button[type=submit]');
    await page.waitForSelector('.error-summary');
    assert.ok(await page.evaluate(() => document.activeElement.classList.contains('error-summary')));
    assert.ok(await page.locator('[aria-invalid=true]').count() >= 5);
    await shot(page, 'f001-errors');
  });

  let ref;
  await step('F001: fill in and submit, get a reference number', async () => {
    await page.goto(BASE + 'f001.html');
    await page.fill('#s_name', 'Dela Cruz, Juan Santos');
    await page.waitForSelector('select#s_program');
    await page.selectOption('#s_program', 'Bachelor of Science in Electronics Communication Engineering');
    assert.strictEqual(await page.inputValue('#s_department'), 'CEng', 'department from the program list');
    await page.selectOption('#s_program', 'Other');
    assert.ok(await page.locator('#s_program_other').isVisible(), 'Other shows a text box');
    assert.strictEqual(await page.inputValue('#s_department'), '', 'department cleared for Other');
    await page.selectOption('#s_program', 'Bachelor of Science in Electronics Communication Engineering');
    await page.fill('#s_student_no', '2026-100234');
    await page.fill('#s_email', 'juan@example.com');
    await page.fill('#s_birthday', '2007-03-14');
    assert.ok(Number(await page.inputValue('#s_age')) >= 18, 'age filled from birthday');
    await page.check('#s_sex_m');
    await page.check('#reason_academic');
    assert.ok(await page.locator('#reason_other').isHidden());
    await page.check('#reason_others');
    await page.fill('#reason_other', 'Frequent absences');
    await page.selectOption('#r_source', 'Self');
    await page.click('#copy-self');
    assert.strictEqual(await page.inputValue('#r_name'), 'Dela Cruz, Juan Santos');
    await page.fill('#r_contact', '09171234567');
    await page.fill('#r_email', 'juan@example.com');
    await page.fill('#observations', 'I find it hard to read the board.');
    await page.check('#consent');
    await page.fill('#attest_name', 'dela cruz, juan santos');
    assert.ok((await page.inputValue('#client_datetime')).length > 5, 'automatic timestamp');
    await shot(page, 'f001-filled', true);
    await page.click('button[type=submit]');
    await page.waitForSelector('#done:not([hidden])');
    ref = (await page.textContent('#done-ref')).trim();
    assert.match(ref, /^IEO-\d{4}-0001$/);
    await shot(page, 'f001-done');
  });

  await step('F002 without a link explains how to get one and hides the form', async () => {
    await page.goto(BASE + 'f002.html');
    await page.waitForSelector('#gate h2');
    assert.match(await page.textContent('#gate'), /opens from your IEO link/);
    assert.ok(await page.locator('#f002').isHidden());
  });

  await step('F002 with a made up link is refused', async () => {
    await page.goto(BASE + 'f002.html#t=' + 'c'.repeat(64));
    await page.waitForFunction(() => /expired|no longer valid/.test(document.getElementById('gate').textContent));
    assert.ok(await page.locator('#f002').isHidden());
  });

  const panel = await ctx.newPage();
  panel.on('pageerror', e => errors.push('panel: ' + e.message));
  let link;
  await step('staff panel: non-staff account is denied', async () => {
    await panel.goto(BASE + 'panel?as=student@gmail.com');
    assert.match(await panel.textContent('body'), /not on the staff list/);
    assert.ok(!(await panel.content()).includes('Dela Cruz'));
  });

  await step('staff panel: case list and SOP stepper', async () => {
    await panel.goto(BASE + 'panel');
    await panel.click('button[data-id="' + ref + '"]');
    await panel.waitForSelector('ol.stepper');
    assert.match(await panel.textContent('[aria-current=step]'), /Reason for referral/);
    await shot(panel, 'panel-new-case', true);
  });

  await step('staff panel: documents gate the interview; F003 is issued and printed', async () => {
    await panel.fill('#risk', 'Reading difficulty confirmed by the referrer; early accommodations may help.');
    await panel.click('#saveRisk');
    await panel.waitForFunction(() => /review saved/.test(document.getElementById('toast').textContent));
    assert.match(await panel.textContent('#detail'), /Assign a case manager|assign a case manager/);
    await panel.selectOption('#cmSelect', 'case.manager@rtu.edu.ph');
    await panel.click('#assignCm');
    await panel.waitForFunction(() => /Follow up/.test(document.querySelector('[aria-current=step]').textContent));
    // Follow up attempt 1: email the student, then record the reply
    await panel.waitForSelector('#fuSend');
    assert.strictEqual(await panel.inputValue('#fuTo'), 'juan@example.com');
    assert.match(await panel.inputValue('#fuBody'), /required documents/);
    await shot(panel, 'panel-followup', true);
    await panel.click('#fuSend');
    await panel.waitForSelector('#fuResponded');
    assert.ok(await panel.isDisabled('#fuNoResponse'), 'no response waits 3 working days');
    assert.ok(srv.world.mail.some(m => m.to === 'juan@example.com' && /required documents/.test(m.subject)), 'student emailed');
    await panel.fill('#fuResultNote', 'Replied, will bring documents');
    await panel.click('#fuResponded');
    await panel.waitForFunction(() => /Responded/.test(document.getElementById('detail').textContent) && !document.getElementById('fuResponded'));
    await panel.check('input[name=cat][value=NEURODIVERGENT]');
    await panel.check('input[name=doc][value=pwd_id]');
    assert.ok(await panel.isDisabled('#toInterview'), 'interview blocked');
    assert.ok(await panel.isEnabled('#openF003'), 'F003 offered');
    assert.match(await panel.textContent('#docEval'), /may not push forward/);
    await shot(panel, 'panel-docs-incomplete');
    await panel.click('#openF003');
    await panel.waitForSelector('#f003Dialog[open]');
    await panel.check('#f003Dialog input[value=Psychiatrist]');
    await panel.fill('#d_to_name', 'Dr. Ana Santos');
    await panel.fill('#d_by', 'Case Manager Name');
    await shot(panel, 'panel-f003-dialog');
    await panel.click('#f003Issue');
    await panel.waitForFunction(() => window.__printed >= 1);
    assert.match(await panel.textContent('#print-area'), /REFERRAL FORM FOR REQUIRED DOCUMENTS/);
    assert.match(await panel.textContent('#print-area'), /Dela Cruz, Juan Santos/);
    await panel.waitForSelector('[data-reprint]');
  });

  await step('staff panel: with the clinical diagnosis the interview opens and gives a link', async () => {
    await panel.check('input[name=doc][value=clinical_dx]');
    await panel.click('#toInterview');
    await panel.waitForSelector('#schedDialog[open]');
    assert.strictEqual(await panel.inputValue('#s_email'), 'juan@example.com', 'self referral email suggested');
    const day = new Date(Date.now() + 8 * 3600000 + 2 * 86400000).toISOString().slice(0, 10);
    await panel.click('#schedGo');
    assert.ok(await panel.locator('#schedDialog[open]').count(), 'date is required');
    await panel.fill('#s_date', day);
    await panel.fill('#s_start', '14:00');
    await panel.fill('#s_end', '15:00');
    await shot(panel, 'panel-schedule-dialog');
    await panel.click('#schedGo');
    await panel.waitForSelector('#theLink');
    assert.match(await panel.textContent('#detail'), /Interview: .*2:00/);
    const sentLink = await panel.inputValue('#theLink');
    assert.ok(srv.world.mail.some(m => m.to === 'juan@example.com' && m.body.includes(sentLink)), 'student emailed with link');
    assert.ok(Object.keys(srv.world.events).length === 1, 'calendar event created');
    await panel.selectOption('#stageFilter', 'upcoming');
    assert.match(await panel.textContent('#cases'), /Interview/);
    await panel.selectOption('#stageFilter', '');
    link = await panel.inputValue('#theLink');
    assert.match(link, /f002\.html#t=[a-f0-9]{64}$/);
    await shot(panel, 'panel-link');
  });

  await step('F002: the student fills in the portfolio from the link', async () => {
    await page.goto(link);
    await page.waitForSelector('#f002:not([hidden])');
    assert.ok(await page.locator('#waiver').isHidden(), 'waiver not available yet');
    // save progress needs the consent, then the answers come back after reopening the link
    await page.fill('#course', 'BS Electronics Engineering');
    await page.click('#save-draft');
    await page.waitForSelector('#f002 .error-summary');
    assert.match(await page.textContent('#f002 .error-summary'), /Data Privacy Consent/);
    await page.check('#consent');
    await page.fill('#nickname', 'Jun');
    await page.click('#save-draft');
    await page.waitForSelector('.form-notice.success');
    await page.goto(BASE + 'index.html');
    await page.goto(link);
    await page.waitForSelector('#saved-note:not([hidden])');
    assert.strictEqual(await page.inputValue('#nickname'), 'Jun', 'saved answers loaded');
    assert.ok(await page.isChecked('#consent'));
    await shot(page, 'f002-resumed');
    await page.check('#disclaimer_ack');
    await page.fill('#last_name', 'Dela Cruz');
    await page.fill('#first_name', 'Juan');
    await page.fill('#middle_name', 'Santos');
    await page.fill('#present_address', 'Mandaluyong City');
    await page.fill('#age', '19');
    await page.check('#sex_m');
    await page.fill('#civil_status', 'Single');
    await page.fill('#mobile', '09181234567');
    await page.fill('#email', 'juan@example.com');
    await page.check('#photo_note_ack');
    await page.check('#ip_yes');
    await page.check('#ip_ifugao');
    await page.fill('#emergency_name', 'Ana Dela Cruz');
    await page.fill('#emergency_relationship', 'Mother');
    await page.fill('#emergency_address', 'Mandaluyong City');
    await page.fill('#emergency_contact', '09190000000');
    await page.fill('#shs_year', '25');
    await page.check('#dis_learning_disability_e_g_dyslexia_dyscalc');
    await page.check('#consent');
    await page.fill('#signature_name', 'Juan Santos Dela Cruz');
    await page.click('#f002 button[type=submit]');
    await page.waitForSelector('#f002 .error-summary');
    assert.match(await page.textContent('#f002 .error-summary'), /four digit year/);
    await page.fill('#shs_year', '2025');
    await shot(page, 'f002-filled', true);
    await page.click('#f002 button[type=submit]');
    await page.waitForSelector('#done:not([hidden])');
    assert.match(await page.textContent('#done-title'), /portfolio submitted/);
  });

  await step('F002: after submitting, the student can reopen the link, change answers and submit again', async () => {
    await page.goto(BASE + 'index.html');
    await page.goto(link);
    await page.waitForSelector('#saved-note:not([hidden])');
    assert.match(await page.textContent('#saved-note'), /You submitted this portfolio/);
    assert.ok(await page.locator('#save-draft').isHidden());
    assert.strictEqual(await page.textContent('#submit-portfolio'), 'Submit changes');
    await page.fill('#nickname', 'Juanito');
    await page.click('#submit-portfolio');
    await page.waitForSelector('#done:not([hidden])');
    assert.match(await page.textContent('#done-title'), /Changes submitted/);
  });

  let waiverLink;
  await step('staff panel: sessions, case notes, decision "No" unlocks the waiver', async () => {
    await panel.click('#refresh');
    await panel.click('button[data-id="' + ref + '"]');
    await panel.waitForSelector('#decNo');
    const row = panel.locator('tr[data-session="Intake"]');
    await row.locator('[data-f=date]').fill('2026-10-20');
    await row.locator('[data-f=time_started]').fill('09:00');
    await row.locator('[data-f=time_ended]').fill('10:00');
    await row.locator('[data-f=attended_by]').fill('Case Manager');
    await row.locator('[data-save-session]').click();
    await panel.waitForSelector('#toast .msg.ok');
    await panel.fill('#newNote', 'Student prefers written instructions.');
    await panel.click('#addNote');
    await panel.waitForSelector('.note');
    await panel.click('#decNo');
    await panel.waitForSelector('#theLink');
    waiverLink = await panel.inputValue('#theLink');
    await shot(panel, 'panel-decision', true);
  });

  await step('F002: the waiver opens only now, and is signed', async () => {
    await page.goto(BASE + 'index.html');
    await page.goto(waiverLink);
    await page.waitForSelector('#waiver:not([hidden])');
    assert.ok(await page.locator('#f002').isHidden());
    await page.fill('#waiver_name', 'Juan Santos Dela Cruz');
    await page.fill('#ay_start', '2026');
    await page.fill('#ay_end', '2027');
    await page.selectOption('#semester', '1st');
    await page.fill('#w_signature_name', 'Juan Santos Dela Cruz');
    await page.check('#w_consent');
    await shot(page, 'f002-waiver', true);
    await page.click('#waiver button[type=submit]');
    await page.waitForSelector('#done:not([hidden])');
    assert.match(await page.textContent('#done-title'), /Waiver signed/);
  });

  await step('staff panel: End of process', async () => {
    await panel.click('#refresh');
    await panel.click('button[data-id="' + ref + '"]');
    await panel.waitForSelector('#closeCase');
    assert.match(await panel.textContent('#detail'), /Individualized Support Plan waiver signed/);
    await panel.click('#closeCase');
    await panel.waitForFunction(() => /Closed/.test(document.getElementById('detail').textContent));
    await shot(panel, 'panel-closed', true);
  });

  await step('F004: a referred student requests the F003, and staff see it in the panel', async () => {
    const r = JSON.parse(srv.intake.ctx.doPost({ postData: { contents: JSON.stringify({ action: 'submit_f001', data: {
      s_name: 'Santos, Ana', s_program: 'Bachelor of Science in Biology', s_department: 'CAS', s_email: 'ana@example.com',
      reasons: ['Academic Challenged'], r_name: 'Prof X', r_email: 'x@rtu.edu.ph', r_source: 'Faculty', attest_name: 'Prof X', consent: true } }) } }).getContent());
    await page.goto(BASE + 'f004.html');
    await page.fill('#case_id', r.ref.toLowerCase());
    await page.fill('#s_name', 'Santos, Ana');
    await page.fill('#s_email', 'ana@example.com');
    await page.check('#prof_psychologist');
    await page.fill('#to_institution', 'City Clinic');
    await page.check('#consent');
    await shot(page, 'f004-filled', true);
    await page.click('button[type=submit]');
    await page.waitForSelector('#done:not([hidden])');
    assert.match(await page.textContent('#done-ref'), /^F004-/);
    await shot(page, 'f004-done');
    await panel.goto(BASE + 'panel');
    await panel.selectOption('#stageFilter', 'f004');
    await panel.waitForSelector('button[data-id="' + r.ref + '"]');
    assert.match(await panel.textContent('#cases'), /F003 requested/);
    await panel.click('button[data-id="' + r.ref + '"]');
    await panel.waitForSelector('[data-decline]');
    assert.match(await panel.textContent('#detail'), /Student requests for F003/);
    await panel.fill('#risk', 'note');
    await panel.click('#saveRisk');
    await panel.waitForFunction(() => /review saved/.test(document.getElementById('toast').textContent));
    await panel.selectOption('#cmSelect', 'case.manager@rtu.edu.ph');
    await panel.click('#assignCm');
    await panel.waitForFunction(() => /Responded/.test(document.getElementById('detail').textContent) && /Case manager/.test(document.getElementById('detail').textContent));
    await panel.check('input[name=cat][value=PHYSICAL_SENSORY]');
    await panel.click('#openF003');
    await panel.waitForSelector('#f003Dialog[open]');
    assert.ok(await panel.isChecked('#f003Dialog input[value=Psychologist]'), 'prefilled from the request');
    assert.strictEqual(await panel.inputValue('#d_inst'), 'City Clinic');
    await panel.fill('#d_by', 'Case Manager');
    await shot(panel, 'panel-f003-from-request');
    const before = srv.world.mail.length;
    await panel.click('#f003Issue');
    await panel.waitForFunction(() => /Issued/.test(document.getElementById('detail').textContent));
    assert.ok(srv.world.mail.slice(before).some(m => m.to === 'ana@example.com' && /ready/.test(m.subject)), 'pickup email');
  });

  await step('mobile width: no sideways scrolling on any page', async () => {
    const m = await browser.newPage({ viewport: { width: 375, height: 800 } });
    for (const p of ['index.html', 'f001.html', 'f002.html#preview', 'f004.html', 'requirements.html']) {
      await m.goto(BASE + p);
      const wide = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.ok(!wide, p + ' scrolls sideways');
    }
    await m.goto(BASE + 'f001.html');
    await shot(m, 'mobile-f001', true);
    await m.goto(BASE + 'f002.html#preview');
    await shot(m, 'mobile-f002-preview', true);
    await m.close();
  });

  await step('no browser errors', async () => {
    const real = errors.filter(e => !/fonts\.(googleapis|gstatic)|ERR_|net::/.test(e));
    assert.deepStrictEqual(real, []);
  });

  await browser.close();
  srv.server.close();
  console.log(process.exitCode ? 'E2E FAILED' : 'E2E passed');
})().catch(e => { console.error(e); process.exit(1); });
