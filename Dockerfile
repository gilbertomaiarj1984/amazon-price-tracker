FROM oven/bun:1-slim

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production \
    DB_PATH=/data/tracker.db \
    HEARTBEAT_FILE=/tmp/heartbeat \
    BUN_RUNTIME_TRANSPILER_CACHE_PATH=0

RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data

# O laço de polling grava o arquivo a cada resposta do Telegram (no máximo ~50 s). Sem batida há 3 min = travou.
HEALTHCHECK --interval=60s --timeout=5s --start-period=90s --retries=3 \
  CMD test $(( $(date +%s) - $(stat -c %Y /tmp/heartbeat 2>/dev/null || echo 0) )) -lt 180 || exit 1

CMD ["bun", "src/index.ts"]
