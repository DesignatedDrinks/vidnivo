# ROLLBLINK — AI Creator beta setup

## 1. Test on iPhone (no backend required for basic AI posts)

Open an exported video project in the **native Expo Rollblink app** →
**Social Studio → OpenAI setup**. Paste the key created at
[OpenAI API Keys](https://platform.openai.com/api-keys) into the
**OpenAI key** field and tap **Save key**, then **Test OpenAI connection**.

**Create my content kit** generates distinct captions for Instagram, TikTok,
YouTube, Facebook, LinkedIn and a YouTube title from timestamped spoken
captions. This direct-to-OpenAI beta route stores the key in iOS/Android
secure storage. It is not included in GitHub, cloud project metadata or
an exported video. The native app must be built/installed; a GitHub commit
does not install the app on your phone.

To get three hook alternatives, a suggested on-screen title, and a
single consistent AI system across web and native, connect the Rollblink
AI backend below.

## 2. Web + mobile AI Creator: secure hosted setup

**Do not paste an OpenAI API key into the GitHub Pages website.**

### Deploy the backend with Render

1. Review the repository's [render.yaml](../render.yaml). This defines
   one paid Docker web service and a private 2 GB persistent disk.
2. In Render Dashboard, choose **New → Blueprint**, connect the
   `DesignatedDrinks/vidnivo` GitHub repository, and deploy the
   `render.yaml` from the merged `main` branch.
3. During Blueprint setup, enter these two **hosting secrets**:
   - `OPENAI_API_KEY`: your OpenAI API key from platform.openai.com.
   - `ROLLBLINK_ACCESS_TOKEN`: a **different** random 24+ character
     access token you choose for this private beta. Keep a secure copy
     because you'll enter it in Rollblink.
   Render generates a separate encrypted-storage secret automatically.
   Your OpenAI key never goes in the web editor or repository.
4. Wait for Render to report a healthy service. Copy the HTTPS service
   URL, like `https://rollblink-ai-beta.onrender.com` (your actual
   service hostname may differ). Check `/health`, which reports whether
   AI is configured without exposing any secrets.
5. In **Rollblink web editor → Generate → AI server connection**:
   enter the actual Render HTTPS URL under **Server URL** and your
   `ROLLBLINK_ACCESS_TOKEN` under **Session access token**. Tap
   **Test connection**, then **Create everything**.
6. For the installed native app, open **Social Studio → Connected
   publishing → Beta API server URL**. Enter the *same* HTTPS URL
   and *same separate beta token*, tap **Save beta connection**.
   In **OpenAI setup**, select **Use server AI** when both a device key
   and hosted AI are configured. Tap **Test OpenAI connection**.

**What gets sent:** AI generation sends spoken caption text and any
creative instructions to OpenAI; original video bytes are not sent for
AI writing. Publishing a finished MP4 **does** upload it to your
Rollblink backend and then to the selected social network only after
explicit confirmation. The editor's browser token remains in memory,
not saved into local browser storage.

**Privacy/security:** This backend is intentionally restricted to
single-owner private beta access. Do not give the shared beta access
token to external users. Social publishing stores encrypted tokens on
the persistent disk; public rollout requires real per-user login,
audited platform permissions, private media object storage, and further
security review. The Render service/disk can incur charges.

## 3. Connect publishing platforms

Add these values in **Render → rollblink-ai-beta → Environment** only
after creating the corresponding developer applications:

| Platform | Required secrets |
| --- | --- |
| Instagram | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |

Use the assigned backend hostname followed by these exact callback
paths in each developer portal:

- Instagram: `/api/social/callback/instagram`
- YouTube: `/api/social/callback/youtube`
- TikTok: `/api/social/callback/tiktok`

After authorized connections, the browser offers MP4 upload,
per-platform captions, publishing privacy and real provider status
feedback. The native app has a native YouTube upload route plus
Instagram/TikTok publishing through the hosted beta server.

Instagram Reels requires an eligible professional account and
appropriate API permissions. YouTube requires Google OAuth and API
quota. TikTok public direct publishing requires review/audit;
unaudited apps may be restricted to private posts.

## 4. Successful readiness checks

- Web editor loads with no stored OpenAI secret and allows offline
  caption editing when the backend is unavailable.
- AI Test connection returns configured only after the server secret
  has been added (this checks configuration, **not** available billing).
- From actual spoken captions, **Create everything** generates three
  alternate hooks, one on-screen title, five distinct posts, a YouTube
  title and a single editing suggestion. All are editable/reviewable.
- Adding a native hook becomes a real timeline title with undo support.
- No external social post is sent until explicitly confirmed.
- A published state is not claimed while Instagram/TikTok processing
  remains pending.
- Backend API tests, Docker container tests, web/mobile smoke and
  real-device tests must pass before commercial use.

This repository does not contain an OpenAI key, social-platform app
credentials or proof that the hosting service or developer apps have
been set up. The code alone does not create these external accounts.
