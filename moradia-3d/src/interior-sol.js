// demo de moradia (Fabrica-3D, 26/10/2026): só o que o tour 360 usa do motor de sol (posição do sol por hora e estação)
import { posicaoSolar, fatorDia } from "./luz-curva.js";
const DIA = 1440;
const hm = (s) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (t) => {
  const m = (Math.round(t) % DIA + DIA) % DIA;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
function solNoInstante(SOL, est, t) {
  const e = SOL.estacoes[est];
  const passo = SOL.meta.passo_min || 15;
  const nascer = hm(e.nascer), por = hm(e.por), ini = hm(e.inicio);
  const dia = t >= nascer && t < por;
  const f = (t - ini) / passo;
  const n = e.az.length;
  let az = null, el = -12;
  if (dia) {
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(f)));
    const i1 = Math.min(n - 1, i0 + 1);
    const k = Math.max(0, Math.min(1, f - i0));
    let a0 = e.az[i0], a1 = e.az[i1];
    if (Math.abs(a1 - a0) > 180) a1 += a1 < a0 ? 360 : -360;
    az = (a0 + (a1 - a0) * k + 360) % 360;
    el = e.el[i0] + (e.el[i1] - e.el[i0]) * k;
    if (f < 0) el = e.el[0] * Math.max(0, (t - nascer) / Math.max(1, ini - nascer));
    if (f > n - 1) {
      const fim = ini + (n - 1) * passo;
      el = e.el[n - 1] * Math.max(0, (por - t) / Math.max(1, por - fim));
    }
  } else {
    az = t >= por ? 260 : 100;
  }
  const ps = posicaoSolar(e.data, t, SOL.meta.local?.lat, SOL.meta.local?.lon);
  el = ps.el;
  az = ps.az;
  const noite = 1 - fatorDia(el);
  const idx = Math.max(0, Math.min(n - 1, Math.floor(f)));
  return { est, data: e.data, nascer: e.nascer, por: e.por, t, hora: fmt(t), dia, az, el, noite, idx, dentro: f >= 0 && f <= n - 1 };
}
function chaveFinal(SOL, un) {
  return String(un != null && typeof un === "object" ? un.final : un);
}
function chaveUnidade(SOL, un) {
  return String(un.numero);
}
function mesmaFace() {
  return null;
}
export { solNoInstante, mesmaFace, chaveUnidade, chaveFinal, hm, fmt };
