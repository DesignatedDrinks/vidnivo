#!/usr/bin/env bash
set -euo pipefail
: "${PROJECT_ID:?Set PROJECT_ID to your existing Firebase project ID}"
command -v firebase >/dev/null || { echo "Install Firebase CLI." >&2; exit 1; }
echo 'Deploys Firestore security rules (not Firestore customer project data).'
read -r -p 'Type RULES to deploy: ' ANSWER
[[ "$ANSWER" == "RULES" ]] || { echo "Cancelled."; exit 1; }
firebase deploy --project "$PROJECT_ID" --only firestore:rules
