#!/bin/sh
set -eu
# Render mounts persistent disks after image build. Set permissions once at startup.
if [ -d /var/data ]; then
  chown node:node /var/data
  chmod 700 /var/data
fi
exec su-exec node node /app/index.mjs
