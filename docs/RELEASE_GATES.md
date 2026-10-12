# VIDNIVO — paid launch acceptance gates

**Status: NOT RELEASE APPROVED.** A successful build or automated test does not
prove output quality on physical iOS and Android hardware. Founder approval must
be based on **observed results**, not claims in the README.

## 1. Configuration, billing and policy (hard block)

- [ ] Dedicated Firebase project created, authorized domains configured,
  Firebase Authentication email/password enabled; sign-up abuse protection
  and verification policy established.
- [ ] Owner explicitly authorizes Firebase Blaze/Cloud Run billing, media
  Storage bucket, IAM roles and spending alerts. Budgets are only alerts.
- [ ] Cloud Run full tier deployed using protected GitHub environment, service
  account and 300-second timeout; configured production HTTPS API base.
- [ ] Expo mobile builds receive **public** `EXPO_PUBLIC_FIREBASE_API_KEY`
  and `EXPO_PUBLIC_CLOUD_API_BASE_URL`. Do not check in secrets or refresh tokens.
- [ ] Firestore per-owner project and media rules deployed, emulator rules
  passing, Storage owner isolation exercised on a live project.
- [ ] Per-account media storage quota and cleanup/deletion policy enforced.
  **Not implemented yet; block unrestricted public account creation.**
- [ ] Terms, privacy notice (including retention/account deletion), customer
  support, refund policy and incident response reviewed. Public payment
  collection must remain disabled until all blocking items are complete.

## 2. Account and cross-device smoke test (repeat on iPhone AND Android)

1. Create account A on iPhone; create account B on Android.
2. Using account A, import a 10-second talking-head MOV/MP4, a still photo,
   a second video and an M4A voiceover. Edit, caption and back up.
3. On the second phone, sign into account A and use **Find my cloud projects >
   Restore**. Verify the original media bytes are downloaded, the video
   previews, captions and audio are present, the project opens offline after
   one successful restore, and a new export renders from these local sources.
4. With a second copy open on device 1, edit/sync from device 2. Attempt to
   back up the stale copy from device 1: expect **HTTP 409**, not data loss.
5. Restore again with a locally edited project of the same ID: expect a
   separate project, not a silent overwrite.
6. Sign out account A and sign in account B: B cannot see, download, delete
   or overwrite A's cloud media or project records.
7. Disconnect network during upload and restore; reopen the app. Local drafts
   remain intact and a retry can succeed. Simulate 401/revoked refresh token.
8. Delete an uploaded media object from the web dashboard. Verify the account
   library reflects deletion and that a project depending on this missing
   object **fails visibly** instead of pretending to restore.
9. Attempt upload over 200 MB, wrong content type, malformed IDs and payloads.
   Ensure rejection, bounded cost and no confidential error leakage.
10. Verify user identity, media and storage metadata are never exposed in
    Google Sheets; Sheets remains the legacy editor metadata-only workflow.
11. Confirm cloud restore creates files under local app document storage and
    survives restart. **Do not uninstall** until account recovery/restore is
    proven; native local drafts cannot survive uninstall on their own.

## 3. Physical phone MP4 proof (repeat iPhone and Android)

Export each fixture at 720p and 1080p using **real native development builds**,
not Expo Go:

| Fixture | Expected result |
|---|---|
| 10-second portrait talking head | Trim matches source in/out within 300 ms; correct voice/lip sync |
| 20-second mixed video/photo montage | Still photos animate as expected; correct duration and orientation |
| 10-second video plus M4A voiceover | Original and independent audio are both audible in the exported file |
| Two clips with silence/caption cuts | Every caption displays during intended interval; no missing/duplicated frame |
| Landscape, square and portrait exports | Correct geometry, no stretched photo or video |
| 2× speed with original audio | Expected playback speed and readable timing |
| Long 3–8-minute project | Render completes without partial file, app crash or unbounded storage |

For each copied MP4 run:

```bash
node scripts/verify-export.mjs ./actual-phone-video.mp4 --expect-audio --expected-seconds=10
```

The script requires FFmpeg + FFprobe on the testing machine and verifies H.264
video, file structure, dimensions, duration and decode errors. Manually watch
the entire output for cuts, overlays, missing media, lip sync and volume; these
cannot be established from native compile success alone.

## 4. Release / rollback / observability

- [ ] Every required GitHub check green for the **exact** release SHA, including
  native iOS simulator build and Android APK build.
- [ ] TestFlight and Google Play internal-test builds signed and installed on
  real devices; no claim of a release until those builds are checked.
- [ ] Documented rollout rollback plan; error reporting excludes names,
  original media, refresh tokens, Firebase IDs and content.
- [ ] Verify monitoring, uptime, OAuth/provider errors, upload failures,
  storage consumption, deletion failures and abuse alerts.
- [ ] Verify backup recovery from Firestore outage, uploaded-media orphan
  cleanup and full account-export/deletion request process.
- [ ] Publish a supported-device matrix, minimum OS versions, 200 MB file
  limitation and honest disclaimers for unsupported Android volume/speed.

**Release decision: no paid launch unless every above hard gate has evidence.**
