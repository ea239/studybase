#!/bin/sh
set -e

# Both the database and the uploaded files live on mounted volumes, so they
# survive image rebuilds. Created here rather than in the image because the
# mount replaces whatever the image had.
mkdir -p /app/data /app/src/data/uploads

exec "$@"
