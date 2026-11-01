#!/usr/bin/env bash
set -euo pipefail

npm ci --include=dev
npm run db:sync:replit
npm run build
