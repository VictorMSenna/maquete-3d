// Demo de moradia (Fabrica-3D D3, 26/10/2026): página do tour 360 do apartamento ilustrativo, SEM prédio.
// Mesmo contrato do módulo anônimo (LEIA.md): parâmetros ponto, hora, estacao, luzes, reflexo, horamin, cred; mensagens de entrada
// { fonte:'site', id, irPara:{ponto}, hora, estacao, luzes, reflexo, reduzido } com resposta { fonte:'modulo-3d', pronto:{ id, tour } } ou
// { fonte:'modulo-3d', erro:{ id, motivo } }; saída { fonte:'modulo-3d', estado }, { fonte:'modulo-3d', tour:{ ponto, minutos, luzes } } e,
// com cred=site, { fonte:'modulo-3d', credito:[{ tipo:'janela', dados, visivel }] } (26/10: janela = cidade do Google, como o modulo do Upper).
import { abrirTour360 } from "./tour360.js";

const q = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);
const pai = window.parent !== window ? window.parent : null;
const manda = (m) => { try { pai && pai.postMessage({ fonte: "modulo-3d", ...m }, "*"); } catch (e) { } };
const estadoHtml = (e) => { document.documentElement.dataset.estado = e; manda({ estado: e, sem3d: false }); };
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); return m ? +m[1] * 60 + +m[2] : null; };
const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.round(t) % 60).padStart(2, "0")}`;
const ESTACOES = ["primavera", "verao", "outono", "inverno"];

function estacaoDoRelogio() {
  const d = new Date(), m = d.getMonth() + 1, dia = d.getDate(), md = m * 100 + dia;
  return md >= 1221 || md < 320 ? "verao" : md < 621 ? "outono" : md < 923 ? "inverno" : "primavera";
}
function luzesDe(v) {
  if (v == null) return null;
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, !!x]));
  return Object.fromEntries(String(v).split(",").map((k) => k.trim()).filter(Boolean).map((k) => [k, true]));
}

// &embutido=1 (26/10, same as the anonymous module's app.js): inside the site's iframe a vertical gesture scrolls the PAGE and a
// horizontal one turns the 360. tour360.js already lets the wheel through without Ctrl (zoom = Ctrl + wheel or pinch); this adds the
// touch-action:pan-y on the tour surfaces so a vertical finger drag reaches the page.
if (q.get("embutido") === "1" || (window.parent !== window && q.get("embutido") !== "0")) {   // D13: framed = embedded
  document.documentElement.classList.add("embutido");
  const st0 = document.createElement("style"); st0.id = "embutido-css";
  st0.textContent = "html.embutido #palco,html.embutido .t360,html.embutido .t360-cv,html.embutido canvas{touch-action:pan-y!important}";
  document.head.appendChild(st0);
}
estadoHtml("carregando");
if (q.get("cred") === "site") {   // the site draws the credits: hide ours + Google's, post the Google attribution (same as app.js of the Upper module)
  $("#cred").hidden = true;
  const sc = document.createElement("style"); sc.textContent = ".g3d-cred,.t360-vg-credito{display:none!important}"; document.head.appendChild(sc);
}
const creditos = () => [...document.querySelectorAll(".g3d-cred,.t360-vg-credito")].map((c) => {
  const tipo = c.classList.contains("t360-vg-credito") ? "vista-gerada" : "janela", at = c.querySelector(".g3d-attr");
  return { tipo, dados: tipo === "vista-gerada" ? c.textContent : (at ? at.textContent : "").replace(/^Dados do mapa: /, ""), visivel: !c.hidden && c.isConnected };
});
let credSig = null;
const BASE = "assets/render/tour360/";
const man = await (await fetch(BASE + "manifesto.json", { cache: "no-store" })).json();
man.base = man.base || BASE;
// 27/10 (round 3, location study; review only): ?torre=lat,lon,ground_h_ellipsoidal,bearing[,floor] moves the synthetic tower -> every
// point's geodetic eye is recomputed with the encoder's formula (plan centre u 7.5 v 7.0; slab = 3.06 m x floor above the ground, 18 -> 55.08 m as in torre-sintetica-vnc.json)
if (q.get("corte")) {   // review only: "lat,lon;lat,lon;...|h_min,h_max" (ellipsoidal) - the low building on the candidate lot, cut from the Google view
  const [pol, hh] = q.get("corte").split("|"); man.corteTorre = { poligono: pol.split(";").map((v) => v.split(",").map(Number)), h: hh.split(",").map(Number) };
}
if (q.get("gnoite")) man.cena = { ...man.cena, noiteGoogleGanho: +q.get("gnoite") };   // review only: night lift of the Google base (park sites)
if (q.get("torre")) {
  const [la0, lo0, h0, rumo, andar] = q.get("torre").split(",").map(Number), laj = 3.06 * (andar || 18);
  const la = la0 * Math.PI / 180, w = Math.sqrt(1 - 0.00669437999014 * Math.sin(la) ** 2), Mr = 6378137 * (1 - 0.00669437999014) / w ** 3, Nr = 6378137 / w, b = rumo * Math.PI / 180;
  for (const p of man.pontos) {
    const du = p.pos[0] - 7.5, dv = p.pos[1] - 7.0, E = Math.sin(b) * dv - Math.cos(b) * du, Nn = Math.cos(b) * dv + Math.sin(b) * du;
    p.geo = { lat: la0 + Nn / Mr * 180 / Math.PI, lon: lo0 + E / (Nr * Math.cos(la)) * 180 / Math.PI, h: h0 + laj + p.pos[2], rumo };
  }
}   // layer paths in the manifest are relative to its folder
const IDS = man.pontos.map((p) => p.id);
const horaMin = hm(q.get("horamin"));
let minutos = hm(q.get("hora"));
if (minutos == null) { const d = new Date(); minutos = d.getHours() * 60 + d.getMinutes(); }
if (horaMin != null) minutos = Math.max(minutos, horaMin);
const estacao = ESTACOES.includes(q.get("estacao")) ? q.get("estacao") : estacaoDoRelogio();
const pontoPedido = IDS.includes(q.get("ponto")) ? q.get("ponto") : (man.cena && man.cena.inicio) || IDS[0];
const luzesIni = q.has("luzes") ? luzesDe(q.get("luzes")) : null;

// details card: only the apartment (area, rooms), no price, no unit
const M = man.apartamento || {};
$("#area").textContent = $("#det-area").textContent = String(Math.round(M.area_m2 || 183));
$("#det-amb").replaceChildren(...(M.ambientes || []).map(([n, a]) => {
  const li = document.createElement("li"); const s1 = document.createElement("span"), s2 = document.createElement("span");
  s1.textContent = n; s2.textContent = a || ""; li.append(s1, s2); return li;
}));
const det = $("#det"), bDet = $("#btn-det");
bDet.addEventListener("click", () => { det.hidden = !det.hidden; bDet.setAttribute("aria-expanded", String(!det.hidden)); });
$("#det-fechar").addEventListener("click", () => { det.hidden = true; bDet.setAttribute("aria-expanded", "false"); });

const api = await abrirTour360({ container: $("#palco"), manifesto: man, ponto: pontoPedido, estacao, minutos, luzes: luzesIni || undefined, reflexo: false });
if (!api) { estadoHtml("contexto-perdido"); throw new Error("tour 360 indisponivel"); }
// the tour's own close button has nowhere to go here
const st = document.createElement("style"); st.textContent = ".t360-fechar{display:none!important}"; document.head.append(st);

// hour / season bar
const hora = $("#hora"), horaTxt = $("#hora-txt"), selEst = $("#estacao");
const mostra = () => { const e = api.estado(); hora.value = e.minutos; horaTxt.textContent = fmt(e.minutos); selEst.value = e.estacao; };
mostra();
hora.addEventListener("input", () => {
  let m = +hora.value; if (horaMin != null && m < horaMin) { m = horaMin; hora.value = m; }
  horaTxt.textContent = fmt(m); api.definirHora(m);
});
selEst.addEventListener("change", () => api.definirEstacao(selEst.value));

// out: state changes (point, hour, lights), polled — the tour has no event for them
const resumo = () => { const e = api.estado(); return { ponto: e.ponto, minutos: Math.round(e.minutos), luzes: Object.keys(e.luzes || {}).filter((k) => e.luzes[k]) }; };
let ultimo = "";
setInterval(() => {
  const e = api.estado(); if (e.andando) return;
  const r = resumo(), k = JSON.stringify(r);
  if (k !== ultimo) { ultimo = k; manda({ tour: r }); if (String(hora.value) !== String(r.minutos)) mostra(); }
  if (q.get("cred") === "site") { const l = creditos(), sg = JSON.stringify(l); if (sg !== credSig) { credSig = sg; manda({ credito: l }); } }
}, 500);

// in: messages from the parent page only
window.addEventListener("message", async (ev) => {
  const m = ev.data;
  if (!m || m.fonte !== "site" || (pai && ev.source !== pai)) return;
  const id = m.id;
  try {
    if (m.irPara && m.irPara.ponto != null) {
      if (!IDS.includes(m.irPara.ponto)) { manda({ erro: { id, motivo: "ponto-invalido" } }); return; }
      // reduced motion (26/10, same as the anonymous module): the parent's flag `reduzido: true` or the iframe's own media query -> cut, no walk
      const reduz = m.reduzido === true || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
      await api.irPara(m.irPara.ponto, reduz ? { dur: 1 } : undefined);
    }
    if (ESTACOES.includes(m.estacao)) await api.definirEstacao(m.estacao);
    const t = hm(m.hora); if (t != null) await api.definirHora(horaMin != null ? Math.max(t, horaMin) : t);
    const l = luzesDe(m.luzes);
    if (l) { const e = api.estado(); for (const k of Object.keys(e.luzes || {})) await api.definirLuz(k, !!l[k]); }
    mostra();
    const e = api.estado();
    manda({ pronto: { id, tour: { ponto: e.ponto, minutos: Math.round(e.minutos), estacao: e.estacao, luzes: Object.keys(e.luzes || {}).filter((k) => e.luzes[k]), reflexo: false } } });
  } catch (err) { manda({ erro: { id, motivo: String(err && err.message || err) } }); }
});

estadoHtml("pronto");
window.__tour = api;
