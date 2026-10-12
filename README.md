# VIDNIVO — mobile-first video editor

VIDNIVO is an independently built short-form video editor for iPhone and Android, developed in Expo / React Native.

## Status
**In development, not a complete CapCut replacement.** Editing and Google Sheets persistence are under construction. CapCut's proprietary code, trademarks, templates, and licensed assets are not used.

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
