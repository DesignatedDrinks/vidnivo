#!/usr/bin/env bash
set -euo pipefail
: "${PROJECT_ID:?Set PROJECT_ID to your existing Firebase project ID}"
command -v firebase >/dev/null || { echo "Install Firebase CLI: npm install -g firebase-tools" >&2; exit 1; }
echo 'Hosting-only deployment does not create Cloud Run or Cloud Storage resources.'
read -r -p 'Type DEPLOY to publish the current public site: ' ANSWER
[[ "$ANSWER" == "DEPLOY" ]] || { echo "Cancelled."; exit 1; }
firebase deploy --project "$PROJECT_ID" --only hosting
