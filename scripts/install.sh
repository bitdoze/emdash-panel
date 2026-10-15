#!/usr/bin/env bash
# EmDash Panel installer.
#
# Usage:
#   curl -fsSL <release-url>/install.sh | sudo bash
#   sudo bash scripts/install.sh --local /path/to/checkout --hostname panel.example.com
#
# Options:
#   --hostname <fqdn>        Public panel hostname (prompted if TTY)
#   --local <dir>            Install from a source checkout (builds images locally)
#   --release-url <url>      URL of a release tarball to fetch
#   --with-postgres          Also run the managed PostgreSQL service
#   --skip-dns-check         Don't verify that the hostname resolves to this host
#   --force                  Proceed past existing-service conflicts
#   --yes                    Noninteractive; accept defaults where possible
#
# Idempotent: re-running preserves secrets, volumes and installed state.
set -Eeuo pipefail

INSTALL_DIR="${EMDASH_INSTALL_DIR:-/opt/emdash}"
PANEL_IMAGE_DEFAULT="emdash-panel:local"
SITE_IMAGE_DEFAULT="emdashd-site"
CADDY_IMAGE="caddy:2.10.2-alpine"
POSTGRES_IMAGE="postgres:18-alpine"

HOSTNAME=""
LOCAL_DIR=""
RELEASE_URL="${EMDASH_RELEASE_URL:-}"
WITH_POSTGRES=0
SKIP_DNS=0
FORCE=0
ASSUME_YES=0

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,20p' "$0"; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
	case "$1" in
		--hostname) HOSTNAME="${2:?}"; shift 2 ;;
		--local) LOCAL_DIR="${2:?}"; shift 2 ;;
		--release-url) RELEASE_URL="${2:?}"; shift 2 ;;
		--with-postgres) WITH_POSTGRES=1; shift ;;
		--skip-dns-check) SKIP_DNS=1; shift ;;
		--force) FORCE=1; shift ;;
		--yes|-y) ASSUME_YES=1; shift ;;
		-h|--help) usage 0 ;;
		*) fail "unknown option: $1" ;;
	esac
done

command_exists() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------- preflight
[ "$(id -u)" -eq 0 ] || fail "must run as root (try: sudo bash install.sh)"

if [ ! -r /etc/os-release ]; then
	fail "cannot read /etc/os-release — unsupported platform"
fi
. /etc/os-release
case "${ID:-}" in
	ubuntu|debian) ;;
	*) warn "untested distribution: ${ID:-unknown} ${VERSION_ID:-}. Supported: Ubuntu 24.04+/Debian 12+. Continuing anyway." ;;
esac

ARCH="$(uname -m)"
case "$ARCH" in
	x86_64|amd64|aarch64|arm64) ;;
	*) fail "unsupported architecture: $ARCH" ;;
esac

MEM_KB=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
[ "$MEM_KB" -ge 1400000 ] || warn "less than ~1.5 GiB RAM detected (${MEM_KB} kB) — proceed at your own risk"
DISK_KB=$(df -k "$INSTALL_DIR" 2>/dev/null | awk 'NR==2 {print $4}' || df -k / | awk 'NR==2 {print $4}')
[ "${DISK_KB:-0}" -ge 4000000 ] || fail "less than ~4 GB free disk space"

command_exists curl || fail "curl is required"
command_exists git || warn "git not found — only needed for some update paths"

# Existing service conflicts.
for port in 80 443; do
	if ss -tln 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"; then
		# Allow our own caddy when reinstalling.
		if [ -d "$INSTALL_DIR" ] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^emdashd-caddy$'; then
			continue
		fi
		[ "$FORCE" -eq 1 ] || fail "port $port is already in use by another service. Stop it or rerun with --force."
		warn "port $port is in use — continuing because --force was given"
	fi
done

# ------------------------------------------------------------------- docker
if ! command_exists docker; then
	log "Installing Docker Engine"
	curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
	sh /tmp/get-docker.sh >/dev/null
	rm -f /tmp/get-docker.sh
	systemctl enable --now docker >/dev/null 2>&1 || true
fi
docker version >/dev/null 2>&1 || fail "docker installed but daemon unreachable"
docker compose version >/dev/null 2>&1 || {
	log "Installing Docker Compose plugin"
	if command_exists apt-get; then
		apt-get update -qq && apt-get install -y -qq docker-compose-v2 >/dev/null
	fi
	docker compose version >/dev/null 2>&1 || fail "docker compose plugin unavailable"
}

# ------------------------------------------------------------------- layout
mkdir -p "$INSTALL_DIR"/{deploy,backups}
exec 9>"$INSTALL_DIR/.install.lock"
flock -n 9 || fail "another install is already running ($INSTALL_DIR/.install.lock)"

# ------------------------------------------------------------------- source
SOURCE_DIR=""
if [ -n "$LOCAL_DIR" ]; then
	[ -f "$LOCAL_DIR/package.json" ] || fail "--local directory does not look like a checkout: $LOCAL_DIR"
	SOURCE_DIR="$LOCAL_DIR"
	log "Installing from local checkout: $LOCAL_DIR"
elif [ -n "$RELEASE_URL" ]; then
	log "Fetching release $RELEASE_URL"
	curl -fsSL "$RELEASE_URL" -o /tmp/emdash-panel-release.tar.gz
	mkdir -p /tmp/emdash-panel-release
	tar -xzf /tmp/emdash-panel-release.tar.gz -C /tmp/emdash-panel-release
	SOURCE_DIR="$(find /tmp/emdash-panel-release -mindepth 1 -maxdepth 1 -type d | head -1)"
	[ -n "$SOURCE_DIR" ] || fail "release tarball did not contain a source tree"
else
	fail "no source specified. Use --local <checkout> or --release-url <url>"
fi

# ------------------------------------------------------------------- config
ENV_FILE="$INSTALL_DIR/env"
if [ ! -f "$ENV_FILE" ]; then
	[ -n "$HOSTNAME" ] || {
		if [ "$ASSUME_YES" -eq 0 ] && [ -t 0 ]; then
			read -r -p "Panel hostname (e.g. panel.example.com): " HOSTNAME
		fi
	}
	[ -n "$HOSTNAME" ] || fail "hostname required — pass --hostname <fqdn>"
fi

if [ -f "$ENV_FILE" ]; then
	log "Existing $ENV_FILE found — preserving secrets and configuration"
	# shellcheck disable=SC1090
	set -a; . "$ENV_FILE"; set +a
	HOSTNAME="${PANEL_HOSTNAME:-$HOSTNAME}"
else
	log "Generating fresh secrets in $ENV_FILE"
	cat > "$ENV_FILE" <<EOF
# EmDash Panel environment — generated $(date -Iseconds)
INSTALL_DIR=$INSTALL_DIR
PANEL_HOSTNAME=$HOSTNAME
INSTALLATION_ID=$(cat /proc/sys/kernel/random/uuid)
BETTER_AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')
PANEL_MASTER_KEY=$(openssl rand -base64 32 | tr -d '\n')
PANEL_IMAGE=$PANEL_IMAGE_DEFAULT
EMDASH_SITE_IMAGE=$SITE_IMAGE_DEFAULT
EOF
	if [ "$WITH_POSTGRES" -eq 1 ]; then
		PG_PASS=$(openssl rand -base64 24 | tr -d '\n')
		{
			echo "POSTGRES_ADMIN_PASSWORD=$PG_PASS"
			echo "POSTGRES_ADMIN_URL=postgres://postgres:$PG_PASS@emdashd-postgres:5432/postgres"
		} >> "$ENV_FILE"
	fi
	chmod 600 "$ENV_FILE"
	# shellcheck disable=SC1090
	set -a; . "$ENV_FILE"; set +a
fi
HOSTNAME="$PANEL_HOSTNAME"

# --------------------------------------------------------------------- DNS
if [ "$SKIP_DNS" -eq 0 ]; then
	MY_V4=$(curl -4 -fsSL -m 10 api.ipify.org 2>/dev/null || true)
	RESOLVED=$(getent ahostsv4 "$HOSTNAME" 2>/dev/null | awk 'NR==1 {print $1}' || true)
	if [ -n "$MY_V4" ] && [ -n "$RESOLVED" ] && [ "$RESOLVED" != "$MY_V4" ]; then
		[ "$FORCE" -eq 1 ] || fail "DNS for $HOSTNAME resolves to $RESOLVED, but this host is $MY_V4. Fix DNS or rerun with --skip-dns-check."
		warn "DNS mismatch: $HOSTNAME -> $RESOLVED (host is $MY_V4)"
	fi
fi

# ------------------------------------------------------------------- assets
log "Installing deploy assets"
cp -f "$SOURCE_DIR/deploy/compose.yaml" "$INSTALL_DIR/deploy/compose.yaml"
sed "s/__PANEL_HOSTNAME__/$HOSTNAME/g" \
	"$SOURCE_DIR/deploy/caddy-bootstrap.json" > "$INSTALL_DIR/deploy/caddy.json"

# ------------------------------------------------------------------- images
cd "$INSTALL_DIR"
if [ -n "$LOCAL_DIR" ]; then
	log "Building panel image (this can take a few minutes)"
	docker build -t "$PANEL_IMAGE" -f "$SOURCE_DIR/deploy/Dockerfile" "$SOURCE_DIR"
	log "Building EmDash site image (sqlite variant; postgres builds on demand)"
	docker build --build-arg EMDASH_DB=sqlite -t "${SITE_IMAGE_DEFAULT}:sqlite" "$SOURCE_DIR/templates/emdash-node"
else
	log "Loading/publishing release images"
	# Release tarballs ship prebuilt image archives.
	for img in emdash-panel emdashd-site; do
		if [ -f "/tmp/emdash-panel-release/$img.tar.gz" ]; then
			gunzip -c "/tmp/emdash-panel-release/$img.tar.gz" | docker load
		fi
	done
fi
docker pull "$CADDY_IMAGE" >/dev/null
if [ "$WITH_POSTGRES" -eq 1 ]; then
	docker pull "$POSTGRES_IMAGE" >/dev/null
fi

# ------------------------------------------------------------------- launch
COMPOSE="docker compose --env-file $ENV_FILE -f $INSTALL_DIR/deploy/compose.yaml"
if [ "$WITH_POSTGRES" -eq 1 ] || grep -q '^POSTGRES_ADMIN_URL=' "$ENV_FILE"; then
	COMPOSE="$COMPOSE --profile postgres"
fi

log "Starting services"
$COMPOSE up -d --remove-orphans

log "Waiting for the panel to become healthy"
TRIES=0
until [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' emdashd-panel 2>/dev/null)" = "healthy" ]; do
	TRIES=$((TRIES + 1))
	[ "$TRIES" -gt 90 ] && fail "panel did not become healthy — run: $COMPOSE logs"
	sleep 2
done

# --------------------------------------------------------------- setup token
SETUP_TOKEN=$($COMPOSE exec -T worker ./node_modules/.bin/tsx worker/cli.ts create-setup-token --ttl 60 2>/dev/null | tail -1 || true)

echo
log "EmDash Panel is installed"
echo "  Panel URL:    https://$HOSTNAME"
echo "  Data dir:     $INSTALL_DIR"
echo "  Manage:       $INSTALL_DIR/scripts/manage.sh status|logs|token|update|uninstall"
mkdir -p "$INSTALL_DIR/scripts"
cp -f "$SOURCE_DIR/scripts/manage.sh" "$INSTALL_DIR/scripts/manage.sh" 2>/dev/null || true
chmod +x "$INSTALL_DIR/scripts/manage.sh" 2>/dev/null || true
if [ -n "$SETUP_TOKEN" ]; then
	echo
	echo "  ┌──────────────────────────────────────────────────────────┐"
	echo "  │  Owner setup token (single-use, expires in 60 minutes):  │"
	echo "  └──────────────────────────────────────────────────────────┘"
	echo
	echo "      $SETUP_TOKEN"
	echo
	echo "  Open https://$HOSTNAME/setup and paste this token to create"
	echo "  the owner account."
else
	warn "no setup token produced — owner may already exist, or see: $COMPOSE logs worker"
fi
