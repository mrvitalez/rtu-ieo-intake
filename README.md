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
| RTU-OVPAA-IEO-F003 | Referral Form for Required Documents | Staff panel only (not on the public site) | IEO staff issue and print it for the student's physician, psychiatrist, or psychologist; the student is emailed to pick it up at the IEO |
| RTU-OVPAA-IEO-F004 | Request for Referral Form for Clinical Diagnosis | `f004.html` | A referred student without a clinical diagnosis asks the IEO for an F003, using their IEO reference number |

Each public form is its own standalone page with its own submission action. F003 is staff only: its template lives in the staff panel, and the public endpoint cannot record one. `requirements.html` lists the documents per case category, and `f002.html#preview` shows the full F002 (including the waiver) for review without sending anything.

## SOP mapping

The SOP flowchart, step by step, and what the system does at each step.

| # | SOP flowchart step | Case stage in the sheet | What happens | Who |
|---|---|---|---|---|
| 1 | Start of Process | | The referrer opens F001. | Referrer |
| 2 | Identify the Risk and Opportunity | (risk note) | F001 captures the *Reason for Referral* and *Other Observations*. Staff write the risk and opportunity note in the panel; the next steps stay locked until it is saved. | Referrer, IEO Staff |
| 3 | Submission of Referral Slip | `RECEIVED` | F001 is submitted. A case is created with a reference number (`IEO-2026-0001`). | Referrer |
| 3a | Follow up (IEO step added after the SOP) | (follow up status) | Staff email the referred student to submit the required documents (ready template, editable). No reply after **3 working days**: contact the **referrer**. No reply again: contact the **department head** of the student's program (from the Programs tab). Self referrals skip the referrer. A reply at any attempt ends the follow up and opens step 4. No reply after the last attempt **closes the referral**; it can be reopened if the student gets in touch. Every attempt (email, phone, in person) is logged. | IEO Staff |
| 4 | Submission of Required Document with Supporting Documents. *Do they have the required documents?* | `RECEIVED` / `DOCS_PENDING` | Staff choose the case category and tick the documents received. **Complete**: staff open the interview stage. **Incomplete**: IP and PDL students are asked to submit the documents; neurodivergent and physical or sensory cases without a clinical diagnosis may request one through F004, and staff issue the F003 from the panel for pickup at the IEO. | IEO Staff, Referred Student |
| 5 | Answering of Needs Assessment Interview and Student Portfolio Form | `INTERVIEW` → `PORTFOLIO_SUBMITTED` | Staff schedule the interview (date, time, in person or online). The student is emailed the schedule and a personal F002 link, and gets a Google Calendar invite. The student submits F002. Staff record the sessions (Intake, Sessions 1 to 10) and case notes. Interviews can be rescheduled. | Referred Student, IEO Staff (Case Manager) |
| 6 | *Do they require educational assistance?* | `ISP` or `WAIVER_PENDING` → `WAIVER_SIGNED` | **Yes**: proceed with the Formulation of ISP (SOP-OVPAA-IEO-02). **No**: the waiver section of F002 unlocks and the student signs it from a new link. | IEO Staff, Referred Student |
| 7 | End of Process | `CLOSED` | Staff close the case. A case can also be closed early with a reason (for example, the student withdrew). | IEO Staff |

The order is enforced by the server, not only by the screen: the interview cannot open without the risk note and the required documents, the portfolio cannot be sent without a valid link, and the waiver cannot be signed until staff record "No educational assistance needed".

## Roles

| Role | Can do | Cannot do |
|---|---|---|
| **Referrer** (office, faculty, classmate, or the student) | Submit F001 and receive a reference number | View or look up any case, including their own referral |
| **Referred Student** | Submit F002 and, if unlocked, the ISP waiver, using their personal link | View any record, including their own answers after submitting |
| **IEO Staff** | Everything in the staff panel: review referrals, the document checklist, F003, interview scheduling and invites, links, sessions, case notes, decision, closing | Access the panel without being on the staff list *and* having access to the sheet |

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
* **Programs list.** The `Programs` tab (college, program, department head, head email) starts from the IEO's list of courses offered. F001's Program dropdown and the department head follow up both use it. The public site receives only program and college names, never the heads' names or emails. Staff edit the tab directly; the head email is also saved there the first time staff email a head.
* **Alert emails.** IEO staff get an email when a referral, portfolio, or waiver comes in. It carries only the reference number and the next step, never the student's name or answers.
* **Audit log.** Every staff action, including opening a case, is logged with the staff email in the `AuditLog` tab.
* No cookies, no analytics. The only browser storage is the text size choice.

## Setup

About 20 minutes, done once. You do **not** need to create a Google Sheet yourself: `setup()` creates it in the Google Drive of the account that runs it. Use one Google account for everything below (the IEO account, or your own while piloting).

### 1. Records and the public endpoint

1. Go to [script.google.com](https://script.google.com) and click **New project**. Rename it **RTU IEO Intake**.
2. Delete the sample code in `Code.gs` and paste the whole of [`apps-script/paste/intake.gs`](apps-script/paste/intake.gs). Click **Save**.
3. In the function menu at the top choose **`setup`**, then click **Run**. Approve the permission prompt (Google shows "unverified app" because you wrote it: click **Advanced**, then **Go to RTU IEO Intake**).
4. Open **Execution log**. Copy the **SHEET_ID** it prints. The spreadsheet "RTU IEO Intake Records (SOP-OVPAA-IEO-01)" is now in your Drive, and alert emails go to this account by default.
5. Click **Deploy > New deployment**, choose type **Web app**. Set *Execute as* **Me** and *Who has access* **Anyone**. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).

### 2. Staff panel

1. Create another **New project** named **RTU IEO Staff Panel**.
2. Replace `Code.gs` with [`apps-script/paste/staff-panel.gs`](apps-script/paste/staff-panel.gs).
3. Click **+ > HTML**, name it exactly `Panel`, and paste [`apps-script/paste/Panel.html`](apps-script/paste/Panel.html). Save.
4. Open **Project Settings** (gear icon) > **Script properties** and add:

   | Property | Value |
   |---|---|
   | `SHEET_ID` | the ID from step 1.4 |
   | `STAFF_EMAILS` | the Google accounts allowed in, comma separated (include your own) |
   | `SITE_URL` | `https://mrvitalez.github.io/rtu-ieo-intake/` |
   | `CALENDAR_ID` | optional, see "Interview invites" below |

5. **Deploy > New deployment > Web app**: *Execute as* **User accessing the web app**, *Who has access* **Anyone with Google account**. Deploy and **bookmark the URL**: this is the staff panel. Do not post it on the public site.
6. Open the bookmarked URL and approve the permission prompt (sheet, email, calendar).
7. Back in the **Intake** project, add two optional Script properties so alert emails link to the panel: `STAFF_PANEL_URL` (the bookmarked URL) and, if more people should get alerts, `ALERT_EMAILS` (comma separated).

### 3. Connect the public site

1. Turn on GitHub Pages: repository **Settings > Pages**, Source **Deploy from a branch**, branch **main**, folder **/docs**, **Save**.
2. Edit [`docs/assets/js/config.js`](docs/assets/js/config.js) on GitHub and paste the Web app URL from step 1.5 into `ENDPOINT_URL`. Commit.
3. Test: submit an F001 at `https://mrvitalez.github.io/rtu-ieo-intake/f001.html`. You should get an alert email, a new row in the sheet, and the case in the staff panel. Close the test case with the reason "Test".

Until `ENDPOINT_URL` is set the forms run in **preview mode**: they check answers but send nothing.

### Keeping the Programs tab current

Open the spreadsheet's **Programs** tab to add a program, change a department head, or fill in the heads' emails. The F001 dropdown picks up changes within 10 minutes. Head emails are blank at first; the panel asks for one the first time a case reaches the department head and saves it.

### Adding staff later

Add their Google account to `STAFF_EMAILS`, share the spreadsheet with them as **Editor**, and send them the staff panel bookmark. Both are needed: the panel runs as the signed in person.

### Interview invites

When staff schedule an interview, the panel can email the student (the schedule plus their portfolio link, sent from the staff member's own Gmail) and send a Google Calendar invite.

* With no `CALENDAR_ID`, the invite goes on the calendar of the staff member who schedules it.
* For a shared IEO calendar: in Google Calendar create a calendar (for example "IEO Interviews"), share it with every staff account with **Make changes to events**, copy its **Calendar ID** from its settings, and put it in `CALENDAR_ID`. Then anyone on the team can reschedule any interview.

### Using a personal Google account

Everything works on a personal Gmail account. Keep in mind that the sheet will hold sensitive personal information (health and disability details) under RA 10173, so for regular use the University Data Protection Officer may prefer it to live in an official RTU or IEO account. To move later, run the same setup under that account, then copy the rows across.

### Updating the code

1. Edit the source files in `apps-script/intake` or `apps-script/staff-panel`, then run `node tools/build-apps-script.js`.
2. Paste the new files from `apps-script/paste` into the Apps Script projects.
3. **Deploy > Manage deployments**, click the pencil, choose **New version**, **Deploy**. The URL stays the same.

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
  intake/                 public, write only endpoint + setup() + alert emails
  staff-panel/            staff only web app (scheduling, calendar invites)
  paste/                  paste ready files for setup (generated)
tools/build-apps-script.js  builds apps-script/paste
tests/                    Node tests with an in-memory Apps Script mock
```

## Testing

```
node tests/run.js        # 77 checks: form options vs schema, validation, workflow order, access control
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
