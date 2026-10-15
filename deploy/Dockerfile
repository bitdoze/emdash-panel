# Panel + operations worker image. One image, two commands:
#   panel:  node build                    (SvelteKit server, no docker access)
#   worker: node_modules/.bin/tsx worker/main.ts
# Debian-based so workerd could run here if needed and tar is available for
# image builds via dockerode.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# Server modules read env at module scope; SvelteKit's post-build route
# analysis imports them, so provide throwaway build-time values (never shipped
# or used at runtime — real values come from the container environment).
RUN DATABASE_URL=file:/tmp/panel-build.db \
	ORIGIN=http://localhost \
	BETTER_AUTH_SECRET=build-time-only \
	PANEL_MASTER_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
	npm run build

FROM node:22-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/bitdoze/emdash-panel" \
	org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
	PORT=3000 \
	HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY drizzle ./drizzle
COPY worker ./worker
COPY src/lib ./src/lib
COPY templates ./templates
RUN chmod +x worker/entrypoint.sh
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=10 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./worker/entrypoint.sh"]
CMD ["node", "build"]
