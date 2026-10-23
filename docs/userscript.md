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

Na página de um produto já rastreado aparece uma janela flutuante com o preço atual, o gráfico dos últimos 30 dias, o veredito (menor preço, abaixo ou acima da média), mínimo, máximo e média. Arraste pelo título; o botão – minimiza (o estado é lembrado). O endpoint devolve só esses números: nada de ofertas, vendedores, alvos ou configuração, e a senha do painel não é usada.

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

## Alvo e detalhes na janela (v3)

Com um segundo token (`USERSCRIPT_TOKEN`) a janela da página do produto passa a mostrar o mesmo que o painel e deixa **definir o alvo** e **rastrear** o item sem sair da Amazon:

- borda e título coloridos pelo alvo (verde: dentro; laranja: até 20% acima; vermelho: mais de 20% acima), estrela, grupo e número do item;
- preço por linha (Amazon, Terceiros e Usado, só as ligadas), gráfico de 30 dias, mínimo, máximo e média;
- "atualizado há N min" (última coleta);
- campo **Alvo R$** com *Salvar* (Enter também salva) e *Remover alvo*; item não rastreado ganha o botão **Rastrear este produto**.

### Como a escrita foi protegida

O Caddy exige senha em tudo, e o Tampermonkey não envia essa senha; por isso `/api/us/*` precisa ficar fora do basic auth. Para isso não virar uma porta aberta:

- **Token próprio**: `USERSCRIPT_TOKEN` (24+ caracteres), diferente do `PANEL_TOKEN` do selo e da senha do painel. O app recusa iniciar se forem iguais. Sem o token no `.env`, `/api/us/*` responde 404.
- **Só 3 operações**: `GET /api/us/ASIN` (ver), `PUT /api/us/ASIN/alvo` (alvo) e `POST /api/us/ASIN/rastrear` (cadastrar). Não dá para pausar, remover, mexer em grupos nem importar.
- **Sem CORS**: a API não envia nenhum cabeçalho `Access-Control-*`; uma página web comum não consegue chamá-la. O Tampermonkey usa `GM_xmlhttpRequest`, que não depende de CORS. Escritas ainda exigem `Content-Type: application/json` e o cabeçalho `x-us: 1`.
- **Limites**: 10 tokens errados por minuto (depois, 429 para todos por um minuto), 30 escritas por minuto e 10 cadastros a cada 10 minutos (cada cadastro lê a Amazon).
- **Revogação**: troque o `USERSCRIPT_TOKEN` no `.env` e rode `docker compose up -d`. `PANEL_READONLY=1` também bloqueia a escrita (a janela só mostra).
- O token fica só no armazenamento do Tampermonkey; nunca cole no chat.

### Passo a passo

**1. VPS (usuário `deploy`): gerar o token e subir**

```sh
cd ~/price-tracker-spike/amazon-price-tracker
git pull --ff-only
TOKEN=$(openssl rand -hex 24); echo "USERSCRIPT_TOKEN=$TOKEN" >> .env; echo "$TOKEN"   # copie o token impresso
chmod 600 .env
docker compose up -d --build
docker compose logs --tail 5 tracker
```

**2. Caddy (você edita; a thread não mexe no Caddyfile).** No bloco `precos.143-95-214-240.sslip.io` de `/home/deploy/garimpo/Caddyfile`, troque a linha `@selo path /api/selo/*` por:

```caddyfile
        @selo path /api/selo/* /api/us/*
```

(o resto do bloco continua igual). Depois:

```sh
docker exec garimpo-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec garimpo-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Testes (401, 401 e 200 ou 404; troque SEU_TOKEN):

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://precos.143-95-214-240.sslip.io/api/itens
curl -s -o /dev/null -w '%{http_code}\n' https://precos.143-95-214-240.sslip.io/api/us/B097BYXGXN
curl -s -w '\n%{http_code}\n' -H "x-us-token: SEU_TOKEN" https://precos.143-95-214-240.sslip.io/api/us/B097BYXGXN
```

**3. Tampermonkey**

1. Abra o link bruto do script (seção Instalar) e clique em **Atualizar** (versão 3.0.0).
2. Abra uma página de produto da Amazon, clique no ícone do Tampermonkey > *Rastreador de preços* > **Definir token do rastreador (alvo e detalhes)**, cole o `USERSCRIPT_TOKEN` e recarregue a página.
3. Na janela, digite o alvo (ex.: `149,90`) e clique em **Salvar**.

Sem o token do rastreador, o script continua funcionando como antes (selo somente leitura ou copiar link).

## Atualizar o bot no VPS (necessário para colar vários links)

```sh
cd ~/price-tracker-spike/amazon-price-tracker
git pull --ff-only
docker compose up -d --build
docker compose logs --tail 5 tracker
```

## Desinstalar

Tampermonkey > painel > lixeira ao lado do script.
