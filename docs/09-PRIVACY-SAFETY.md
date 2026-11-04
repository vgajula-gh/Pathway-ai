# 09 · Privacy & Safety for Minors

> Legal requirements (including COPPA and FERPA where applicable, plus state student-privacy laws) require **specialist review before launch**. This document is engineering guidance, not legal advice.

## Built in now
- AI consent toggle at onboarding and in settings; when off, no AI calls are made.
- Private by default; portfolio items individually shareable.
- Minimal collection: broad location only; no sensitive inferences; provenance shown for each profile attribute.
- Export (JSON) and delete-everything (cascade).
- Audit log of state-changing actions, visible to the student.
- No external side effects from the server; downloads are student-initiated.
- Logger redacts identity/access headers and session cookies.
- Legacy browser profiles can be upgraded to private-phrase sign-in with keyed secret hashes, one-time recovery codes, hashed 30-day sessions, persistent IP/credential/shared login throttles, and origin checks. No username or email collected. Server-only SIGN_IN_SECRET is required in production and must be kept stable.

## Buddy voice

Voice is off by default and enabled explicitly in You › Privacy. Browser SpeechRecognition (or webkitSpeechRecognition) writes only text into an editable draft, never sends automatically, and is hidden when unsupported. Students stop listening before editing or sending. “Read replies aloud” is a separate, session-only choice for new replies using speechSynthesis, with a stop control. Listening and playback stop when leaving Buddy or disabling Voice. Pathway does not record, upload, or store audio; browser speech recognition may process audio through the browser provider, whose handling requires review before launch. Only the Voice preference is saved; transcripts become chat messages only after the student sends them.

## Required before real students *(launch blockers)*
- Review account security and recovery (legacy unlinked profiles still use browser-ID authentication); age gate; verifiable parental consent where required; teen-appropriate terms and privacy notice.
- Encryption at rest (managed DB), TLS everywhere, secrets in a vault, least-privilege service accounts.
- Data retention policy (e.g., auto-delete chat after N days unless saved); don't retain schedule photos by default.
- Content moderation for chat input/output; escalation copy for crisis language (provide resources, don't diagnose).
- Parent/counselor roles with explicit, student-visible permissions.
- Incident response runbook and breach notification process.
- Vendor review of AI provider data handling settings.

## Safety behaviors (agent)
No admissions predictions; no invented achievements or facts; academic integrity; non-judgmental tone; no pressure tactics or streaks; limited nudges.

Scout optional goals/project/time/max-cost preferences are private local ranking inputs, included in the student's export/deletion. Public search receives only interests, grade band and broad location/format/cost-group context. Public ResearchCandidate/page/assertion audit is shared and visible only through JOBS_SECRET-protected owner diagnostics; reports omit student identities/private text and Secret values. Unknown age/parent consent are not inferred. No private preferences or feedback are embedded. Student status summaries expose controlled enums/counts, not the owner audit. See [Scout](14-OPPORTUNITY-SCOUT.md).


## Growth Map Drop 2

Drop 2 sends only a compact visible-skills summary, public program metadata, opaque evidence IDs and approved factual options. Student identity, raw activity titles, location/school and full reflections are excluded. Cache/dismissals are private, exported and cascade-deleted. Revoked consent removes AI cards and blocks new generation; cached facts are revalidated on reads. No vector or hosted-tracing export is added.
