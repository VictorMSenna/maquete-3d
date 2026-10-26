import { UNIDADES } from "./dados.js";
const qs = new URLSearchParams(location.search);
const minutos = (t, pad) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  return m ? +m[1] * 60 + +m[2] : pad;
};
const avisa = (v) => {
  document.documentElement.dataset.vitrine = v;
  try {
    if (window.parent !== window) window.parent.postMessage({ fonte: "modulo-3d", vitrine: v }, "*");
  } catch (e) {
  }
};
async function iniciarVitrine(app) {
  document.documentElement.classList.add("vitrine");
  app.fecharAbertura();
  app.painelUnidades(false);
  if (app.modo3d !== "3d" || !app.cena) {
    avisa("sem-3d");
    return;
  }
  const cena = app.cena, c = cena.controls;
  const retrato = innerWidth < innerHeight;
  const dist = retrato ? 260 : 200;
  const longe = Math.round(dist * 1.6);
  // 26/10 &enquadra=centro (portrait only): vertical focal offset = frac x camera distance, frac measured on the pin's window
  const ENQ = qs.get("enquadra") === "centro" && retrato;
  let frac = 0;
  const centra = () => {
    if (ENQ) c.setFocalOffset(0, frac * c.distance, 0, false);
  };
  const enquadra = (d) => {
    c.enabled = false;
    c.maxDistance = Math.max(c.maxDistance, longe + 40);
    c.rotateTo(-2.6, 1.22, false);
    c.dollyTo(d, false);
    centra();
    cena.pedirRender();
  };
  const unidadeDoPino = () => {
    const disp = UNIDADES.filter((u) => u.situacao === "disponivel");
    const pref = disp.find((u) => String(u.numero) === String(qs.get("pino") || ""));
    if (pref) return pref;
    let melhor = null, dm = 1e9;
    for (const u of disp) {
      const p = cena.pontoDaUnidade && cena.pontoDaUnidade(u.id);
      if (!p || p.alvo !== u.id) continue;
      const dd = Math.hypot(p.x - innerWidth / 2, p.y - innerHeight / 2);
      if (dd < dm) { dm = dd; melhor = u; }
    }
    return melhor;
  };
  const doisQuadros = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const calibra = async () => {
    if (!ENQ || !cena.pontoDaUnidade) return;
    const u = unidadeDoPino();
    if (!u) return;
    const k = 2 * Math.tan(cena.camera.fov * Math.PI / 360) / innerHeight;
    for (let i = 0; i < 4; i++) {
      await doisQuadros();
      const p = cena.pontoDaUnidade(u.id);
      if (!p) return;
      const dy = p.y - innerHeight / 2;
      if (Math.abs(dy) < 2) break;
      frac += dy * k;   // camera-controls: a positive focal offset y moves the picture UP (measured)
      centra();
      cena.pedirRender();
    }
  };
  if (cena.esconderArco) cena.esconderArco(true);
  const S = await app.carregarSol();
  S.rel.estacao("primavera");
  enquadra(longe);
  const de = minutos(qs.get("de"), 17 * 60 + 30), ate = minutos(qs.get("ate"), 20 * 60 + 30);
  const dur = Math.max(1, Math.min(60, +qs.get("dur") || 9)) * 1e3;
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fim = () => {
    S.rel.hora(ate);
    enquadra(dist);
    if (ENQ) calibra().then(() => avisa("noite"));
    else avisa("noite");
    if (qs.get("interativo") === "1") {
      c.minDistance = Math.max(c.minDistance, 140);
      c.maxDistance = dist + 120;
      c.enabled = true;
    }
    cena.pedirRender();
  };
  S.rel.hora(reduz ? ate : de);
  await new Promise((ok) => {
    const t02 = performance.now();
    let q = 0;
    const olha = () => {
      const t = window.__g3dTiles;
      const st = t && t.stats ? t.stats.queued + t.stats.downloading + t.stats.parsing : 0;
      q = st === 0 ? q + 1 : 0;
      if (q >= 6 || performance.now() - t02 > 25e3) ok();
      else setTimeout(olha, 250);
    };
    setTimeout(olha, 500);
  });
  enquadra(reduz ? dist : longe);
  await calibra();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (typeof app.vitrinePronta === "function") app.vitrinePronta();
  if (reduz) {
    fim();
    return;
  }
  avisa("animando");
  const t0 = performance.now();
  await new Promise((ok) => {
    const passo = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      S.rel.hora(Math.round(de + (ate - de) * e));
      c.dollyTo(longe + (dist - longe) * e, false);
      centra();
      if (k < 1) setTimeout(passo, 120);
      else ok();
    };
    setTimeout(passo, 120);
  });
  fim();
}
export {
  iniciarVitrine
};
