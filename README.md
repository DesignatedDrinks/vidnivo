# ROLLBLINK — mobile-first video editor

## New mobile editing layout — October 12, 2026

Both the GitHub Pages **browser editor** and the separate **Expo native app** now follow the touch-first editing pattern shown in the Rollblink mobile design reference.

**Browser editor:** A centered 9:16 preview, compact top export control, playable/scrubbable filmstrip timeline, actual timestamp-based caption track, original audio lane, selected-caption editing tray, and seven-item bottom navigation (Edit, Audio, Text, Effects, Overlay, Captions, Generate). Advanced panels slide up from the bottom rather than occupying the main preview. Preview thumbnails are generated locally when the browser supports offscreen video seeking. If thumbnails cannot be decoded, normal timeline editing still works.

**Native iOS/Android:** Rollblink branding and a permanent global editing rail. Selecting a caption shows a compact contextual tray (Style, Edit text, Auto captions, Split, Delete) while keeping the main tools available. Selecting a video clip shows contextual editing controls. On the native video preview, dragging a visible subtitle moves **all non-title subtitles** to the same normalized placement; pinching changes their common size. Opening titles remain independently positioned. The preview interaction commits one undoable project change when released, not an undo entry for every touch event.

The updated browser code is covered by pure timeline tests and a GitHub Actions Chromium mobile smoke test. Native subtitle placement has unit tests. Browser export restrictions and the native development-build requirement **have not changed**; never present unsupported editing or export actions as working. Test on actual iPhone and Android devices before commercial launch.

---

## Rollblink creator update — October 2026

The [browser editor](https://designateddrinks.github.io/vidnivo/) now offers 24 caption typefaces, editable transcript-caption words (without altering their timestamps), three visual directions (Clean / Punchy / Editorial), an optional smooth digital camera crop, an undoable continuous 30-second highlight selector, opening title layers, and platform-specific social post drafts.

**Project recovery:** Browser storage preserves timeline and styling metadata only, not raw videos. After a refresh, re-import the identical local video source(s) and press **Restore**. Recovery is available only when the file name, byte size and duration match.

**Export safety:** The browser exporter intentionally refuses discontinuous edits, reordered clips, and speed effects it cannot encode with safe source audio. The new **Check video** action catches unsupported exports, caption timing issues and overlapping text before recording. Video effects are not substitutes for listening to the final exported file.

**AI copy:** The browser generates an honest transcript-derived draft without a server. OpenAI-powered title and caption rewriting requires the optional [secure Node backend](server/README.md) deployed separately with a server-side OpenAI API key and its own access token. GitHub Pages cannot run this backend; committing the code does not connect or deploy it.

**Scope:** The new creator tools improve the **browser** editor. They are not yet part of the separate Expo mobile UI, and do not yet deliver full transcript-driven video cuts, multi-camera reframing, automatic highlight extraction from long podcasts, or a verified production publishing pipeline. Those features require additional engineering and device testing.

---

## Open the working browser editor

**[▶ Launch ROLLBLINK Studio — tap here to edit a video](https://designateddrinks.github.io/vidnivo/)**

This is the **browser-based preview**: import videos from your device, trim/split,
change speed, add timed captions, and export where your browser supports MP4
recording. It runs without installing software or signing in. Your footage
stays on your device.

**Important:** The web preview is separate from the more extensive
Expo/React Native iPhone and Android editor described below. The native
app is still under development; a README page is not an app.

---

ROLLBLINK is an independently built short-form video editor for iPhone and Android, developed in Expo / React Native.

## Status
**In development.** ROLLBLINK is an independent mobile video editor. Editing, native rendering, and Google Sheets persistence are under active development.

## Architecture
- **Mobile app:** React Native with Expo SDK 57 (compatible with current Expo Go for iOS and Android).
- **Database:** Google Sheets, with normalized `Projects`, `Assets`, `Clips`, `TextLayers` tabs.
- **Device:** Original video/photo bytes remain local; Google Sheets stores metadata only.
- **Authentication:** Google OAuth with the signed-in user's Sheets permissions. No hardcoded secrets.
- **Offline:** AsyncStorage holds local projects; explicit cloud sync updates Google Sheets.

Database: https://docs.google.com/spreadsheets/d/1MclQpsLuNcq4hv28m-UByxImcqLcv1BqO3vcMsIWfYM/edit

## Running
1. Install Node.js 20.19+.
2. `npm install`
3. `npx expo install --fix` (align native package versions for installed SDK)
4. `npm start`, then open in Expo Go on iOS or Android.
5. Import video/photos from your device and use the timeline editing controls.

## Google Sheets integration
The spreadsheet is the database; do not publish tokens. Google Sheets requires the signed-in Google identity to have access to the database sheet.

To connect live sync, make Google OAuth clients in Google Cloud for your iOS bundle ID and Android package/signing certificate. Set the public client IDs via `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, and (for web) `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. No client **secrets** go in `.env` or source control.

Google login is disabled until configured; local editing is usable without it. A native development build may be required for redirect URI handling. The Google OAuth consent screen must grant Sheets scope, typically in testing mode for approved users.

**Important limitation:** Stored local media URIs refer to the phone on which files were imported. Google Sheets does not make raw media available across devices. Cross-device collaboration will require cloud object storage plus media upload and access controls.

## Validation
`npm test` exercises timeline operations and project correctness using Node 22's TS stripping feature. `npm run typecheck` requires installed node modules. CI configuration verifies both. Native encoding/export is a separate milestone; there is no misleading fake MP4 export.

## Security and scale
Do not embed Google account passwords, OAuth client secrets, API keys with write privileges, or service-account JSON in this public repository or shipped app. Sheets is an early-stage metadata database, not a scalable high-traffic backend. Protect the sheet through Google sharing settings.

## New: iOS MP4 export (native development build)

The iOS AVFoundation export module is located in `modules/rollblink-export`.
It assembles consecutive source-video segments, applies source trims and constant
speed, mixes unmuted video audio and imported audio, adds timed text overlays,
and renders a local MP4 file. Export is intentionally disabled in Expo Go
because Expo Go does not contain the custom native module.

On macOS: run `npx expo prebuild -p ios` then `npx expo run:ios --device`.
Alternatively, after configuring your Expo account and Apple credentials:
`npx eas-cli build --profile development --platform ios`.

IMPORTANT: The native exporter has not yet been compiled against Xcode or
validated on a physical iPhone. The JavaScript export planner has automated tests.
Do not ship the native module without testing text timing, orientation, slow
motion, source audio mix, file formats, and failure cases on hardware.
The Android native export implementation remains a separate milestone.

## Android native video export (development)
Native MP4 export now has a Media3 Transformer implementation in
`modules/rollblink-export/android`. It supports consecutive video clips,
source trimming, constant speed, mute, and fitted output aspect ratio.
The Android implementation supports timed text overlays. It **explicitly rejects separately imported soundtracks and custom volume** rather than silently dropping those edits.
Build an Android development APK (not Expo Go) to access native export.

This implementation needs a full Gradle CI build and phone-level export tests
before being considered ready. Media3 is pinned to 1.9.4. 

## Voiceover recording

Tap **Voiceover** to record from the microphone at the current playhead position.
Tap **Stop voiceover** to import the recorded M4A to the audio timeline. The
recording is stored in the app's document directory and its actual duration is
probed before it is added. Microphone permission is requested when recording
begins. iOS exports can mix voiceovers; the Android exporter currently refuses
extra audio tracks until native mixing is implemented. Actual device recording
and sync must be checked before shipping.

## Mobile editor redesign (October 2026)
The editing surface follows touch-first conventions inspired by modern mobile editors:
portrait-first centered preview, a fixed playhead, horizontally scrubbable frame timeline,
independent audio and text tracks, and a bottom action rail. Actions without a working
backend are marked Soon and display an explicit explanation. HD export is a real control
in native builds; it is not represented as working inside Expo Go.

### Android audio mixing
The Android native exporter now builds dedicated audio-only composition
sequences for imported soundtracks and voiceovers. Each sequence starts at the
selected timeline position and mixes with the original video audio.
Custom track gain beyond 100%/mute is not yet supported. Verify soundtrack
position, overlap and output playback on an Android device before release.

## Precision trim
The clip toolbar includes a source-aware **Precision** trim sheet with source
in/out sliders and 100ms nudges, with minimum 250ms output duration. Primary video
ripple trim shifts downstream video, audio and caption tracks together; edits
remain reversible using Undo. The timeline editor now uses picker durations in
milliseconds rather than incorrectly treating source seconds as milliseconds.

## Autosave recovery
ROLLBLINK persists the active project collection in two AsyncStorage slots:
a validated primary and a last-good backup. If the primary becomes corrupt
or interrupted, the app tries its backup, restores the primary and reports an
error when neither copy is safe. Old project metadata is never silently treated
as empty on a malformed JSON record. Local media files still live in the app's
separate documents folder and cannot survive uninstall without an explicit backup.


## Optional Firebase/Google Cloud foundation (October 2026)

An additional Firebase Hosting account dashboard and owner-isolated cloud media
API are under development in `web/` and `cloud-run/`. This supplements, but
does **not replace**, the existing Google Sheets editor metadata store.
Configuration, deployment approval and cost safeguards:
[docs/FIREBASE_CLOUD_SETUP.md](docs/FIREBASE_CLOUD_SETUP.md).
No live Firebase/Cloud Run deployment is implied by committed source files.
