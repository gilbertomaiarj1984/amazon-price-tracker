# Painel web

Painel somente leitura com a lista de itens (mini-gráfico), histórico de 7/14/30 dias (linhas Amazon, Terceiros e Usado, com faixa cinza quando a Amazon não vendeu), tabela de ofertas da última coleta e a saúde das coletas. Lê o mesmo SQLite do bot. Não faz login na Amazon, não altera nada e aceita só `GET`.

## Como está publicado

Igual ao AgendaBoa e ao pdf-unite: o container entra na rede Docker externa `proxy` e **não publica porta**. O Caddy do projeto `garimpo` (`garimpo-caddy-1`) faz o TLS e o login (basic auth) e repassa para `tracker:8787`. Endereço: https://precos.143-95-214-240.sslip.io (o nome resolve sozinho para o IP do VPS, sem DNS).

O `docker-compose.yml` já define `PANEL_PORT=8787` e `PANEL_HOST=0.0.0.0`. Sem o login do Caddy o painel ficaria aberto, então **não publique o domínio antes do passo 2**.

## 1. Atualizar o rastreador (VPS, usuário `deploy`)

```sh
cd ~/price-tracker-spike/amazon-price-tracker
git pull --ff-only
docker compose up -d --build
docker compose logs --tail 5 tracker   # deve mostrar: painel em http://0.0.0.0:8787
docker network inspect proxy --format '{{range .Containers}}{{.Name}} {{end}}'   # deve listar price-tracker-tracker-1
```

## 2. Login e bloco no Caddy (VPS)

Gere o hash da senha (digite a senha quando pedir; guarde-a fora do repositório):

```sh
docker run --rm -it caddy:2-alpine caddy hash-password
```

Edite o Caddyfile do garimpo e acrescente no fim, trocando `HASH_AQUI` pelo hash gerado (o usuário é `giba`; mude se quiser):

```sh
nano /home/deploy/garimpo/Caddyfile
```

```caddyfile
# Rastreador de preços (projeto price-tracker; rede externa proxy)
precos.143-95-214-240.sslip.io {
        header {
                Strict-Transport-Security "max-age=31536000"
                X-Content-Type-Options "nosniff"
                Referrer-Policy "no-referrer"
                -Server
        }
        basic_auth {
                giba HASH_AQUI
        }
        reverse_proxy tracker:8787
}
```

Valide e recarregue só o Caddy, sem derrubar nada:

```sh
docker exec garimpo-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec garimpo-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Abra https://precos.143-95-214-240.sslip.io; o navegador pede usuário e senha. Teste também sem login: `curl -sI https://precos.143-95-214-240.sslip.io/api/itens` deve responder `401`.

Obs.: dentro da rede `proxy` o nome `tracker` pode colidir com outro container. Se o Caddy não achar o painel, use `price-tracker-tracker-1:8787` no `reverse_proxy`.

## Desligar

Remova o bloco do Caddyfile e recarregue o Caddy. Para tirar o painel do rastreador, apague as duas linhas `PANEL_*` do `docker-compose.yml` e rode `docker compose up -d`.

## Acesso sem Caddy (alternativa)

Sem passar pelo proxy dá para abrir por túnel SSH até o IP do container: `docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' price-tracker-tracker-1`, depois `ssh -N -L 8787:IP:8787 deploy@VPS` e http://localhost:8787 (use o IP da rede `price-tracker_default`).
