# amazon-price-tracker

Rastreador pessoal de preços da Amazon Brasil. Você cola o link no bot do Telegram, define um preço-alvo e recebe um alerta quando o preço chegar lá. O histórico é guardado a cada 30 minutos.

**Status:** em construção. Esta base traz o parser, a regra de linhas de preço, a regra de alertas, o banco SQLite e o script de teste de bloqueio. O bot, o agendador e o deploy vêm no PR seguinte.

## Como funciona

Cada produto tem até três **linhas de preço**, cada uma com histórico e alvo próprios:

| Linha | O que é |
|---|---|
| **Amazon** (principal) | Oferta vendida pela própria Amazon. Fica sem dado quando a Amazon não vende; nunca é preenchida com preço de terceiro. |
| **Terceiros (novo)** | Menor `preço + frete` entre vendedores terceiros, condição nova. |
| **Usado** | Menor `preço + frete` entre ofertas usadas. |

A cada coleta o sistema guarda o instantâneo bruto das ofertas e deriva as linhas dele. Ofertas "novas" muito abaixo da mediana do grupo (menos de 50%) são descartadas como suspeitas.

```
src/amazon/asin.ts    link -> ASIN (resolve amzn.to / a.co só entre hosts conhecidos)
src/amazon/fetch.ts   requisição com User-Agent, jitter e timeout
src/amazon/parse.ts   página do produto, painel de ofertas, detecção de captcha/bloqueio
src/lines.ts          ofertas -> linhas Amazon / Terceiros / Usado
src/alerts.ts         quando avisar (alvo, novo mínimo, "voltou a vender", falhas seguidas)
src/db.ts             SQLite (bun:sqlite)
scripts/spike.ts      teste de bloqueio, para rodar no VPS
```

## Rodar

Requer [Bun](https://bun.sh) 1.1+.

```sh
bun install
bun test            # testes de funções puras e do banco, sem rede
bun run typecheck
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

Ele faz ~50 requisições espaçadas (2 a 5 s), imprime a taxa de sucesso por tipo de falha e salva o HTML bruto em `tests/fixtures/real/` (fora do git). Meta: pelo menos 90% de sucesso. Esses HTMLs servem para calibrar os seletores de `src/amazon/parse.ts`, que hoje foram escritos de memória e ainda não foram conferidos contra a página real. `bun scripts/spike.ts --dry` roda o script contra as fixtures sem usar a rede.

O endereço do painel "Todas as ofertas" (`offersUrl` em `src/amazon/fetch.ts`) também precisa ser confirmado nesse teste.

## Aviso

A Amazon proíbe coleta automática nos termos de uso. O projeto foi pensado para uso pessoal e baixo volume (dezenas de produtos, uma requisição por produto a cada 30 minutos). O efeito prático esperado é bloqueio de IP, mas o risco é seu.
