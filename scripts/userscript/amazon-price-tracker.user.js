// ==UserScript==
// @name         Rastreador de preços
// @namespace    price-tracker-local
// @version      3.1.0
// @description  Botão "Rastrear" na página do produto e seleção de vários itens na busca. Janela com preços, gráfico e alvo editável (com token); copia links para o bot do Telegram.
// @match        https://www.amazon.com.br/*
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      precos.143-95-214-240.sslip.io
// @run-at       document-idle
// ==/UserScript==

// Copia links limpos (https://www.amazon.com.br/dp/ASIN) para o bot cadastrar.
// Janela de detalhes (opcional): consulta GET /api/us/ASIN e permite definir o alvo e rastrear (PUT/POST),
// com o USERSCRIPT_TOKEN guardado no armazenamento do Tampermonkey (menu do script). Sem ele, cai no selo
// somente leitura (/api/selo, PANEL_TOKEN) ou só copia links. Nenhum segredo fica neste arquivo.

(function () {
  "use strict";

  const ASIN_RE = /(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/)([A-Z0-9]{10})(?![A-Z0-9])/i;
  const MAX = 20;

  function asinFromPath(path) {
    const m = ASIN_RE.exec(path);
    return m ? m[1].toUpperCase() : null;
  }
  const linkFor = (asin) => "https://www.amazon.com.br/dp/" + asin;
  const isProductPath = (path) => asinFromPath(path) !== null;
  const isSearchPath = (path) => path === "/s" || path.startsWith("/s/");
  function uniqueAsins(list) {
    return [...new Set(list.filter(Boolean).map((a) => String(a).toUpperCase()))].filter((a) => /^[A-Z0-9]{10}$/.test(a)).slice(0, MAX);
  }

  const VERDE = "#1b7f3b", LARANJA = "#b8651b", VERMELHO = "#c0392b";
  const brl = (n) => "R$ " + n.toFixed(2).replace(".", ",");
  const VEREDITOS = {
    minimo: ["#1b7f3b", "No menor preço de 30 dias"],
    bom: ["#2e8b57", "Abaixo da média de 30 dias"],
    acima: ["#b8651b", "Acima da média de 30 dias"],
    sem_dados: ["#5b6670", "Histórico ainda curto"],
  };
  /** Texto e cor do selo a partir da resposta do painel. */
  function seloView(s) {
    if (!s || s.rastreado === false) return { cor: "#5b6670", linhas: ["Não rastreado ainda", "Clique em Rastrear este produto"] };
    const [cor, titulo] = VEREDITOS[s.veredito] || VEREDITOS.sem_dados;
    const linhas = [titulo];
    if (s.min != null && s.max != null) linhas.push(`Mín ${brl(s.min)} · Máx ${brl(s.max)}` + (s.media != null ? ` · Média ${brl(s.media)}` : ""));
    if (s.atual != null && s.atual === s.min && s.veredito !== "minimo") linhas.push("Preço atual é o mínimo registrado");
    return { cor, linhas };
  }

  /** Pontos do gráfico (coordenadas SVG) para uma série [{t, v}]; eixo Y com folga para não colar nas bordas. */
  function chartGeometry(serie, w, h, pad) {
    const pts = (serie || []).filter((p) => p && Number.isFinite(p.v) && !Number.isNaN(Date.parse(p.t)));
    if (!pts.length) return null;
    const ts = pts.map((p) => Date.parse(p.t));
    const vs = pts.map((p) => p.v);
    const t0 = Math.min(...ts), t1 = Math.max(...ts);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    const span = hi - lo || Math.max(hi * 0.05, 1);
    const yMin = lo - span * 0.1, yMax = hi + span * 0.1;
    const x = (t) => (t1 === t0 ? w / 2 : pad + ((t - t0) / (t1 - t0)) * (w - 2 * pad));
    const y = (v) => pad + (1 - (v - yMin) / (yMax - yMin)) * (h - 2 * pad);
    const xy = pts.map((p, i) => [x(ts[i]), y(p.v)]);
    return { xy, line: xy.map(([a, b]) => a.toFixed(1) + "," + b.toFixed(1)).join(" "), lo, hi, t0, t1, yOf: y };
  }
  const dia = (ms) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  const LIMITE_LARANJA = 20; // % acima do alvo; mesma regra do painel
  /** Situação do preço atual frente ao alvo: verde (dentro), laranja (até 20% acima), vermelho (mais). */
  function alvoStatus(atual, alvo) {
    if (alvo == null || atual == null || !(alvo > 0)) return null;
    const p = ((atual - alvo) / alvo) * 100;
    const f = (n) => Math.abs(n).toFixed(1).replace(".", ",");
    if (p <= 0) return { k: "dentro", cor: VERDE, texto: p === 0 ? "No alvo" : `▼ ${f(p)}% abaixo do alvo`, pct: p };
    return { k: p > LIMITE_LARANJA ? "longe" : "perto", cor: p > LIMITE_LARANJA ? VERMELHO : LARANJA, texto: `▲ ${f(p)}% acima do alvo`, pct: p };
  }

  /** Valor digitado: "449", "449,90", "1.299,90", "R$ 199", "449.90". Null se inválido. */
  function parseValor(input) {
    let s = String(input).replace(/R\$|\s/g, "");
    if (!/^[\d.,]+$/.test(s)) return null;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const v = Number(s);
    return Number.isFinite(v) && v > 0 && v <= 1000000 ? Math.round(v * 100) / 100 : null;
  }

  /** "há 5 min", "há 3 h", "há 2 dias". */
  function quando(iso, agora) {
    const t = Date.parse(iso || "");
    if (Number.isNaN(t)) return "";
    const m = Math.max(0, Math.round((agora - t) / 60000));
    if (m < 1) return "agora";
    if (m < 60) return `há ${m} min`;
    if (m < 1440) return `há ${Math.round(m / 60)} h`;
    const d = Math.round(m / 1440);
    return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  }

  const core = { alvoStatus, parseValor, quando, asinFromPath, linkFor, isProductPath, isSearchPath, uniqueAsins, seloView, chartGeometry, MAX };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = core;
    return;
  }

  function copy(text) {
    if (typeof GM_setClipboard === "function") GM_setClipboard(text, "text");
    else if (navigator.clipboard) navigator.clipboard.writeText(text);
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = "position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:#1d2329;color:#fff;padding:10px 16px;border-radius:8px;z-index:2147483647;font:14px system-ui";
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function floatingButton(label, onClick) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483646;padding:10px 16px;border:0;border-radius:22px;background:#1d6fd6;color:#fff;font:600 14px system-ui;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)";
    b.addEventListener("click", onClick);
    document.body.appendChild(b);
    return b;
  }

  const PANEL_URL = "https://precos.143-95-214-240.sslip.io";
  const getCfg = (k) => (typeof GM_getValue === "function" ? GM_getValue(k, "") : "");

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("Definir token do rastreador (alvo e detalhes)", () => {
      const v = prompt("Cole o USERSCRIPT_TOKEN (fica só neste navegador). Vazio apaga:", getCfg("usToken"));
      if (v === null) return;
      GM_setValue("usToken", v.trim());
      toast(v.trim() ? "Token salvo. Recarregue a página." : "Token apagado.");
    });
    GM_registerMenuCommand("Definir token do selo de histórico (somente leitura)", () => {
      const v = prompt("Cole o PANEL_TOKEN (fica só neste navegador). Vazio apaga:", getCfg("token"));
      if (v === null) return;
      GM_setValue("token", v.trim());
      toast(v.trim() ? "Token salvo. Recarregue a página." : "Token apagado.");
    });
  }

  const SVGNS = "http://www.w3.org/2000/svg";
  const svgEl = (name, attrs) => {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };

  function drawChart(serie, cor) {
    const W = 280, H = 110, PAD = 8;
    const g = chartGeometry(serie, W, H, PAD);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", height: String(H) });
    svg.style.cssText = "display:block;background:#f6f8fa;border-radius:6px";
    if (!g) return svg;
    svg.appendChild(svgEl("polyline", { points: g.line, fill: "none", stroke: cor, "stroke-width": "2", "stroke-linejoin": "round" }));
    const last = g.xy[g.xy.length - 1];
    svg.appendChild(svgEl("circle", { cx: last[0], cy: last[1], r: "3.5", fill: cor }));
    const tip = document.createElementNS(SVGNS, "title");
    tip.textContent = g.xy.length + " coletas";
    svg.appendChild(tip);
    return svg;
  }

  const LINHAS = [["amazon", "Amazon"], ["terceiros", "Terceiros"], ["usado", "Usado"]];

  const el = (tag, css, text) => {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  };

  /** Janela flutuante: arrastável pelo título, minimiza para uma pílula, lembra o estado.
   *  `api` = { salvarAlvo(valor|null) => Promise, rastrear() => Promise } quando há token de escrita; senão null. */
  function openWindow(data, api, onData) {
    const old = document.getElementById("pt-win");
    if (old) old.remove();
    const rastreado = data && data.rastreado !== false;
    const v = seloView(data);
    const alvoAmazon = rastreado ? (data.alvo != null ? data.alvo : null) : null;
    const st = rastreado ? alvoStatus(data.menor != null ? data.menor : data.atual, alvoAmazon) : null;
    const cor = st ? st.cor : v.cor;
    const win = el("div", "position:fixed;right:16px;bottom:64px;z-index:2147483646;width:300px;border-radius:10px;background:#fff;color:#1d2329;font:13px/1.4 system-ui;box-shadow:0 4px 18px rgba(0,0,0,.35);overflow:hidden");
    win.id = "pt-win";
    if (st) win.style.border = `3px solid ${cor}`;
    const bar = el("div", `display:flex;align-items:center;gap:8px;padding:8px 10px;background:${cor};color:#fff;cursor:move;user-select:none`);
    const title = el("div", "flex:1;font-weight:600", (rastreado && data.estrela ? "★ " : "") + (st ? st.texto : v.linhas[0]));
    const min = el("button", "border:0;background:transparent;color:#fff;font:700 16px system-ui;cursor:pointer;padding:0 4px");
    bar.append(title, min);
    const body = el("div", "padding:10px");
    if (rastreado) {
      if (data.atual != null) body.appendChild(el("div", "font:700 20px system-ui;margin-bottom:2px", brl(data.atual)));
      body.appendChild(el("div", `color:${cor};font-weight:600;margin-bottom:6px`, v.linhas[0]));
      body.appendChild(drawChart(data.serie, v.cor));
      const g = chartGeometry(data.serie, 280, 110, 8);
      if (g) {
        const ax = el("div", "display:flex;justify-content:space-between;color:#5b6670;font-size:11px;margin:2px 0 6px");
        ax.append(el("span", "", dia(g.t0)), el("span", "", dia(g.t1)));
        body.appendChild(ax);
      }
      if (data.linhas) {
        const tb = el("div", "display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:6px 0");
        for (const [k, nome] of LINHAS) {
          const l = data.linhas[k];
          if (!l || !l.ligada) continue;
          tb.appendChild(el("div", "color:#5b6670", nome));
          tb.appendChild(el("div", "text-align:right", l.atual != null ? brl(l.atual) + (l.vendedor && k !== "amazon" ? ` · ${l.vendedor}` : "") : "sem oferta"));
        }
        body.appendChild(tb);
      }
      for (const t of v.linhas.slice(1)) body.appendChild(el("div", "", t));
      if (data.grupo) body.appendChild(el("div", "color:#5b6670;font-size:11px;margin-top:4px", "Grupo: " + data.grupo.nome));
      const info = [];
      if (data.num != null) info.push("#" + data.num);
      if (data.coletas != null) info.push(`${data.coletas} coletas em 30 dias`);
      const q = quando(data.ultimaColeta && data.ultimaColeta.em ? data.ultimaColeta.em : data.atualizadoEm, Date.now());
      if (q) info.push("atualizado " + q);
      if (info.length) body.appendChild(el("div", "color:#5b6670;font-size:11px;margin-top:4px", info.join(" · ")));
      if (data.pausado) body.appendChild(el("div", "color:#b8651b;font-size:11px", "Item pausado no painel"));
    } else {
      for (const t of v.linhas) body.appendChild(el("div", "", t));
    }
    // Alvo e rastrear (só com token de escrita)
    if (api) {
      const msg = el("div", "font-size:11px;margin-top:4px;min-height:14px;color:#5b6670");
      const run = async (fn) => {
        try { msg.textContent = "Salvando…"; const nd = await fn(); onData(nd); } catch (e) { msg.style.color = VERMELHO; msg.textContent = String((e && e.message) || e); }
      };
      if (rastreado) {
        const row = el("div", "display:flex;gap:6px;margin-top:8px;align-items:center");
        row.appendChild(el("span", "color:#5b6670", "Alvo R$"));
        const inp = el("input", "flex:1;min-width:0;padding:4px 6px;border:1px solid #c5ccd3;border-radius:6px;font:13px system-ui");
        inp.type = "text";
        inp.inputMode = "decimal";
        inp.placeholder = "ex.: 149,90";
        if (alvoAmazon != null) inp.value = String(alvoAmazon).replace(".", ",");
        const ok = el("button", "border:0;border-radius:6px;background:#1d6fd6;color:#fff;padding:5px 10px;font:600 12px system-ui;cursor:pointer", "Salvar");
        const salvar = () => {
          const n = parseValor(inp.value);
          if (inp.value.trim() === "") return run(() => api.salvarAlvo(null));
          if (n == null) { msg.style.color = VERMELHO; msg.textContent = "Valor inválido."; return; }
          return run(() => api.salvarAlvo(n));
        };
        ok.addEventListener("click", salvar);
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") salvar(); });
        row.append(inp, ok);
        body.append(row);
        if (alvoAmazon != null) {
          const clr = el("button", "border:0;background:transparent;color:#1d6fd6;font:12px system-ui;cursor:pointer;padding:2px 0;margin-top:2px", "Remover alvo");
          clr.addEventListener("click", () => run(() => api.salvarAlvo(null)));
          body.append(clr);
        }
      } else {
        const b = el("button", "width:100%;margin-top:8px;border:0;border-radius:6px;background:#1d6fd6;color:#fff;padding:8px;font:600 13px system-ui;cursor:pointer", "Rastrear este produto");
        b.addEventListener("click", () => { b.disabled = true; run(() => api.rastrear()); });
        body.append(b);
      }
      body.append(msg);
    }
    const setMin = (m) => {
      body.style.display = m ? "none" : "block";
      min.textContent = m ? "▢" : "–";
      min.title = m ? "Expandir" : "Minimizar";
      win.style.width = m ? "auto" : "300px";
      try { if (typeof GM_setValue === "function") GM_setValue("minimizado", m); } catch {}
    };
    let minimized = typeof GM_getValue === "function" && GM_getValue("minimizado", false) === true;
    min.addEventListener("click", (e) => { e.stopPropagation(); minimized = !minimized; setMin(minimized); });
    let drag = null;
    bar.addEventListener("pointerdown", (e) => {
      if (e.target === min) return;
      const r = win.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const x = Math.min(Math.max(0, e.clientX - drag.dx), innerWidth - 60);
      const y = Math.min(Math.max(0, e.clientY - drag.dy), innerHeight - 30);
      win.style.left = x + "px"; win.style.top = y + "px"; win.style.right = "auto"; win.style.bottom = "auto";
    });
    bar.addEventListener("pointerup", () => { drag = null; });
    win.append(bar, body);
    document.body.appendChild(win);
    setMin(minimized);
  }

  /** Chamada à API do painel; resolve com o JSON e rejeita com uma mensagem legível. */
  function chamar(method, path, token, header, body) {
    return new Promise((resolve, reject) => {
      const headers = { [header]: token };
      if (body !== undefined) { headers["content-type"] = "application/json"; headers["x-us"] = "1"; }
      GM_xmlhttpRequest({
        method,
        url: PANEL_URL + path,
        headers,
        data: body !== undefined ? JSON.stringify(body) : undefined,
        timeout: 60000,
        onerror: () => reject(new Error("Sem conexão com o painel.")),
        ontimeout: () => reject(new Error("O painel demorou a responder.")),
        onload: (r) => {
          let j = null;
          try { j = JSON.parse(r.responseText); } catch {}
          if (r.status === 401) {
            const caddy = /www-authenticate/i.test(r.responseHeaders || "") || !j;
            return reject(new Error(caddy ? "O Caddy ainda pede senha neste caminho: ajuste a linha @selo do Caddyfile (docs/userscript.md)." : "Token recusado pelo app: confira o valor no menu do Tampermonkey."));
          }
          if (r.status === 429) return reject(new Error("Muitas tentativas. Espere um pouco."));
          if (r.status === 200 || (r.status === 404 && j && j.rastreado === false)) return resolve(j);
          reject(new Error((j && j.erro) || `Erro ${r.status}`));
        },
      });
    });
  }

  function showItem(asin) {
    const usToken = getCfg("usToken");
    const seloToken = getCfg("token");
    if (typeof GM_xmlhttpRequest !== "function") return false;
    if (usToken) {
      const path = "/api/us/" + asin;
      let writable = false;
      const draw = (data) => {
        writable = data && data.edicao !== false;
        const api = writable
          ? {
              salvarAlvo: (valor) => chamar("PUT", path + "/alvo", usToken, "x-us-token", { valor }),
              rastrear: () => chamar("POST", path + "/rastrear", usToken, "x-us-token", {}),
            }
          : null;
        openWindow(data, api, draw);
      };
      chamar("GET", path, usToken, "x-us-token").then(draw, (e) => toast("Rastreador: " + e.message));
      return true;
    }
    if (seloToken) {
      chamar("GET", "/api/selo/" + asin, seloToken, "x-selo-token").then((d) => openWindow(d, null, () => {}), (e) => toast("Selo: " + e.message));
    }
    return false;
  }

  function setupProduct() {
    const asin = asinFromPath(location.pathname);
    if (!asin) return;
    const hasWindow = showItem(asin);
    if (!hasWindow) {
      floatingButton("Rastrear este produto", () => {
        copy(linkFor(asin));
        toast("Link copiado. Cole no chat do bot do Telegram.");
      });
    }
  }

  function setupSearch() {
    const cards = [...document.querySelectorAll('[data-component-type="s-search-result"][data-asin]')].filter((c) => /^[A-Z0-9]{10}$/i.test(c.dataset.asin));
    if (!cards.length) return;
    const chosen = new Set();
    let btn;
    const refresh = () => {
      btn.textContent = chosen.size ? `Copiar ${chosen.size} link(s) para rastrear` : "Marque itens para rastrear";
      btn.style.opacity = chosen.size ? "1" : ".7";
    };
    for (const c of cards) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.title = "Rastrear este item";
      cb.style.cssText = "position:absolute;top:6px;left:6px;width:20px;height:20px;z-index:5;cursor:pointer";
      cb.addEventListener("change", () => {
        if (cb.checked && chosen.size >= MAX) {
          cb.checked = false;
          toast(`Máximo de ${MAX} itens por vez.`);
          return;
        }
        cb.checked ? chosen.add(c.dataset.asin) : chosen.delete(c.dataset.asin);
        refresh();
      });
      if (getComputedStyle(c).position === "static") c.style.position = "relative";
      c.appendChild(cb);
    }
    btn = floatingButton("", () => {
      const asins = uniqueAsins([...chosen]);
      if (!asins.length) return toast("Marque pelo menos um item.");
      copy(asins.map(linkFor).join("\n"));
      toast(`${asins.length} link(s) copiado(s). Cole no chat do bot do Telegram.`);
    });
    refresh();
  }

  if (isProductPath(location.pathname)) setupProduct();
  else if (isSearchPath(location.pathname)) setupSearch();
})();
