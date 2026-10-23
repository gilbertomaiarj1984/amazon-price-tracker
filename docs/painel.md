# Painel web

Painel com tudo o que o bot do Telegram faz, mais a leitura: lista de itens (mini-gráfico), histórico de 7/14/30 dias (linhas Amazon, Terceiros e Usado, com faixa cinza quando a Amazon não vendeu), tabela de ofertas da última coleta e a saúde das coletas. Lê e altera o mesmo SQLite do bot. Não faz login na Amazon.

## O que dá para fazer no site (equivale ao bot)

| No Telegram | No painel |
|---|---|
| colar um link (ou vários, até 20) | caixa **Rastrear produtos** na lista; sugere alvo −5/−10/−15% ou valor livre |
| `/lista` | a própria lista, com preço atual, alvo e mini-gráfico |
| `/historico N` | clicar no item: gráfico de 7/14/30 dias, mínimo, máximo, variação |
| `/linhas N` | **Linhas de preço**: ligar/desligar Terceiros e Usado (lê o produto na hora) |
| `/alvo N valor` | **Preço-alvo** único do item (vale para Amazon, Terceiros e Usado), com campo para salvar e botão para remover |
| `/pausar N` | **Pausar/Retomar coletas** |
| `/estrela N` | **Estrela de prioridade** (coletado primeiro em cada rodada) |
| botão **Consultar agora** (também no card do `/item N`) | Lê a Amazon na hora, só aquele item |
| `/remover N` | **Remover item** (pede confirmação) |
| botão "Silenciar 24 h" | **Silenciar alertas por 24 h** / reativar |

Os avisos de queda de preço continuam chegando só no Telegram.

### Segurança das ações

- Escrita só em `POST /api/itens` e `PUT`/`DELETE /api/itens/ASIN[/alvo|pausa|silencio|linhas]` e `POST /api/itens/ASIN/consultar`. Exige `Origin` igual ao host do painel, `Content-Type: application/json` e o cabeçalho `x-painel: 1` (um site de fora não consegue enviar isso: bloqueia CSRF). Corpo máximo de 8 KB, valores validados (alvo entre 0,01 e 1.000.000, links só da amazon.com.br).
- `/api/selo/*` segue só leitura e o token do selo não dá acesso a nenhuma rota de escrita.
- O login (basic auth) é do Caddy. Containers da rede `proxy` alcançam o painel sem login, como já era na leitura; se isso for um risco, ligue `PANEL_READONLY=1`.
- Para voltar ao painel só de leitura: `echo 'PANEL_READONLY=1' >> .env && docker compose up -d`.

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

## Importar a lista do Keepa

1. No navegador, abra https://keepa.com/manage (Manage Tracking) e use o botão de exportar (CSV). O arquivo tem só a coluna `ASIN`: não traz domínio, título nem preço-alvo.
2. No painel, card **Importar do Keepa**, escolha o arquivo. Aceita também um `.txt` com ASINs ou links da amazon.com.br (um por linha). Links de outros países são ignorados e contados.
3. O painel mostra o resumo (importados, repetidos, inválidos, outros países). Máximo de 200 itens por importação; arquivo até 6000 caracteres.

Os itens entram **sem alvo** e sem ler a Amazon na hora (68 leituras seguidas dariam captcha). O título e o preço aparecem nas próximas rodadas, que já espaçam as requisições. Como o Keepa não informa o domínio, o painel assume amazon.com.br; ASINs que não existirem lá falham na coleta e você pode removê-los. Nenhum login nem chave do Keepa é usado.

## Cards com foto

A lista de itens é uma grade de cards: foto, título, preço atual da Amazon, alvo, mínimo de 30 dias, variação, mini-gráfico e etiquetas (pausado, silenciado, falha, dentro do alvo). A foto é lida da página do produto na coleta e só carrega dos hosts de imagem da Amazon (`m.media-amazon.com`, `images-na.ssl-images-amazon.com`, liberados na CSP). Itens recém-importados mostram um ícone até a primeira coleta.

## Consultar agora

Botão por item (detalhe do painel e card do `/item N` no Telegram). Usa o mesmo caminho da rodada agendada: mesma fila (nunca duas leituras ao mesmo tempo; se a rodada estiver rodando, espera a vez), mesma detecção de bloqueio/captcha, grava histórico e dispara alertas. Cada item só pode ser consultado de novo após 5 minutos (o botão mostra o tempo restante; falha também conta). Some com `PANEL_READONLY=1`.

## Grupos de itens similares

Na Amazon o mesmo produto costuma ter vários cadastros (edições, cores, anúncios duplicados). Para ver todos juntos:

1. Abra um item e, no campo **Grupo**, escolha **+ Novo grupo…** (ou um grupo que já existe). Um item fica em no máximo um grupo.
2. Clique em **Ver grupo** para comparar: tabela com preço atual, diferença para o menor, alvo, mínimo e máximo de cada item, e um gráfico com uma linha por item.
3. No filtro da lista há o seletor **Todos os grupos / Sem grupo / cada grupo**.

Apagar um grupo não apaga os itens. O alvo continua sendo por item. As escritas seguem atrás do login e respeitam `PANEL_READONLY=1`. O banco migra sozinho (nova tabela `grupos` e coluna `products.grupo_id`), sem mexer no histórico.

Atalho: ao buscar (ex.: `random access`) e a lista mostrar 2 ou mais itens, aparece **Agrupar os N itens desta busca**; ele cria o grupo e coloca todos de uma vez.

**Arrastar e soltar** (no computador): arraste um item sobre outro e solte para agrupar os dois (o painel sugere um nome pelas palavras em comum dos títulos, que você pode editar). Solte um item sobre um grupo para colocá-lo nele, ou sobre "Sem grupo" para tirá-lo. Itens agrupados aparecem como **um só cartão** na lista; clique nele para ver o grupo e abrir os itens. Em celular o arrastar não funciona: use o campo Grupo do item. Renomear: botão Renomear na visão do grupo.

Ao arrastar, a página rola sozinha para cima ou para baixo quando o item chega perto da borda da janela.
