#!/bin/sh
# Block startup if paid customer records would be written to ephemeral storage.
set -eu
if [ "${RAILWAY_VOLUME_MOUNT_PATH:-}" != "/data" ]; then
  echo "ERROR: Attach a persistent Railway volume at /data before launching." >&2
  exit 1
fi
if [ "${DATA_FILE:-}" != "/data/proconnect.json" ]; then
  echo "ERROR: DATA_FILE must be /data/proconnect.json." >&2
  exit 1
fi
token="${ADMIN_TOKEN:-}"
if [ "${#token}" -lt 32 ]; then
  echo "ERROR: Set a fresh ADMIN_TOKEN with at least 32 characters." >&2
  exit 1
fi
mkdir -p /data
chown node:node /data
if ! su-exec node sh -c 'touch /data/.write-check && rm /data/.write-check'; then
  echo "ERROR: Persistent volume is not writable by the application." >&2
  exit 1
fi
exec su-exec node node server.js
