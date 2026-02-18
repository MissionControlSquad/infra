#!/bin/sh
# Called every 3 minutes by the cron container.
# Iterates over all clients and hits their auto-sleep endpoint.

REGISTRY="/clients/registry.json"

if [ ! -f "$REGISTRY" ]; then
  exit 0
fi

for slug in $(jq -r 'keys[]' "$REGISTRY" 2>/dev/null); do
  secret=$(jq -r ".\"$slug\".cronSecret" "$REGISTRY")
  if [ -n "$secret" ] && [ "$secret" != "null" ]; then
    curl -sf -m 10 \
      -H "Authorization: Bearer $secret" \
      "http://app-${slug}:3000/api/cron/auto-sleep" || true
  fi
done
