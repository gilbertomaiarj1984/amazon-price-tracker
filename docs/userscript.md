# Userscript do Tampermonkey

Adiciona na Amazon Brasil: botão **Rastrear este produto** na página do produto e caixas de seleção nos resultados da busca (até 20 itens). O script **só copia links** para a área de transferência; você cola no chat do seu bot do Telegram e o bot cadastra. As funções de copiar não usam rede. O **selo de histórico** (v2, opcional) consulta só `GET /api/selo/ASIN` do painel com um token somente de leitura; sem o token configurado o script não faz nenhuma requisição.

## Instalar

1. Instale a extensão Tampermonkey no navegador (https://www.tampermonkey.net).
2. Abra o arquivo bruto do script no GitHub:
   https://raw.githubusercontent.com/gilbertomaiarj1984/amazon-price-tracker/main/scripts/userscript/amazon-price-tracker.user.js
   O Tampermonkey mostra a tela de instalação; clique em **Instalar**.
   (Alternativa: Tampermonkey > Criar novo script, apague o conteúdo, cole o arquivo e salve com Ctrl+S.)

## Usar

- **Produto:** abra a página, clique em *Rastrear este produto*, abra o chat do bot e cole (Ctrl+V).
- **Busca:** marque os itens, clique em *Copiar N link(s) para rastrear*, cole no chat do bot. Vários links na mesma mensagem são cadastrados de uma vez, sem perguntar alvo; depois use `/alvo N valor`.

## Selo de histórico (v2)

Na página de um produto já rastreado aparece um selo com o veredito (menor preço de 30 dias, abaixo ou acima da média), mínimo, máximo e média. O endpoint devolve só esses números: nada de ofertas, vendedores, alvos ou configuração, e a senha do painel não é usada.

### 1. Gerar o token e ligar no VPS (usuário `deploy`)

```sh
cd ~/price-tracker-spike/amazon-price-tracker
git pull --ff-only
TOKEN=$(openssl rand -hex 24); echo "PANEL_TOKEN=$TOKEN" >> .env; echo "$TOKEN"   # copie o token impresso
chmod 600 .env
docker compose up -d --build
docker compose logs --tail 5 tracker
```

### 2. Liberar só esse caminho no Caddy (você edita; a thread não mexe no Caddyfile)

O Caddy pede senha em tudo; o userscript não consegue enviá-la, então o caminho `/api/selo/*` precisa passar sem basic auth (o token do painel é quem protege). No `/home/deploy/garimpo/Caddyfile`, dentro do bloco `precos.143-95-214-240.sslip.io`, troque o `basic_auth { ... }` e o `reverse_proxy` por:

```caddyfile
        @selo path /api/selo/*
        handle @selo {
                reverse_proxy tracker:8787
        }
        handle {
                basic_auth {
                        giba HASH_JA_EXISTENTE
                }
                reverse_proxy tracker:8787
        }
```

(mantenha o bloco `header { ... }` como está e reaproveite o hash que já está no arquivo). Depois:

```sh
docker exec garimpo-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec garimpo-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Testes (devem dar 401 nos dois primeiros e 200 ou 404 no terceiro):

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://precos.143-95-214-240.sslip.io/api/itens
curl -s -o /dev/null -w '%{http_code}\n' https://precos.143-95-214-240.sslip.io/api/selo/B097BYXGXN
curl -s -w '\n%{http_code}\n' -H "x-selo-token: SEU_TOKEN" https://precos.143-95-214-240.sslip.io/api/selo/B097BYXGXN
```

### 3. Atualizar o userscript e informar o token

Abra de novo o link bruto do script (seção Instalar) e clique em **Atualizar**. Na página de um produto, Tampermonkey (ícone) > *Rastreador de preços* > **Definir token do selo de histórico**, cole o token e recarregue a página. O token fica só no armazenamento do Tampermonkey. Para revogar: troque o `PANEL_TOKEN` no `.env` e rode `docker compose up -d`.

## Atualizar o bot no VPS (necessário para colar vários links)

```sh
cd ~/price-tracker-spike/amazon-price-tracker
git pull --ff-only
docker compose up -d --build
docker compose logs --tail 5 tracker
```

## Desinstalar

Tampermonkey > painel > lixeira ao lado do script.
