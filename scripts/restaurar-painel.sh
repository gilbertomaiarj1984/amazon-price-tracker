#!/usr/bin/env bash
# Recoloca o bloco do painel no Caddyfile do garimpo quando ele some. Idempotente: se o bloco já existe e o
# painel responde, não faz nada. Rode no VPS como usuário deploy (feito pelo dono; o app nunca edita esse arquivo).
#
#   bash scripts/restaurar-painel.sh            # verbose
#   bash scripts/restaurar-painel.sh --cron     # silencioso quando está tudo certo (para o cron)
#   bash scripts/restaurar-painel.sh --dry      # só mostra o que faria
#
# O hash da senha é lido, nesta ordem, de: $PAINEL_HASH, ~/.painel-caddy-hash (uma linha, chmod 600),
# ou do bloco mais recente achado em Caddyfile.bak-*.
set -uo pipefail

DOMINIO="${PAINEL_DOMINIO:-precos.143-95-214-240.sslip.io}"
CADDYFILE="${CADDYFILE:-/home/deploy/garimpo/Caddyfile}"
CONTAINER="${CADDY_CONTAINER:-garimpo-caddy-1}"
USUARIO="${PAINEL_USUARIO:-giba}"
UPSTREAM="${PAINEL_UPSTREAM:-tracker:8787}"
HASHFILE="${PAINEL_HASHFILE:-$HOME/.painel-caddy-hash}"
MODO="${1:-}"

say() { [ "$MODO" = "--cron" ] || echo "$*"; }
log() { echo "$(date -Is) $*"; }
http() { curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$DOMINIO/api/itens" 2>/dev/null || true; }

[ -f "$CADDYFILE" ] || { log "ERRO: $CADDYFILE não existe"; exit 1; }

SITES="$(dirname "$CADDYFILE")/sites"
RE_BLOCO="^${DOMINIO//./\\.}[[:space:]]*\\{"
# O bloco pode estar no próprio Caddyfile ou em sites/*.caddy, desde que o Caddyfile importe esse diretório.
bloco_presente() {
  grep -qE "$RE_BLOCO" "$CADDYFILE" && return 0
  grep -qE '^[[:space:]]*import[[:space:]]+.*sites/' "$CADDYFILE" && grep -qsE "$RE_BLOCO" "$SITES"/*.caddy
}

if bloco_presente; then
  code="$(http)"
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then say "ok: bloco presente e painel responde HTTP $code"; exit 0; fi
  log "bloco presente, mas o painel respondeu '${code:-sem resposta}'; recarregando o Caddy uma vez"
  [ "$MODO" = "--dry" ] && exit 0
  docker exec "$CONTAINER" caddy reload --config /etc/caddy/Caddyfile 2>&1 | tail -3
  sleep 15
  code="$(http)"; log "depois do reload: HTTP ${code:-sem resposta}"
  [ "$code" = "401" ] || [ "$code" = "200" ]; exit $?
fi

log "bloco de $DOMINIO AUSENTE em $CADDYFILE; restaurando"

hash="${PAINEL_HASH:-}"
[ -z "$hash" ] && [ -f "$HASHFILE" ] && hash="$(head -n1 "$HASHFILE" | tr -d '[:space:]')"
if [ -z "$hash" ]; then
  for bak in $(ls -t "$CADDYFILE".bak-* 2>/dev/null); do
    hash="$(awk -v d="$DOMINIO" '$1==d {f=1} f && /basic_?auth/ {a=1; next} f && a && NF>=2 {print $2; exit}' "$bak")"
    [ -n "$hash" ] && { log "hash lido de $bak"; break; }
  done
fi
[ -n "$hash" ] || { log "ERRO: sem hash. Gere com: docker run --rm -it caddy:2-alpine caddy hash-password  e grave em $HASHFILE (chmod 600)"; exit 1; }

if [ "$MODO" = "--dry" ]; then log "(dry) acrescentaria o bloco de $DOMINIO a $CADDYFILE"; exit 0; fi

backup="$CADDYFILE.bak-restaurar-$(date +%Y%m%d-%H%M%S)"
cp -p "$CADDYFILE" "$backup" || { log "ERRO: sem backup, abortando"; exit 1; }
log "backup: $backup"

# Acrescenta (>>) em vez de substituir o arquivo: mantém o mesmo inode, que é o que o container enxerga.
cat >> "$CADDYFILE" <<BLOCO

# Rastreador de preços (projeto price-tracker; rede externa proxy) - bloco gerenciado por scripts/restaurar-painel.sh
$DOMINIO {
        header {
                Strict-Transport-Security "max-age=31536000"
                X-Content-Type-Options "nosniff"
                Referrer-Policy "no-referrer"
                -Server
        }
        basic_auth {
                $USUARIO $hash
        }
        reverse_proxy $UPSTREAM
}
BLOCO

if ! docker exec "$CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  log "ERRO: Caddyfile inválido depois de acrescentar; revertendo para o backup (sem recarregar)"
  cat "$backup" > "$CADDYFILE"
  exit 1
fi

if ! docker exec "$CONTAINER" caddy reload --config /etc/caddy/Caddyfile 2>&1 | tail -3; then
  log "ERRO no reload; o arquivo ficou com o bloco, backup em $backup"; exit 1
fi

# O certificado é emitido sob demanda (Let's Encrypt); pode levar alguns segundos.
for _ in 1 2 3 4 5 6; do
  sleep 10
  code="$(http)"
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then log "restaurado: painel respondeu HTTP $code"; exit 0; fi
done
log "bloco recolocado e Caddy recarregado, mas o painel ainda não responde (último: '${code:-sem resposta}'). Veja: docker logs --tail 30 $CONTAINER"
exit 1
