# VIDNIVO Cloud release checklist

These are release gates, **not completed tests**.

- [ ] Owner connects a real Firebase project to the correct Google account
- [ ] Firebase app is registered; public Expo build-time config installed
- [ ] Firestore default database exists in approved region
- [ ] Email/password Authentication provider enabled and email verification works
- [ ] Storage bucket created on Blaze after explicit billing consent
- [ ] Storage rules enforce owner UID and verified email across two test users
- [ ] Cloud Run service account and least-privilege IAM permissions approved
- [ ] Cloud Run billing account linked with alerting and spend monitoring
- [ ] API deployed and /healthz returns 200
- [ ] /v1/me rejects unauthenticated, invalid, revoked and wrong-user tokens
- [ ] Mobile account creation, sign in, sign out, and profile editing verified on iPhone
- [ ] Mobile account creation, sign in, sign out, and profile editing verified on Android
- [ ] Private image/short-video upload, offline interruption and retry tested
- [ ] Media ownership isolation and deletion confirmed
- [ ] Signed release builds created; crash and upload diagnostics reviewed
- [ ] Firestore/Cloud Storage security rules emulator tests pass
- [ ] Web landing deployed and TLS/domain verified
- [ ] Legacy shared Google Sheets project access isolated from future paying customers
- [ ] Owner confirms cloud costs and relevant data handling/privacy documents
- [ ] Native full-size video streaming uploads and true cross-device timeline sync built

**Do not interpret successful source compilation as any of these gates passing.**
