# CLAUDE.md

Rastreador pessoal de preços da Amazon Brasil. Leia o `README.md` para a visão geral.

## Regra de isolamento (inegociável)

Este projeto **não executa nem interfere em nada dos outros projetos e repositórios** do dono, nem nos serviços do VPS onde roda (`leilao-finder-buddy`, AgendaBoa, Caddy, Postgres, Portainer, Dokploy).

- Não ler, editar, commitar nem dar push em outro repositório a partir de uma sessão daqui. Outro projeto serve no máximo de referência de leitura.
- Não reutilizar código, secrets, tokens, `.env`, imagens GHCR, bancos ou volumes de outro projeto. Este app tem o seu próprio bot do Telegram, o seu próprio SQLite e os seus próprios secrets.
- No VPS: diretório próprio (`/opt/price-tracker`), projeto Compose próprio (`name: price-tracker`), rede própria (nenhuma rede externa), **nenhuma porta publicada**, sem montar o socket do Docker, sem volume compartilhado, sem bloco no `Caddyfile` de ninguém, com `mem_limit` e `cpus` definidos.
- Comandos de deploy atuam só neste projeto: `docker compose -p price-tracker ...` dentro do diretório dele. Nunca `docker system prune`, `docker compose down` fora do projeto, `docker network`/`volume` rm, nem mexer em `/etc`, cron do host ou firewall.
- Mudança que precise tocar algo fora deste repositório (ex.: Caddyfile, outro compose) não é feita aqui: descreva o que seria preciso e peça autorização ao dono.

## Comandos

```sh
bun install
bun test
bun run typecheck
bun scripts/spike.ts --dry
```
