#!/usr/bin/env bash
# EmDash Panel management CLI.
#   manage.sh status | logs [service] | token | migrate | update | uninstall [--purge]
set -Eeuo pipefail

INSTALL_DIR="${EMDASH_INSTALL_DIR:-/opt/emdash}"
ENV_FILE="$INSTALL_DIR/env"
COMPOSE_FILE="$INSTALL_DIR/deploy/compose.yaml"

[ -f "$ENV_FILE" ] || { echo "error: $ENV_FILE not found — is EmDash Panel installed?" >&2; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

COMPOSE="docker compose --env-file $ENV_FILE -f $COMPOSE_FILE"
if grep -q '^POSTGRES_ADMIN_URL=' "$ENV_FILE"; then
	COMPOSE="$COMPOSE --profile postgres"
fi

cmd="${1:-status}"
shift || true

case "$cmd" in
	status)
		$COMPOSE ps
		echo
		$COMPOSE exec -T worker ./node_modules/.bin/tsx worker/cli.ts status 2>/dev/null || true
		;;
	logs)
		$COMPOSE logs -f --tail=200 "$@"
		;;
	token)
		# Print a fresh single-use owner setup token (expires in 15 min).
		$COMPOSE exec -T worker ./node_modules/.bin/tsx worker/cli.ts create-setup-token --ttl "${1:-15}"
		;;
	migrate)
		$COMPOSE exec -T worker ./node_modules/.bin/tsx worker/cli.ts migrate
		;;
	reconcile)
		$COMPOSE exec -T worker ./node_modules/.bin/tsx worker/cli.ts reconcile
		;;
	restart)
		$COMPOSE restart "$@"
		;;
	update)
		# Pull fresh images if the installation used a registry; rebuild otherwise.
		echo "Update flow: fetch the new release, then run install.sh again (it is idempotent)."
		$COMPOSE pull || true
		$COMPOSE up -d --remove-orphans
		;;
	uninstall)
		echo "This stops the panel, worker, caddy and postgres services."
		if [ "${1:-}" = "--purge" ]; then
			echo "PURGE: also deletes panel data, backups dir contents and all site volumes."
			$COMPOSE down -v --remove-orphans
			rm -rf "$INSTALL_DIR/backups"
			rm -f "$ENV_FILE"
			echo "Volumes and backups removed."
		else
			$COMPOSE down --remove-orphans
			echo "Services stopped. Data volumes and $INSTALL_DIR kept — rerun with --purge to remove everything."
		fi
		;;
	*)
		echo "Usage: manage.sh status|logs|token|migrate|reconcile|restart|update|uninstall [--purge]"
		exit 1
		;;
esac
