# Rollblink AI backend — private beta

The GitHub Pages editor is static. It cannot hold a private OpenAI API key. This Node 22 HTTP service provides the optional protected \`/api/generate\` route for titles and platform post copy.

## Required server environment variables

- \`OPENAI_API_KEY\`: your **private** OpenAI API key, set only in hosting secrets.
- \`ROLLBLINK_ACCESS_TOKEN\`: a separate, random, 24+ character private-beta access token. **This is not your OpenAI API key.**
- \`ALLOWED_ORIGINS\`: comma-separated editor origins; default \`https://designateddrinks.github.io\`.
- \`OPENAI_MODEL\`: optional; defaults to \`gpt-4o-mini\`.
- \`PORT\`: hosting-provided port, defaults to 8080.

Do not commit real secrets to GitHub, bake them into container images, or pass them in query strings.

## Local test (Node 22+)

\`\`\`bash
OPENAI_API_KEY=YOUR_PRIVATE_KEY ROLLBLINK_ACCESS_TOKEN=RANDOM_LONG_TOKEN node server/index.mjs
\`\`\`

Check \`http://localhost:8080/health\`. In the browser editor, expand **AI server connection**, enter your HTTPS API origin (for example, your own Cloud Run URL) and the separate access token for this session. The editor does **not** persist that access token.

## Deploying

The included Dockerfile can be deployed to Cloud Run or a similar HTTPS container host. For Cloud Run, use Secret Manager for both secrets; expose the service only through intended authenticated access and set \`ALLOWED_ORIGINS\` to your editor's origin. This prototype uses a shared bearer token for a single owner's private beta, not user accounts. Before selling multi-user access, implement proper identity verification and per-user quotas/rate limits rather than giving every user one shared token.

This backend sends only the transcript (not source video) to OpenAI when the user explicitly presses Generate and has connected a server. Responses request \`store:false\`. The UI asks creators to review all generated text for accuracy. No hosting account or Cloud Run service is deployed by committing these files.

## Direct publishing beta: Instagram Reels, YouTube Shorts and TikTok

The `docs/` browser editor now contains **Publish video** under the Generate panel
(and a Publish action next to Export). Exports or chosen MP4 files upload to this
backend only after the creator presses **Review & Publish** and confirms. The
backend is **not deployed by a GitHub commit**. No account is connected or posted
to until configured and authorized.

### Where to add your OpenAI API key

For the **browser beta**, put `OPENAI_API_KEY` in the HTTPS backend's secret
environment variables (e.g. host's secret manager), **not** in the GitHub
repository, browser UI, URL, or Expo public config. In the browser, open
**Generate → AI server connection** and enter only the backend HTTPS URL
and the unrelated `ROLLBLINK_ACCESS_TOKEN`. The **native Expo Social Studio**
already has its own on-device secure API key field; it does not use this
browser publishing backend unless separately integrated.

### Additional deployment secrets/configuration

```dotenv
# Store as host secrets; the values below are examples, NOT real credentials.
OPENAI_API_KEY=<your private OpenAI API key>
ROLLBLINK_ACCESS_TOKEN=<openssl rand -hex 32>
ROLLBLINK_TOKEN_ENCRYPTION_KEY=<openssl rand -hex 32>
PUBLIC_BASE_URL=https://api.your-rollblink-domain.com
ALLOWED_ORIGINS=https://designateddrinks.github.io
ROLLBLINK_EDITOR_ORIGIN=https://designateddrinks.github.io

GOOGLE_CLIENT_ID=<Google OAuth web application ID>
GOOGLE_CLIENT_SECRET=<Google OAuth secret>
INSTAGRAM_APP_ID=<Meta Instagram API with Instagram Login app ID>
INSTAGRAM_APP_SECRET=<Meta Instagram app secret>
TIKTOK_CLIENT_KEY=<TikTok Login Kit client key>
TIKTOK_CLIENT_SECRET=<TikTok client secret>

# MUST use a mounted, persistent, private encrypted volume:
SOCIAL_TOKEN_FILE=/mnt/rollblink/tokens.enc
MEDIA_DIR=/mnt/rollblink/media
```

Register these exact authorization callback URLs on the providers (change the
hostname to your real PUBLIC_BASE_URL):
- Google OAuth Web client: `https://api.your-rollblink-domain.com/api/social/callback/youtube`
- Instagram API with Instagram Login: `https://api.your-rollblink-domain.com/api/social/callback/instagram`
- TikTok Login Kit Web: `https://api.your-rollblink-domain.com/api/social/callback/tiktok`

Enable YouTube Data API and request the `youtube.upload` scope; configure
Meta's `instagram_business_basic` and `instagram_business_content_publish`
scopes, and TikTok's `user.info.basic` and `video.publish` scopes.
Instagram requires a professional account. Google/Meta/TikTok may restrict
test users or public publishing until app verification/review. TikTok unaudited
clients are limited to private posting. Do not mark a submitted video
"published" until the provider actually confirms it.

### Server requirements and workflow

1. Deploy the Dockerfile from the `server/` directory to a HTTPS Node 22
   host with a single persistent, private volume. Both `index.mjs` and
   `social.mjs` must be included (the Dockerfile now includes both).
2. Install all environment secrets, set the correct OAuth callback URLs,
   and verify `GET /health`. Configure a **single instance** for this
   one-owner beta; OAuth state is held in server memory. Cloud Run's default
   ephemeral filesystem and autoscaling **do not satisfy** this beta token
   and media persistence requirement. Use persistent storage or adapt the
   implementation to your cloud provider's durable object/database services.
3. In the editor, set the HTTPS server origin and beta access token
   under AI server connection; open Publish video and connect each platform.
4. Export a supported MP4, choose a destination, edit its caption and
   privacy, confirm the upload; the server forwards video through official APIs.
   The TikTok flow uses sequential file-upload chunks; YouTube uses a resumable
   upload session; Instagram creates a Reel container and serves a temporary
   publicly accessible media URL for Instagram to fetch. For Instagram, tap
   Complete Reel when container processing finishes. Check TikTok status
   to distinguish submission from confirmed publication.

The upload limit is **200 MB** per MP4 and the local media URL expires after
48 hours. That means original footage stays local until an explicit publish,
but publishing necessarily transfers the *exported video* to the beta
backend, and then to the selected social platform. Instagram media files
are publicly accessible at unguessable temporary URLs during processing.
Do not use confidential footage with this prototype. Files are not
automatically garbage-collected yet: configure a 48-hour storage cleanup
job or lifecycle policy before real use.

### Security and production launch gate

This prototype is **private single-owner beta infrastructure**, NOT a
multi-user production system. Shared bearer authentication, one-instance
OAuth state, local encrypted token file, and media filesystem storage are
inadequate for a public commercial SaaS. Before selling access, add real
end-user login, OAuth account ownership binding, CSRF/session management,
durable encrypted DB tokens, private object storage and expiring signed
upload links, queues/retries, storage cleanup, audit log, per-account
quotas, and verified Instagram/TikTok/Google app publishing permissions.

Never post credentials into chat or commit them to GitHub.
