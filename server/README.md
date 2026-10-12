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
