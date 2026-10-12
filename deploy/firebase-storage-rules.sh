#!/usr/bin/env bash
set -euo pipefail
: "${PROJECT_ID:?Set PROJECT_ID to your existing Firebase project ID}"
command -v firebase >/dev/null || { echo "Install Firebase CLI." >&2; exit 1; }
echo 'Cloud Storage for Firebase requires Blaze billing and a created storage bucket.'
read -r -p 'Type BILLABLE to authorize rules deployment: ' ANSWER
[[ "$ANSWER" == "BILLABLE" ]] || { echo "Cancelled."; exit 1; }
firebase deploy --project "$PROJECT_ID" --only storage
