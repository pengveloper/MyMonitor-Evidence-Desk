# MyMonitor Alpha, community run shape. Build context: the repository root.
#   docker build -f alpha/Dockerfile -t mymonitor-alpha .
FROM node:24-bookworm-slim AS build
WORKDIR /src
COPY . .
RUN npm ci --no-audit --no-fund && npm run alpha:build

# The server uses only Node's standard library, so the runtime image carries no node_modules.
FROM node:24-bookworm-slim
ENV NODE_ENV=production ALPHA_HOST=0.0.0.0 ALPHA_PORT=4310 ALPHA_DATA_DIR=/data ALPHA_STATIC_DIR=/app/dist-alpha
WORKDIR /app
COPY --from=build /src/dist-alpha ./dist-alpha
COPY --from=build /src/alpha/server ./alpha/server
COPY --from=build /src/alpha/shared ./alpha/shared
COPY --from=build /src/LICENSE /src/alpha/NOTICE.md ./
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 4310
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4310/api/status').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "alpha/server/server.ts"]
