// ==UserScript==
// @name         Rastreador de preços: copiar links
// @namespace    price-tracker-local
// @version      1.0.0
// @description  Botão "Rastrear" na página do produto e seleção de vários itens na busca. Copia os links para colar no bot do Telegram.
// @match        https://www.amazon.com.br/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

// Sem rede nem credenciais: o script só lê a página aberta e copia links limpos
// (https://www.amazon.com.br/dp/ASIN) para a área de transferência. Quem cadastra é o bot.

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

  const core = { asinFromPath, linkFor, isProductPath, isSearchPath, uniqueAsins, MAX };
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

  function setupProduct() {
    const asin = asinFromPath(location.pathname);
    if (!asin) return;
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
