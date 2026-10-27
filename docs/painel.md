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

## Painel fora do ar (o bloco some do Caddyfile)

**Sintoma:** o navegador mostra `ERR_SSL_PROTOCOL_ERROR`. **Causa:** o bloco `precos...` desaparece de `/home/deploy/garimpo/Caddyfile` (o deploy do garimpo regrava o arquivo inteiro). Sem o bloco o Caddy não tem certificado para o endereço e recusa o TLS. O tracker está saudável o tempo todo.

### Opções comparadas

| Opção | Resolve? | Custo |
|---|---|---|
| Arquivo separado + `import sites/*.caddy` | Só se o deploy do garimpo preservar a linha `import` e o diretório estiver montado no container. Se o garimpo regrava o Caddyfile inteiro, a linha `import` some do mesmo jeito. | Mexe no compose do garimpo (fora deste repositório) |
| Caddy próprio do tracker | Não é viável: o Let's Encrypt precisa das portas 80/443, que o Caddy do garimpo já ocupa, e este projeto não pode publicar portas. | Quebra o isolamento |
| **Recomendada: auto-reparo + alerta** | Sim, mesmo que o garimpo continue sobrescrevendo o arquivo: em até 5 minutos o bloco volta sozinho (com backup, validação e reload), e o Telegram avisa se continuar fora. | Só arquivos deste projeto + 1 linha de cron do `deploy` |
| Correção na origem | Definitiva de verdade: o deploy do garimpo deixar de apagar o bloco (ex.: versionar o bloco no Caddyfile do repositório do garimpo). | Mudança no garimpo, por decisão do dono |

A recomendada convive com a correção na origem: quando o garimpo parar de apagar o bloco, o script simplesmente não tem nada a fazer.

### Peça 1: o app avisa no Telegram

O `docker-compose.yml` define `PANEL_PUBLIC_URL`. A cada 5 minutos o app pede `/api/itens` ao endereço público; `401` (pede login) ou `200` é "no ar". Depois de **2 checagens seguidas** com falha (erro de TLS, 404, 5xx) manda uma mensagem de queda e, quando volta, outra de volta. Não usa token nem senha. Para desligar, deixe `PANEL_PUBLIC_URL` vazio no `.env`.

### Peça 2: `scripts/restaurar-painel.sh` (auto-reparo)

Se o bloco existe e o painel responde, não faz nada. Se o bloco sumiu: copia `Caddyfile.bak-restaurar-DATA`, acrescenta o bloco (sem trocar o arquivo, para não mudar o inode que o container enxerga), valida com `caddy validate`, **reverte sozinho se for inválido**, recarrega o Caddy e confere o HTTP 401. O hash da senha vem de `~/.painel-caddy-hash` ou do último `Caddyfile.bak-*` que tenha o bloco.

Instalação (VPS, usuário `deploy`):

```sh
cd ~/price-tracker-spike/amazon-price-tracker
git pull --ff-only
docker compose up -d --build

# 1. Guarde o hash da senha num arquivo só seu (só o hash, uma linha). Pegue-o do bloco atual/backup:
awk '/^precos\.143-95-214-240\.sslip\.io/ {f=1} f && /basic_?auth/ {a=1; next} f && a && NF>=2 {print $2; exit}' /home/deploy/garimpo/Caddyfile > ~/.painel-caddy-hash
# Se o bloco estiver ausente agora, use o backup mais recente que o tenha:
#   for b in $(ls -t /home/deploy/garimpo/Caddyfile.bak-*); do h=$(awk '/^precos\.143-95-214-240\.sslip\.io/ {f=1} f && /basic_?auth/ {a=1; next} f && a && NF>=2 {print $2; exit}' "$b"); [ -n "$h" ] && { echo "$h" > ~/.painel-caddy-hash; echo "de $b"; break; }; done
chmod 600 ~/.painel-caddy-hash
wc -c ~/.painel-caddy-hash        # deve ter ~60 bytes (começa com $2a$)

# 2. Teste sem alterar nada:
bash scripts/restaurar-painel.sh --dry
bash scripts/restaurar-painel.sh

# 3. Agende a cada 5 minutos (cron do usuário deploy; reversível com `crontab -e`):
crontab -l 2>/dev/null > ~/crontab.bak-painel
( crontab -l 2>/dev/null; echo '*/5 * * * * /home/deploy/price-tracker-spike/amazon-price-tracker/scripts/restaurar-painel.sh --cron >> /home/deploy/painel-restaurar.log 2>&1' ) | crontab -
crontab -l
```

Desfazer: `crontab ~/crontab.bak-painel` (ou `crontab -r` se não havia cron antes) e apague `~/.painel-caddy-hash`.

Acompanhar: `tail -20 ~/painel-restaurar.log` (o modo `--cron` só escreve quando precisa agir). Se a rede do container não alcançar o próprio IP público, a peça 1 acusa falso alarme; teste com `docker exec price-tracker-tracker-1 wget -qO- --spider https://precos.143-95-214-240.sslip.io/api/itens` (um `401` já é sucesso).

### Descobrir o que sobrescreve o Caddyfile do garimpo

Comandos só de leitura (VPS):

```sh
ls -la --time=ctime /home/deploy/garimpo/Caddyfile*
stat -c '%n %i %y' /home/deploy/garimpo/Caddyfile        # inode e data da última alteração
cd /home/deploy/garimpo && git log --oneline -5 -- Caddyfile
git -C /home/deploy/garimpo status --short | head
grep -rn "Caddyfile" /home/deploy/garimpo --include='*.sh' --include='*.yml' --include='*.yaml' --include='Makefile' 2>/dev/null | head -20
crontab -l; ls /home/deploy/garimpo/.github/workflows 2>/dev/null
```

Se aparecer um script de deploy que copia o Caddyfile do repositório, a correção na origem é colocar o bloco do painel (com o hash) no Caddyfile versionado do garimpo.

### Correção na origem (bloco em arquivo que o deploy não toca)

Evidência (VPS, 2026-10-27): o deploy do garimpo de 26/10 19:36 trocou `docker-compose.yml`, `.env` e `remote-deploy.sh`, e os backups do Caddyfile de antes do bloco e de antes de cada restauração têm o mesmo tamanho (6980 bytes): o Caddyfile do repositório do garimpo não tem o bloco e é copiado por cima a cada deploy.

Solução: o bloco fica em `~/garimpo/sites/precos.caddy` (arquivo que o deploy não copia) e o Caddyfile do repositório do garimpo só importa o diretório. Mudança no repositório do garimpo, por decisão do dono:

1. Caddyfile do garimpo, no fim do arquivo (depois de qualquer bloco de opções globais): `import /etc/caddy/sites/*.caddy`
2. `docker-compose.yml` do garimpo, serviço `caddy`, em `volumes`: `- ./sites:/etc/caddy/sites:ro`
3. No VPS, **antes** de publicar a mudança:

```sh
mkdir -p /home/deploy/garimpo/sites
awk '/^precos\.143-95-214-240\.sslip\.io/ {f=1} f {print} f && /^}/ {exit}' /home/deploy/garimpo/Caddyfile > /home/deploy/garimpo/sites/precos.caddy
cat /home/deploy/garimpo/sites/precos.caddy      # confira: abre e fecha chaves, tem o basic_auth
```

`scripts/restaurar-painel.sh` reconhece o bloco em `sites/*.caddy` quando o Caddyfile tem o `import`, então não acrescenta duplicata. Para desfazer, tire as duas linhas do repositório do garimpo e apague `sites/`.

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
