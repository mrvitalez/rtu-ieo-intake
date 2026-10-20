/* RTU-OVPAA-IEO-F003 Referral Form for Required Documents */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var F = window.IEOForms;
  var form = document.getElementById('f003');
  var sheet = document.getElementById('sheet');
  var date = document.getElementById('date_issued');
  if (!date.value) date.value = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

  var allDocs = Array.prototype.map.call(form.querySelectorAll('[name="docs_requested"]'), function (el) { return el.value; });

  function printSheet(data) {
    sheet.innerHTML = window.IEOF003Sheet(data, { bannerSrc: 'assets/img/ieo-banner.png', allDocs: allDocs });
    document.body.classList.add('printing-sheet');
    var img = sheet.querySelector('img');
    var go = function () { window.print(); };
    if (img && !img.complete) { img.onload = go; img.onerror = go; } else { go(); }
  }
  window.addEventListener('afterprint', function () { document.body.classList.remove('printing-sheet'); });

  document.getElementById('print-only').addEventListener('click', function () {
    printSheet(F.readForm(form));
  });

  F.wireForm(form, {
    action: 'submit_f003',
    onSuccess: function (res, data) {
      F.showNotice(form, 'success', 'Saved to IEO records',
        'Record ' + res.ref + ' was saved. The print window opens now; choose "Save as PDF" as the printer to keep a PDF copy.');
      printSheet(data);
    }
  });
});
