/* RTU-OVPAA-IEO-F004 Request for Referral Form for Clinical Diagnosis */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var F = window.IEOForms;
  var form = document.getElementById('f004');
  var ref = document.getElementById('case_id');
  ref.addEventListener('blur', function () { ref.value = ref.value.trim().toUpperCase(); });

  F.wireForm(form, {
    action: 'submit_f004',
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
