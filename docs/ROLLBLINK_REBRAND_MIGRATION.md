# ROLLBLINK rebrand — deployment and compatibility notes

ROLLBLINK is the active identity for the browser video editor, watermark, visual mark, Expo app, native exporter modules, secondary web/cloud account frontend, documentation and regression tests.

## Published web app
The GitHub Pages editor is currently published from the **existing repository** `DesignatedDrinks/vidnivo`, so the legacy hosting route remains:
`https://designateddrinks.github.io/vidnivo/`

The page itself, favicon, on-screen logo and exported watermarks all say **ROLLBLINK**. The repo/hosting URL cannot be changed by replacing frontend text. To use a new URL, connect a verified ROLLBLINK domain (or deliberately rename/migrate the GitHub repository) and update all linked addresses, DNS, SSL and callback/redirect settings. Do not assume automatic custom-domain ownership or trademark clearance.

## Existing infrastructure
- **Cloud Run service ID:** `vidnivo-api` is intentionally retained in Firebase Hosting rewrites and the deployment workflow. It may be serving existing endpoints and should be migrated with a planned cutover, not silently renamed.
- **Firebase project ID / OAuth clients:** existing values are not assumed to change with product branding. Confirm production Authorized Domains and redirect URIs before switching to another hostname.
- **Native package identifiers:** Expo app identity is now `com.rollblink.editor` for Android and iOS. This is a **new app identity** relative to `com.vidnivo.editor`; do not expect an in-place app-store upgrade or seamless container migration from a previously installed old app without a deliberate migration plan.
- **Project data:** original AsyncStorage project/backup keys `@vidnivo/projects/v1` and `@vidnivo/projects/last-good/v1` are retained for old installations; changing them without data migration would make projects seem missing.
- **Stored OpenAI key:** `vidnivo.openai.key.v1` stays stable to avoid losing a user's saved secure credential.
- **Creator My Style:** `rollblink:creator-style:v1` is the new key. Loading automatically falls back to `vidnivo:creator-style:v1` and writes the recovered setting under the new key when possible.

## Validation
Run `npm test`, web GitHub Pages checks, and native Swift/Android build verification. Test a 30-second real video on physical iPhone/Android, including face retouch, auto captions, drag/pinch positioning, soundtrack synchronization and branded export.

## Follow-up before commercial launch
1. Secure and verify product domain and trademark independently.
2. Update Google/Firebase OAuth client IDs and callback URLs for any changed app identity or domain.
3. Configure Apple Developer and Google Play identities for new bundle/application IDs.
4. If desired, migrate GitHub repository/Pages URL and Cloud Run service with redirects and smoke tests.
5. Do not claim a native build is published simply because web and CI checks pass.
