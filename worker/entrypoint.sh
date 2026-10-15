#!/bin/sh
# Container entrypoint shared by the panel and worker services.
#
# Both services must apply Drizzle migrations against the same SQLite database
# (the shared /data volume) before serving traffic. SQLite serializes writes
# but not "check-then-apply" sequences, so the migrate step runs under an flock
# on the shared volume; the second process then sees the journal applied and
# no-ops.
set -e

mkdir -p /data
flock -w 120 /data/.migrate.lock -c './node_modules/.bin/tsx worker/cli.ts migrate'
exec "$@"
