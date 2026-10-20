/*
 * RTU-OVPAA-IEO-F003 Referral Form for Required Documents: printable sheet.
 * Single source of the F003 wording. The staff panel includes this same file
 * (apps-script/staff-panel/F003Sheet.html); tests/run.js checks they match.
 *
 * window.IEOF003Sheet(data, options) returns the HTML of a one page A4 sheet.
 * data: { date_issued, to_name, to_profession, to_institution, to_address,
 *         s_name, s_program, s_student_no, case_id, docs_requested[], remarks,
 *         issued_by, issued_designation }
 * options: { bannerSrc, allDocs[] }
 */
(function (root) {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function blank(v, width) {
    return v ? '<span style="border-bottom:1px solid #000;padding:0 4px;font-weight:700">' + esc(v) + '</span>'
      : '<span style="display:inline-block;border-bottom:1px solid #000;min-width:' + (width || 12) + 'em">&nbsp;</span>';
  }
  function longDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
    var m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var p = iso.split('-');
    return m[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0];
  }
  function lines(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '<div style="border-bottom:1px solid #000;height:1.4em"></div>';
    return s;
  }

  root.IEOF003Sheet = function (d, opt) {
    d = d || {};
    opt = opt || {};
    var all = opt.allDocs || [];
    var picked = d.docs_requested || [];
    var prof = d.to_profession || '';
    var box = function (on) { return '<span style="display:inline-block;width:1em;text-align:center;border:1px solid #000;margin-right:6px;line-height:1">' + (on ? '&#10003;' : '&nbsp;') + '</span>'; };
    var docs = all.map(function (doc) { return '<li style="list-style:none;margin:2px 0">' + box(picked.indexOf(doc) >= 0) + esc(doc) + '</li>'; }).join('');
    var profLine = ['Physician', 'Psychiatrist', 'Psychologist'].map(function (p) { return box(prof === p) + p; }).join('&nbsp;&nbsp;&nbsp;');

    return '' +
      '<div style="font-family:\'Atkinson Hyperlegible\',Arial,sans-serif;color:#000;font-size:10pt;line-height:1.32">' +
      (opt.bannerSrc ? '<img src="' + esc(opt.bannerSrc) + '" alt="Rizal Technological University, Inclusive Education Office" style="width:100%;display:block;margin-bottom:6px">' : '') +
      '<div style="display:flex;justify-content:space-between;font-size:9pt;border-bottom:1px solid #000;padding-bottom:3px">' +
      '<strong>RTU-OVPAA-IEO-F003</strong><span>' + (d.case_id ? 'IEO Case Ref.: ' + esc(d.case_id) : 'SOP-OVPAA-IEO-01') + '</span></div>' +
      '<h1 style="text-align:center;font-size:13pt;margin:8px 0 6px;letter-spacing:.03em;color:#000">REFERRAL FORM FOR REQUIRED DOCUMENTS</h1>' +

      '<p style="margin:0 0 4px">Date: ' + blank(longDate(d.date_issued), 12) + '</p>' +
      '<p style="margin:0 0 4px">To: ' + blank(d.to_name, 22) + '</p>' +
      '<p style="margin:0 0 4px">' + profLine + '</p>' +
      '<p style="margin:0 0 4px">Clinic / Hospital: ' + blank(d.to_institution, 22) + '</p>' +
      '<p style="margin:0 0 10px">Address: ' + blank(d.to_address, 26) + '</p>' +

      '<p style="margin:0 0 6px">Dear Doctor:</p>' +
      '<p style="margin:0 0 6px">Greetings from the Inclusive Education Office (IEO) of Rizal Technological University!</p>' +
      '<p style="margin:0 0 6px;text-align:justify">We respectfully refer to you ' + blank(d.s_name, 18) + ', a student of ' + blank(d.s_program, 14) +
      ', Student No. ' + blank(d.s_student_no, 9) + ', who is undergoing Needs Assessment and Student Profiling (SOP-OVPAA-IEO-01) at our office. ' +
      'Under this procedure, a student with a neurodivergent condition and/or physical and sensory impairment is required to submit a clinical diagnosis from a physician, psychiatrist, or psychologist, together with other supporting documents pertinent to his/her condition. ' +
      'The process may not push forward without the required document.</p>' +
      '<p style="margin:0 0 4px">In this regard, may we request the following for the student:</p>' +
      '<ul style="margin:0 0 6px;padding-left:4px">' + docs + '</ul>' +
      (d.remarks ? '<p style="margin:0 0 6px">Remarks: ' + esc(d.remarks) + '</p>' : '') +
      '<p style="margin:0 0 6px;text-align:justify">The documents will be kept confidential by the IEO and used only to plan inclusive education support for the student, in accordance with Republic Act 10173, the Data Privacy Act of 2012. Thank you very much.</p>' +
      '<div style="margin:10px 0 6px;width:48%">' +
      '<div style="border-bottom:1px solid #000;min-height:1.4em;font-weight:700;text-align:center">' + esc(d.issued_by || '') + '</div>' +
      '<div style="text-align:center;font-size:9pt">' + (d.issued_designation ? esc(d.issued_designation) + ', ' : '') + 'Inclusive Education Office</div></div>' +

      '<div style="border:1.5px solid #000;padding:6px 8px;margin-top:6px">' +
      '<strong>TO BE ACCOMPLISHED BY THE ATTENDING PHYSICIAN, PSYCHIATRIST, OR PSYCHOLOGIST</strong>' +
      '<p style="margin:6px 0 0">Clinical diagnosis / impression:</p>' + lines(3) +
      '<p style="margin:6px 0 0">Recommendations for school accommodations or precautions:</p>' + lines(2) +
      '<div style="display:flex;gap:12px;margin-top:14px">' +
      '<div style="flex:2"><div style="border-bottom:1px solid #000;height:1.4em"></div><div style="font-size:9pt;text-align:center">Name and signature</div></div>' +
      '<div style="flex:1"><div style="border-bottom:1px solid #000;height:1.4em"></div><div style="font-size:9pt;text-align:center">License No.</div></div>' +
      '<div style="flex:1"><div style="border-bottom:1px solid #000;height:1.4em"></div><div style="font-size:9pt;text-align:center">Date of assessment</div></div></div></div>' +

      '<div style="border:1px solid #000;padding:6px 8px;margin-top:8px">' +
      '<strong>STUDENT\'S AUTHORIZATION</strong>' +
      '<p style="margin:4px 0 0;text-align:justify">I authorize my attending physician, psychiatrist, or psychologist to release the documents requested above to the Inclusive Education Office of Rizal Technological University.</p>' +
      '<div style="display:flex;gap:12px;margin-top:14px">' +
      '<div style="flex:2"><div style="border-bottom:1px solid #000;height:1.4em"></div><div style="font-size:9pt;text-align:center">Signature over printed name of student</div></div>' +
      '<div style="flex:1"><div style="border-bottom:1px solid #000;height:1.4em"></div><div style="font-size:9pt;text-align:center">Date</div></div></div></div>' +
      '<p style="font-size:8.5pt;margin:8px 0 0">Please return this form with the requested documents to the Inclusive Education Office, Rizal Technological University, Boni Avenue, Mandaluyong City. Tel. (02) 8534-8267 loc. 1202.</p>' +
      '</div>';
  };
})(typeof window !== 'undefined' ? window : this);
