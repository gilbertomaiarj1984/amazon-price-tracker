# Instalação no VPS (passo a passo)

Guia para colocar o rastreador no ar no VPS, com o usuário `deploy`, na pasta `~/price-tracker-spike` e Docker (imagem base `oven/bun:1-slim`). O app roda isolado: projeto Compose `price-tracker`, rede e volume próprios, nenhuma porta publicada, 128 MB e meia CPU. Não mexe nos outros projetos do servidor.

> Este guia complementa o [deploy.md](deploy.md), usando a pasta e o usuário do seu servidor.

## O que você precisa antes

- Acesso SSH ao VPS como `deploy`.
- Docker e o plugin Compose instalados, e o `deploy` autorizado a usá-los.
- Telegram no celular ou no computador.
- O PR 1 e o PR 2 mesclados na `main` (o Dockerfile e o `docker-compose.yml` vêm do PR 2).

Confira no VPS:

```sh
ssh deploy@SEU_VPS
docker --version && docker compose version
docker ps        # se der "permission denied", rode: sudo usermod -aG docker deploy  (saia e entre de novo)
```

## Passo 1. Criar o bot no Telegram e pegar o token

1. No Telegram, procure **@BotFather** (tem o selo azul de verificado) e abra a conversa.
2. Envie `/newbot`.
3. Escolha um **nome** (aparece na conversa, pode ser `Rastreador de Preços`).
4. Escolha um **usuário** que termine em `bot` e não exista ainda (por exemplo `giba_precos_bot`).
5. O BotFather responde com o **token**, no formato `123456789:AAH...`. Copie.

Trate o token como senha: quem o tem controla o bot. Se vazar, envie `/revoke` ao BotFather para gerar outro.

## Passo 2. Descobrir o seu chat_id

O bot só atende o chat com esse número e ignora todo o resto.

1. No Telegram, abra o bot que você criou e envie qualquer mensagem (por exemplo `oi`).
2. No VPS, faça isso **antes** de subir o app (dois leitores de `getUpdates` atrapalham um ao outro):

```sh
read -rs TELEGRAM_TOKEN      # cole o token, Enter (nada aparece na tela)
curl -s "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates" | grep -o '"chat":{"id":-\?[0-9]*'
unset TELEGRAM_TOKEN
```

O número depois de `"id":` é o `chat_id` (para conversa direta é positivo). Se a saída vier vazia, mande outra mensagem ao bot e repita.

## Passo 3. Baixar o código em `~/price-tracker-spike`

Se a pasta ainda não existe:

```sh
cd ~
git clone https://github.com/gilbertomaiarj1984/amazon-price-tracker.git price-tracker-spike
cd ~/price-tracker-spike
```

Se ela já existe (do teste de bloqueio), atualize para a `main`:

```sh
cd ~/price-tracker-spike
git status --short        # deve estar limpo; se não, guarde ou descarte o que sobrou
git fetch origin
git checkout main
git pull --ff-only
```

## Passo 4. Configurar o `.env`

```sh
cd ~/price-tracker-spike
cp .env.example .env
chmod 600 .env
nano .env
```

Preencha:

```
TELEGRAM_BOT_TOKEN=123456789:AAH...    # token do Passo 1
TELEGRAM_CHAT_ID=123456789             # número do Passo 2
```

As demais variáveis são opcionais: `INTERVAL_MIN=30` (minutos entre rodadas, mínimo 5), `REQ_MIN_MS=2000` e `REQ_MAX_MS=5000` (pausa entre requisições à Amazon). O `.env` nunca vai para o git.

## Passo 5. Subir

```sh
cd ~/price-tracker-spike
docker compose up -d --build
docker compose ps
docker compose logs --tail 30
```

O primeiro build baixa a imagem `oven/bun:1-slim` e instala as dependências; leva alguns minutos. Esperado:

- nos logs, a linha `iniciado: 0 itens...`;
- no Telegram, a mensagem **"Rastreador no ar"**;
- em cerca de 1 minuto, o estado `healthy` em `docker compose ps`.

Confirme que nada mais mudou no servidor:

```sh
docker ps --format 'table {{.Names}}\t{{.Status}}'
```

## Passo 6. Primeiro uso

No chat com o bot, cole o link de um produto da amazon.com.br, escolha o alvo (−5%, −10%, −15% ou um valor) e pronto. `/ajuda` lista os comandos: `/item N`, `/historico N`, `/linhas N`, `/alvo N valor`, `/pausar N`, `/remover N`.

## Problemas comuns

| Sintoma | O que fazer |
| --- | --- |
| `getUpdates` volta `{"ok":true,"result":[]}` | Você ainda não escreveu para o bot, ou o app já está rodando. Mande outra mensagem; se o app estiver no ar, pare com `docker compose stop` antes. |
| `401 Unauthorized` | Token errado. Copie de novo do BotFather. |
| Bot não responde | Confira `TELEGRAM_CHAT_ID` no `.env` e veja `docker compose logs --tail 50`. Mensagens de outros chats são ignoradas de propósito. |
| Container `unhealthy` | O polling do Telegram parou de responder (rede ou Telegram fora). Ele continua tentando; veja os logs. |
| `permission denied` no Docker | `sudo usermod -aG docker deploy`, saia e entre de novo no SSH. |
| Mudou o `.env` e nada mudou | `docker compose up -d` recria o container com o novo valor. |

## Manutenção

Atualizar:

```sh
cd ~/price-tracker-spike
git pull --ff-only
docker compose up -d --build
```

O banco fica num volume e sobrevive à atualização.

Backup do banco:

```sh
cd ~/price-tracker-spike
docker compose stop
docker run --rm -v price-tracker_tracker_data:/data -v "$PWD":/out busybox tar czf /out/backup-$(date +%F).tgz -C /data .
docker compose start
```

Parar ou remover (só este projeto):

```sh
docker compose down          # para e remove o container, mantém o histórico
docker compose down -v       # também apaga o histórico
```
