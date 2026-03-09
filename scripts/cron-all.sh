#!/bin/sh
# Called every 3 minutes by the cron container.
# Iterates over all hosted clients and hits their auto-sleep endpoint.

REGISTRY="/clients/registry.json"

if [ ! -f "$REGISTRY" ]; then
  exit 0
fi

# Validate JSON before iterating
if ! jq empty "$REGISTRY" 2>/dev/null; then
  echo "[cron] ERROR: registry.json is not valid JSON" >&2
  exit 1
fi

CLIENT_COUNT=$(jq 'length' "$REGISTRY" 2>/dev/null)
if [ "$CLIENT_COUNT" = "0" ] || [ -z "$CLIENT_COUNT" ]; then
  exit 0
fi

for slug in $(jq -r 'keys[]' "$REGISTRY" 2>/dev/null); do
  # Skip self-hosted clients — they have no local container
  client_type=$(jq -r ".\"$slug\".type // \"hosted\"" "$REGISTRY")
  if [ "$client_type" = "self-hosted" ]; then
    continue
  fi

  secret=$(jq -r ".\"$slug\".cronSecret" "$REGISTRY")
  if [ -n "$secret" ] && [ "$secret" != "null" ]; then
    curl -sf -m 10 \
      -H "Authorization: Bearer $secret" \
      "http://app-${slug}:3000/api/cron/auto-sleep" || true
  fi
done
