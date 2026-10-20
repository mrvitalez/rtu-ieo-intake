/* RTU-OVPAA-IEO-F001 Referral Slip for Needs Assessment */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var F = window.IEOForms;
  var form = document.getElementById('f001');
  F.startClock(document.getElementById('client_datetime'));

  var bday = document.getElementById('s_birthday');
  var age = document.getElementById('s_age');
  bday.max = new Date().toISOString().slice(0, 10);
  ['input', 'change'].forEach(function (ev) {
    bday.addEventListener(ev, function () { var a = F.ageFrom(bday.value); if (a) age.value = a; });
  });

  document.getElementById('copy-self').addEventListener('click', function () {
    var n = document.getElementById('s_name').value.trim();
    document.getElementById('r_name').value = n;
    if (!document.getElementById('r_email').value) document.getElementById('r_email').value = document.getElementById('s_email').value.trim();
    document.getElementById('attest_name').value = '';
    document.getElementById('r_name').focus();
  });

  F.wireForm(form, {
    action: 'submit_f001',
    extraValidate: function (d) {
      var e = {};
      if (!d.r_contact && !d.r_email) e.r_contact = 'Give a contact number or an email address so the IEO can reach you.';
      if (d.attest_name && d.r_name && F.norm(d.attest_name) !== F.norm(d.r_name)) {
        e.attest_name = 'Type your name exactly as written in "Name" under Referring Person.';
      }
      if (d.s_age && (!/^\d+$/.test(d.s_age) || +d.s_age < 10 || +d.s_age > 99)) e.s_age = 'Enter an age from 10 to 99.';
      return e;
    },
    onSuccess: function (res) {
      document.getElementById('form-doc').hidden = true;
      var done = document.getElementById('done');
      document.getElementById('done-ref').textContent = res.ref;
      document.getElementById('done-time').textContent = F.nowText();
      done.hidden = false;
      form.reset();
      window.scrollTo(0, 0);
      done.focus();
    }
  });
});
