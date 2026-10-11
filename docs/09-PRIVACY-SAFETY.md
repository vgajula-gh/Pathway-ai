# 09 · Privacy & Safety for Minors

> Legal requirements (including COPPA and FERPA where applicable, plus state student-privacy laws) require **specialist review before launch**. This document is engineering guidance, not legal advice.

## Built in now
- AI consent toggle at onboarding and in settings; when off, no AI calls are made.
- Private by default; portfolio items individually shareable.
- Minimal collection: broad location only; no sensitive inferences; provenance shown for each profile attribute.
- Export (JSON) and delete-everything (cascade).
- Audit log of state-changing actions, visible to the student.
- No external side effects from the server; downloads are student-initiated.
- Logger redacts identity headers.

## Buddy voice

Voice is off by default and enabled explicitly in You › Privacy. Browser SpeechRecognition (or webkitSpeechRecognition) writes only text into an editable draft, never sends automatically, and is hidden when unsupported. Students stop listening before editing or sending. “Read replies aloud” is a separate, session-only choice for new replies using speechSynthesis, with a stop control. Listening and playback stop when leaving Buddy or disabling Voice. Pathway does not record, upload, or store audio; browser speech recognition may process audio through the browser provider, whose handling requires review before launch. Only the Voice preference is saved; transcripts become chat messages only after the student sends them.

## Required before real students *(launch blockers)*
- Real authentication; age gate; verifiable parental consent where required; teen-appropriate terms and privacy notice.
- Encryption at rest (managed DB), TLS everywhere, secrets in a vault, least-privilege service accounts.
- Data retention policy (e.g., auto-delete chat after N days unless saved); don't retain schedule photos by default.
- Content moderation for chat input/output; escalation copy for crisis language (provide resources, don't diagnose).
- Parent/counselor roles with explicit, student-visible permissions.
- Incident response runbook and breach notification process.
- Vendor review of AI provider data handling settings.

## Safety behaviors (agent)
No admissions predictions; no invented achievements or facts; academic integrity; non-judgmental tone; no pressure tactics or streaks; limited nudges.
