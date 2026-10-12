# VIDNIVO — Firebase and Google Cloud deployment

This is a **development-ready cloud foundation**, not evidence that a live
Google Cloud/Firebase project or production service has been provisioned.
You must connect the Firebase account and authorize billing-dependent work.
The **existing Google Sheets editor metadata database remains unchanged**.

## Architecture and ownership

| Service | Responsibility | Status |
| --- | --- | --- |
| Firebase Hosting | Web account dashboard and static product site | Code/CI ready; requires a Firebase project and deploy |
| Firebase Authentication | Email/password and Google sign-in for each customer | Client coded; providers/domain must be enabled |
| Firestore | Per-user profile and media-registration records | Server coded; database and rules must be deployed |
| Cloud Storage for Firebase | Private original videos, photos and audio | Browser uploader/rules coded; Blaze and bucket required |
| Cloud Run | HTTPS API with verified Firebase ID tokens | Server coded, unit tested; billing/deploy required |
| Existing Google Sheets | VIDNIVO mobile timeline/edit data | Preserved; **not replaced or secured for multi-customer use by this change** |
| App Store/Play | iPhone and Android app distribution | Separate native build/signing/release process |

The browser site is a **cloud dashboard**, NOT a fully functioning desktop
video editor. Firebase Hosting cannot distribute the iPhone/Android
applications as installable App Store apps.

## Correct pricing cautions

- Firebase Spark Hosting has separate free allowances for storage/bandwidth;
  verify the current amounts on the official pricing page.
- A billing account is required to run Cloud Run (Spark projects become Blaze
  when linked to billing). The 2 million requests quota is **not** an all-in
  cost ceiling: build minutes, artifact storage, compute, egress and other
  services may be billable.
- New Cloud Storage for Firebase buckets require **Blaze**, even if usage falls
  inside regional no-cost quotas. Always Free Cloud Storage locations are
  US-CENTRAL1, US-EAST1 and US-WEST1 as currently documented.
- Firestore has a limited free quota. Backups, PITR and some other operations
  are chargeable; this system does not enable them.
- **Google Cloud budgets are alerts, not a hard billing shutdown.** Create a
  low budget alert, set conservative quotas and review billing frequently.
- Video storage and delivery can become costly far earlier than API request
  volume. Cloud media uploads are capped at 200 MB each in code.

Refer to:
- https://firebase.google.com/pricing
- https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
- https://cloud.google.com/run/pricing
- https://firebase.google.com/docs/firestore/pricing

## One-time console configuration — account owner

1. Open https://console.firebase.google.com/ with the desired Google account
   (e.g. designateddrinksonline@gmail.com). Create a **dedicated** Firebase
   project with a unique project ID, or select an approved existing project.
   **Do not make a second Firebase project if a VIDNIVO project already exists.**
2. Register a **Web App**. Copy its **public** web configuration values:
   apiKey, authDomain, projectId, storageBucket and appId. Never use an Admin
   SDK private key or OAuth client secret in web environment variables.
3. In Authentication > Sign-in method, enable Email/Password and Google.
   Configure the provider support email and authorized domains.
4. In Firestore, create the **default** database and choose its region
   deliberately. These rules assume Firestore is for owner-only cloud media
   and profile records, not shared editing projects.
5. To enable Cloud Storage and Cloud Run, explicitly link the Google Cloud
   billing account and move to Blaze. The new storage bucket should match
   your Firebase web app's storageBucket configuration. Make sure the bucket
   location and pricing are acceptable before creating it.
6. Enable Cloud Run, Cloud Build, Artifact Registry and related required APIs.
   Use a dedicated **runtime** service account with the Firestore document
   and specific Cloud Storage bucket access actually needed; avoid broad
   editor/admin permissions for the runtime.
7. Configure GitHub Workload Identity Federation (OIDC). Give the GitHub
   deployer identity permission to impersonate a **separate deploy** service
   account, scoped to this repository and preferably the protected production
   GitHub environment. Grant only deployment-related roles needed for
   Cloud Run source build, IAM service-account use, Firebase Hosting, and
   Firebase Rules release. Do **not** download long-lived service-account keys.
8. In GitHub repository Settings > Environments, create the
   **firebase-production** environment with required reviewers and branch
   restrictions. Add:
   - **Secrets**: `GCP_WORKLOAD_IDENTITY_PROVIDER`,
     `GCP_DEPLOY_SERVICE_ACCOUNT`
   - **Variables**: `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`,
     `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_APP_ID`,
     `GCP_RUNTIME_SERVICE_ACCOUNT`
   Settings can be repository-wide, but protected environment secrets and
   variables are preferred.
9. Confirm service names and budget before running the deployment workflow.
   First use the `spark` option to publish the non-billing static dashboard
   (auth needs public web configuration). Then use `full` only **after**
   billing, Firestore, Storage and IAM have been approved and set up.

## Local validation without any Google billing

```bash
node --test cloud-run/tests/*.test.mjs infra/tests/*.test.mjs
npm install --prefix web
npm run build --prefix web
# Preview the site:
npm run preview --prefix web
```

Create `web/.env.local` from `web/.env.example` with the **public** Firebase
Web App configuration. Those public identifiers are embedded in web bundles.
A Google service-account JSON key must never be placed there.

For local Cloud Run development, prefer ADC via `gcloud auth
application-default login` with developer permissions; use the Firestore
emulator for private-document tests and avoid local production bucket writes.

## Deployment and smoke tests

After environment setup, go to GitHub Actions > **Deploy VIDNIVO cloud
foundation** > Run workflow. Choose one:

- `spark`: compiles the web site and deploys via `firebase.spark.json`.
  No Cloud Run rewrite or cloud storage is provisioned. Cloud upload and API
  registration will remain unavailable. Authentication requires provider setup.
- `full`: builds the web site, deploys the Cloud Run API to us-central1
  with `min-instances=0` and `max-instances=2`, and deploys Hosting,
  Firestore rules and Storage rules. The Cloud Run service accepts external
  requests solely so Hosting can reach it; **all private API routes require
  a verified Firebase ID token**, and CORS is restricted to authorized domains.

The workflow checks the public landing page and Cloud Run `/api/healthz`.
After deploying, test in a real browser and phone:

1. Sign up, log out, and log back in using Email/Password and Google.
2. Upload a short, non-sensitive, disposable test video.
3. Confirm it appears only in the uploader account's private media list.
4. Attempt to access the same storage path from a second account: expect
   **permission denied**.
5. Try a >200 MB file and unsupported format: expect validation failure.
6. Revoke ID token/session: private API endpoints must reject the request.
7. Ensure billing counters and Cloud Run logs contain no tokens, raw
   transcripts, media contents or secret keys.
8. Verify that editor projects in Google Sheets still open as before.
9. Test browser sign-in on iPhone and Android. Popup fallback uses redirect;
   configure correct Firebase authorized domains and auth-provider settings.

## Important next work before public launch

- The native VIDNIVO app currently uses Google OAuth/Google Sheets, not
  Firebase Auth. Wire Firebase Auth and private cloud-media references into
  mobile editing separately, and test local media URI repair across phones.
- Owner-scoped Firestore records are supplementary; do not pretend that the
  Google Sheets database provides secure per-customer multitenancy.
- Store actual media in private Cloud Storage, not Firestore or spreadsheet
  cells. Add lifecycle/deletion policies and a customer data export flow.
- Add production monitoring, retention rules, terms/privacy approval and
  real-device editing/export tests before inviting paying customers.
- Cloud Run signed-in CORS/API must be tested against your final custom
  domain. Update ALLOWED_ORIGINS if a domain changes.

## Runbook: failures

- **Firebase not configured**: the website displays a configuration warning
  rather than accepting credentials.
- **Cloud API unavailable**: the website stays available, but the file library
  reports its cloud API dependency is offline.
- **Storage on Spark**: requires Blaze to provision/operate the new bucket.
- **403 CORS**: use the approved web domain and update allowed origins.
- **401 on API**: verify Firebase Authentication settings and reconnect.
- **500**: check Cloud Run logs using project-scoped permissions; don't
  surface raw provider errors to end users.
- **Unexpected costs**: stop services via your Cloud Console, review quotas
  and budgets; `max-instances=2` alone does not guarantee a $0 bill.
