# amazon-price-tracker

Rastreador pessoal de preços da Amazon Brasil. Você cola o link no bot do Telegram, define um preço-alvo e recebe um alerta quando o preço chegar lá. O histórico é guardado a cada 30 minutos.

**Status:** funcional. Bot do Telegram, coletor a cada 30 minutos, parser calibrado com HTML real da amazon.com.br, banco SQLite e deploy por Docker Compose. Guia de instalação no VPS: [`docs/deploy.md`](docs/deploy.md).

**Teste de bloqueio (feito no VPS, 23/10/2026):** a página do produto respondeu 50 de 50 vezes sem captcha nem 503. O painel "Todas as ofertas" responde em `/gp/product/ajax/aodAjaxMain/ref=dp_aod_ALL_mbc`.

## Como funciona

Cada produto tem até três **linhas de preço**, cada uma com histórico próprio, e **um alvo único por item** que vale para qualquer linha (o aviso e as cores usam o menor preço entre elas):

| Linha | O que é |
|---|---|
| **Amazon** (principal) | Oferta vendida pela própria Amazon. Fica sem dado quando a Amazon não vende; nunca é preenchida com preço de terceiro na série. Nesse caso o card, o painel e os alertas mostram o **melhor terceiro novo** (rotulado "Terceiro", com vendedor e FBA ou não), o alvo do item vale para ele, e ele é gravado na série Terceiros. Não custa requisição extra: o painel de ofertas já é lido sempre que a caixa de compra não é da Amazon. |
| **Terceiros (novo)** | Menor preço anunciado entre vendedores terceiros, condição nova. |
| **Usado** | Menor preço anunciado entre ofertas usadas. |

**O frete não entra na conta.** No HTML ele vem vazio (carregado depois e dependente do CEP), e o texto "Entrega GRÁTIS" é promoção condicional. Os preços são os anunciados na página. Alguns vendedores destacam o preço **à vista no Pix** (cerca de 10% abaixo); o sistema usa o preço em destaque, que pode ser esse.

A cada coleta o sistema guarda o instantâneo bruto das ofertas e deriva as linhas dele. Ofertas "novas" muito abaixo da mediana do grupo (menos de 50%) são descartadas como suspeitas.

```
src/index.ts          liga tudo: bot (long polling) + agendador
src/bot.ts            comandos e botões do Telegram
src/collector.ts      uma coleta: página, painel se preciso, linhas, alertas, gravação
src/scheduler.ts      rodada a cada 30 min, avisos de falha geral
src/telegram.ts       cliente mínimo da Bot API
src/amazon/asin.ts    link -> ASIN (resolve amzn.to / a.co só entre hosts conhecidos)
src/amazon/fetch.ts   requisição com User-Agent, jitter e timeout
src/amazon/parse.ts   página do produto, painel de ofertas, detecção de captcha/bloqueio
src/lines.ts          ofertas -> linhas Amazon / Terceiros / Usado
src/alerts.ts         quando avisar (alvo, novo mínimo, "voltou a vender", falhas seguidas)
src/db.ts             SQLite (bun:sqlite)
scripts/spike.ts      teste de bloqueio, para rodar no VPS
```

## Comandos do bot

Cole o link de um produto para rastrear. `/item N`, `/historico N`, `/linhas N`, `/alvo N valor`, `/pausar N`, `/estrela N`, `/remover N`, `/ajuda`.

## Rodar

Requer [Bun](https://bun.sh) 1.1+.

```sh
bun install
bun test            # testes de funções puras e do banco, sem rede
bun run typecheck
bun scripts/e2e-local.ts   # sobe um Telegram falso e roda o app de verdade (poucas requisições reais à Amazon)
```

## Teste de bloqueio (faça isto antes de qualquer outra coisa)

O que decide se o projeto funciona é a taxa de captcha/503 que a Amazon devolve **para o IP do seu VPS**. Rode lá:

```sh
cp links.example.txt links.txt        # coloque 3 a 5 links de produtos reais
bun scripts/spike.ts --file links.txt --n 50 --offers
```

Sem Bun no VPS:

```sh
docker run --rm -v "$PWD":/app -w /app oven/bun:1 bun install --frozen-lockfile
docker run --rm -v "$PWD":/app -w /app oven/bun:1 bun scripts/spike.ts --file links.txt --n 50 --offers
```

Ele faz ~50 requisições espaçadas (2 a 5 s), imprime a taxa de sucesso por tipo de falha e salva o HTML bruto em `tests/fixtures/real/` (fora do git). Meta: pelo menos 90% de sucesso. Esses HTMLs serviram para calibrar os seletores de `src/amazon/parse.ts`. Se a Amazon mudar o layout, rode `scripts/inspect.ts`, `scripts/inspect-offers.ts` e `scripts/inspect-price.ts` sobre HTML novo para ver o que mudou. `bun scripts/spike.ts --dry` roda o script contra as fixtures sem usar a rede.

`scripts/probe-offers.ts` testa endereços candidatos do painel de ofertas.

## Isolamento

O app roda sozinho e não toca em nenhum outro projeto do mesmo servidor: diretório, projeto Compose, rede, volume, bot do Telegram e secrets próprios, sem portas publicadas (o painel web é exposto só pelo Caddy do servidor, com login, via rede `proxy`; veja `docs/painel.md`) e sem depender de Postgres ou do Docker socket. Detalhes em `CLAUDE.md`.

## Aviso

A Amazon proíbe coleta automática nos termos de uso. O projeto foi pensado para uso pessoal e baixo volume (dezenas de produtos, uma requisição por produto a cada 30 minutos). O efeito prático esperado é bloqueio de IP, mas o risco é seu.
