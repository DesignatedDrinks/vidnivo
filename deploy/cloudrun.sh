#!/usr/bin/env bash
set -euo pipefail
# Deliberately manual: NEVER link billing, provision cloud services or deploy
# from an unreviewed pull request. Authenticate gcloud before invoking.
: "${PROJECT_ID:?Set PROJECT_ID to your existing, billed Firebase/GCP project ID}"
: "${SERVICE_ACCOUNT:?Set SERVICE_ACCOUNT to a least-privilege runtime service-account email}"
REGION="${REGION:-northamerica-northeast2}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}"
if [[ -z "$ALLOWED_ORIGINS" ]]; then
 echo "ALLOWED_ORIGINS is required (comma-separated HTTPS origins)." >&2; exit 1
fi
command -v gcloud >/dev/null || { echo "Install Google Cloud CLI." >&2; exit 1; }
printf 'Deploying Cloud Run service vidnivo-api in %s. Billing MUST already be enabled.\n' "$PROJECT_ID"
read -r -p 'Type DEPLOY to authorize cloud service creation and potential charges: ' ANSWER
[[ "$ANSWER" == "DEPLOY" ]] || { echo "Cancelled."; exit 1; }
gcloud run deploy vidnivo-api \
 --project "$PROJECT_ID" \
 --region "$REGION" \
 --source cloudrun/api \
 --service-account "$SERVICE_ACCOUNT" \
 --allow-unauthenticated \
 --cpu 1 --memory 512Mi \
 --min-instances 0 --max-instances 2 \
 --concurrency 10 --timeout 30 \
 --set-env-vars "FIREBASE_PROJECT_ID=$PROJECT_ID,ALLOWED_ORIGINS=$ALLOWED_ORIGINS" \
 --quiet
echo 'The HTTP gateway is public ONLY for /healthz; /v1/me requires verified Firebase Authentication.'
