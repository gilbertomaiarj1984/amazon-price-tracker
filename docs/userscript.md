# Userscript do Tampermonkey

Adiciona na Amazon Brasil: botão **Rastrear este produto** na página do produto e caixas de seleção nos resultados da busca (até 20 itens). O script **só copia links** para a área de transferência; você cola no chat do seu bot do Telegram e o bot cadastra. Não usa rede, token nem login, então não precisa abrir nenhuma porta no servidor.

## Instalar

1. Instale a extensão Tampermonkey no navegador (https://www.tampermonkey.net).
2. Abra o arquivo bruto do script no GitHub:
   https://raw.githubusercontent.com/gilbertomaiarj1984/amazon-price-tracker/main/scripts/userscript/amazon-price-tracker.user.js
   O Tampermonkey mostra a tela de instalação; clique em **Instalar**.
   (Alternativa: Tampermonkey > Criar novo script, apague o conteúdo, cole o arquivo e salve com Ctrl+S.)

## Usar

- **Produto:** abra a página, clique em *Rastrear este produto*, abra o chat do bot e cole (Ctrl+V).
- **Busca:** marque os itens, clique em *Copiar N link(s) para rastrear*, cole no chat do bot. Vários links na mesma mensagem são cadastrados de uma vez, sem perguntar alvo; depois use `/alvo N valor`.

## Atualizar o bot no VPS (necessário para colar vários links)

```sh
cd ~/price-tracker-spike/amazon-price-tracker
git pull --ff-only
docker compose up -d --build
docker compose logs --tail 5 tracker
```

## Desinstalar

Tampermonkey > painel > lixeira ao lado do script.
