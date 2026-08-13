#!/usr/bin/env bash
#
# deploy.sh - Publish dist/ to a configured rsync target
#
# The target used to be written into package.json, which put a username and the
# server's directory layout in a public repository. It now comes from the
# environment, so the repo says how to deploy without saying where to.
#
# Configure either by exporting the variables, or by creating .env.deploy
# (gitignored) from .env.deploy.example:
#
#   DEPLOY_TARGET=user@host:path/          # production
#   DEPLOY_STAGING_TARGET=user@host:path/  # staging
#
# An rsync target may be any form rsync accepts, including an SSH host alias.
#
# Deliberately one rsync invocation and nothing else: the server this publishes
# to locks out additional concurrent SSH sessions, so this script must never
# grow a "check the result over SSH" step. Verify over HTTPS instead.
#
# Written by
#  Mike Daley <michael_daley@icloud.com>

set -euo pipefail

ENVIRONMENT="${1:-production}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load .env.deploy without letting it override anything already exported, so an
# explicit DEPLOY_TARGET=... on the command line still wins.
ENV_FILE="$REPO_ROOT/.env.deploy"
if [ -f "$ENV_FILE" ]; then
    while IFS='=' read -r key value; do
        case "$key" in
            ''|\#*) continue ;;
        esac
        key="${key%"${key##*[![:space:]]}"}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%\"}"; value="${value#\"}"
        if [ -z "${!key:-}" ]; then
            export "$key=$value"
        fi
    done < "$ENV_FILE"
fi

case "$ENVIRONMENT" in
    production)
        TARGET="${DEPLOY_TARGET:-}"
        VAR_NAME="DEPLOY_TARGET"
        ;;
    staging)
        TARGET="${DEPLOY_STAGING_TARGET:-}"
        VAR_NAME="DEPLOY_STAGING_TARGET"
        ;;
    *)
        echo "deploy: unknown environment '$ENVIRONMENT' (expected 'production' or 'staging')" >&2
        exit 2
        ;;
esac

if [ -z "$TARGET" ]; then
    cat >&2 <<EOF
deploy: $VAR_NAME is not set.

Set it in the environment, or copy .env.deploy.example to .env.deploy and fill
it in:

    cp .env.deploy.example .env.deploy

.env.deploy is gitignored, so the target stays out of the repository.
EOF
    exit 1
fi

if [ ! -d "$REPO_ROOT/dist" ]; then
    echo "deploy: dist/ does not exist — run 'npm run build' first." >&2
    exit 1
fi

echo "Deploying dist/ to the $ENVIRONMENT target..."
exec rsync -avz --delete "$REPO_ROOT/dist/" "$TARGET"
