# VIDNIVO AI Help — support that fixes what it safely can

**Development status:** The mobile Help interface and Cloud Run route are implemented
in the `feat/device-cloud-project-sync` branch. That is NOT evidence of
deployed paid AI, production customer access or autonomous code patching.

## What customers get

- A Help button on the project library and while editing.
- A text field where the creator describes what stopped working.
- Diagnostic context (OS, open screen, quality, clip/asset counts,
  missing-media count, save-failure indicator, native-export availability,
  Cloud sign-in state) **without media bytes, file names, captions, project
  titles, user email, login tokens, URLs, or raw device file paths**.
- A safe offline rules-based answer when offline, signed out, or when the
  AI backend has not been configured.
- A private signed-in POST `/api/v1/support/diagnose` call for AI replies,
  when the owner has explicitly configured the AI service.
- Automatically applied **non-destructive device actions only**:
  `retry-save`, `restart-preview`, and `set-export-720`.
  Existing project edits, media bytes and original footage are untouched.
  All other actions are informational.

## AI configuration

Store the API key **only on the Cloud Run server** (e.g. in Google Secret Manager
and mapped as `OPENAI_SUPPORT_API_KEY` to the protected runtime). No API key
goes into Expo `EXPO_PUBLIC_*`, the frontend, GitHub commits, an email, or the
Firestore account. `OPENAI_SUPPORT_MODEL` is optional; default is
`gpt-5-mini`. The server uses OpenAI Responses with `store:false`, a
strictly bounded schema, and a max output budget. It does not upload original
media or app secret credentials. App users must be signed into VIDNIVO Cloud
to receive model assistance; local help works without an account.

AI requests are limited to 12 per authenticated account per hour with
Firestore transactions. Errors fall back to local guidance without claiming
AI succeeded. The support provider and storage/retention disclosures must
be reflected in a customer-facing privacy policy before public rollout.

## Critical limitations

**AI cannot fix arbitrary native or production source code in a running app.**
It cannot rewrite Swift/Kotlin/TypeScript live, open a network socket to GitHub
from the user's phone, or deploy a new release through the Help widget.
It must NEVER request customer passwords, authenticate as the developer,
execute shell scripts, delete customer data, change billing, or bypass tests.

A future autonomous code-repair pipeline should:
1. Deduplicate consented problem reports into privacy-filtered reproducible
   test cases; never send raw video or private transcripts to a code agent.
2. Use a constrained GitHub App identity and isolated ephemeral workspace to
   author a candidate PR against a disposable branch, never `main`.
3. Require regression tests, mobile/native CI, security lint and static scan;
   generated patches have no access to production customer credentials.
4. Apply narrow, reversible, observable rollouts. Critical data, billing,
   authentication or video encoding repairs remain review-gated.
5. Allow automatic rollback on crash/export regression and prevent repeated
   failing deployments. Record an audit trail of every patch and rollback.

That unattended code-repair pipeline is **not built yet**; do not market it as
operational. A safe shipping promise is “AI help, automatic common repairs and
escalated software diagnostics,” not “AI can rewrite the app live.”

## Tests and smoke checks

```bash
npm test
npm run typecheck
npm test --prefix cloud-run
```

On a physical iOS and Android build, test local save retries, preview resets,
export-quality reduction, offline failures and session expiry. For connected
AI, configure a development Firebase project and server-only AI key, verify
that the provider sees no media paths or tokens, and ensure the reply cannot
execute an action outside the known allowlist.
