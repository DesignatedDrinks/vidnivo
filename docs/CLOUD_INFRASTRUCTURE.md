# VIDNIVO — Firebase Hosting, Cloud Run, Auth, Firestore and Storage

## Current state

This repository includes a deployable **static Hosting site**, a **Node 22 Cloud Run
account API**, **Firebase Auth mobile login**, **private Cloud Storage rules and
small-file upload**, and restrictive **Firestore rules**.

It does **not** mean that a Google Cloud/Firebase project has been created,
billed, or deployed. CI runs build/tests; deployment is always an authorized manual action.

**Google Sheets remains the current project editing metadata database.**
The Firebase account profile in Firestore is additional infrastructure,
not a migration or second competing project database. The current Google
Sheets direct-user OAuth sync is a developer workflow and must be redesigned
before customer accounts can be supported securely.

## Pricing facts — read before creating any billable services

- Firebase Hosting can be used on Spark for a static site; its hosting
  quota is separate from media storage.
- The default Firestore database has a no-cost allocation (currently 1 GiB,
  50,000 reads/day and 20,000 writes/day). Some features require billing.
- **Cloud Storage for Firebase requires Blaze**. The older 'Spark storage'
  instructions are outdated even if you stay below nominal storage quotas.
- **Cloud Run requires a Cloud Billing account**. Its no-cost request-based
  quota includes 2 million requests/month, plus finite CPU and memory allowances.
  Other CPU, memory, region, build, registry, storage and egress charges can occur.
- Firebase Authentication base-tier limits depend on provider and whether
  Identity Platform is enabled; the '50,000 MAU' headline is not a guarantee
  for every configuration or service.
- A Google Cloud billing **budget alert does not stop charges**. The scripts set
  Cloud Run minimum instances to 0 and maximum instances to 2 but these are
  not hard cost caps.

Official sources:
https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
https://firebase.google.com/docs/firestore/pricing
https://cloud.google.com/run/pricing

## 1. Choose one project and owner

Use the Firebase console (https://console.firebase.google.com/) with the
authorized business Google account and create/select a project.

Record its real **project ID** in your own secure account settings. Do not
hardcode or invent the ID in GitHub. Keep staging and production separate
when you eventually have actual paying customers.

Create the project in a location appropriate for customer privacy and cost.
Firestore database locations and Storage bucket locations are important
choices that may not be reversible without migrating data.

## 2. Enable Firebase Authentication

- Add a **Web App** to the Firebase project and copy the public web app
  config (apiKey, projectId, appId, authDomain, storageBucket, messagingSenderId).
- Enable the **Email/Password** provider under Authentication > Sign-in method.
- Configure approved email domains and address verification emails.
- Enable App Check, abuse prevention and rate limiting before public signup.

Install the Firebase JavaScript SDK in the Expo app (already listed in package.json).
Use the sample `.env.example` keys **only on your development machine** or
in your trusted build system:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=<public-app-api-key>
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<your-project>.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=<your-project>
EXPO_PUBLIC_FIREBASE_APP_ID=<public-web-app-id>
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=<your-existing-bucket>
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<public-sender-id>
EXPO_PUBLIC_VIDNIVO_API_BASE_URL=https://<your-deployed-cloud-run-host>
```

These Firebase Web App identifiers are public configuration data, not an
Admin SDK private key. Firebase Auth ID tokens are secrets and must not appear
in source code or log output.

No email account is created or verified by repository changes alone.
In the app, the owner explicitly selects **Cloud account** and registers.

## 3. Initialize the Firestore database and security rules

In the Firebase console, create the default Cloud Firestore database. Test
the location and start with least-privilege production rules.

The included `firestore.rules` lets users **read only their own profile**,
denies client writes and denies access to unknown collections. Cloud Run uses
Firebase Admin with a least-privilege runtime identity to create profiles.

Test rules in the emulator before production; then:

```bash
export PROJECT_ID='<actual-existing-project-id>'
bash deploy/firebase-database-rules.sh
```

Firestore does not store VIDNIVO's existing Google Sheets projects.

## 4. Enable Cloud Storage only after approving Blaze billing

In the Firebase console, link the billing account and create a default
Cloud Storage bucket. Your approval is required for any charges.

`storage.rules` restricts media paths to
`users/{verified_uid}/media/{assetId}` and exports to
`users/{verified_uid}/exports/{exportId}`. Originals are immutable except
for explicit deletion. Client uploads require a verified email address.

The current mobile beta deliberately limits files to **25 MiB**, reads them
into memory, requires explicit confirmation and shows progress. This is a
small-image and short-clip feature, not a mature streaming original-video
backup system. Large recordings need native streaming, resumable persistence,
and upload recovery before customer launch.

```bash
export PROJECT_ID='<actual-existing-project-id>'
bash deploy/firebase-storage-rules.sh
```

No bucket is provisioned by checking in these rules; the console step is
required first.

## 5. Cloud Run account API

The Node API lives in `cloudrun/api` and exposes:

- `GET /healthz` — public health check.
- `GET /v1/me` — requires a valid **Firebase Auth ID token**.
- `PUT /v1/me` — requires the same ID token and accepts only displayName.

It verifies tokens using the Admin SDK, requires per-user ownership, rejects
large/unknown requests, keeps private data out of error messages and
allowlists browser CORS origins. The service is publicly invokable for native
apps, but the user endpoints are **not anonymous**.

Create a separate **runtime service account** and grant only permissions
needed for Firestore profile access and Firebase token validation. Prefer
Workload Identity; **never download and commit a service-account JSON key**.

Install Google Cloud CLI, authenticate interactively, enable the necessary
Cloud Run, Cloud Build, Artifact Registry, Firestore and Firebase APIs, and
link billing. Then run the explicit deploy script:

```bash
export PROJECT_ID='<existing-billed-project-id>'
export SERVICE_ACCOUNT='<runtime-identity>@<project>.iam.gserviceaccount.com'
export REGION='northamerica-northeast2'
export ALLOWED_ORIGINS='https://<project>.web.app,https://<your-confirmed-domain>'
bash deploy/cloudrun.sh
```

The script asks for `DEPLOY` before publishing. Runtime config uses the
project's metadata identity, not a JSON key. Cloud Run auto-scales to zero.

Review your region-specific Cloud Run costs. The example selects Toronto for
Canadian locality, not because it guarantees the lowest free-tier charges.

## 6. Static Firebase Hosting

The `web/` directory contains a responsive development landing page,
not a browser-based video editor.

```bash
npm install -g firebase-tools
firebase login
export PROJECT_ID='<your-existing-firebase-project-id>'
bash deploy/firebase-hosting.sh
```

Firebase Hosting issues a TLS-enabled `PROJECT_ID.web.app` URL. It
**does not register or attach a custom domain** automatically. Only add a
domain after verifying that your company owns it and confirming DNS changes.

Do not turn on unreviewed site-indexing or sell app access before product
quality, privacy terms and customer-support mechanisms are established.

## 7. Verify locally and in CI

```bash
node --test cloudrun/api/test/*.test.mjs tests/cloud-configuration.test.mjs
node --test tests/cloud-media-policy.test.mjs
npm test
npm run typecheck
firebase emulators:start --only auth,firestore,storage,hosting
```

`.github/workflows/cloud-verify.yml` runs API security tests, configuration
checks and a Docker build. It does **not** deploy infrastructure.

A launch gate still requires real signed iOS/Android builds, physical-device
signup and verification, private file upload, access-denied testing across
two different Firebase users, backend logs, monitoring, and a budget review.

## 8. Security and project-data migration gate

The app currently talks directly to an existing **owner-managed Google
Sheet** for manual project sync. Never grant all customers direct access to
that spreadsheet. Before commercial multitenancy, replace the client-to-Sheets
path with a verified Firebase-authenticated Cloud Run gateway that scopes every
project to the authenticated UID, handles update conflicts, and keeps service
credentials on the server. Do not silently swap the founder's requested
Google Sheets metadata database for Firestore.

Media in a cloud bucket does not make a VIDNIVO timeline portable until the
database includes owner-scoped media references, upload recovery, media
resolution on a second phone and proper retention/deletion features.
