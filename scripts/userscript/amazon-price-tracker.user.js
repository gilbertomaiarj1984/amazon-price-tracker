// ==UserScript==
// @name         Rastreador de preços: copiar links
// @namespace    price-tracker-local
// @version      2.1.0
// @description  Botão "Rastrear" na página do produto e seleção de vários itens na busca. Copia os links para colar no bot do Telegram.
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
// Selo de histórico (opcional): só consulta GET /api/selo/ASIN do painel, com um token só de
// leitura guardado no armazenamento do Tampermonkey (menu do script). Nenhum segredo fica neste arquivo.

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

  const core = { asinFromPath, linkFor, isProductPath, isSearchPath, uniqueAsins, seloView, chartGeometry, MAX };
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
    GM_registerMenuCommand("Definir token do selo de histórico", () => {
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

  /** Janela flutuante: arrastável pelo título, minimiza para uma pílula, lembra o estado. */
  function openWindow(data) {
    const v = seloView(data);
    const win = document.createElement("div");
    win.style.cssText = "position:fixed;right:16px;bottom:64px;z-index:2147483646;width:300px;border-radius:10px;background:#fff;color:#1d2329;font:13px/1.4 system-ui;box-shadow:0 4px 18px rgba(0,0,0,.35);overflow:hidden";
    const bar = document.createElement("div");
    bar.style.cssText = `display:flex;align-items:center;gap:8px;padding:8px 10px;background:${v.cor};color:#fff;cursor:move;user-select:none`;
    const title = document.createElement("div");
    title.style.cssText = "flex:1;font-weight:600";
    title.textContent = v.linhas[0];
    const min = document.createElement("button");
    min.style.cssText = "border:0;background:transparent;color:#fff;font:700 16px system-ui;cursor:pointer;padding:0 4px";
    bar.append(title, min);
    const body = document.createElement("div");
    body.style.cssText = "padding:10px";
    if (data && data.rastreado !== false) {
      if (data.atual != null) {
        const p = document.createElement("div");
        p.style.cssText = "font:700 20px system-ui;margin-bottom:6px";
        p.textContent = brl(data.atual);
        body.appendChild(p);
      }
      body.appendChild(drawChart(data.serie, v.cor));
      const g = chartGeometry(data.serie, 280, 110, 8);
      if (g) {
        const ax = document.createElement("div");
        ax.style.cssText = "display:flex;justify-content:space-between;color:#5b6670;font-size:11px;margin:2px 0 6px";
        ax.append(Object.assign(document.createElement("span"), { textContent: dia(g.t0) }), Object.assign(document.createElement("span"), { textContent: dia(g.t1) }));
        body.appendChild(ax);
      }
    }
    for (const t of v.linhas.slice(1)) {
      const d = document.createElement("div");
      d.textContent = t;
      body.appendChild(d);
    }
    if (data && data.coletas != null) {
      const d = document.createElement("div");
      d.style.cssText = "color:#5b6670;font-size:11px;margin-top:4px";
      d.textContent = `${data.coletas} coletas em 30 dias`;
      body.appendChild(d);
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

  function showSelo(asin) {
    const token = getCfg("token");
    if (!token || typeof GM_xmlhttpRequest !== "function") return;
    GM_xmlhttpRequest({
      method: "GET",
      url: `${PANEL_URL}/api/selo/${asin}`,
      headers: { "x-selo-token": token },
      timeout: 8000,
      onload: (r) => {
        let data = null;
        if (r.status === 401) return toast("Selo: token recusado. Troque no menu do Tampermonkey.");
        if (r.status !== 200 && r.status !== 404) return;
        try { data = JSON.parse(r.responseText); } catch { return; }
        openWindow(data);
      },
    });
  }

  function setupProduct() {
    const asin = asinFromPath(location.pathname);
    if (!asin) return;
    showSelo(asin);
    floatingButton("Rastrear este produto", () => {
      copy(linkFor(asin));
      toast("Link copiado. Cole no chat do bot do Telegram.");
    });
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
