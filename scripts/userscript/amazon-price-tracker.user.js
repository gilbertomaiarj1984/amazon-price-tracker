// ==UserScript==
// @name         Rastreador de preços: copiar links
// @namespace    price-tracker-local
// @version      2.0.0
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

  const core = { asinFromPath, linkFor, isProductPath, isSearchPath, uniqueAsins, seloView, MAX };
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
        const v = seloView(data);
        const box = document.createElement("div");
        box.style.cssText = `position:fixed;right:16px;bottom:64px;z-index:2147483646;max-width:300px;padding:10px 14px;border-radius:10px;background:${v.cor};color:#fff;font:13px/1.4 system-ui;box-shadow:0 2px 8px rgba(0,0,0,.3)`;
        v.linhas.forEach((t, i) => {
          const d = document.createElement("div");
          d.textContent = t;
          if (i === 0) d.style.fontWeight = "600";
          box.appendChild(d);
        });
        document.body.appendChild(box);
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
