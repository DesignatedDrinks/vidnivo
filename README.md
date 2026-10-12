# VIDNIVO — mobile-first video editor

VIDNIVO is an independently built short-form video editor for iPhone and Android, developed in Expo / React Native.

## Status
**In development.** VIDNIVO is an independent mobile video editor. Editing, native rendering, and Google Sheets persistence are under active development.

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

The iOS AVFoundation export module is located in `modules/vidnivo-export`.
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
`modules/vidnivo-export/android`. It supports consecutive video clips,
source trimming, constant speed, mute, and fitted output aspect ratio.
The Android implementation **explicitly rejects text layers, separate
soundtracks and custom volume** rather than silently dropping those edits.
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
