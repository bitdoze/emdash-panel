# EmDash site runtime image. Debian-based (glibc) because the workerd binary
# used by the plugin sandbox has no musl build.
#
# Build variants (the database dialect type is baked by astro.config):
#   docker build --build-arg EMDASH_DB=sqlite   -t emdashd-site:sqlite .
#   docker build --build-arg EMDASH_DB=postgres -t emdashd-site:postgres .
FROM node:22-bookworm-slim AS builder
ARG EMDASH_DB=sqlite
ENV EMDASH_DB=$EMDASH_DB
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
ARG EMDASH_DB=sqlite
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=4321 \
	EMDASH_DATA_DIR=/app/data \
	EMDASH_DB=$EMDASH_DB
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 4321
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=18 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "./dist/server/entry.mjs"]
