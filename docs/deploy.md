# Deploy no VPS

O app roda isolado: pasta própria, projeto Compose `price-tracker`, rede e volume próprios, nenhuma porta publicada, limites de 128 MB e meia CPU. Não toca em nenhum outro projeto do servidor.

## 1. Criar o bot

No Telegram, abra o @BotFather, envie `/newbot`, escolha nome e usuário. Ele devolve o **token**. Guarde-o: quem tem o token controla o bot.

## 2. Descobrir o seu chat_id

Mande qualquer mensagem (por exemplo `oi`) para o seu bot recém-criado. Depois, no VPS:

```sh
read -rs TELEGRAM_TOKEN      # cole o token e dê Enter (não aparece na tela)
curl -s "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates" | grep -o '"chat":{"id":-\?[0-9]*'
unset TELEGRAM_TOKEN
```

O número depois de `"id":` é o seu `chat_id`. Faça isso **antes** de subir o app (dois leitores de `getUpdates` brigam).

## 3. Baixar e configurar

```sh
sudo mkdir -p /opt/price-tracker
sudo chown "$USER":"$USER" /opt/price-tracker
git clone https://github.com/gilbertomaiarj1984/amazon-price-tracker.git /opt/price-tracker
cd /opt/price-tracker
cp .env.example .env
chmod 600 .env
nano .env       # preencha TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID
```

## 4. Subir

```sh
cd /opt/price-tracker
docker compose up -d --build
docker compose ps
docker compose logs --tail 30
```

Você deve ver `iniciado: 0 itens...` e receber no Telegram "Rastreador no ar". Em ~1 minuto o estado fica `healthy`.

Confira que nada mais mudou no servidor:

```sh
docker ps --format 'table {{.Names}}\t{{.Status}}'
```

## 5. Usar

No chat com o bot: cole o link de um produto da amazon.com.br, escolha o alvo, e pronto. `/ajuda` lista os comandos.

## Atualizar

```sh
cd /opt/price-tracker
git pull
docker compose up -d --build
```

O banco fica no volume e sobrevive à atualização.

## Backup do banco

```sh
cd /opt/price-tracker
docker compose stop
docker run --rm -v price-tracker_tracker_data:/data -v "$PWD":/out busybox tar czf /out/backup-$(date +%F).tgz -C /data .
docker compose start
```

## Parar ou remover (só este projeto)

```sh
cd /opt/price-tracker
docker compose down          # para e remove o container, mantém o histórico
docker compose down -v       # também apaga o histórico (volume deste projeto)
```
