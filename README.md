# RTU IEO Intake System

Online version of **SOP-OVPAA-IEO-01 Needs Assessment and Student Profiling** for the Inclusive Education Office (IEO) of Rizal Technological University.

* **Public site** (this repository, GitHub Pages): the referral slip, the student portfolio, the document referral form, and the required documents list.
* **Records**: an IEO owned Google Sheet, written through Google Apps Script.
* **Staff panel**: an Apps Script web app that only allowlisted IEO Google accounts can open.

> This repository contains code only. No student data is ever stored here. All answers go straight to the IEO Google Sheet.

## Contents

1. [Forms](#forms)
2. [SOP mapping](#sop-mapping)
3. [Roles](#roles)
4. [Required documents rule](#required-documents-rule)
5. [Privacy and security](#privacy-and-security)
6. [Setup](#setup)
7. [Repository layout](#repository-layout)
8. [Testing](#testing)
9. [Notes for IEO review](#notes-for-ieo-review)

## Forms

| Code | Title | Page | Who uses it |
|---|---|---|---|
| RTU-OVPAA-IEO-F001 | Referral Slip for Needs Assessment | `f001.html` | Anyone: CAWO, AO, UC, faculty, a classmate, or the student |
| RTU-OVPAA-IEO-F002 | Student Portfolio Form for Inclusive Education (formerly RTU-OVPASA-OSAAS-CASU-F008) | `f002.html` | The referred student, from a personal link issued by the IEO |
| RTU-OVPAA-IEO-F003 | Referral Form for Required Documents | `f003.html` and the staff panel | IEO staff, printed for the student's physician, psychiatrist, or psychologist |

Each form is its own standalone page with its own submission action. `requirements.html` lists the documents per case category, and `f002.html#preview` shows the full F002 (including the waiver) for review without sending anything.

## SOP mapping

The SOP flowchart, step by step, and what the system does at each step.

| # | SOP flowchart step | Case stage in the sheet | What happens | Who |
|---|---|---|---|---|
| 1 | Start of Process | | The referrer opens F001. | Referrer |
| 2 | Identify the Risk and Opportunity | (risk note) | F001 captures the *Reason for Referral* and *Other Observations*. Staff write the risk and opportunity note in the panel; the next steps stay locked until it is saved. | Referrer, IEO Staff |
| 3 | Submission of Referral Slip | `RECEIVED` | F001 is submitted. A case is created with a reference number (`IEO-2026-0001`). | Referrer |
| 4 | Submission of Required Document with Supporting Documents. *Do they have the required documents?* | `RECEIVED` / `DOCS_PENDING` | Staff choose the case category and tick the documents received. **Complete**: staff open the interview stage. **Incomplete**: IP and PDL students are asked to submit the documents; neurodivergent and physical or sensory cases are given F003. | IEO Staff, Referred Student |
| 5 | Answering of Needs Assessment Interview and Student Portfolio Form | `INTERVIEW` → `PORTFOLIO_SUBMITTED` | Staff issue a personal F002 link. The student submits F002. Staff record the sessions (Intake, Sessions 1 to 10) and case notes. | Referred Student, IEO Staff (Case Manager) |
| 6 | *Do they require educational assistance?* | `ISP` or `WAIVER_PENDING` → `WAIVER_SIGNED` | **Yes**: proceed with the Formulation of ISP (SOP-OVPAA-IEO-02). **No**: the waiver section of F002 unlocks and the student signs it from a new link. | IEO Staff, Referred Student |
| 7 | End of Process | `CLOSED` | Staff close the case. A case can also be closed early with a reason (for example, the student withdrew). | IEO Staff |

The order is enforced by the server, not only by the screen: the interview cannot open without the risk note and the required documents, the portfolio cannot be sent without a valid link, and the waiver cannot be signed until staff record "No educational assistance needed".

## Roles

| Role | Can do | Cannot do |
|---|---|---|
| **Referrer** (office, faculty, classmate, or the student) | Submit F001 and receive a reference number | View or look up any case, including their own referral |
| **Referred Student** | Submit F002 and, if unlocked, the ISP waiver, using their personal link | View any record, including their own answers after submitting |
| **IEO Staff** | Everything in the staff panel: review referrals, the document checklist, F003, links, sessions, case notes, decision, closing | Access the panel without being on the staff list *and* having access to the sheet |

## Required documents rule

From SOP-OVPAA-IEO-01. Nothing is uploaded; staff verify the documents in person and tick them in the panel.

| Category | Required | Supporting (may include, but not limited to) | If incomplete |
|---|---|---|---|
| Neurodivergent condition | Clinical diagnosis from physician, psychiatrist, or psychologist | PWD Identification Card; Individualized Education Plan from previous school, if available; Progress Reports from OT, PT, SLT and other multidisciplinary team providers | Issue F003 |
| Physical or sensory impairment | Same as above | Same as above | Issue F003 |
| Indigenous People (IP) | Certificate of Confirmation (COC) **or** Tribal/Community Endorsement | | Student submits the documents |
| Person Deprived of Liberty (PDL) | Endorsement from the BJMP Coordinator **and** Clearance from CAWO | | Student submits the documents |

A student can belong to more than one category; the requirements combine. *The process may not push forward without the required document.*

## Privacy and security

* **RA 10173.** Every form shows the University's Data Privacy Consent (the text from the original F008) and cannot be sent without agreeing to it.
* **Write only public endpoint.** The intake Apps Script only adds records. It never returns a stored record. A link status check answers only "open or not", with no names or details.
* **Personal links.** F002 and waiver links carry a random 64 character token after `#`, so it is never sent to GitHub's servers. Only a SHA-256 hash is stored. Links expire after 30 days, stop working once used, and staff can replace a lost one (the old one stops working).
* **Staff panel, two locks.** It runs as the signed in user, so Google requires that the user has access to the sheet, *and* every action checks the account against the `STAFF_EMAILS` list. Students and other accounts see an "access denied" page with no data.
* **Spreadsheet safety.** All cells are stored as text (leading zeros in phone and student numbers are kept) and anything that looks like a formula is stored as plain text.
* **Abuse guards.** Option values are checked against the original forms, lengths are limited, a hidden field catches bots, and submissions are capped per minute.
* **Audit log.** Every staff action, including opening a case, is logged with the staff email in the `AuditLog` tab.
* No cookies, no analytics. The only browser storage is the text size choice.

## Setup

You need: the IEO Google account that will own the records, and access to this repository.

### 1. Create the records sheet and intake endpoint

1. Signed in as the IEO account, go to [script.google.com](https://script.google.com) and create a new project named **RTU IEO Intake**.
2. In Project Settings, tick **Show "appsscript.json" manifest file in editor**.
3. Replace the editor files with the three files in [`apps-script/intake`](apps-script/intake): `Code.gs`, `Schema.gs`, `appsscript.json`.
4. Select the function **`setup`** and click **Run**. Approve the permission prompt. The log shows the new sheet's address and its **SHEET_ID**. Copy the ID.
5. **Deploy > New deployment > Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Click Deploy and copy the **Web app URL** (ends in `/exec`).
6. Open the new spreadsheet and check its sharing: **only IEO staff** should have access. Never make it public or "anyone with the link".

### 2. Create the staff panel

1. Create a second Apps Script project named **RTU IEO Staff Panel** and show the manifest as above.
2. Add the files in [`apps-script/staff-panel`](apps-script/staff-panel): `Code.gs`, `Schema.gs`, `Panel.html`, `F003Sheet.html`, `appsscript.json` (create the two `.html` files with **+ > HTML** and give them exactly those names, without `.html`).
3. In **Project Settings > Script properties**, add:

   | Property | Value |
   |---|---|
   | `SHEET_ID` | the ID from step 1.4 |
   | `STAFF_EMAILS` | comma separated IEO staff accounts, e.g. `ieo@rtu.edu.ph, casemanager@rtu.edu.ph` |
   | `SITE_URL` | `https://mrvitalez.github.io/rtu-ieo-intake/` |

4. **Deploy > New deployment > Web app**: *Execute as* **User accessing the web app**, *Who has access* **Anyone with Google account** (or **Anyone within rtu.edu.ph** if the IEO uses RTU Google Workspace accounts). Bookmark the Web app URL; that is the staff panel. Do not post it on the public site.
5. Share the spreadsheet (Editor) with each account in `STAFF_EMAILS`. Each staff member approves the permission prompt the first time they open the panel.

### 3. Connect the public site

1. In this repository, edit [`docs/assets/js/config.js`](docs/assets/js/config.js) and paste the intake Web app URL into `ENDPOINT_URL`. Commit.
2. GitHub Pages (Settings > Pages) publishes from branch `main`, folder `/docs`. The site is at **https://mrvitalez.github.io/rtu-ieo-intake/**.
3. Test: submit an F001 with test data, then open the staff panel and find the case. Close the test case with the reason "Test".

Until `ENDPOINT_URL` is set, the forms run in **preview mode**: they check answers but send nothing.

### Updating

* After changing either Apps Script project, use **Deploy > Manage deployments > Edit > New version** so the same URL keeps working.
* `Schema.gs` must be identical in both projects. `F003Sheet.html` must match `docs/assets/js/f003-sheet.js` wrapped in `<script>` tags. The tests check both.

## Repository layout

```
docs/                     public site (GitHub Pages)
  index.html              process overview
  f001.html               RTU-OVPAA-IEO-F001 Referral Slip
  f002.html               RTU-OVPAA-IEO-F002 Student Portfolio + ISP waiver
  f003.html               RTU-OVPAA-IEO-F003 Referral Form for Required Documents
  requirements.html       required documents by category
  assets/js/config.js     the endpoint URL (the only file to edit after setup)
  assets/js/common.js     consent text, validation, sending
  assets/js/f003-sheet.js printable F003 (shared with the staff panel)
apps-script/
  intake/                 public, write only endpoint + setup()
  staff-panel/            staff only web app
tests/                    Node tests with an in-memory Apps Script mock
```

## Testing

```
node tests/run.js        # 53 checks: form options vs schema, validation, workflow order, access control
node tests/e2e.js        # full SOP flow in a headless browser (needs Playwright)
node tests/server.js     # local copy of everything at http://localhost:8765 (panel at /panel)
```

The tests run the real `.gs` files against an in-memory stand-in for Google Sheets, so no real data or Google account is involved.

## Notes for IEO review

* **Wording.** Form text follows the original RTU documents. Small typing errors in the original F008 were corrected: "Uses mobility aid )e.g." to "(e.g."; "Attach you recent" to "your". "Muscoskeletal" was kept as written; change it in `Schema.gs` and `f002.html` if the office prefers "Musculoskeletal".
* **Mobility Impairment** appears under both Neurological and Physical Disability in F008. Both are kept; in the sheet they are stored as "Neurological: ..." and "Physical: ..." so they can be told apart.
* **2x2 picture.** Photos are not uploaded. The form asks the student to bring the picture to the interview.
* **New wording to approve.** F003 has no RTU original; its letter is drafted from SOP-OVPAA-IEO-01 language. The short privacy notes on F001 and F003 (about whose data is collected) are also new. The Referral source dropdown and the *Others* option were added as requested. Please have these reviewed, including by the University Data Protection Officer.
* **Supporting documents** for neurodivergent and physical or sensory cases are recorded but not required; only the clinical diagnosis blocks the process. To require one, set that document's `required: true` in `Schema.gs`.
* **Contact email.** The letterhead image shows "inclusive education@rtu.edu.ph" with a space, so the site lists only the phone number in text. Add the correct address once confirmed.
