import { capacidade, rebaixar } from "./capacidade.js";
import { chaveLocal } from "./predio.js";
import * as THREE from "three";
import { SOL } from "./dados-sol.js";
import { MisturaPonto, ROTULO, INFO, VEU } from "./render-mix.js";
import { solNoInstante } from "./interior-sol.js";
import { criarVistaGerada } from "./vista-gerada.js"; // E0 22/10: generated window view (demo)
let atual = null, geracao = 0;
async function abrirTour360(opts) {
  const g = ++geracao;
  if (atual) atual.fechar(false);
  const h = await criar({ ...opts, registrar: (x) => {
    if (g !== geracao) {
      x.fechar(false);
      return;
    }
    if (atual && atual !== x) atual.fechar(false);
    atual = x;
  } });
  return h.api;
}
function definirHora(m) {
  atual?.api.definirHora(m);
}
function definirEstacao(e) {
  atual?.api.definirEstacao(e);
}
function definirLuz(n, l) {
  atual?.api.definirLuz(n, l);
}
function irPara(id) {
  return atual?.api.irPara(id);
}
function estadoTour360() {
  return atual ? atual.api.estado() : null;
}
function fecharTour360() {
  atual?.fechar(true);
}
let CENA = { luzes: [], nomesLuz: {}, curtoLuz: {}, luzesNoite: [], inicio: null, refLuz: null, pufe: {}, chegada: {} };
// MORADIA-CONSERTO D13: inside a frame the module behaves as embedded even without &embutido=1 (&embutido=0 turns it off)
const EMBUTIDO = typeof location !== "undefined" && (/[?&]embutido=1/.test(location.search) || (typeof window !== "undefined" && window.parent !== window && !/[?&]embutido=0/.test(location.search)));
const SEG_H = 256, SEG_V = 128;   // A-11: denser sphere, the linear uv across big triangles pinched the poles (star in the floor at nadir)
let MORADIA = false;   // demo de moradia (manifesto.moradia): arrival direction always on
const paraMundo = ([u, v, h]) => new THREE.Vector3(-v, h, u);
const CHAVE_LUZES = chaveLocal("tabela3d-luzes-cliente");
let luzesMemoria = null;
// MORADIA-CONSERTO D3.1: the client's light choice is kept PER PERIOD (dia / noite). Crossing dusk or dawn goes back to the automatic
// rule (a click by day no longer leaves the room dark at 23:00); coming back to the same period restores that period's choice.
function elDe(estacao, minutos) {
  try {
    const s = solNoInstante(SOL, estacao, minutos);
    if (Number.isFinite(s.el)) return s.el;
  } catch (e) {
  }
  return -12;
}
function limiteLuz() {
  return Array.isArray(CENA.luzRampa) ? CENA.luzRampa[0] : -2;
}
function periodoDe(estacao, minutos) {
  return elDe(estacao, minutos) < limiteLuz() ? "noite" : "dia";
}
function luzesDoCliente(periodo) {
  let o = null;
  try {
    o = JSON.parse(sessionStorage.getItem(CHAVE_LUZES) || "null");
  } catch (e) {
  }
  if (!o) o = luzesMemoria;
  if (o && typeof o === "object" && o.luzes && typeof o.luzes === "object" && o.periodo === periodo) return { ...o.luzes };
  return null;
}
function guardaLuzesCliente(l, periodo) {
  luzesMemoria = { periodo, luzes: { ...l } };
  try {
    sessionStorage.setItem(CHAVE_LUZES, JSON.stringify(luzesMemoria));
  } catch (e) {
  }
}
function luzesAuto(estacao, minutos) {
  const el = elDe(estacao, minutos);
  return Object.fromEntries(CENA.luzes.map((k) => [k, el < limiteLuz() && CENA.luzesNoite.includes(k)]));
}
// D4: automatic lamps fade in with the sun elevation (luzRampa [on at, full at] deg) instead of all switching at -2 deg
function ganhoAuto(estacao, minutos) {
  if (!Array.isArray(CENA.luzRampa)) return 1;
  const [a, b] = CENA.luzRampa, t = Math.min(1, Math.max(0, (a - elDe(estacao, minutos)) / (a - b)));
  return t * t * (3 - 2 * t);
}
const CHAVE_RETORNO = chaveLocal("tabela3d-360-retorno");
function retorno360(numero) {
  try {
    const o = JSON.parse(sessionStorage.getItem(CHAVE_RETORNO) || "null");
    if (o && String(o.numero) === String(numero) && Date.now() - o.t < 12e4) return o;
  } catch (e) {
  }
  return null;
}
async function criar({
  container,
  manifesto = "assets/render/tour360/manifesto.json",
  ponto,
  estacao = "inverno",
  minutos = 900,
  luzes = null,
  reflexo = false,
  aoFechar,
  teste = false,
  andar = null,
  final = null,
  numero = null,
  torre = null,
  registrar = null
}) {
  const man = typeof manifesto === "string" ? await (await fetch(manifesto)).json() : manifesto;
  const base = typeof manifesto === "string" ? manifesto.replace(/[^/]*$/, "") : man.base || "";
  const PTS = Object.fromEntries(man.pontos.map((p) => [p.id, p]));
  CENA = { ...CENA, ...man.cena || {} };
  MORADIA = !!man.moradia;
  const REF_LUZ = (() => {
    const r = CENA.refLuz, c = r && PTS[r.ponto] && PTS[r.ponto].camadas && PTS[r.ponto].camadas[r.camada];
    return c ? c.media_dentro || c.media : null;
  })();
  const pontoInicial = () => (man.pontos.find((p) => p.id === CENA.inicio && p.camadas && p.camadas.fora) || man.pontos.find((p) => p.camadas && p.camadas.fora) || man.pontos[0]).id;
  const volta = numero != null ? retorno360(numero) : null;
  if (volta) {
    try {
      sessionStorage.removeItem(CHAVE_RETORNO);
    } catch (e) {
    }
    if (!ponto && PTS[volta.ponto]) ponto = volta.ponto;
  }
  const per0 = periodoDe(estacao, minutos), cli0 = luzes || luzesDoCliente(per0);
  const estado = { estacao, minutos, luzes: { ...cli0 || luzesAuto(estacao, minutos) }, ponto: ponto && PTS[ponto] ? ponto : pontoInicial(), reflexo: !!reflexo,
    manual: !!cli0, ganhoLuz: cli0 ? 1 : ganhoAuto(estacao, minutos) };
  if (luzes) guardaLuzesCliente(estado.luzes, per0);
  let G = null;
  let VG = null; // E0 22/10: generated window view (one image per facade, distant backdrop)
  const raiz = document.createElement("div");
  raiz.className = "t360";
  raiz.innerHTML = `
    <canvas class="t360-cv"></canvas>
    <button type="button" class="t360-rot" aria-label="Sobre a imagem" aria-expanded="false"><span class="t360-rot-i" aria-hidden="true">i</span><span class="t360-rot-txt">${man.rotulo || ROTULO}</span></button>
    <div class="t360-vista" hidden>${man.moradia ? "Vista ilustrativa" : "Vista simulada"}</div>
    <div class="t360-nome"></div>
    <div class="t360-luzes">${CENA.luzes.filter((k) => (k === "cidade" && man.moradia) || man.pontos.some((p) => p.camadas && p.camadas[k])).map((k) => `<button data-luz="${k}" aria-pressed="false" title="${CENA.nomesLuz[k] || k}"><span class="l-longo">${CENA.nomesLuz[k] || k}</span><span class="l-curto">${CENA.curtoLuz[k] || CENA.nomesLuz[k] || k}</span></button>`).join("")}</div>
    <button class="t360-fechar" aria-label="Fechar">×</button>
    <div class="t360-chips"></div>
    <div class="t360-aviso-sol" hidden>Este ambiente tem sol direto agora; o passeio não mostra esse sol.</div>`;
  const bR = document.createElement("button");
  bR.className = "t360-reflexo";
  bR.hidden = true;
  bR.setAttribute("aria-pressed", "false");
  bR.innerHTML = '<span class="l-longo">Reflexo no vidro</span><span class="l-curto">Reflexo</span>';
  raiz.querySelector(".t360-luzes").appendChild(bR);
  bR.addEventListener("click", () => {
    estado.reflexo = estado.reflexo === false;
    bR.setAttribute("aria-pressed", String(estado.reflexo));
    creditoReflexo();
    if (G && G.vidro) {
      G.malha.material.uniforms.usaVidro.value = estado.reflexo ? 1 : 0;
      G.vista.acordar();
    }
    desenha();
    repinta();
  });
  function creditoReflexo() {
    try {
      const p = G && G.vista && G.vista.credito && G.vista.credito.querySelector(".g3d-parte");
      if (p) p.innerHTML = (G.vidro && estado.reflexo !== false ? "Vista da janela e reflexo: Google Maps" : "Vista da janela: Google Maps") + "<br>apartamento: render ilustrativo";
    } catch (e) {
    }
  }
  function botaoReflexo() {
    const p = PTS[pontoVisivel()];
    bR.hidden = MORADIA || !(G && G.vidro || !!(p && p.camadas && p.camadas.fora));   // MORADIA: no glass reflection layer
    bR.setAttribute("aria-pressed", String(estado.reflexo !== false));
    creditoReflexo();
  }
  container.appendChild(raiz);
  if (EMBUTIDO) raiz.style.touchAction = "pan-y";
  {
    const b = raiz.querySelector(".t360-rot");
    let tm = 0;
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const ab = !b.classList.contains("aberto");
      b.classList.toggle("aberto", ab);
      b.setAttribute("aria-expanded", String(ab));
      clearTimeout(tm);
      if (ab) tm = setTimeout(() => {
        b.classList.remove("aberto");
        b.setAttribute("aria-expanded", "false");
      }, 6e3);
    });
  }
  if (!document.getElementById("t360-css")) {
    const css = document.createElement("style");
    css.id = "t360-css";
    css.textContent = `
    .t360{position:absolute;inset:0;overflow:hidden;background:#111;touch-action:none;user-select:none;font:14px/1.3 system-ui,sans-serif}
    .t360-cv{width:100%;height:100%;display:block;cursor:grab}
    .t360-cv.arrastando{cursor:grabbing}.t360-cv.alvo{cursor:pointer}
    .t360-rot{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 24px);min-height:24px;padding:3px;border:0;border-radius:999px;background:rgba(0,0,0,.45);color:#fff;font:11px/1.3 system-ui,sans-serif;text-align:left;cursor:pointer}
    .t360-rot-i{flex:none;width:18px;height:18px;border-radius:50%;border:1px solid rgba(255,255,255,.7);display:grid;place-items:center;font:italic 600 11px Georgia,serif}
    .t360-rot-txt{display:none;padding-right:8px}.t360-rot.aberto{border-radius:10px;background:rgba(0,0,0,.72)}.t360-rot.aberto .t360-rot-txt{display:block}
    .t360-luzes .l-curto{display:none}
    .t360-vista{position:absolute;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;transform:translate(-50%,-50%);pointer-events:none;white-space:nowrap}
    .t360-nome{position:absolute;left:50%;top:12px;transform:translateX(-50%);padding:6px 12px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff}
    .t360-luzes{position:absolute;right:12px;top:56px;display:flex;flex-direction:column;gap:6px}
    .t360-luzes button{padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.45);color:#fff;cursor:pointer}
    .t360-luzes button[aria-pressed="true"]{background:#f5c66b;color:#222;border-color:#f5c66b}
    .t360-chips{position:absolute;inset:0;pointer-events:none;z-index:4}
    .t360-chip{position:absolute;transform:translate(-50%,-100%);pointer-events:auto;display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 13px;border-radius:999px;border:1px solid rgba(255,255,255,.65);background:rgba(16,18,17,.8);color:#fff;font:600 12.5px/1 system-ui,sans-serif;white-space:nowrap;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)}
    .t360-chip i{font-style:normal;font-size:14px;opacity:.85}
    .t360-aviso-sol{position:absolute;left:50%;top:104px;transform:translateX(-50%);width:max-content;max-width:min(86%,420px);padding:6px 10px;border-radius:10px;background:rgba(16,18,17,.78);color:#f4d48a;font:11.5px/1.3 system-ui,sans-serif;text-align:center;pointer-events:none;z-index:4}
    .t360-aviso-sol[hidden]{display:none}
    @media (max-width:760px){.t360-aviso-sol{top:200px}}
    .t360-fechar{position:absolute;right:12px;top:12px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:22px;cursor:pointer}`;
    document.head.appendChild(css);
  }
  const cv = raiz.querySelector(".t360-cv");
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: teste });
  cv.addEventListener("webglcontextlost", (ev) => {
    ev.preventDefault();
    if (rebaixar()) {
      guardaRetorno();
      setTimeout(() => location.reload(), 300);
    }
  });
  cv.addEventListener("webglcontextrestored", () => {
    if (!fechado) recuperaContexto();
  });
  renderer.setPixelRatio(Math.min(capacidade().dprMax, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const movel = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const larguraMax = Math.min(capacidade().larguraPano, renderer.capabilities.maxTextureSize);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
  let yaw = 0, pitch = 0, fov = innerHeight > innerWidth ? 90 : 75;
  const RAIO = 5;
  const esferas = /* @__PURE__ */ new Map();
  const baixadosFundo = new Set();   // 25/11: files fetched in the background (adiantar, below)
  const NITIDO = !/[?&]nitido=0/.test(location.search);
  const NITIDO_GLSL = `
vec4 amostraNitida(sampler2D t, vec2 uv) {
  vec2 ts = vec2(textureSize(t, 0)), pf = fwidth(uv * ts);
  vec4 bl = texture2D(t, uv);
  if (max(pf.x, pf.y) >= 1.0 || pf.x > 0.25 * ts.x) return bl;   // minified, or across the u = 0/1 seam: plain bilinear
  vec2 sp = uv * ts, t1 = floor(sp - 0.5) + 0.5, f = sp - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f), w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, t0 = (t1 - 1.0) / ts, t3 = (t1 + 2.0) / ts, t12 = (t1 + w2 / w12) / ts;
  vec4 r = texture2D(t, vec2(t0.x, t0.y)) * w0.x * w0.y + texture2D(t, vec2(t12.x, t0.y)) * w12.x * w0.y + texture2D(t, vec2(t3.x, t0.y)) * w3.x * w0.y
         + texture2D(t, vec2(t0.x, t12.y)) * w0.x * w12.y + texture2D(t, vec2(t12.x, t12.y)) * w12.x * w12.y + texture2D(t, vec2(t3.x, t12.y)) * w3.x * w12.y
         + texture2D(t, vec2(t0.x, t3.y)) * w0.x * w3.y + texture2D(t, vec2(t12.x, t3.y)) * w12.x * w3.y + texture2D(t, vec2(t3.x, t3.y)) * w3.x * w3.y;
  return max(r, vec4(0.0));
}
`;
  function esfera(id) {
    if (esferas.has(id)) return esferas.get(id);
    const p = PTS[id];
    const geo = new THREE.SphereGeometry(RAIO, SEG_H, SEG_V);
    geo.scale(-1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false, toneMapped: false });
    if (NITIDO) mat.onBeforeCompile = (sh) => {   // 19/11: on a phone the 4096 panorama is magnified ~1.5x; bilinear blurs it. Catmull-Rom (9 taps) where the texel is larger than the screen pixel, bilinear elsewhere (?nitido=0 = bilinear, A/B)
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + NITIDO_GLSL).replace("#include <map_fragment>", "#ifdef USE_MAP\n  diffuseColor *= amostraNitida(map, vMapUv);\n#endif");
    };
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(paraMundo(p.pos));
    m.visible = false;
    cena.add(m);
    const mix = new MisturaPonto(renderer, p, base, { larguraMax, SOL, unidade: final != null && numero != null ? { numero: String(numero), andar, final, torre } : null, finalRender: man.final ?? null, luzes: CENA.luzes, pufe: CENA.pufe, cena: CENA });
    mix.pufeNoiteCena = CENA.pufe && CENA.pufe.noite;
    mix.sincrono = MORADIA;
    mix.aoRefinar = () => {
      if (fechado) return;
      if (pontoVisivel() === id) repinta();
      else e.refinar = true;
    };
    mix.refLuz = REF_LUZ;
    mix.baixados = baixadosFundo;
    const e = { m, mix, pronto: null, refinar: false };
    esferas.set(id, e);
    return e;
  }
  let destino = null;
  const pontoVisivel = () => destino || estado.ponto;
  function emDia(e) {
    const u = e.mix.ultimo;
    if (!u || !u.estado || e.refinar) return false;
    const s = u.estado;
    return s.estacao === estado.estacao && s.minutos === estado.minutos && u.veu === VEU.fora.value && s.reflexo === (estado.reflexo !== false) && Math.abs((s.ganhoLuz ?? 1) - (estado.ganhoLuz ?? 1)) < 1e-4 && CENA.luzes.every((k) => !!s.luzes[k] === !!estado.luzes[k]);
  }
  async function pinta(id) {
    const e = esfera(id);
    e.refinar = false;
    const tx = await e.mix.atualizar(estado);
    if (fechado || !tx) return e;
    e.m.material.map = tx;
    e.m.material.needsUpdate = true;
    if (id === pontoVisivel()) botaoReflexo();
    if (VG && id === pontoVisivel()) {
      VG.aposPintar(id, e);
      if (VG.luzCidade) VG.luzCidade(!!estado.luzes.cidade);
      botoesLuz();
      if (G && VG.cobre(id)) { G.vidro = false; botaoReflexo(); }
    }
    if (G && id === pontoVisivel()) { G.aposPintar(id, e); if (!VG) botoesLuz(); }
    if (id === pontoVisivel()) adiantar.agenda();
    return e;
  }
  // 25/11 (owner request): while the visitor looks at a room, the files of
  // the same room in the other mode (day <-> night) and then of the neighbouring rooms are fetched one at a time into the browser's
  // HTTP cache (plain fetch, nothing decoded, no GPU memory). When the visitor goes there, the full layers are already on the phone
  // and the preview step is skipped (render-mix only uses previews for layers not yet decoded, and decoding is fast).
  // Only on MORADIA, after the view is complete and the city of the window is not loading; never with "save data" on; with a known
  // slow link (connection type 2g/3g) only the other mode of the same room; at most ~160 MB per visit. ?adiantar=0 turns it off (A/B).
  const adiantar = (() => {
    const feitos = new Set(), baixados = baixadosFundo, K = new URLSearchParams(location.search);
    let fila = null, tm = 0, mb = 0, ativo = false;
    const con = typeof navigator !== "undefined" ? navigator.connection : null;
    const desligado = () => !MORADIA || K.get("adiantar") === "0" || (con && con.saveData);
    const lento = () => !!con && /^(slow-2g|2g|3g)$/.test(con.effectiveType || "");
    const ehNoite = (min) => min < 6 * 60 + 30 || min > 18 * 60;
    const arqs = (P, noite) => {
      const C = P.camadas || {}, out = [];
      const add = (c, kb) => { if (c) out.push([c, kb || 0]); };
      if (C.ceu) add(C.ceu.arq, C.ceu.kb);
      if (C.fora) add(C.fora.arq, C.fora.kb);
      if (noite) {
        const ev = esferas.get(pontoVisivel()), comLo = !!(ev && ev.mix && ev.mix.comLo);
        for (const c of Object.values(C)) if (c && c.grupos && c.arq) { add(c.arq, c.kb); if (comLo && c.lo) add(c.lo, c.kb_lo); }   // the 12-bit complement too, when this device draws it
      } else {
        if (C.albedo) add(C.albedo.arq, C.albedo.kb);
        if (C.normal) add(C.normal.arq, C.normal.kb);
        const est = estado.estacao, sv = C.solvis && C.solvis[est], si = C.solind && C.solind[est];
        if (sv) for (const a of [].concat(sv.arq)) add(a, (sv.kb || 0) / [].concat(sv.arq).length);
        if (si) {
          const hs = Object.keys(si).map((h) => [h, Math.abs(+h.slice(0, 2) * 60 + +h.slice(3, 5) - estado.minutos)]).sort((a, b) => a[1] - b[1]).slice(0, 2);
          for (const [h] of hs) add(si[h].arq, si[h].kb);
        }
      }
      return out;
    };
    const monta = () => {
      const P0 = PTS[pontoVisivel()];
      if (!P0) return [];
      const noite = ehNoite(estado.minutos), out = [...arqs(P0, !noite)];
      if (!lento()) for (const v of P0.vizinhos || []) if (PTS[v]) out.push(...arqs(PTS[v], noite), ...arqs(PTS[v], !noite));
      // the main layers of every room first, the 12-bit complements (-lo) after: with the -lo inline the ~160 MB ran out before the
      // kitchen was reached from the living room at night (VER-POSD 12a)
      const lo = (x) => /-lo\.webp$/.test(x[0]);
      return [...out.filter((x) => !lo(x)), ...out.filter(lo)].filter(([a]) => !feitos.has(a));
    };
    const ocupado = () => {
      const cg = raiz.querySelector(".t360-g3d-carga");
      const ev = esferas.get(pontoVisivel()), mx = ev && ev.mix;   // the room on screen still downloading its full layers
      const baixando = mx && mx.emUso && [...mx.emUso].some((a) => !a.endsWith(".p.webp") && !mx.prontas.has(a));
      return document.hidden || baixando || (cg && !cg.hidden) || [...esferas.values()].some((e) => e.refinar);
    };
    async function passo() {
      tm = 0;
      if (fechado || desligado() || ativo) return;
      if (ocupado()) { agenda(2500); return; }
      if (!fila) fila = monta();
      const it = fila.shift();
      if (!it || mb > 160) return;
      const [a, kb] = it;
      if (feitos.has(a)) { agenda(50); return; }
      feitos.add(a);
      ativo = true;
      try {
        const r = await fetch(base + a, { priority: "low" });
        await r.arrayBuffer();
        if (r.ok) baixados.add(a);
        mb += kb / 1024;
      } catch (e) {
      }
      ativo = false;
      agenda(150);
    }
    function agenda(ms = 1800) {
      if (desligado()) return;
      if (ms === 1800) fila = null;   // a new view: rebuild the list for this room and this hour
      clearTimeout(tm);
      tm = setTimeout(passo, ms);
    }
    if (K.has("teste")) window.__adiantar = () => ({ fila: fila && fila.length, mb: Math.round(mb), n: feitos.size, ocupado: ocupado(), ativo, desligado: desligado(), lento: lento() });
    return { agenda, baixados };
  })();
  const grupoHot = new THREE.Group();
  cena.add(grupoHot);
  const texHot = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 64, 52, 0, 7);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.beginPath();
    g.arc(64, 64, 40, 0, 7);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.38)";
    g.lineWidth = 4;
    g.beginPath();
    g.arc(64, 64, 59, 0, 7);
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  function limpaHot() {
    for (const m of grupoHot.children) {
      if (!m.isSprite) m.geometry.dispose();
      m.material.dispose();
    }
    grupoHot.clear();
  }
  const BOLA_M = 0.44, BOLA_MIN = 34, vFrente = new THREE.Vector3(), vRel = new THREE.Vector3();
  const fundura = (m) => { camera.getWorldDirection(vFrente); return Math.max(0.1, vRel.copy(m.position).sub(camera.position).dot(vFrente)); };
  function ajustaHot() {
    const k = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (cv.clientHeight || 1);
    // 09/11: the rings are one size on screen, the 34 px of the building module, wherever they are. The size is solved on the depth along the view (what the sprite is
    // divided by): solved on the distance, a ring near the edge of a wide view came out 1.3-1.6x larger than asked
    for (const m of grupoHot.children) m.scale.setScalar(MORADIA ? BOLA_MIN * k * fundura(m) : Math.max(BOLA_M, BOLA_MIN * k * camera.position.distanceTo(m.position)));
  }
  function montaHot() {
    limpaHot();
    const p = PTS[estado.ponto];
    // MORADIA-CONSERTO D6/B7: balls only for points in line of sight (manifest vizinhos, plan test), plus one ball at the first DOOR on
    // the way to a hidden point (portais); every other point stays reachable from the bottom chips (alvos)
    const bolas = (p.vizinhos || []).map((vid) => [vid, PTS[vid] && PTS[vid].pos]).concat((p.portais || []).map((q) => [q.alvo, q.pos]));
    for (const [vid, qp] of bolas) {
      const q = PTS[vid];
      if (!q || !qp) continue;
      const pos = paraMundo([qp[0], qp[1], 0.3]);
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: texHot, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
      m.scale.setScalar(BOLA_M);
      m.position.copy(pos);
      m.userData.id = vid;
      m.renderOrder = 5;
      grupoHot.add(m);
    }
  }
  function fovLimites() {
    // A-09/D13 (MORADIA-CONSERTO): never magnify the panorama more than 1.5x at the centre of the view (4096 px = 11.4 px/deg), and
    // B-m3: the horizontal field never wider than 106 deg (wide canvases stretched the edges)
    const H = (cv.clientHeight || 600) * renderer.getPixelRatio(), pxg = (larguraMax || 4096) / 360;
    const fMin = Math.min(75, Math.max(35, 2 * Math.atan(H / 2 * (Math.PI / 180) / (1.5 * pxg)) * 180 / Math.PI));
    const asp = camera.aspect || 1, fMaxH = 2 * Math.atan(Math.tan(53 * Math.PI / 180) / asp) * 180 / Math.PI;   // 106 deg: the 16:9 default (75) stays
    return [fMin, Math.max(fMin, Math.min(95, fMaxH))];
  }
  function aplicaCam() {
    pitch = Math.max(-85, Math.min(85, pitch));
    if (MORADIA) {
      const [a, b] = fovLimites();
      fov = Math.max(a, Math.min(b, fov));
    }
    const y = yaw * Math.PI / 180, x = pitch * Math.PI / 180;
    const d = new THREE.Vector3(-Math.cos(x) * Math.cos(y), Math.sin(x), -Math.cos(x) * Math.sin(y));
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.lookAt(camera.position.clone().add(d));
  }
  function redim() {
    const w = raiz.clientWidth || 1, h = raiz.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    desenha();
  }
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hotEm(ev) {
    const r = cv.getBoundingClientRect();
    ndc.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(grupoHot.children.filter((m) => m.visible), false)[0];
    if (h) return h.object.userData.id;
    if (!MORADIA) return null;
    // the ring is small on screen, the place to tap stays comfortable: up to 26 px from its centre
    let melhor = null, dMin = 26;
    for (const m of grupoHot.children) {
      vRel.copy(m.position).project(camera);
      if (vRel.z >= 1 || !m.visible) continue;
      const dd = Math.hypot(r.left + (vRel.x * 0.5 + 0.5) * r.width - ev.clientX, r.top + (-vRel.y * 0.5 + 0.5) * r.height - ev.clientY);
      if (dd < dMin) { dMin = dd; melhor = m.userData.id; }
    }
    return melhor;
  }
  let arr = null, moveu = 0;
  const toques = /* @__PURE__ */ new Map();
  let pinca = null;
  cv.addEventListener("pointerdown", (ev) => {
    cv.setPointerCapture(ev.pointerId);
    toques.set(ev.pointerId, [ev.clientX, ev.clientY]);
    arr = { x: ev.clientX, y: ev.clientY, yaw, pitch };
    moveu = 0;
    cv.classList.add("arrastando");
    if (toques.size === 2) {
      const [a, b] = [...toques.values()];
      pinca = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), fov };
    }
  });
  cv.addEventListener("pointermove", (ev) => {
    if (toques.has(ev.pointerId)) toques.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pinca && toques.size === 2) {
      const [a, b] = [...toques.values()];
      fov = Math.max(35, Math.min(95, pinca.fov * pinca.d / Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1]))));
      aplicaCam();
      desenha();
      return;
    }
    if (arr) {
      const k = fov / (cv.clientHeight || 600);
      moveu = Math.max(moveu, Math.hypot(ev.clientX - arr.x, ev.clientY - arr.y));
      yaw = arr.yaw - (ev.clientX - arr.x) * k;
      pitch = arr.pitch + (ev.clientY - arr.y) * k;
      aplicaCam();
      desenha();
      return;
    }
    cv.classList.toggle("alvo", !!hotEm(ev));
  });
  const solta = (ev) => {
    toques.delete(ev.pointerId);
    if (toques.size < 2) pinca = null;
    cv.classList.remove("arrastando");
    // 11/11: pointercancel = the browser took the finger for a page scroll (embedded, pan-y). The moves before that (up to the
    // touch slop) had tilted the view ~3 deg each time, so ten page scrolls over the tour ended looking at the floor: put it back.
    if (ev.type === "pointercancel" && arr && !pinca) {
      yaw = arr.yaw;
      pitch = arr.pitch;
      aplicaCam();
      desenha();
      arr = null;
      return;
    }
    if (arr && moveu < 6) {
      const id = hotEm(ev);
      if (id) irPara2(id);
    }
    arr = null;
  };
  cv.addEventListener("pointerup", solta);
  cv.addEventListener("pointercancel", solta);
  cv.addEventListener("wheel", (ev) => {
    if (EMBUTIDO && !ev.ctrlKey) return;
    ev.preventDefault();
    fov = Math.max(35, Math.min(95, fov + ev.deltaY * 0.05));
    aplicaCam();
    desenha();
  }, { passive: false });
  const elVista = raiz.querySelector(".t360-vista");
  function desenha() {
    ajustaHot();
    if (VG) VG.antes(camera, estado.ponto, andando);
    if (G) G.antes();
    renderer.render(cena, camera);
    const p = PTS[estado.ponto];
    const alvo = paraMundo([p.pos[0], p.pos[1] + 30, p.pos[2] + 2]);
    const v = alvo.clone().project(camera);
    const ok = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1;
    elVista.hidden = MORADIA || !ok || !!(G && G.malha.visible) || !!(VG && VG.malha.visible);
    if (ok) {
      elVista.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
      elVista.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    }
    atualizaChips();
  }
  const chipsBox = raiz.querySelector(".t360-chips");
  // D7: the MORADIA page's own bars are in the list too (#sol, #barra, #det, #cred); fixed elements are tested with getClientRects
  const COBRE = ["#interior-sol", "#int-barra", "#interior-fechar", ".t360-luzes", ".t360-nome", ".int-luzes-barra", ".t360-rot", ".int-rodape", "#int-detalhes", "#sol", "#barra", "#det", "#cred"];
  const visivelEl = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
  let chipsSig = "", chipsAtuais = [];
  const vC = new THREE.Vector3(), vF = new THREE.Vector3(), vD = new THREE.Vector3();
  function atualizaChips() {
    if (fechado) return;
    const r = cv.getBoundingClientRect();
    if (andando || !r.width) {
      if (chipsSig) {
        chipsSig = "";
        chipsAtuais = [];
        chipsBox.replaceChildren();
      }
      return;
    }
    const tampas = [];
    for (const s of COBRE) for (const el of document.querySelectorAll(s)) {
      if (!visivelEl(el)) continue;
      const q = el.getBoundingClientRect();
      if (q.width && q.height) tampas.push(q);
    }
    const sol = [document.querySelector("#interior-sol"), document.querySelector("#sol")].find(visivelEl);
    let baseY = sol && sol.getBoundingClientRect().height ? Math.min(r.bottom - 20, sol.getBoundingClientRect().top - 10) : r.bottom - 20;
    for (const d of document.querySelectorAll("#interior-sol .sol-dica, #sol .sol-dica")) if (visivelEl(d)) baseY = Math.min(baseY, d.getBoundingClientRect().top - 6);   // 09/11: the MORADIA page holds the same bar in #sol
    {
      const ri = raiz.querySelector(".t360-rot");
      if (visivelEl(ri)) {
        const q = ri.getBoundingClientRect();
        if (q.bottom > baseY - 40) baseY = Math.min(baseY, q.top - 6);
      }
    }
    camera.getWorldDirection(vF);
    vF.y = 0;
    vF.normalize();
    const precisa = [], aneis = [], vistos = new Set(), posBola = new Map();
    // phones: the strip kept for the walk buttons covers as many rows as all of them could need (a ring half hidden behind a second row looked broken)
    let faixa = 0, anelMudou = false;
    if (r.width <= 760) { const ids = PTS[estado.ponto].alvos || [...new Set(grupoHot.children.map((m) => m.userData.id))]; const tot = ids.reduce((s, id) => s + (PTS[id] ? largChip(id) + 6 : 0), 0); faixa = Math.max(1, Math.ceil(tot / Math.max(1, r.width - 16))) * 36 + 30; }
    for (const m of grupoHot.children) {
      vC.copy(m.position).project(camera);
      const x = r.left + (vC.x * 0.5 + 0.5) * r.width, y = r.top + (-vC.y * 0.5 + 0.5) * r.height, R2 = 22;
      const naTela = vC.z < 1 && x > r.left + 24 && x < r.right - 24 && y > r.top + 24 && y < r.bottom - 24;
      // on phones a ring in the strip of the walk buttons gives way to its button: the buttons keep their place right above the sun bar
      const tapado = tampas.some((q) => x + R2 > q.left && x - R2 < q.right && y + R2 > q.top && y - R2 < q.bottom) || (faixa > 0 && y + R2 > baseY - faixa && y - R2 < baseY);
      if (MORADIA && m.visible === (naTela && tapado)) { m.visible = !(naTela && tapado); anelMudou = true; }   // a ring under the interface became a button: it is not drawn behind it
      if (naTela && !tapado) {
        aneis.push([x - r.left, y]);
        vistos.add(m.userData.id);
        continue;
      }
      if (!posBola.has(m.userData.id)) posBola.set(m.userData.id, m.position);
    }
    const P0 = PTS[estado.ponto];
    for (const id of P0.alvos || [...new Set(grupoHot.children.map((m) => m.userData.id))]) {
      if (vistos.has(id) || !PTS[id]) continue;
      vD.copy(posBola.get(id) || paraMundo([PTS[id].pos[0], PTS[id].pos[1], 0.3])).sub(camera.position);
      vD.y = 0;
      const ang = THREE.MathUtils.radToDeg(Math.atan2(vD.x * -vF.z + vD.z * vF.x, vD.x * vF.x + vD.z * vF.z));
      precisa.push({ id, ang });
    }
    precisa.sort((a, b) => a.ang - b.ang);
    const meiaFov = THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * camera.aspect));
    const W = r.width;
    let fimAnt = -1e9;
    const lista = precisa.map((c) => {
      const w = largChip(c.id);
      let x = Math.abs(c.ang) < meiaFov ? W / 2 + c.ang / meiaFov * (W / 2) : c.ang < 0 ? 0 : W;
      x = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, x));
      if (x - w / 2 < fimAnt + 6) x = fimAnt + 6 + w / 2;
      fimAnt = x + w / 2;
      return { ...c, x, w, seta: c.ang < -12 ? "←" : c.ang > 12 ? "→" : "↓" };
    });
    for (let k = lista.length - 1, lim = W - 8; k >= 0; k--) {
      if (lista[k].x + lista[k].w / 2 > lim) lista[k].x = lim - lista[k].w / 2;
      lim = lista[k].x - lista[k].w / 2 - 6;
    }
    // D7: chips that do not fit in one row (412 px) wrap into rows going UP from the base line, never off screen or under the bar
    const larguraTotal = lista.reduce((s, c) => s + c.w + 6, 0);
    if (larguraTotal > W - 16) {
      let xx = 8, linha = 0;
      for (const c of lista) {
        if (xx + c.w > W - 8 && xx > 8) { linha++; xx = 8; }
        c.x = xx + c.w / 2; c.linha = linha; xx += c.w + 6;
      }
    }
    // the buttons never climb into the row of the light buttons: a ring under them only lifts them while the whole block still fits below the top interface
    const estreito = W <= 760, passo = estreito ? 36 : 44, altoChip = estreito ? 30 : 36, nLinhas = 1 + lista.reduce((n, c) => Math.max(n, c.linha || 0), 0);
    const teto = tampas.reduce((t, q) => q.bottom < r.top + r.height / 2 ? Math.max(t, q.bottom) : t, r.top);
    const baseMin = teto + 6 + altoChip + (nLinhas - 1) * passo;
    if (!estreito) for (const c of lista) for (const [ax, ay] of aneis) {
      const yc = baseY - (c.linha || 0) * passo;
      if (Math.abs(c.x - ax) < c.w / 2 + 22 && ay > yc - altoChip - 22 && ay < yc + 22 && ay - 28 + (c.linha || 0) * passo >= baseMin) baseY = Math.min(baseY, ay - 28 + (c.linha || 0) * passo);
    }
    const yDe = (c) => baseY - (c.linha || 0) * passo;
    if (anelMudou) requestAnimationFrame(desenha);
    const sig = lista.map((c) => c.id + ":" + Math.round(c.x / 8) + c.seta + (c.linha || 0)).join("|") + "@" + Math.round(baseY);
    if (sig === chipsSig) return;
    chipsSig = sig;
    chipsAtuais = lista.map((c) => ({ id: c.id, x: r.left + c.x, y: yDe(c) }));
    chipsBox.replaceChildren(...lista.map((c) => {
      const b = criaChip(c.id, c.seta);
      b.style.left = c.x + "px";
      b.style.top = yDe(c) - r.top + "px";
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        irPara2(c.id);
      });
      return b;
    }));
  }
  function criaChip(id, seta) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "t360-chip";
    b.dataset.id = id;
    const i = document.createElement("i");
    i.textContent = seta;
    i.setAttribute("aria-hidden", "true");
    b.append(...seta === "→" ? [PTS[id].nome, i] : [i, PTS[id].nome]);
    b.setAttribute("aria-label", "Ir para " + PTS[id].nome);
    return b;
  }
  const largChips = /* @__PURE__ */ new Map();
  function largChip(id) {
    let w = largChips.get(id);
    if (w) return w;
    const b = criaChip(id, "→");
    b.style.visibility = "hidden";
    b.style.left = "-1000px";
    chipsBox.append(b);
    w = Math.ceil(b.getBoundingClientRect().width) + 2;
    b.remove();
    if (!(w > 2)) return 120;
    largChips.set(id, w);
    return w;
  }
  // 09/11: the balcony's arrival looks at the table and the room, with or without the city: straight out there is no piece of the apartment on screen
  const CHEGADA_MORADIA = { varanda: [90, -6] };
  function chegadaDe(id) {
    const c = (EMBUTIDO || MORADIA || /[?&]chegada=1/.test(location.search)) && ((MORADIA && CHEGADA_MORADIA[id]) || (CENA.chegada && CENA.chegada[id]));   // moradia: always
    return Array.isArray(c) && c.length >= 2 ? c.map(Number) : null;
  }
  let andando = null;
  async function irPara2(id, { dur = (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) ? 1 : 440 } = {}) {   // moradia 26/10: reduced motion = cut
    if (!PTS[id] || id === estado.ponto || andando) return andando;
    destino = id;
    andando = (async () => {
      const de = esfera(estado.ponto), para = await pinta(id);
      if (fechado) return;
      limpaHot();
      const p1 = paraMundo(PTS[id].pos);
      const ch = chegadaDe(id), f0 = fov;
      // MORADIA-CONSERTO D8: dip to dark instead of a crossfade between two spheres while the camera crosses the plan (that showed a
      // double image and went through walls): the origin fades out with a small push-in, the camera jumps to the target centre in the
      // dark, the target fades in at its arrival direction. Each sphere is only ever seen from its own centre (no distortion).
      const t0 = performance.now(), meio = dur / 2;
      para.m.visible = false;
      await new Promise((ok) => {
        let trocou = false;
        const passo = (t) => {
          const k = Math.min(1, (t - t0) / dur);
          if (k < 0.5) {
            const s = k / 0.5;
            de.m.material.opacity = 1 - s * s;
            fov = f0 * (1 - 0.06 * s);
          } else {
            if (!trocou) {
              trocou = true;
              de.m.visible = false;
              de.m.material.opacity = 1;
              camera.position.copy(p1);
              para.m.visible = true;
              if (ch) {
                yaw = ch[0];
                pitch = ch[1];
              }
            }
            const s = (k - 0.5) / 0.5;
            para.m.material.opacity = Math.sqrt(s);
            fov = (ch && ch[2] ? ch[2] : f0) * (1 - 0.06 * (1 - s));
          }
          aplicaCam();
          desenha();
          if (k < 1) requestAnimationFrame(passo);
          else ok();
        };
        requestAnimationFrame(passo);
      });
      if (ch && ch[2]) fov = ch[2]; else fov = f0;
      if (fechado) return;
      de.m.visible = false;
      para.m.material.opacity = 1;
      estado.ponto = id;
      destino = null;
      raiz.querySelector(".t360-nome").textContent = PTS[id].nome;
      { const bp = document.querySelector("#barra-ponto"); if (bp) bp.textContent = PTS[id].nome; }
      if (de !== para) de.mix.soltarCamadas();
      andando = null;
      botoesLuz();
      montaHot();
      desenha();
      if (!emDia(para)) repinta();
      else avisoSol(para);
    })();
    const esta = andando;
    esta.catch((err) => console.warn("tour360: caminhada falhou", err && err.message)).finally(() => {
      if (andando === esta) andando = null;
      if (destino === id) destino = null;
    });
    return andando;
  }
  let pintando = null, pendente = false;
  async function repinta() {
    if (fechado) return null;
    if (pintando) {
      pendente = true;
      return pintando;
    }
    pintando = (async () => {
      let semPedido = 0;
      while (!fechado) {
        pendente = false;
        const alvo = pontoVisivel();
        const e = await pinta(alvo);
        if (fechado) break;
        if (alvo === estado.ponto && !andando) {
          e.m.visible = true;
          avisoSol(e);
        }
        desenha();
        if (pendente) continue;
        if (emDia(esfera(pontoVisivel()))) break;
        if (++semPedido >= 3) break;
      }
    })().finally(() => {
      pintando = null;
    });
    return pintando;
  }
  function guardaRetorno() {
    if (numero == null) return;
    try {
      sessionStorage.setItem(CHAVE_RETORNO, JSON.stringify({ numero: String(numero), estacao: estado.estacao, minutos: estado.minutos, ponto: estado.ponto, yaw, pitch, fov, t: Date.now() }));
    } catch (e) {
    }
  }
  function recuperaContexto() {
    if (G) {
      try {
        G.liberar();
      } catch (e) {
      }
      G = null;
      window.__g3dVista = null;
    }
    VEU.fora.value = MORADIA && !VG ? 1 : 0;   // 09/11: same rule as semGoogle
    for (const e of esferas.values()) {
      e.mix.esquecerCamadas();
      e.refinar = true;
    }
    repinta();
  }
  function avisoSol(e) {
    const a = raiz.querySelector(".t360-aviso-sol");
    if (a) a.hidden = !(e.mix.outraFace() && e.mix.cvAgora(estado.estacao, estado.minutos) > 0.5);
  }
  function marcaLuzes() {
    raiz.querySelectorAll("[data-luz]").forEach((b) => b.setAttribute("aria-pressed", String(!!estado.luzes[b.dataset.luz])));
  }
  // D9: a light button only where it changes something: the point has that layer; 'cidade' (the view's lit windows) only after sunset
  function botoesLuz() {
    if (!MORADIA) return;
    const p = PTS[pontoVisivel()], el = elDe(estado.estacao, estado.minutos);
    raiz.querySelectorAll("[data-luz]").forEach((b) => {
      const k = b.dataset.luz;
      b.hidden = k === "cidade" ? !((VG || (G && G.ativoEm(pontoVisivel()))) && el < -1) : !(p && p.camadas && p.camadas[k]);
    });
  }
  raiz.querySelectorAll("[data-luz]").forEach((b) => b.addEventListener("click", () => {
    estado.luzes[b.dataset.luz] = !estado.luzes[b.dataset.luz];
    estado.manual = true;
    estado.ganhoLuz = 1;
    guardaLuzesCliente(estado.luzes, periodoDe(estado.estacao, estado.minutos));
    marcaLuzes();
    repinta();
  }));
  function luzesPelaHora() {
    const cli = luzesDoCliente(periodoDe(estado.estacao, estado.minutos));
    if (cli) {
      estado.luzes = { ...estado.luzes, ...cli };
      estado.manual = true;
      estado.ganhoLuz = 1;
    } else {
      estado.luzes = luzesAuto(estado.estacao, estado.minutos);
      estado.manual = false;
      estado.ganhoLuz = ganhoAuto(estado.estacao, estado.minutos);
    }
    marcaLuzes();
    botoesLuz();
  }
  let fechado = false;
  function fechar(chamaCb = true) {
    if (fechado) return;
    fechado = true;
    if (G) {
      try {
        G.liberar();
      } catch (e) {
      }
      G = null;
    }
    if (VG) {
      try {
        VG.liberar();
      } catch (e) {
      }
      VG = null;
    }
    for (const e of esferas.values()) {
      e.mix.liberar();
      e.m.geometry.dispose();
      e.m.material.dispose();
    }
    renderer.dispose();
    raiz.remove();
    window.removeEventListener("resize", redim);
    chipsBox.replaceChildren();
    if (atual && atual.raiz === raiz) atual = null;
    if (chamaCb && aoFechar) aoFechar();
  }
  raiz.querySelector(".t360-fechar").addEventListener("click", () => fechar(true));
  window.addEventListener("resize", redim);
  let geoPredio = null;
  const raio = (lat) => {
    const la = lat * Math.PI / 180, a = 6378137, e2 = 0.00669437999014, w = Math.sqrt(1 - e2 * Math.sin(la) ** 2);
    return { M: a * (1 - e2) / w ** 3, N: a / w, la };
  };
  function geoDaUnidade(p) {
    const G0 = geoPredio, f = G0 && G0.finais[String(final ?? G0.padrao.final)];
    if (!f || !p.pos) return null;
    const [u, v, hp] = p.pos, x = f.M[0] * u + f.M[1] * v + f.t[0], z = f.M[2] * u + f.M[3] * v + f.t[1];
    const y = G0.laje_1 + ((andar ?? G0.padrao.andar) - 1) * G0.piso + hp;
    const o = G0.origem, b = o.rumoX * Math.PI / 180, E = x * Math.sin(b) + z * Math.cos(b), Nn = x * Math.cos(b) - z * Math.sin(b), r = raio(o.lat);
    return { lat: o.lat + Nn / r.M * (180 / Math.PI), lon: o.lon + E / (r.N * Math.cos(r.la)) * (180 / Math.PI), h: o.h + y, rumo: f.rumo, porUnidade: true, ajuste: G0.ajuste };
  }
  function geoDoPonto(id) {
    const p = PTS[id];
    const gu = geoDaUnidade(p);
    if (gu) return gu;
    if (p.geo) return p.geo;
    const ref = Object.values(PTS).find((q) => q.geo && q.pos) || (man.geo && man.geo.pos ? { geo: man.geo, pos: man.geo.pos } : null);
    if (!ref || !p.pos) return null;
    const g = ref.geo, b = g.rumo * Math.PI / 180, du = p.pos[0] - ref.pos[0], dv = p.pos[1] - ref.pos[1], dh = p.pos[2] - ref.pos[2];
    const E = Math.sin(b) * dv - Math.cos(b) * du, Nn = Math.cos(b) * dv + Math.sin(b) * du;
    const la = g.lat * Math.PI / 180, a = 6378137, e2 = 0.00669437999014, w = Math.sqrt(1 - e2 * Math.sin(la) ** 2);
    const M = a * (1 - e2) / w ** 3, Nr = a / w;
    return { ...g, lat: g.lat + Nn / M * (180 / Math.PI), lon: g.lon + E / (Nr * Math.cos(la)) * (180 / Math.PI), h: g.h + dh };
  }
  async function ligaGoogle() {
    if (/[?&]google3d=0/.test(location.search)) return;
    try {
      const gm = await import("./google-vista.js");
      if (!MORADIA) try {   // MORADIA: per-point geo of the synthetic tower (manifest); google-geo.js is the Upper's building
        geoPredio = (await import("./google-geo.js")).GEO_PREDIO;
      } catch (e) {
      }
      const sess = await gm.iniciarGoogle();
      if (!sess || fechado) {
        semGoogle();
        return;
      }
      // 26/10 MORADIA (rule 27): the lit windows / street-light pools of Google's night city work in the B5 frame (cena3d's
      // ligarGoogleCena sets it on the Upper). The tour alone has no cena3d -> same matrix here, from the manifest's geoB5 (the VNC
      // region maps fachadas-angulo + luzes-rua were made in the Upper frame, d2-vnc clone); no cut box (liga stays 0)
      if (MORADIA && man.geoB5 && sess.recorte && !sess.recorte.ecefParaB5) {
        const r = man.geoB5, la = r.lat * Math.PI / 180, lo = r.lon * Math.PI / 180, b = r.rumoX * Math.PI / 180;
        const E = [-Math.sin(lo), Math.cos(lo), 0], N = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)], U = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
        const ax = [0, 1, 2].map((i) => Math.sin(b) * E[i] + Math.cos(b) * N[i]), az = [0, 1, 2].map((i) => Math.sin(b + Math.PI / 2) * E[i] + Math.cos(b + Math.PI / 2) * N[i]);
        const P = gm.ecef(r.lat, r.lon, r.h), dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
        sess.recorte.ecefParaB5 = new THREE.Matrix4().set(ax[0], ax[1], ax[2], -dot(ax, P), U[0], U[1], U[2], -dot(U, P), az[0], az[1], az[2], -dot(az, P), 0, 0, 0, 1);
        sess._recFeito = false;
        // 27/10 round 4: the real (low) building that stands on OUR lot is cut out of the Google window view only: manifest/URL
        // corteTorre = { poligono: [[lat, lon], ...] (<= 24, already inflated), h: [h_min, h_max] ellipsoidal } -> recorte lote polygon in
        // the B5 frame (box test disabled: min.x > max.x), between the two heights; the ground (below h_min) stays
        if (man.corteTorre && man.corteTorre.poligono && man.corteTorre.poligono.length >= 3) {
          const ct = man.corteTorre, Rr = 6378137, b5 = (la_, lo_) => { const E = (lo_ - r.lon) * Math.PI / 180 * Rr * Math.cos(r.lat * Math.PI / 180), N = (la_ - r.lat) * Math.PI / 180 * Rr; return [Math.sin(b) * E + Math.cos(b) * N, Math.cos(b) * E - Math.sin(b) * N]; };
          ct.poligono.slice(0, 24).forEach(([la_, lo_], i) => { const [xx, zz] = b5(la_, lo_); sess.recorte.lote.value[i].set(xx, zz); });
          sess.recorte.loteN.value = Math.min(24, ct.poligono.length);
          sess.recorte.min.value.set(1e9, ct.h[0] - r.h, 1e9); sess.recorte.max.value.set(-1e9, ct.h[1] - r.h, -1e9); sess.recorte.liga.value = 1;
        }
        if (r.rua) new THREE.TextureLoader().load(man.base + r.rua, (t) => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; sess.recorte.terr.value = t; sess.recorte.terrExt.value = r.ruaExt; desenha(); }, undefined, () => {});
      }
      const vista = new gm.VistaGoogle(renderer, sess, { lat: 0, lon: 0, h: 0, rumo: 0 }, () => desenha());
      const mat = gm.materialSobreposicao();
      const geo = new THREE.SphereGeometry(RAIO, 96, 48);
      geo.scale(-1, 1, 1);
      const malha = new THREE.Mesh(geo, mat);
      malha.renderOrder = 3;
      malha.visible = false;
      malha.frustumCulled = false;
      cena.add(malha);
      const st = document.createElement("style");
      st.id = "t360-g3d-css";
      st.textContent = ".t360-g3d{position:absolute;right:10px;bottom:78px;max-width:calc(100% - 20px);pointer-events:none;overflow:visible}.t360-g3d[hidden]{display:none}@media (max-width:760px){.t360-g3d{top:92px;bottom:auto!important}.t360-g3d-carga{top:92px;bottom:auto!important;width:130px!important}}.t360-g3d-carga{position:absolute;left:12px;bottom:78px;width:160px;display:flex;flex-direction:column;gap:3px;padding:4px 8px;border-radius:7px;background:rgba(0,0,0,.45);color:#fff;font:10px/1.2 system-ui,sans-serif;pointer-events:none}.t360-g3d-carga[hidden]{display:none}.t360-g3d-carga i{display:block;height:2px;border-radius:2px;background:rgba(255,255,255,.25);overflow:hidden}.t360-g3d-carga b{display:block;height:100%;width:4%;background:#fff;transition:width .4s ease}";
      document.head.appendChild(st);
      raiz.appendChild(vista.credito);
      raiz.appendChild(vista.carga);
      const dir = new THREE.Vector3(), tam = new THREE.Vector2(), perf = { n: 0, ms: 0, max: 0 }, camV = new THREE.PerspectiveCamera();
      let atual2 = null, falhou = false;
      G = {
        fatorNoite: (e) => { const t = Math.min(1, Math.max(0, (-(Number.isFinite(e) ? e : -20) - 4) / 10)); return t * t * (3 - 2 * t); },   // 0 above -4 deg sun, 1 below -14 deg
        vista,
        malha,
        perf,
        gm,
        ativoEm: (id) => !falhou && !(VG && VG.cobre(id)) && !!(PTS[id].camadas && PTS[id].camadas.fora) && !!geoDoPonto(id), // E0: no Google tiles where the generated view is
        aposPintar(id, e) {
          if (!this.ativoEm(id)) return;
          if (atual2 !== null && atual2 !== id && !gm.MODO_FOTO) {
            if (vista.recomeca) vista.recomeca();   // same as the Upper module (anon 21:26)
            else {
              vista.pronto = false;
              vista._lote = null;
              vista._quieto = 0;
            }
          }
          const g0 = geoDoPonto(id);
          const g = g0.porUnidade ? g0 : { ...g0, h: g0.h + (andar != null && g0.andar_ref != null ? (andar - g0.andar_ref) * (g0.por_andar || 2.81) : 0) };
          vista.ref = { ...g, ajuste: window.__g3dAjuste || g.ajuste };
          vista.unidadeChave = andar != null && final != null ? `${andar}-${final}` : null;
          vista.ligaNaCena();
          mat.uniforms.tM.value = e.mix.mat.uniforms.tFora.value;
          mat.uniforms.tPano.value = e.m.material.map;
          mat.uniforms.panoSrgb.value = e.mix.mat.uniforms.srgb.value;
          vista.definirMascara(mat.uniforms.tM.value && mat.uniforms.tM.value.image);
          const el = e.mix.ultimo && e.mix.ultimo.sol ? e.mix.ultimo.sol.el : 20;
          sess.definirLuz(el);
          if (MORADIA && estado.luzes.cidade === false && sess.recorte) sess.recorte.noite.value = 0;   // 'Luzes da cidade' off = only the lit windows go
          // 27/10 round 3: the tower now stands on a park (Parque do Povo) - at night the park below has no lit windows or street pools and read
          // as a black hole (median 16.8 sRGB luma under the railing vs 29 on the Upper balcony at 21:00); manifest cena.noiteGoogleGanho lifts
          // only the night base of the Google tiles (faded in with the night, 1 by day), so the park reads as a dark park
          if (MORADIA && sess.recorte && CENA.noiteGoogleGanho > 1) { const k = 1 + (CENA.noiteGoogleGanho - 1) * this.fatorNoite(el); sess.recorte.luz.value.multiplyScalar(k); }
          mat.uniforms.ganho.value.setScalar(window.__g3dGanho && window.__g3dGanho.dia || 1.35);
          {
            const Gr = gm.gradeGoogle(el);
            mat.uniforms.ombro.value.set(Gr.joelho, Gr.w);
            if (window.__g3d) window.__g3d.ganhoJanela = mat.uniforms.ganho.value.x;
          }
          {
            const c = gm.ceuParaSol(el);
            mat.uniforms.ceuTopo.value.set(...c.topo);
            mat.uniforms.ceuHoriz.value.set(...c.horiz);
            // 09/11: the sky above the city is drawn by the overlay (ceuEm): it needs the sun in the panorama frame (forward -x = bearing rumo,
            // see dirParaL) so the horizon brightens toward the sun instead of a flat band
            const sol = e.mix.ultimo && e.mix.ultimo.sol, az = sol && Number.isFinite(sol.az) ? sol.az : 0, elr = (Number.isFinite(el) ? el : -20) * Math.PI / 180;
            const b = (vista.ref.rumo + (vista.ref.ajuste && vista.ref.ajuste.rumo || 0)) * Math.PI / 180, rel = az * Math.PI / 180 - b;
            if (mat.uniforms.solDir) mat.uniforms.solDir.value.set(-Math.cos(elr) * Math.cos(rel), Math.sin(elr), -Math.cos(elr) * Math.sin(rel));
            mat.uniforms.veuAtivo.value = MORADIA && VEU.fora.value ? 1 : 0;   // these panoramas are black outside: the city replaces the veil on the window edges
            mat.uniforms.veuTopo.value.copy(VEU.topo.value);
            mat.uniforms.veuHoriz.value.copy(VEU.horiz.value);
          }
          this.el = el;
          const cv2 = PTS[id].camadas && PTS[id].camadas.vidro;
          mat.uniforms.usaVidro.value = 0;
          this.vidro = false;
          botaoReflexo();
          {
            const t = Math.min(1, Math.max(0, (el + 2) / 10));
            mat.uniforms.kDiaV.value = cv2 && cv2.sem_reflexo ? 1 : t * t * (3 - 2 * t);
          }
          if (cv2 && cv2.arq) {
            if (!this.vidros) this.vidros = /* @__PURE__ */ new Map();
            if (!this.vidros.has(cv2.arq)) this.vidros.set(cv2.arq, new Promise((ok) => new THREE.TextureLoader().load(e.mix.base + cv2.arq, (t) => {
              t.colorSpace = THREE.NoColorSpace;
              t.generateMipmaps = false;
              t.minFilter = t.magFilter = THREE.LinearFilter;
              ok(t);
            }, void 0, () => ok(null))));
            this.vidros.get(cv2.arq).then((tx) => {
              if (!tx || atual2 !== id) return;
              mat.uniforms.tV.value = tx;
              vista.definirVidro(tx.image);
              mat.uniforms.usaVidro.value = estado.reflexo === false ? 0 : 1;
              this.vidro = true;
              botaoReflexo();
              vista.acordar();
              desenha();
            });
          }
          mat.uniforms.usaCaixa.value = cv2 && Array.isArray(cv2.caixa) ? 1 : 0;
          if (cv2 && Array.isArray(cv2.caixa)) {
            mat.uniforms.caixaMin.value.set(cv2.caixa[0], cv2.caixa[1], cv2.caixa[2]);
            mat.uniforms.caixaMax.value.set(cv2.caixa[3], cv2.caixa[4], cv2.caixa[5]);
          }
          atual2 = id;
        },
        antes() {
          if (gm.MODO_FOTO) return this.antesFoto();
          let mostrar = !andando && !falhou && atual2 === estado.ponto && this.ativoEm(estado.ponto);
          let janela = null, vidroTela = null;
          if (mostrar) {
            camera.updateMatrixWorld(true);
            janela = vista.janelaNaTela(camera);
            mat.uniforms.espelho.value = 0;
            mat.uniforms.temJanela.value = 1;
            vidroTela = this.vidro && mat.uniforms.usaVidro.value > 0.5 ? vista.vidroNaTela(camera) : null;
            if (!janela && vidroTela) janela = { x0: -1, y0: -1, x1: 1, y1: 1, espelho: true };
            if (!janela) {
              mostrar = false;
              malha.visible = false;
              vista.credito.hidden = true;
              camV.position.copy(camera.position);
              camV.fov = camera.fov;
              camV.aspect = camera.aspect;
              camV.updateProjectionMatrix();
              camV.lookAt(camV.position.x - 1, camV.position.y, camV.position.z);
              camV.updateMatrixWorld(true);
              const jv = vista.janelaNaTela(camV);
              if (jv) {
                try {
                  renderer.getDrawingBufferSize(tam);
                  vista.tamanho(tam.x, tam.y, Math.min(1, renderer.capabilities.maxTextureSize / Math.max(tam.x, tam.y)));
                  camV.getWorldDirection(dir);
                  vista.desenha(dir, camV.fov, camV.aspect, jv, true);
                } catch (e) {
                }
              }
              return;
            }
          }
          malha.visible = mostrar;
          vista.credito.hidden = !mostrar;
          if (!mostrar) return;
          try {
            const t0 = performance.now();
            renderer.getDrawingBufferSize(tam);
            const k = Math.min(1, renderer.capabilities.maxTextureSize / Math.max(tam.x, tam.y));
            vista.tamanho(tam.x, tam.y, k);
            camera.updateMatrixWorld(true);
            camera.getWorldDirection(dir);
            malha.position.copy(camera.position);
            let dirV = null;
            if (janela.espelho) {
              dir.x = -dir.x;
              mat.uniforms.espelho.value = 1;
              mat.uniforms.temJanela.value = 0;
            } else if (vidroTela) {
              dirV = dir.clone();
              dirV.x = -dirV.x;
              mat.uniforms.espelho.value = 1;
            }
            vista.desenha(dir, camera.fov, camera.aspect, janela, false, dirV);
            mat.uniforms.tGV.value = dirV && vista.rtV ? vista.rtV.texture : vista.rt.texture;
            vista.progresso(true);
            const op = vista.opacidade();
            mat.uniforms.forca.value = op;
            if (op < 1) vista.acordar();
            vista.credito.hidden = op <= 0;
            if ((perf.n & 31) === 0) {
              const rot = raiz.querySelector(".t360-rot");
              const topo = Math.min(rot && rot.offsetParent ? rot.getBoundingClientRect().top : innerHeight - 120, ...[...raiz.querySelectorAll(".t360-chip")].map((c) => c.getBoundingClientRect().top));
              const bb = Math.max(78, Math.round(raiz.getBoundingClientRect().bottom - topo + 6)) + "px";
              vista.credito.style.bottom = bb;
              vista.carga.style.bottom = bb;
            }
            mat.uniforms.tG.value = vista.rt.texture;
            mat.uniforms.res.value.copy(tam);
            const dt = performance.now() - t0;
            perf.n++;
            perf.ms += dt;
            perf.max = Math.max(perf.max, dt);
            if (window.__g3d && window.__g3d.erro && /403|429|quota|key|denied|permission/i.test(window.__g3d.erro)) throw new Error(window.__g3d.erro);
          } catch (err) {
            falhou = true;
            semGoogle();
            malha.visible = false;
            vista.credito.hidden = true;
            try {
              vista.liberar();
            } catch (e2) {
            }
            console.warn("google3d desligado", err && err.message);
          }
        },
        antesFoto() {
          const ok = !falhou && atual2 === estado.ponto && this.ativoEm(estado.ponto);
          if (!ok) {
            malha.visible = false;
            vista.credito.hidden = true;
            vista.progressoFoto(false);
            return;
          }
          try {
            vista.passoFoto();
            camera.updateMatrixWorld(true);
            const janela = vista.janelaNaTela(camera);
            const ve = (!!janela || this.vidro) && !andando;
            malha.visible = ve && vista.pronto;
            malha.position.copy(camera.position);
            mat.uniforms.espelho.value = 0;
            mat.uniforms.temJanela.value = 1;
            mat.uniforms.usaCubo.value = 1;
            {
              const F = vista.foto, U = mat.uniforms;
              U.nF.value = F.alvos.length;
              U.nOk.value = F.feito ? F.alvos.length : F.i;
              F.alvos.forEach((a, k) => {
                U["fA" + k].value = a.A.texture;
                U["fW" + k].value = a.W.texture;
                U.fM.value[k].copy(F.mats[k]);
              });
            }
            {
              const L = gm.luzDaCidade(this.el), Gr = gm.gradeGoogle(this.el);
              if (MORADIA && CENA.noiteGoogleGanho > 1) L.base = L.base.map((v) => v * (1 + (CENA.noiteGoogleGanho - 1) * this.fatorNoite(this.el)));   // same lift in the phone photo mode
              mat.uniforms.luzBase.value.set(...L.base);
              mat.uniforms.luzesN.value = L.luzes;
              mat.uniforms.gradeF.value.set(Gr.expo, Gr.contraste, Gr.sat, Gr.pivo);
              mat.uniforms.ombro.value.set(Gr.joelho, Gr.w);
            }
            mat.uniforms.rumoB.value = (vista.ref.rumo + (vista.ref.ajuste && vista.ref.ajuste.rumo || 0)) * Math.PI / 180;
            vista.progressoFoto(true);
            const op = vista.opacidade();
            mat.uniforms.forca.value = op;
            if (op < 1 && malha.visible) vista.acordar();
            vista.credito.hidden = !malha.visible || op <= 0;
            if ((perf.n++ & 31) === 0) {
              const rot = raiz.querySelector(".t360-rot");
              const topo = Math.min(rot && rot.offsetParent ? rot.getBoundingClientRect().top : innerHeight - 120, ...[...raiz.querySelectorAll(".t360-chip")].map((c) => c.getBoundingClientRect().top));
              const bb = Math.max(78, Math.round(raiz.getBoundingClientRect().bottom - topo + 6)) + "px";
              vista.credito.style.bottom = bb;
              vista.carga.style.bottom = bb;
            }
            if (window.__g3d && window.__g3d.erro && /403|429|quota|key|denied|permission/i.test(window.__g3d.erro)) throw new Error(window.__g3d.erro);
          } catch (err) {
            falhou = true;
            semGoogle();
            malha.visible = false;
            vista.credito.hidden = true;
            try {
              vista.liberar();
            } catch (e2) {
            }
            console.warn("google3d desligado", err && err.message);
          }
        },
        liberar() {
          malha.geometry.dispose();
          mat.dispose();
          cena.remove(malha);
          vista.liberar();
          if (this.vidros) for (const p of this.vidros.values()) p.then((t) => t && t.dispose());
        }
      };
      window.__g3dVista = G;
      G.aposPintar(estado.ponto, esfera(estado.ponto));
      vista.acordar();
      desenha();
    } catch (err) {
      G = null;
      semGoogle();
      console.warn("google3d indisponivel", err && err.message);
    }
  }
  function semGoogle() {
    if (MORADIA && !VG) return;   // 09/11: no city and no generated view: the sky veil of the hour stays (see abrirTour360)
    if (VEU.fora.value) {
      VEU.fora.value = 0;
      if (!fechado) repinta();
    }
  }
  const api = {
    definirHora: (m) => {
      estado.minutos = m;
      luzesPelaHora();
      return repinta();
    },
    definirEstacao: (e) => {
      estado.estacao = e;
      luzesPelaHora();
      return repinta();
    },
    definirLuz: (n, l) => {
      estado.luzes[n] = !!l;
      estado.manual = true;
      estado.ganhoLuz = 1;
      guardaLuzesCliente(estado.luzes, periodoDe(estado.estacao, estado.minutos));
      marcaLuzes();
      return repinta();
    },
    irPara: irPara2,
    olhar: (y, p = 0, f = fov) => {
      yaw = y;
      pitch = p;
      fov = f;
      aplicaCam();
      desenha();
    },
    hotspots: () => {
      const r = cv.getBoundingClientRect();
      return grupoHot.children.map((m) => {
        const v = m.position.clone().project(camera);
        const px = m.scale.x / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / (cv.clientHeight || 1) * fundura(m));
        return { id: m.userData.id, x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, visivel: m.visible && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1, px: Math.round(px) };
      });
    },
    cursor: () => cv.className,
    _mix: () => esfera(estado.ponto).mix,   // debug/audit accessor (MORADIA-CONSERTO)
    _g3d: () => (G ? { foto: !!G.gm.MODO_FOTO, ganho: G.malha.material.uniforms.ganho.value.x, luzBase: G.malha.material.uniforms.luzBase.value.toArray(), forca: G.malha.material.uniforms.forca.value, pronto: !!G.vista.pronto, op: G.vista.opacidade ? G.vista.opacidade() : null, visivel: !!G.malha.visible, ativo: G.ativoEm(estado.ponto), status: { ...(window.__g3d || {}) } } : null),   // audit accessor: Google window state
    chips: () => chipsAtuais.slice(),
    estado: () => {
      const e = esfera(estado.ponto), u = e.mix.ultimo;
      return {
        ...estado,
        luzes: { ...estado.luzes },
        yaw,
        pitch,
        fov,
        expo: u?.expo,
        lG: u?.lG,
        andando: !!andando,
        pintado: u && u.estado ? { ...u.estado, luzes: { ...u.estado.luzes }, veu: u.veu, el: u.sol && Number.isFinite(u.sol.el) ? +u.sol.el.toFixed(2) : null } : null,
        emDia: emDia(e),
        google: G ? { ...window.__g3d || {}, ms: G.perf.n ? G.perf.ms / G.perf.n : 0, max: G.perf.max, n: G.perf.n } : null
      };
    },
    fechar: () => fechar(true),
    renderer
  };
  const alca = { api, fechar, raiz };
  if (registrar) registrar(alca);
  camera.position.copy(paraMundo(PTS[estado.ponto].pos));
  if (volta && volta.ponto === estado.ponto) {
    yaw = +volta.yaw || 0;
    pitch = +volta.pitch || 0;
    fov = +volta.fov || fov;
  } else {
    const ch = chegadaDe(estado.ponto);
    if (ch) {
      yaw = ch[0];
      pitch = ch[1];
      if (ch[2]) fov = ch[2];
    }
  }
  raiz.querySelector(".t360-nome").textContent = PTS[estado.ponto].nome;
  { const bp = document.querySelector("#barra-ponto"); if (bp) bp.textContent = PTS[estado.ponto].nome; }
  aplicaCam();
  redim();
  marcaLuzes();
  // demo de moradia (manifesto.moradia): a vista da janela vem no render; sem cidade do Google e sem vista gerada por cima
  // 26/10 (protocol rule 27): the MORADIA window is the Google 3D city, same path as the Upper with vistagerada=0; the
  // generated view stays BLOCKED until it is approved (only ?vistagerada=1 turns it on, for review)
  const semVG = MORADIA ? !/[?&]vistagerada=1/.test(location.search) : /[?&]vistagerada=0/.test(location.search);
  // 09/11: these layers carry no outside picture, so with the city off (google3d=0 or a failed load) and no generated view the
  // glass was flat black at noon. The sky veil of the hour stays there instead (ceuDoSol: clear day, warm dusk, dark night):
  // a plain placeholder, nothing drawn in it. With the city on nothing changes (veil while it loads, the city on top).
  VEU.fora.value = (MORADIA && semVG) || !/[?&]google3d=0/.test(location.search) ? 1 : 0;
  VG = semVG ? null : await criarVistaGerada({ cena, PTS, andar, final, RAIO, segH: SEG_H, segV: SEG_V });
  if (VG) raiz.appendChild(VG.credito);
  if (VG && MORADIA) VG.credito.style.display = "none";   // the page draws its own credit line (#cred / cred=site)
  botoesLuz();
  await repinta();
  if (fechado) return alca;
  montaHot();
  desenha();
  await ligaGoogle();
  botoesLuz();
  if (fechado) return alca;
  raiz.dataset.ready = "1";
  if (/[?&]debug360=1/.test(location.search)) {
    const d = document.createElement("pre");
    d.style.cssText = "position:absolute;left:8px;top:240px;z-index:50;margin:0;padding:6px 8px;font:11px/1.35 monospace;background:rgba(0,0,0,.75);color:#fff;border-radius:6px;pointer-events:none;white-space:pre-wrap;max-width:80%";
    const atualizaDbg = () => {
      d.textContent = `WebGL ${INFO.webgl} · RT float: ${INFO.rtFloat ? "sim" : "NAO (8 bits, sRGB)"}
maxTextureSize ${INFO.maxTex} · larguraMax ${larguraMax}
texturas enviadas: ${[...INFO.tamanhos].join(", ")}
decodificador: ${INFO.decodificador} · dpr ${renderer.getPixelRatio()}
${navigator.userAgent.slice(0, 120)}`;
    };
    atualizaDbg();
    setInterval(atualizaDbg, 2e3);
    raiz.appendChild(d);
  }
  return alca;
}
export {
  abrirTour360,
  definirEstacao,
  definirHora,
  definirLuz,
  estadoTour360,
  fecharTour360,
  irPara,
  retorno360
};
