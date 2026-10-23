# Painel web

Painel somente leitura com a lista de itens (mini-gráfico), histórico de 7/14/30 dias (linhas Amazon, Terceiros e Usado, com faixa cinza quando a Amazon não vendeu), tabela de ofertas da última coleta e a saúde das coletas. Lê o mesmo SQLite do bot. Não faz login na Amazon, não altera nada e aceita só `GET`.

Vem **desligado**. Nenhuma porta é publicada no host: o acesso é por túnel SSH até o IP interno do container.

## 1. Atualizar e ligar (no VPS, usuário `deploy`)

```sh
cd ~/price-tracker-spike/amazon-price-tracker
git pull --ff-only
printf '\nPANEL_PORT=8787\nPANEL_HOST=0.0.0.0\n' >> .env
docker compose up -d --build
docker compose logs --tail 5 tracker   # deve mostrar: painel em http://0.0.0.0:8787
```

`PANEL_HOST=0.0.0.0` vale só dentro da rede privada do container; como não há `ports:`, nada fica exposto na internet.

## 2. Descobrir o IP do container (no VPS)

```sh
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' price-tracker-tracker-1
```

## 3. Abrir o túnel (no seu computador)

Troque `IP` pelo valor acima e `VPS` pelo endereço do servidor:

```sh
ssh -N -L 8787:IP:8787 deploy@VPS
```

Abra http://localhost:8787. O IP pode mudar se o container for recriado; repita o passo 2.

## Desligar

Apague as linhas `PANEL_PORT` e `PANEL_HOST` do `.env` e rode `docker compose up -d`.
