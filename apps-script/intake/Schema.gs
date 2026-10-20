/**
 * RTU Inclusive Education Office (IEO) intake system
 * Shared schema for SOP-OVPAA-IEO-01 Needs Assessment and Student Profiling.
 *
 * This file is IDENTICAL in apps-script/intake and apps-script/staff-panel.
 * Edit one, then copy it to the other (tests/run.js fails if they differ).
 *
 * Option labels below are copied from the original RTU forms. The public
 * HTML forms in /docs must use exactly the same values (tests check this).
 */

var IEO = {
  TIMEZONE: 'Asia/Manila',

  FORMS: {
    F001: 'RTU-OVPAA-IEO-F001 Referral Slip for Needs Assessment',
    F002: 'RTU-OVPAA-IEO-F002 Student Portfolio Form for Inclusive Education',
    F003: 'RTU-OVPAA-IEO-F003 Referral Form for Required Documents'
  },

  /** Case stages, in SOP flowchart order. */
  STAGES: {
    RECEIVED: 'Referral slip received',
    DOCS_PENDING: 'Required documents incomplete',
    INTERVIEW: 'Needs assessment interview and student portfolio',
    PORTFOLIO_SUBMITTED: 'Student portfolio submitted',
    ISP: 'Educational assistance: ISP (SOP-OVPAA-IEO-02)',
    WAIVER_PENDING: 'No educational assistance: waiver unlocked',
    WAIVER_SIGNED: 'ISP waiver signed',
    CLOSED: 'End of process'
  },

  /** How many days a student portfolio or waiver link stays valid. */
  LINK_VALID_DAYS: 30,

  /** Public endpoint flood guard: accepted submissions per minute, all forms combined. */
  MAX_SUBMISSIONS_PER_MINUTE: 30,

  MAX_TEXT: 300,
  MAX_LONG_TEXT: 4000,

  // F001 Referral Slip
  REFERRAL_REASONS: [
    'Academic Challenged',
    'Behavioral Challenged',
    'Mobility/Sensory Challenged',
    'Student from Marginalized Sector',
    'Others'
  ],
  REFERRAL_SOURCES: ['CAWO', 'AO', 'UC', 'Faculty', 'Student/Classmate', 'Self', 'Others'],
  SEX: ['Male', 'Female'],

  // F002 Student Portfolio Form (original order, read row by row)
  IP_GROUPS: [
    'Kalanguya', 'Bataks', 'Ivatan',
    'Ati Negrito', 'Bagobo', 'Matigsalug',
    'Muslim Maranaos', 'Isnag', 'Tagbanuas',
    'Agusan Manobo', 'Tadyawan Mangyan', 'Dibabaon',
    'Ata-Manobo', 'Ayta', 'Mansaka',
    'Ifugao', 'Ibaloi', 'Bugkalot',
    'Sumadel Kalinga', 'Ilongot-Engongot', 'Others',
    'Higaonon', 'Pala’wans',
    'Subanen', 'Busaos Kankana-ey',
    'Tagabawa', 'Mandaya'
  ],

  DISABILITIES: [
    // Sensory Disability
    'Visual Disability – Low vision or partial sight',
    'Visual Disability – Blind or total loss of vision',
    'Hearing Disability – Hard of hearing',
    'Hearing Disability – Deaf or total hearing loss',
    // Speech and Communication Disability
    'Difficulty in speaking clearly (e.g. stuttering, slurred speech)',
    'Non-verbal (uses sign language or communication devices)',
    'Diagnosed speech/language delay or disorder',
    // Physical Disability
    'Physical: Mobility Impairment (e.g. Cerebral Palsy, Amputee, Spinal Cord Injury)',
    'Muscoskeletal disorder (e.g. scoliosis, clubfoot)',
    'Uses mobility aid (e.g. wheelchair, crutches, prosthesis)',
    // Neurological Disability
    'Neurological: Mobility Impairment (e.g. Cerebral Palsy, Amputee, Spinal Cord Injury)',
    'Epilepsy or seizure disorder',
    'Traumatic Brain Injury',
    'Neurodegenerative condition (e.g. Parkinson’s disease, Alzheimer’s disease)',
    // Intellectual and Learning Disability
    'Intellectual Disability (e.g. Global Developmental Delay, Mild/Moderate/Severe ID)',
    'Learning Disability (e.g. Dyslexia, Dyscalculia, Dysgraphia)',
    'Has difficulty with memory, problem-solving, or adaptive behavior',
    // Psychosocial Disability
    'Autism Spectrum Disorder',
    'Depression, anxiety, or trauma-related disorder (diagnosed)',
    'Bipolar disorder, schizophrenia, or other major mental health condition',
    // Chronic Illness with Functional Limitation
    'Diabetes (with complications affecting daily activities)',
    'Cancer (currently undergoing treatment or with lasting impact)',
    'Cardiovascular condition (e.g. heart disease, affecting function)',
    'Tuberculosis (chronic or with long-term effects)',
    'Others'
  ],

  SEMESTERS: ['1st', '2nd', 'Summer'],

  INTERVIEW_MODES: ['In person', 'Online'],

  // Follow up before Submission of Required Documents: student, then referrer, then department head.
  // Self referrals skip the referrer. After the last "No response" the referral is closed.
  FOLLOWUP_WAIT_WORKING_DAYS: 3,
  CONTACT_METHODS: ['Email', 'Phone', 'In person', 'Other'],
  FOLLOWUP_TARGETS: { student: 'Referred student', referrer: 'Referrer', dept_head: 'Department head' },
  /**
   * Starting list for the Programs tab (courses offered and their department heads, from the IEO).
   * Used only to fill an empty Programs tab; after that staff edit the tab in the sheet.
   * Head emails are not known yet: staff add them in the sheet or the first time they contact a head.
   */
  PROGRAM_SEED: [
    ['CAS', 'Bachelor of Arts in Political Science', 'Asst. Prof. John D. Benedick Alim'],
    ['CAS', 'Bachelor of Science in Astronomy', 'Instr. Jason B. Kalaw'],
    ['CAS', 'Bachelor of Science in Biology', 'Assoc. Prof. Marita Geroy'],
    ['CAS', 'Bachelor of Science in Psychology', 'Asst. Prof. Iris Cristelle D. Destura'],
    ['CAS', 'Bachelor of Science in Statistics', 'Dr. Faustino E. Oguan'],
    ['CBEA', 'Bachelor of Science in Accountancy', 'Instr. Noel G. Tubice'],
    ['CBEA', 'Bachelor of Science in Entrepreneurship', 'Instr. Cyrille Anne R. Del Rio'],
    ['CBEA', 'Bachelor of Science in Office Administration', 'Instr. Hanna V. Reambonanza'],
    ['CBEA', 'Bachelor of Science in Business Administration Major in Financial Management', 'Instr. Michael Ivan P. Mediola'],
    ['CBEA', 'Bachelor of Science in Business Administration Major in Human Resource Management', 'Instr. Carlie H. Momongan'],
    ['CBEA', 'Bachelor of Science in Business Administration Major in Marketing Management', 'Instr. Abigail P. Mendoza'],
    ['CBEA', 'Bachelor of Science in Business Administration Major in Operation Management', 'Instr. Louie A. Donato'],
    ['CEng', 'Bachelor of Science in Civil Engineering', 'Engr. Aleli N. Rey'],
    ['CEng', 'Bachelor of Science in Computer Engineering', 'Dr. Ma. Luisa M. Villanueva'],
    ['CEng', 'Bachelor of Science in Electrical Engineering', 'Dr. Corleto R. Bravo'],
    ['CEng', 'Bachelor of Science in Electronics Communication Engineering', 'Engr. Danfort Raven E. Inocencio'],
    ['CEng', 'Bachelor of Science in Industrial Engineering', 'Dr. Helen L. Mendoza'],
    ['CEng', 'Bachelor of Science in Instrumentation and Control Engineering', 'Engr. Darius I. Trance'],
    ['CEng', 'Bachelor of Science in Mechanical Engineering', 'Engr. Gerry C. Cabrera'],
    ['CEng', 'Bachelor of Engineering Technology Major in Mechatronics', 'Dr. Odilon B. Yangco'],
    ['CED', 'Bachelor of Secondary Education Major in English', 'Instr. Monica Elijan R. Macaballug'],
    ['CED', 'Bachelor of Secondary Education Major in Filipino', 'Instr. Aira F. Mitra'],
    ['CED', 'Bachelor of Secondary Education Major in Mathematics', 'Asst. Prof. Belen B. Balbuena'],
    ['CED', 'Bachelor of Secondary Education Major in Sciences', 'Assoc. Prof. Jerico S. Laquesta'],
    ['CED', 'Bachelor of Secondary Education Major in Social Studies', 'Instr. Dexter O. Andal'],
    ['CED', 'Bachelor of Technical-Vocational Teacher Education Major in Animation', 'Assoc. Prof. Romelyn Z. Callueng'],
    ['CED', 'Bachelor of Technical-Vocational Teacher Education Major in Computer System Servicing', 'Assoc. Prof. Romelyn Z. Callueng'],
    ['CED', 'Bachelor of Technical-Vocational Teacher Education Major in Electronics Technology', 'Assoc. Prof. Romelyn Z. Callueng'],
    ['CED', 'Bachelor of Technical-Vocational Teacher Education Major in Garment, Fashion, and Design', 'Assoc. Prof. Romelyn Z. Callueng'],
    ['CED', 'Bachelor of Technical-Vocational Teacher Education Major in Visual Graphics Design', 'Assoc. Prof. Romelyn Z. Callueng'],
    ['CED', 'Bachelor of Technical-Vocational Teacher Education Major in Welding and Fabrication Technology', 'Assoc. Prof. Romelyn Z. Callueng'],
    ['IA', 'Bachelor of Science in Architecture', 'Ar. Marirose V. Vocal'],
    ['IHK', 'Bachelor of Physical Education', 'Instr. Christian Alex Mondido'],
    ['ICS', 'Bachelor of Information and Technology', 'Dr. Lea S Nesperos'],
    ['GS', 'Master of Arts in Literature and Language Instruction', 'Dr. Edna C. Aquino'],
    ['GS', 'Master of Science in Engineering major in Instrumentation & Control Engineering', 'Dr. Wilfredo De Leon Timajo'],
    ['GS', 'Master of Arts in Public Administration', 'Dr. Jeremiah V. Pacer'],
    ['GS', 'Master in Business Administration', 'Dr. Rodolfo L. Ducut'],
    ['GS', 'Doctor of Philosophy in Public Administration', 'Dr. Helen Mercedes C. Asturias']
  ],

  UNREACHABLE_REASON: 'No response after the follow up attempts (referred student, referrer, department head)',
  DEFAULT_VENUE: 'Inclusive Education Office, Rizal Technological University, Boni Avenue, Mandaluyong City',

  // Document checklist (SOP-OVPAA-IEO-01, Submission of Required Documents)
  CATEGORIES: {
    NEURODIVERGENT: 'Neurodivergent condition',
    PHYSICAL_SENSORY: 'Physical or sensory impairment',
    IP: 'Indigenous People (IP)',
    PDL: 'Person Deprived of Liberty (PDL)'
  },

  /**
   * rule 'all'  : every document marked required must be checked
   * rule 'any'  : at least one document in the group must be checked
   * required:false documents are supporting documents (checked if submitted).
   */
  DOCUMENTS: {
    NEURODIVERGENT: {
      rule: 'all',
      f003: true,
      docs: [
        { id: 'clinical_dx', label: 'Clinical diagnosis from physician, psychiatrist, or psychologist', required: true },
        { id: 'pwd_id', label: 'PWD Identification Card', required: false },
        { id: 'iep', label: 'Individualized Education Plan from previous school, if available', required: false },
        { id: 'progress', label: 'Progress Reports from occupational therapists, physical therapists, speech and language therapists, and other multidisciplinary team providers', required: false }
      ]
    },
    PHYSICAL_SENSORY: {
      rule: 'all',
      f003: true,
      docs: [
        { id: 'clinical_dx', label: 'Clinical diagnosis from physician, psychiatrist, or psychologist', required: true },
        { id: 'pwd_id', label: 'PWD Identification Card', required: false },
        { id: 'iep', label: 'Individualized Education Plan from previous school, if available', required: false },
        { id: 'progress', label: 'Progress Reports from occupational therapists, physical therapists, speech and language therapists, and other multidisciplinary team providers', required: false }
      ]
    },
    IP: {
      rule: 'any',
      f003: false,
      docs: [
        { id: 'coc', label: 'Certificate of Confirmation (COC)', required: true },
        { id: 'tribal_endorsement', label: 'Tribal/Community Endorsement', required: true }
      ]
    },
    PDL: {
      rule: 'all',
      f003: false,
      docs: [
        { id: 'bjmp_endorsement', label: 'Endorsement from the BJMP Coordinator', required: true },
        { id: 'cawo_clearance', label: 'Clearance from CAWO', required: true }
      ]
    }
  },

  // F003 Referral Form for Required Documents
  PROFESSIONS: ['Physician', 'Psychiatrist', 'Psychologist'],
  F003_DOCS: [
    'Clinical diagnosis',
    'Psychological, psychiatric, or developmental assessment report',
    'Progress Reports from occupational therapists, physical therapists, speech and language therapists, and other multidisciplinary team providers',
    'Recommended school accommodations or precautionary measures'
  ],

  /** Sheet tabs and their columns. Records are written by header name. */
  SHEETS: {
    Cases: ['case_id', 'created_at', 'stage', 'student_name', 'student_no', 'program', 'department',
      'referral_source', 'risk_opportunity_note', 'categories', 'documents_received', 'documents_complete',
      'f003_issued_count', 'link_hash', 'link_purpose', 'link_issued_at', 'portfolio_submitted_at',
      'decision', 'decision_at', 'decision_by', 'waiver_unlocked_at', 'waiver_signed_at',
      'closed_at', 'close_reason', 'updated_at', 'updated_by',
      'student_email', 'interview_start', 'interview_end', 'interview_mode', 'interview_venue',
      'calendar_event_id', 'interview_scheduled_by', 'interview_scheduled_at',
      'followup_status', 'followup_due'],
    F001_Referrals: ['case_id', 'submitted_at', 's_name', 's_program', 's_department', 's_student_no',
      's_birthday', 's_age', 's_sex', 'reasons', 'reason_other', 'r_name', 'r_contact', 'r_department',
      'r_email', 'r_designation', 'r_source', 'r_source_other', 'observations', 'attest_name',
      'client_datetime', 'consent', 's_email'],
    F002_Portfolios: ['case_id', 'submitted_at', 'course', 'last_name', 'first_name', 'middle_name',
      'nickname', 'present_address', 'provincial_address', 'age', 'sex', 'civil_status', 'religion',
      'nationality', 'telephone', 'mobile', 'email', 'pwd_id', 'ip_member', 'ip_groups', 'ip_other',
      'emergency_name', 'emergency_relationship', 'emergency_address', 'emergency_contact',
      'elem_school', 'elem_year', 'jhs_school', 'jhs_year', 'shs_school', 'shs_year', 'shs_track',
      'shs_strand', 'disabilities', 'disability_other', 'medications', 'precautions',
      'photo_note_ack', 'disclaimer_ack', 'consent', 'signature_name'],
    F002_Waivers: ['case_id', 'signed_at', 'waiver_name', 'ay_start', 'ay_end', 'semester',
      'signature_name', 'consent'],
    F003_Referrals: ['f003_id', 'case_id', 'recorded_at', 'recorded_by', 'date_issued', 'to_name',
      'to_profession', 'to_institution', 'to_address', 's_name', 's_program', 's_student_no',
      'docs_requested', 'remarks', 'issued_by', 'issued_designation', 'consent'],
    Sessions: ['case_id', 'session', 'date', 'time_started', 'time_ended', 'attended_by',
      'entered_by', 'entered_at'],
    CaseNotes: ['case_id', 'written_at', 'author', 'note'],
    ContactAttempts: ['case_id', 'attempt_no', 'target', 'contact_name', 'contact', 'method', 'contacted_at',
      'due_date', 'result', 'result_at', 'staff', 'note'],
    Programs: ['college', 'program', 'head_name', 'head_email'],
    AuditLog: ['at', 'actor', 'action', 'case_id', 'detail']
  },

  SESSION_LABELS: ['Intake', 'Session 1', 'Session 2', 'Session 3', 'Session 4', 'Session 5',
    'Session 6', 'Session 7', 'Session 8', 'Session 9', 'Session 10']
};

/* ---------- helpers shared by both projects ---------- */

function ieoNow_() {
  return Utilities.formatDate(new Date(), IEO.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Turn any input into a safe sheet cell string: trimmed, length limited,
 * control characters removed, and never interpreted as a formula.
 */
function ieoClean_(value, max) {
  if (value === null || value === undefined) return '';
  var s = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  s = s.slice(0, max || IEO.MAX_TEXT);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return s;
}

function ieoHash_(token) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function ieoNewToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

function ieoSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('SHEET_ID script property is not set. Run setup() in the intake project first.');
  return SpreadsheetApp.openById(id);
}

function ieoSheet_(name) {
  var ss = ieoSpreadsheet_();
  var sh = ss.getSheetByName(name);
  if (!sh && IEO.SHEETS[name]) {
    // A tab added in a newer version of the code: create it so an existing spreadsheet keeps working.
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, IEO.SHEETS[name].length).setValues([IEO.SHEETS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), IEO.SHEETS[name].length).setNumberFormat('@');
  }
  if (!sh) throw new Error('Missing sheet tab: ' + name + '. Run setup() in the intake project.');
  return sh;
}

/** yyyy-MM-dd plus n working days (Monday to Friday; holidays are not counted out). */
function ieoAddWorkingDays_(isoDate, n) {
  var d = new Date(isoDate + 'T12:00:00+08:00');
  var added = 0;
  while (added < n) {
    d = new Date(d.getTime() + 86400000);
    var wd = Number(Utilities.formatDate(d, IEO.TIMEZONE, 'u')); // 1 = Monday ... 7 = Sunday
    if (wd <= 5) added++;
  }
  return Utilities.formatDate(d, IEO.TIMEZONE, 'yyyy-MM-dd');
}

function ieoToday_() {
  return Utilities.formatDate(new Date(), IEO.TIMEZONE, 'yyyy-MM-dd');
}

/**
 * Programs (courses offered) with their college and department head, from the Programs tab.
 * An empty tab is filled once from IEO.PROGRAM_SEED; staff keep it up to date in the sheet.
 */
function ieoPrograms_() {
  var sh = ieoSheet_('Programs');
  if (sh.getLastRow() < 2 && IEO.PROGRAM_SEED.length) {
    var rows = IEO.PROGRAM_SEED.map(function (r) { return [r[0], r[1], r[2], '']; });
    sh.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  return ieoReadAll_('Programs').filter(function (p) { return String(p.program || '').trim(); }).map(function (p) {
    return { _row: p._row, college: String(p.college || '').trim(), program: String(p.program).trim(),
      head_name: String(p.head_name || '').trim(), head_email: String(p.head_email || '').trim() };
  });
}

function ieoFindProgram_(program) {
  var key = String(program || '').trim().toLowerCase();
  return ieoPrograms_().filter(function (p) { return p.program.toLowerCase() === key; })[0] || null;
}

/** Append a record object to a tab, matching keys to the header row. */
function ieoAppend_(name, record) {
  var sh = ieoSheet_(name);
  var headers = ieoHeaders_(sh, name);
  var row = headers.map(function (h) { return record.hasOwnProperty(h) ? record[h] : ''; });
  sh.appendRow(row);
}

/**
 * The tab's header row. Columns added to IEO.SHEETS in a newer version of the code
 * are appended automatically, so an existing spreadsheet keeps working after an update.
 */
function ieoHeaders_(sh, name) {
  var headers = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
  var missing = (IEO.SHEETS[name] || []).filter(function (h) { return headers.indexOf(h) < 0; });
  if (missing.length) {
    sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    sh.getRange(1, headers.length + 1, sh.getMaxRows(), missing.length).setNumberFormat('@');
    headers = headers.concat(missing);
  }
  return headers;
}

/** Read a whole tab as objects keyed by header. Adds _row (1 based sheet row). */
function ieoReadAll_(name) {
  var sh = ieoSheet_(name);
  var values = sh.getDataRange().getValues();
  var headers = values.shift() || [];
  return values.map(function (r, i) {
    var o = { _row: i + 2 };
    headers.forEach(function (h, j) { o[h] = r[j] instanceof Date ? Utilities.formatDate(r[j], IEO.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : r[j]; });
    return o;
  });
}

/** Update named columns on one row of a tab. */
function ieoUpdate_(name, rowNumber, changes) {
  var sh = ieoSheet_(name);
  var headers = ieoHeaders_(sh, name);
  Object.keys(changes).forEach(function (k) {
    var col = headers.indexOf(k);
    if (col < 0) throw new Error('Unknown column ' + k + ' in ' + name);
    sh.getRange(rowNumber, col + 1).setValue(changes[k]);
  });
}

function ieoFindCase_(caseId) {
  var all = ieoReadAll_('Cases');
  for (var i = 0; i < all.length; i++) if (String(all[i].case_id) === String(caseId)) return all[i];
  return null;
}

function ieoFindCaseByToken_(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(String(token))) return null;
  var h = ieoHash_(token);
  var all = ieoReadAll_('Cases');
  for (var i = 0; i < all.length; i++) if (all[i].link_hash === h) return all[i];
  return null;
}

function ieoLinkExpired_(c) {
  if (!c.link_issued_at) return true;
  var issued = new Date(String(c.link_issued_at).replace(' ', 'T') + '+08:00');
  return (Date.now() - issued.getTime()) > IEO.LINK_VALID_DAYS * 86400000;
}

function ieoAudit_(actor, action, caseId, detail) {
  ieoAppend_('AuditLog', { at: ieoNow_(), actor: ieoClean_(actor), action: action, case_id: caseId || '', detail: ieoClean_(detail || '', 1000) });
}

/**
 * Document checklist evaluation. categories: array of category keys;
 * received: array of document ids. Returns {complete, missing:[labels], f003Eligible}.
 */
function ieoEvaluateDocuments_(categories, received) {
  var missing = [];
  var f003 = false;
  var have = {};
  (received || []).forEach(function (d) { have[d] = true; });
  if (!categories || !categories.length) return { complete: false, missing: ['Select at least one case category'], f003Eligible: false };
  categories.forEach(function (cat) {
    var def = IEO.DOCUMENTS[cat];
    if (!def) return;
    var req = def.docs.filter(function (d) { return d.required; });
    if (def.rule === 'any') {
      if (!req.some(function (d) { return have[d.id]; })) {
        missing.push(req.map(function (d) { return d.label; }).join(' or '));
      }
    } else {
      req.forEach(function (d) {
        if (!have[d.id]) { missing.push(d.label); if (def.f003) f003 = true; }
      });
    }
  });
  missing = missing.filter(function (m, i) { return missing.indexOf(m) === i; });
  return { complete: missing.length === 0, missing: missing, f003Eligible: f003 };
}
