import * as THREE from "three";
import { solNoInstante, mesmaFace, chaveUnidade } from "./interior-sol.js";
import { capacidade } from "./capacidade.js";
const ROTULO = "Imagem ilustrativa: projeto criado sem nenhuma foto ou vídeo";
const LUX_W = 683, EFICACIA_SOL = 105;
function dniLux0(el) {
  if (el <= 0.5) return 0;
  const am = 1 / Math.max(Math.sin(el * Math.PI / 180), 0.02);
  return 1353 * 0.7 ** am ** 0.678 * EFICACIA_SOL;
}
// TOUR2 08/11 (VER8 §5 item 2: 7.8-8.4 luma step 06:01 -> 06:02 at the entrada; 8.3 measured here): dniLux0 jumps from 0 to ~900 lux the
// minute the sun passes 0.5 deg (air mass clamped at 50), so the direct term, the solind pair and the white key switch on in one step
// (ref r0 +41 %, -0.53 EV). The direct sun now fades in with a smoothstep between DNI_RAMPA[0] and [1] deg; above [1] nothing changes
// Measured (arrival view of each point, primavera, 1920x1080, largest 1-min step 05:50-06:40): no ramp entrada 8.28 (06:01->06:02),
// estar 9.0, cozinha 8.76, suite 7.14; [0.5,4] 3.64 / 4.12 / 4.28 / 3.11; [0.5,5] 2.97 / 3.85 / 4.07 / 2.95; [0.5,6] 2.52 / 3.71 / 3.88 /
// 2.68 (jantar 2.6, varanda 0.3 in every case); sunset unchanged (3.3 at 17:46). ?dnirampa=a,b overrides it for A/B measurements.
const DNI_RAMPA = (() => { const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("dnirampa") : null, v = q ? q.split(",").map(Number) : null; return v && v.length === 2 && v.every(Number.isFinite) && v[1] > v[0] ? v : [0.5, 6]; })();
function dniLux(el) {
  const d = dniLux0(el);
  if (el >= DNI_RAMPA[1]) return d;
  const t = Math.min(1, Math.max(0, (el - DNI_RAMPA[0]) / (DNI_RAMPA[1] - DNI_RAMPA[0])));
  return d * t * t * (3 - 2 * t);
}
function dhiLux0(el) {
  if (el <= -6) return 3;
  if (el <= 0) return 3 + (el + 6) / 6 * 400;
  return 400 + 16e3 * Math.sin(el * Math.PI / 180) ** 0.6;
}
// MORADIA-CONSERTO (per-minute scan 18:1x: 7-14 luma pops at 05:59-06:01 and 17:59): sin(el)^0.6 has an infinite slope at the
// horizon (400 -> 1,800 lux in the first degree, x2 per minute of the slider); between -2 and +4 deg the sky term is now
// log-linear (~ +10 % per minute), the same curve outside that band
function dhiLux(el) {
  if (el <= -2 || el >= 4) return dhiLux0(el);
  const a = Math.log(dhiLux0(-2)), b = Math.log(dhiLux0(4));
  return Math.exp(a + (b - a) * (el + 2) / 6);
}
const mix3 = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
function corCeu(el) {
  return el > 10 ? [1, 1, 1] : el > -2 ? mix3([1.05, 0.9, 0.85], [1, 1, 1], (el + 2) / 12) : [0.35, 0.45, 0.9];
}
function corSol(el) {
  return el > 20 ? [1, 0.97, 0.92] : mix3([1, 0.62, 0.36], [1, 0.97, 0.92], Math.max(0, el) / 20);
}
const VERT = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D t[7];
uniform vec3 g[7];
uniform float esc[7];
uniform float gama;
uniform float ombro;
uniform float joelho[7];
uniform float joelho2[7];
uniform float gamaL[7];
uniform float y2[7];
uniform float ymax[7];
uniform float loIdx[7];
uniform float semRefl;
uniform float ehLuz[7];
#ifdef COM_LO
uniform sampler2D tL0; uniform sampler2D tL1; uniform sampler2D tL2;
#ifdef COM_LO4
uniform sampler2D tL3;
vec3 loTex(float k, vec2 uv){ return k < 0.5 ? texture2D(tL0, uv).rgb : (k < 1.5 ? texture2D(tL1, uv).rgb : (k < 2.5 ? texture2D(tL2, uv).rgb : texture2D(tL3, uv).rgb)); }
#else
vec3 loTex(float k, vec2 uv){ return k < 0.5 ? texture2D(tL0, uv).rgb : (k < 1.5 ? texture2D(tL1, uv).rgb : texture2D(tL2, uv).rgb); }
#endif
#endif
vec3 decod(vec3 v, float kn, float kn2, float yb, float ym, float gL){
  v = max(v, vec3(0.0)); // 16/10 CEU-PRETO: pow() of a negative code is NaN on ANGLE/D3D (black pixel) - never feed it one
  if (kn <= 0.0) return pow(v, vec3(gama));
  vec3 baixo = pow(min(v / kn, 1.0), vec3(gL)); // per-layer gamma (lamps 3.0: more codes for dark surfaces)
  vec3 meio = exp(clamp(v - kn, 0.0, kn2 - kn) / (kn2 - kn) * log(yb));
  vec3 alto = yb * exp(max(v - kn2, 0.0) / (1.0 - kn2) * log(ym / yb));
  return mix(mix(baixo, meio, step(kn, v)), alto, step(kn2, v));
}
uniform vec3 wb;
uniform float expo;
uniform float dbR;
uniform float dbT;
float hDb(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
vec3 deband(sampler2D tx, vec2 uv, vec3 c){
  float a = hDb(uv * 4096.0) * 6.2831853, r = dbR * (0.5 + 0.5 * hDb(uv * 2048.0 + 7.1));
  vec2 o = vec2(cos(a), sin(a)) * r, p = vec2(-o.y, o.x);
  vec3 s1 = texture2D(tx, uv + o).rgb, s2 = texture2D(tx, uv - o).rgb, s3 = texture2D(tx, uv + p).rgb, s4 = texture2D(tx, uv - p).rgb;
  vec3 d = max(max(abs(s1 - c), abs(s2 - c)), max(abs(s3 - c), abs(s4 - c)));
  vec3 m = max((c + s1 + s2 + s3 + s4) * 0.2 + (hDb(uv * 3071.0 + 3.3) - 0.5) / 255.0, vec3(0.0));
  return mix(m, c, step(dbT, max(d.r, max(d.g, d.b))));
}
uniform float modoLum;
uniform vec2 refUv; uniform vec2 refSpan;   // 28/10 white reference (modoLum 2/3)
uniform sampler2D tLoc;
uniform float sLoc;
uniform float lG;
uniform sampler2D tFora;
uniform float usaFora;
uniform float pufeGanho;
uniform vec3 pufeAlb;
uniform float pufeAmb;
uniform vec3 corLuz;
uniform float ambSala;
uniform float pufeNoite;
uniform vec3 pufeCor;
uniform float pufeLumP;
uniform float fatorFora;
uniform float srgb;
uniform float veuFora;
uniform vec3 veuTopo;
uniform vec3 veuHoriz;
uniform sampler2D tAlb;
uniform sampler2D tNor;
uniform float nInt;
uniform float usaVis;
uniform vec3 gDir;
uniform vec3 solDir;
uniform float meioMin;
uniform vec2 visTam;
#ifndef USA_AC
uniform sampler2D tVis;
uniform sampler2D tVis2;
float acesaT(sampler2D tx, vec2 uv){
  vec3 c = floor(texture2D(tx, uv).rgb * 255.0 + 0.5);
  float a = c.r * 16.0 + floor(c.g / 16.0);
  float b = mod(c.g, 16.0) * 256.0 + c.b;
  if (a + b < 0.5) return 0.0;
  return clamp((meioMin - a) / 4.0 + 0.5, 0.0, 1.0) * clamp((b - meioMin) / 4.0 + 0.5, 0.0, 1.0);
}
float acesa(vec2 uv){
  if (nInt < 0.5) return acesaT(tVis, uv);
  float v = acesaT(tVis, vec2(uv.x, 0.5 + uv.y * 0.5));
  if (nInt > 1.5) v += acesaT(tVis, vec2(uv.x, uv.y * 0.5));
  if (nInt > 2.5) v += acesaT(tVis2, vec2(uv.x, 0.5 + uv.y * 0.5));
  if (nInt > 3.5) v += acesaT(tVis2, vec2(uv.x, uv.y * 0.5));
  return min(v, 1.0);
}
float av(vec2 q){ return acesa(q); }
#else
uniform sampler2D tAc;
float av(vec2 q){ return texture2D(tAc, q).r; }
#endif
uniform float raioVis;
uniform float pesoN;
float visSol(vec2 uv){
  vec2 d = 1.0 / visTam; vec2 t = uv * visTam; vec2 c0 = (floor(t) + 0.5) * d; vec2 fr = t - (floor(t) + 0.5);
  vec3 n0 = texture2D(tNor, uv).rgb * 2.0 - 1.0;
  float sup2 = (raioVis + 0.5) * (raioVis + 0.5);
  float s = 0.0, w = 0.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    if (float(i * i) > raioVis * raioVis || float(j * j) > raioVis * raioVis) continue;
    vec2 o = vec2(float(i), float(j)) - fr;
    float k = max(0.0, 1.0 - dot(o, o) / sup2); k *= k;
    if (k <= 0.0) continue;
    vec2 q = c0 + vec2(float(i), float(j)) * d;
    vec3 n = texture2D(tNor, q).rgb * 2.0 - 1.0;
    float wq = mix(1.0, smoothstep(0.35, 0.8, dot(n, n0)), pesoN) * k; // fabric/rug bump normals still count as the same surface
    s += av(q) * wq; w += wq;
  }
  return w > 1e-4 ? s / w : av(c0);
}
vec3 neutral(vec3 c){
  const float start = 0.76; const float desat = 0.15;
  float x = min(c.r, min(c.g, c.b));
  float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= off;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < start) return c;
  float d = 1.0 - start;
  float np = 1.0 - d * d / (peak + d - start);
  c *= np / peak;
  float gg = 1.0 - 1.0 / (desat * (peak - np) + 1.0);
  return mix(c, np * vec3(1.0), gg);
}
void main(){
  vec2 vUvR = modoLum > 1.5 ? refUv + (vUv - 0.5) * refSpan : vUv;   // 28/10: modoLum 2/3 = the white-reference window, linear RGB
  vec3 s = vec3(0.0);
  float foR = semRefl > 0.5 && usaFora > 0.5 ? texture2D(tFora, vUvR).r : 0.0; // ITEM 12
  ${[0, 1, 2, 3, 4, 5, 6].map((i) => `if (g[${i}].r + g[${i}].g + g[${i}].b > 0.0) { vec3 c${i} = texture2D(t[${i}], vUvR).rgb; if (joelho[${i}] <= 0.0 && dbT > 0.0) c${i} = deband(t[${i}], vUvR, c${i});
#ifdef COM_LO
  if (loIdx[${i}] > -0.5) { vec3 lo${i} = loTex(loIdx[${i}], vUvR); c${i} = c${i} * (4080.0 / 4095.0) + lo${i} * (15.0 / 4095.0); }
#endif
  s += g[${i}] * esc[${i}] * decod(c${i}, joelho[${i}], joelho2[${i}], y2[${i}], ymax[${i}], gamaL[${i}]) * (1.0 - ehLuz[${i}] * foR); }`).join("\n  ")}
  if (usaVis > 0.5) {
    vec3 alb = pow(texture2D(tAlb, vUvR).rgb, vec3(2.2));
    vec3 n = normalize(texture2D(tNor, vUvR).rgb * 2.0 - 1.0);
    s += gDir * alb * max(dot(n, solDir), 0.0) * visSol(vUvR);
  }
  vec3 x = s * wb * expo;
  vec2 foP = usaFora > 0.5 ? texture2D(tFora, vUvR).rg : vec2(0.0);
  float fo = foP.x;
  if (foP.y > 0.0 && modoLum < 0.5 && pufeCor.r > 0.0) {
    float a = foP.y, r = a < 0.999 ? exp(texture2D(tFora, vUvR).b * 6.9078) : 1.0, D = a + (1.0 - a) * r;
    float lp = dot(x, vec3(0.2126, 0.7152, 0.0722));
    vec3 xp = pufeCor * corLuz * (lp / (pufeLumP * D)); // the pouf in the new colour under this texel's light
    float ks = clamp(1.5 * ambSala, 0.08, mix(0.45, 0.16, clamp((pufeNoite - 1.0) / 0.6, 0.0, 1.0))), lq = dot(xp, vec3(0.2126, 0.7152, 0.0722));
    if (lq > ks) xp *= (a < 0.999 ? ks : ks + 0.25 * ks * (lq - ks) / (lq - ks + 0.25 * ks)) / lq;
    x = x * ((1.0 - a) * r / D) + xp * a;
  } else if (foP.y > 0.0 && modoLum < 0.5) {
    float lp = dot(x, vec3(0.2126, 0.7152, 0.0722));
    vec3 sh = mix(vec3(lp), x, 0.5) * pufeGanho; // its own shading, as if the albedo were ~pufeGanho x lighter (less violet)
    sh /= 1.0 + dot(sh, vec3(0.2126, 0.7152, 0.0722)) / 0.12; // soft cap: the lit lower front seen from the balcony went white
    vec3 xp = sh + pufeAlb * corLuz * ambSala * expo * pufeAmb * pufeNoite;
    x = mix(x, xp, foP.y);
  }
  if (modoLum > 1.5) { vec3 lv = clamp((log2(max(x, vec3(1e-6))) + 16.0) / 20.0, 0.0, 1.0) * 255.0; gl_FragColor = modoLum > 2.5 ? vec4(fract(lv), 1.0) : vec4(floor(lv) / 255.0, 1.0); return; }   // 28/10: linear RGB, 16 bits per channel over 2 passes
  if (modoLum > 0.5) { float l0 = max(dot(x, vec3(0.2126, 0.7152, 0.0722)), 1e-6); float v = clamp((log2(l0) + 16.0) / 20.0, 0.0, 1.0) * 255.0; gl_FragColor = vec4(floor(v) / 255.0, 1.0 - fo, fract(v), 1.0); return; } // 08/10: 16 bits (R hi + B lo) - 8 bits made rings on smooth walls
  if (usaFora > 0.5) x *= mix(1.0, fatorFora, fo); // v4: window exposed on its own
  if (sLoc > 0.0) { vec4 q = texture2D(tLoc, vUvR); float r = exp2(clamp((lG - ((q.r + q.b / 255.0) * 20.0 - 16.0)) * sLoc, -1.5, 1.5)); x *= mix(1.0, r, smoothstep(0.05, 0.3, q.g) * (1.0 - fo)); }
  float l = dot(x, vec3(0.2126, 0.7152, 0.0722));
  x *= (1.0 + 1.0 / ombro) / (1.0 + l / ombro);   // soft highlight roll-off; 08/10 review: white bed blown in daylight -> stronger shoulder (1.1)
  vec3 o = neutral(x);
  { float m_ = max(o.r, max(o.g, o.b)); float t_ = smoothstep(0.85, 1.0, m_); o = o + (vec3(m_) - o) * t_; }   // 28/10 N10: a clipping highlight goes neutral, not blue-cyan
  if (veuFora > 0.5 && fo > 0.0) o = mix(o, mix(veuHoriz, veuTopo, smoothstep(0.5, 0.78, vUvR.y)), fo); // 21/10 SACADA-GOOGLE-JA
  if (srgb > 0.5) o = mix(o * 12.92, 1.055 * pow(max(o, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, o));
  gl_FragColor = vec4(o, 1.0);
}`;
const INFO = { tamanhos: /* @__PURE__ */ new Set(), decodificador: null };
async function carregaTextura(url, max, dados = false, manterImagem = false, inteira = false) {
  if (inteira) max = 0;
  const blob = await (await fetch(url)).blob();
  let img = null, flipY = false;
  if (dados && max && max < 4096) {
    try {
      const ini = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const k = ini.width > max ? max / ini.width : 1, w = Math.round(ini.width * k), h = Math.round(ini.height * k);
      if (ini.close) ini.close();
      img = await createImageBitmap(blob, { imageOrientation: "flipY", colorSpaceConversion: "none", premultiplyAlpha: "none", resizeWidth: w, resizeHeight: h, resizeQuality: "pixelated" });
      INFO.decodificador = "createImageBitmap";
    } catch (e) {
      img = null;
    }
  }
  if (dados) max = 0;
  try {
    if (!img) {
      img = await createImageBitmap(blob, { imageOrientation: "flipY", colorSpaceConversion: "none", premultiplyAlpha: "none" });
      INFO.decodificador = "createImageBitmap";
    }
  } catch (e) {
    const el = new Image();
    el.src = URL.createObjectURL(blob);
    await el.decode();
    img = el;
    flipY = true;
    INFO.decodificador = "img.decode";
  }
  let fonte = img;
  if (max && img.width > max) {
    const c = document.createElement("canvas");
    c.width = max;
    c.height = max / 2;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    if (flipY) {
      g.translate(0, c.height);
      g.scale(1, -1);
      flipY = false;
    }
    g.drawImage(img, 0, 0, c.width, c.height);
    if (img.close) img.close();
    fonte = c;
  }
  INFO.tamanhos.add(`${fonte.width}x${fonte.height}`);
  const tx = new THREE.Texture(fonte);
  tx.flipY = flipY;
  tx.colorSpace = THREE.NoColorSpace;
  tx.generateMipmaps = !!manterImagem;
  tx.minFilter = manterImagem ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tx.magFilter = THREE.LinearFilter;
  tx.anisotropy = manterImagem ? 4 : 1;
  tx.needsUpdate = true;
  if (dados) {
    tx.generateMipmaps = false;
    tx.minFilter = tx.magFilter = THREE.NearestFilter;
    tx.anisotropy = 1;
  }
  tx.userData.w = fonte.width;
  tx.userData.h = fonte.height;
  if (!manterImagem) tx.onUpdate = () => {
    const im = tx.image;
    if (im && im.width) {
      tx.image = { width: im.width, height: im.height };
      if (typeof im.close === "function") im.close();
    }
    tx.onUpdate = null;
  };
  return tx;
}
function mediaVis(tab, minutos) {
  if (!tab) return null;
  const ks = Object.keys(tab).map((k) => [+k.slice(0, 2) * 60 + +k.slice(3, 5), tab[k]]).sort((x, y) => x[0] - y[0]);
  if (!ks.length) return null;
  if (minutos <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (minutos <= ks[i][0]) {
    const f = (minutos - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0]);
    return ks[i - 1][1].map((x, j) => x + (ks[i][1][j] - x) * f);
  }
  return ks[ks.length - 1][1];
}
const PRETO = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
PRETO.needsUpdate = true;
const VEU = { fora: { value: 0 }, topo: { value: new THREE.Vector3(0.12, 0.27, 0.6) }, horiz: { value: new THREE.Vector3(0.55, 0.66, 0.8) } };
const smooth_ = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function ceuDoSol(el) {
  const e = Number.isFinite(el) ? el : -20;
  const dia = smooth_(-2, 10, e), crep = smooth_(-8, 0, e) * (1 - smooth_(4, 14, e));
  const L = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  let topo = L([8e-3, 0.012, 0.03], [0.12, 0.27, 0.6], dia), horiz = L([0.02, 0.025, 0.05], [0.55, 0.66, 0.8], dia);
  topo = L(topo, [0.16, 0.2, 0.42], crep * 0.5);
  horiz = L(horiz, [0.85, 0.6, 0.42], crep * 0.45);
  return { topo, horiz };
}
const FRAG_AC = `precision highp float;
varying vec2 vUv;
uniform sampler2D tVis;
uniform sampler2D tVis2;
uniform float nInt;
uniform float meioMin;
` + FRAG.slice(FRAG.indexOf("float acesaT("), FRAG.indexOf("float av(", FRAG.indexOf("float acesaT("))) + "void main(){ gl_FragColor = vec4(acesa(vUv), 0.0, 0.0, 1.0); }";
const AC = /* @__PURE__ */ new WeakMap();
function prepassoAcesa(r, U) {
  let a = AC.get(r);
  if (!a) {
    const gl = r.getContext(), f16 = r.capabilities.isWebGL2 && (gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG_AC,
      depthTest: false,
      depthWrite: false,
      uniforms: { tVis: { value: PRETO }, tVis2: { value: PRETO }, nInt: { value: 0 }, meioMin: { value: 0 } }
    });
    const cena = new THREE.Scene();
    cena.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    a = { mat, cena, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), rt: null, tipo: f16 ? THREE.HalfFloatType : THREE.UnsignedByteType, ok: r.capabilities.isWebGL2 };
    AC.set(r, a);
  }
  if (!a.ok) return null;
  const w = Math.round(U.visTam.value.x), h = Math.round(U.visTam.value.y);
  if (!a.rt || a.rt.width !== w || a.rt.height !== h) {
    if (a.rt) a.rt.dispose();
    a.rt = new THREE.WebGLRenderTarget(w, h, { type: a.tipo, format: THREE.RedFormat, depthBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  }
  const V = a.mat.uniforms;
  V.tVis.value = U.tVis.value;
  V.tVis2.value = U.tVis2.value;
  V.nInt.value = U.nInt.value;
  V.meioMin.value = U.meioMin.value;
  const ant = r.getRenderTarget();
  r.setRenderTarget(a.rt);
  r.render(a.cena, a.cam);
  r.setRenderTarget(ant);
  return a.rt.texture;
}
class MisturaPonto {
  constructor(renderer, ponto, base, { larguraMax = 4096, SOL, unidade = null, finalRender = null, luzes = [], pufe = {}, cena = {} } = {}) {
    this.luzesOrdem = luzes;
    this.cfg = cena || {};   // MORADIA-CONSERTO 26/10: rbNoite, wbNoite, deband, solInterino, ceuMinLux, corCeuNoite ('cfg': this.cena is the THREE.Scene below)
    this.rbNoite = this.cfg.rbNoite || 1.25;
    this.wbNoite = Number.isFinite(this.cfg.wbNoite) ? this.cfg.wbNoite : 0.15;
    this.r = renderer;
    this.p = ponto;
    this.base = base;
    this.max = larguraMax;
    this.SOL = SOL;
    this.unidade = unidade;
    this.finalRender = finalRender;
    this.cache = /* @__PURE__ */ new Map();
    const w = Math.min(larguraMax, ponto.largura || 4096);
    const gl = renderer.getContext();
    const half = renderer.capabilities.isWebGL2 && (gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float"));
    this.rt = new THREE.WebGLRenderTarget(w, w / 2, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false });
    this.rt.texture.colorSpace = half ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
    INFO.rtFloat = !!half;
    INFO.webgl = renderer.capabilities.isWebGL2 ? 2 : 1;
    INFO.maxTex = renderer.capabilities.maxTextureSize;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      defines: renderer.capabilities.isWebGL2 ? { USA_AC: "" } : {},
      uniforms: {
        t: { value: Array(7).fill(PRETO) },
        g: { value: Array.from({ length: 7 }, () => new THREE.Vector3()) },
        esc: { value: Array(7).fill(1) },
        gama: { value: 2.2 },
        ombro: { value: +new URLSearchParams(location.search).get("ombro") || 1.1 },
        joelho: { value: Array(7).fill(0) },
        joelho2: { value: Array(7).fill(0.95) },
        gamaL: { value: Array(7).fill(2.2) },
        y2: { value: Array(7).fill(2) },
        ymax: { value: Array(7).fill(4) },
        wb: { value: new THREE.Vector3(1, 1, 1) },
        expo: { value: 1 },
        srgb: { value: 0 },
        tFora: { value: PRETO },
        usaFora: { value: 0 },
        pufeGanho: { value: +new URLSearchParams(location.search).get("pufe") || pufe.ganho || 0 },
        pufeAmb: { value: Number.isFinite(parseFloat(new URLSearchParams(location.search).get("pufeA"))) ? parseFloat(new URLSearchParams(location.search).get("pufeA")) : pufe.amb ?? 0 },
        pufeAlb: { value: new THREE.Vector3(...pufe.albedo || [0, 0, 0]) },
        corLuz: { value: new THREE.Vector3(1, 1, 1) },
        ambSala: { value: 0 },
        pufeNoite: { value: 1 },
        pufeCor: { value: new THREE.Vector3(...pufe.cor || [0, 0, 0]) },
        pufeLumP: { value: +new URLSearchParams(location.search).get("pufeL") || pufe.lumAntigo || 1 },
        /* pufeAlb = sRGB (46, 50, 64) linear */
        fatorFora: { value: 1 },
        modoLum: { value: 0 },
        refUv: { value: new THREE.Vector2(0.5, 0.5) },
        refSpan: { value: new THREE.Vector2(48 / 2048, 48 / 1024) },
        tLoc: { value: PRETO },
        sLoc: { value: 0 },
        lG: { value: 0 },
        dbR: { value: 14 / w },
        loIdx: { value: Array(7).fill(-1) },
        semRefl: { value: 0 },
        ehLuz: { value: Array(7).fill(0) },
        tL0: { value: PRETO },
        tL1: { value: PRETO },
        tL2: { value: PRETO },
        tL3: { value: PRETO },
        dbT: { value: (new URLSearchParams(location.search).get("deband") === "0" || (cena && cena.deband === 0 && new URLSearchParams(location.search).get("deband") !== "1") ? 0 : 3) / 255 },
        veuFora: VEU.fora,
        veuTopo: VEU.topo,
        veuHoriz: VEU.horiz,
        tAlb: { value: PRETO },
        tNor: { value: PRETO },
        tVis: { value: PRETO },
        tVis2: { value: PRETO },
        nInt: { value: 0 },
        usaVis: { value: 0 },
        gDir: { value: new THREE.Vector3() },
        solDir: { value: new THREE.Vector3(0, 0, 1) },
        tAc: { value: PRETO },
        meioMin: { value: 0 },
        visTam: { value: new THREE.Vector2(1, 1) },
        raioVis: { value: Number.isFinite(parseFloat(new URLSearchParams(location.search).get("visr"))) ? parseFloat(new URLSearchParams(location.search).get("visr")) : capacidade().nivel === "topo" ? 2 : 1 },
        pesoN: { value: new URLSearchParams(location.search).get("visn") === "0" ? 0 : 1 }
      }
    });
    this.comLo = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) >= 16 && new URLSearchParams(location.search).get("lo12") !== "0";
    // TOUR2 08/11 (VER8 §2.1): the MORADIA points carry 4 lamps and only 3 low-nibble slots existed, so the weakest lamp was drawn in
    // 8 bits although its -lo file was downloaded. Measured on the entrada/estar/jantar: that lamp (varanda) is the ONLY light on the
    // balcony seen through the glass, 8-bit step 6-7 % of the value there (p50), max error 0.23-0.35 of the pixel = the Upper's error 3
    // (rings). 4th slot tL3 when the main shader has a sampler free: on WebGL2 tVis/tVis2 now live only in the acesa pre-pass (USA_AC), so
    // t[7] + tL0..3 + tLoc + tFora + tAlb + tNor + tAc = 16; WebGL1 keeps 3 unless the device has >= 17 units. ?lo4=0 forces 3 (A/B).
    const nUnid = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    this.nLo = !this.comLo ? 0 : (renderer.capabilities.isWebGL2 || nUnid >= 17) && new URLSearchParams(location.search).get("lo4") !== "0" ? 4 : 3;
    if (this.comLo) {
      this.mat.defines = { ...this.mat.defines || {}, COM_LO: "", ...this.nLo >= 4 ? { COM_LO4: "" } : {} };
      this.mat.needsUpdate = true;
    }
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.cena = new THREE.Scene();
    this.cena.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mapa = (w2, h) => {
      const t = new THREE.WebGLRenderTarget(w2, h, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false });
      t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter;
      t.texture.wrapS = THREE.RepeatWrapping;
      t.texture.colorSpace = THREE.NoColorSpace;
      return t;
    };
    this.rtLum = mapa(512, 256);
    this.rtLoc = mapa(64, 32);
    this.bufLoc = new Uint8Array(64 * 32 * 4);
    this.matBorra = new THREE.ShaderMaterial({ vertexShader: VERT, depthTest: false, depthWrite: false, uniforms: { tL: { value: this.rtLum.texture } }, fragmentShader: `
precision highp float; varying vec2 vUv; uniform sampler2D tL;
void main(){
  float s = 0.0, w = 0.0, wt = 0.0;
  for (int j = -4; j <= 4; j++) for (int i = -4; i <= 4; i++) {
    float k = exp(-float(i * i + j * j) / 8.0);
    vec4 c = texture2D(tL, vUv + vec2(float(i) * 0.0139, float(j) * 0.0278));
    s += ((c.r + c.b / 255.0) * 20.0 - 16.0) * c.g * k; w += c.g * k; wt += k;
  }
  float v = clamp(w > 1e-3 ? (s / w + 16.0) / 20.0 : 0.5, 0.0, 1.0) * 255.0;
  gl_FragColor = vec4(floor(v) / 255.0, w / wt, fract(v), 1.0);
}` });
    this.cenaBorra = new THREE.Scene();
    this.cenaBorra.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matBorra));
  }
  textura(rel, dados = false, inteira = false) {
    if (!rel) return Promise.resolve(null);
    if (!this.cache.has(rel)) this.cache.set(rel, carregaTextura(this.base + rel, this.max, dados, /(^|\/)fora[^/]*$/.test(rel), inteira));
    const v = this.cache.get(rel);
    this.cache.delete(rel);
    this.cache.set(rel, v);
    while (this.cache.size > 16) {
      const [k, p] = this.cache.entries().next().value;
      if (this.emUso && this.emUso.has(k)) break;
      this.cache.delete(k);
      p.then((t) => t && t.dispose());
    }
    return v;
  }
  soltarCamadas() {
    return this._naFila(() => {
      for (const p of this.cache.values()) p.then((t) => t && t.dispose());
      this.cache.clear();
    });
  }
  esquecerCamadas() {
    return this._naFila(() => {
      this.cache.clear();
      this._chaveLoc = null;
    });
  }
  _naFila(fn) {
    const vez = (this._fila || Promise.resolve()).then(fn);
    this._fila = vez.catch(() => {
    });
    return vez;
  }
  atualizar(estado) {
    return this._naFila(() => this._atualizar(estado));
  }
  static estadoDe(estado, luzes) {
    return { estacao: estado.estacao, minutos: estado.minutos, reflexo: estado.reflexo !== false, ganhoLuz: Number.isFinite(estado.ganhoLuz) ? estado.ganhoLuz : 1, luzes: Object.fromEntries(luzes.map((k) => [k, !!(estado.luzes && estado.luzes[k])])) };
  }
  fatorSolUnidade(estacao, minutos) {
    const u = this.unidade, S = this.SOL;
    if (!u || !S || !S.finais || u.final == null || this.finalRender == null) return 1;
    const mesma = mesmaFace(S, u, this.finalRender);
    if (mesma == null) return 1;
    if (!mesma) return 0;
    return this.cvAgora(estacao, minutos);
  }
  cvAgora(estacao, minutos) {
    const u = this.unidade, S = this.SOL;
    if (!u || !S) return 0;
    const ku = S.unidades ? chaveUnidade(S, u) : null;
    const d = ku != null && S.unidades[ku] && S.unidades[ku].est && S.unidades[ku].est[estacao];
    const e = S.estacoes && S.estacoes[estacao];
    if (!d || !e || !d.cv) return 0;
    const passo = S.meta && S.meta.passo_min || 15;
    const [h, m] = e.inicio.split(":").map(Number);
    const x = (minutos - (h * 60 + m)) / passo - 0.5, k0 = Math.floor(x), w = x - k0;
    const v = (k) => k >= 0 && k < d.cv.length && d.cv[k] === "1" ? 1 : 0;
    return v(k0) * (1 - w) + v(k0 + 1) * w;
  }
  outraFace() {
    const u = this.unidade, S = this.SOL;
    if (!u || !S || !S.finais || this.finalRender == null) return false;
    return mesmaFace(S, u, this.finalRender) === false;
  }
  plano({ estacao, minutos, luzes, ganhoLuz }) {
    const s = solNoInstante(this.SOL, estacao, minutos);
    const fSol = this.fatorSolUnidade(estacao, minutos);
    const C = this.p.camadas;
    const el = Number.isFinite(s.el) ? s.el : -12;
    const cn = this.cfg.corCeuNoite, cc = cn && el < 10 ? mix3(cn, corCeu(el), Math.max(0, Math.min(1, (el + 2) / 12))) : corCeu(el), cs = corSol(el);
    const lista = [];
    // MORADIA-CONSERTO (D3/D4): the sky term never drops below the city glow (ceuMinLux), so a night with every lamp off is dim, never black
    // 26/10 (review item 16): the open balcony gets more city glow than the rooms (ceuMinLuxPonto), so lamps-off 23:00 reads as a dark night,
    // not black; indoors stays at ceuMinLux (raising it there moved the leather hue 23 -> 12 deg, rule 28)
    const cml = this.cfg.ceuMinLuxPonto && this.p && this.cfg.ceuMinLuxPonto[this.p.id] != null ? this.cfg.ceuMinLuxPonto[this.p.id] : this.cfg.ceuMinLux || 0;
    if (C.ceu) lista.push({ c: C.ceu, g: cc.map((x) => x * Math.max(dhiLux(el), cml) / LUX_W) });
    const v4 = !!(C.solvis && C.solvis[estacao] && C.albedo && C.normal && C.solind && C.solind[estacao]);
    let dir = null;
    if (v4 && fSol > 0) {
      const k = this.p.solvis_k || C.solvis_k || 1;
      const gd = cs.map((x) => x * dniLux(el) * k * fSol / LUX_W);
      const md = mediaVis((this.p.solvis_media || C.solvis_media || {})[estacao], minutos);
      dir = { vis: C.solvis[estacao], g: gd, media: md, el, az: s.az };
    }
    const sol = (v4 ? C.solind : C.sol) && (v4 ? C.solind : C.sol)[estacao] || {};
    const gs = dniLux(el) / LUX_W * fSol;
    const horas = Object.keys(sol).map((k) => +k.slice(0, 2) * 60 + +k.slice(3, 5)).sort((x, y) => x - y);
    const ant = horas.filter((m) => m <= minutos).pop(), pos = horas.find((m) => m > minutos);
    const nome = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const SI = !v4 && this.cfg.solInterino;
    if (SI && gs > 0 && horas.length) {
      // MORADIA-CONSERTO interim sun (B5/D2): ONE morning render, weighted by a smooth curve (smootherstep in, out) made exponential in
      // light (k = ln(1 + sun/sky)) so the auto exposure sees a steady change: no 07:00 pop, no 11:30 cut. The shadow does not move.
      const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * t * (t * (t * 6 - 15) + 10); };
      const s0 = Math.min(ss(SI.sobe[0], SI.sobe[1], minutos), 1 - ss(SI.desce[0], SI.desce[1], minutos)), k = SI.k || 2.2;
      const w = s0 > 0 ? (Math.exp(k * s0) - 1) / (Math.exp(k) - 1) : 0;
      if (w > 0) lista.push({ c: sol[nome(horas[0])], g: cs.map((x) => x * gs * w) });
    } else if (gs > 0 && (ant !== void 0 || pos !== void 0)) {
      const entre = ant !== void 0 && pos !== void 0 && pos - ant <= (v4 ? 150 : 120);
      const fa = entre ? (pos - minutos) / (pos - ant) : ant !== void 0 ? Math.max(0, 1 - (minutos - ant) / 60) : 0;
      const fb = entre ? 1 - fa : pos !== void 0 ? Math.max(0, 1 - (pos - minutos) / 60) : 0;
      if (fa > 0) lista.push({ c: sol[nome(ant)], g: cs.map((x) => x * gs * fa) });
      if (fb > 0) lista.push({ c: sol[nome(pos)], g: cs.map((x) => x * gs * fb) });
    }
    const gl = Number.isFinite(ganhoLuz) ? ganhoLuz : 1;   // MORADIA-CONSERTO D4: automatic lamps fade in by sun elevation
    for (const k of this.luzesOrdem) if (luzes && luzes[k] && C[k] && gl > 0) lista.push({ c: C[k], g: [gl, gl, gl], luz: true });
    const media = [0, 0, 0];
    for (const it of lista) for (let i = 0; i < 3; i++) media[i] += it.g[i] * it.c.media[i];
    let mDentro = null, mFora = null, mDia = null;
    if (lista.length && lista.every((it) => it.c.media_dentro && it.c.media_fora)) {
      mDentro = [0, 0, 0];
      mFora = [0, 0, 0];
      mDia = [0, 0, 0];
      for (const it of lista) for (let i = 0; i < 3; i++) {
        mDentro[i] += it.g[i] * it.c.media_dentro[i];
        mFora[i] += it.g[i] * it.c.media_fora[i];
        if (!it.luz) mDia[i] += it.g[i] * it.c.media_dentro[i];
      }
      const P = this.p, md = (P.solvis_media_dentro || {})[estacao], mf = (P.solvis_media_fora || {})[estacao];
      if (dir && md && mf) {
        const a = mediaVis(md, minutos), b = mediaVis(mf, minutos);
        for (let i = 0; i < 3; i++) {
          mDentro[i] += dir.g[i] * a[i];
          mFora[i] += dir.g[i] * b[i];
          mDia[i] += dir.g[i] * a[i];
        }
      }
    }
    if (dir && dir.media) for (let i = 0; i < 3; i++) media[i] += dir.g[i] * dir.media[i];
    return { lista: lista.slice(0, 7), media, mDentro, mFora, mDia, sol: s, dir, minutos, fSol };
  }
  async _atualizar(estado) {
    if (this.liberado) return null;
    const usado = MisturaPonto.estadoDe(estado, this.luzesOrdem);
    const pl = this.plano(estado);
    this.emUso = new Set(pl.lista.map((it) => it.c.arq));
    const C = this.p.camadas;
    const visArq = pl.dir ? [].concat(pl.dir.vis.arq) : [];
    const tDir = pl.dir ? await Promise.all([this.textura(C.albedo.arq), this.textura(C.normal.arq), ...visArq.map((a) => this.textura(a, true))]) : null;
    if (pl.dir) for (const a of [C.albedo.arq, C.normal.arq, ...visArq]) this.emUso.add(a);
    for (const it of pl.lista) if (it.c.lo && this.comLo) this.emUso.add(it.c.lo);
    const loP = pl.lista.map((it) => it.c.lo && this.comLo ? this.textura(it.c.lo, false, true) : null);
    const tx = await Promise.all(pl.lista.map((it) => this.textura(it.c.arq, false, !!it.c.joelho)));
    const txLo = await Promise.all(loP.map((p) => p ? Promise.race([p, Promise.resolve(void 0)]) : null));
    if (this.liberado) return null;
    if (txLo.some((t) => t === void 0)) Promise.all(loP).then(() => {
      if (this.aoRefinar) this.aoRefinar();
    }).catch(() => {
    });
    const U = this.mat.uniforms;
    U.semRefl.value = estado.reflexo === false ? 1 : 0;
    U.usaVis.value = tDir && tDir.every(Boolean) ? 1 : 0;
    if (U.usaVis.value) {
      U.tAlb.value = tDir[0];
      U.tNor.value = tDir[1];
      U.tVis.value = tDir[2];
      U.tVis2.value = tDir[3] || PRETO;
      const empilhado = Array.isArray(pl.dir.vis.arq);
      U.nInt.value = empilhado ? Math.min(pl.dir.vis.intervalos || 2 * visArq.length, 2 * visArq.length) : 0;
      U.visTam.value.set(tDir[2].userData.w, empilhado ? tDir[2].userData.h / 2 : tDir[2].userData.h);
      U.gDir.value.set(...pl.dir.g);
      U.meioMin.value = pl.minutos * 2;
      const a = pl.dir.az * Math.PI / 180, e = Math.max(pl.dir.el, 0) * Math.PI / 180;
      const enu = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
      const M = this.p.enu_para_normal || this.manifestoMat || [1, 0, 0, 0, 1, 0, 0, 0, 1];
      U.solDir.value.set(M[0] * enu[0] + M[1] * enu[1] + M[2] * enu[2], M[3] * enu[0] + M[4] * enu[1] + M[5] * enu[2], M[6] * enu[0] + M[7] * enu[1] + M[8] * enu[2]).normalize();
    }
    U.tL0.value = U.tL1.value = U.tL2.value = U.tL3.value = PRETO;
    const pesoLo = pl.lista.map((it, i) => {
      if (!it || !txLo[i]) return -1;
      const md = it.c.media_dentro || it.c.media || [1, 1, 1];
      return 0.2126 * it.g[0] * md[0] + 0.7152 * it.g[1] * md[1] + 0.0722 * it.g[2] * md[2];
    });
    const ordemLo = pesoLo.map((w, i) => [w, i]).filter((x) => x[0] >= 0).sort((p, q) => q[0] - p[0]).slice(0, this.nLo || 3).map((x) => x[1]);
    if (!U.usaVis.value) U.tAlb.value = U.tNor.value = U.tVis.value = U.tVis2.value = PRETO;
    for (let i = 0; i < 7; i++) {
      const it = pl.lista[i];
      U.t.value[i] = it && tx[i] || PRETO;
      U.loIdx.value[i] = -1;
      if (it && txLo[i]) {
        const k = ordemLo.indexOf(i);
        if (k >= 0) {
          U["tL" + k].value = txLo[i];
          U.loIdx.value[i] = k;
        }
      }
      U.g.value[i].set(...it ? it.g : [0, 0, 0]);
      U.esc.value[i] = it ? it.c.escala : 1;
      U.ehLuz.value[i] = it && it.luz ? 1 : 0;
      U.joelho.value[i] = it && it.c.joelho || 0;
      U.joelho2.value[i] = it && it.c.joelho2 || 0.95;
      U.y2.value[i] = it && it.c.y2 || 2;
      U.ymax.value[i] = it && it.c.ymax || 4;
      U.gamaL.value[i] = it && it.c.gama || 2.2;
    }
    const lum = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    const m = pl.mDentro || pl.media, y = lum(m);
    const el = Number.isFinite(pl.sol.el) ? pl.sol.el : -12;
    {
      const cv = ceuDoSol(el);
      VEU.topo.value.set(...cv.topo);
      VEU.horiz.value.set(...cv.horiz);
    }
    const tDia = Math.min(1, Math.max(0, (el + 2) / 10)), kDia = tDia * tDia * (3 - 2 * tDia);
    const balanco = (mm, WB, noite) => {
      const yb = lum(mm);
      const w = mm.map((x) => yb > 0 ? (yb / Math.max(x, 1e-9)) ** WB : 1);
      if (noite) {
        const c = [mm[0] * w[0], mm[1] * w[1], mm[2] * w[2]];
        const rb = c[0] / Math.max(c[2], 1e-9);
        if (rb > this.rbNoite) {
          const k = Math.sqrt(rb / this.rbNoite);
          w[0] /= k;
          w[2] *= k;
          c[0] /= k;
          c[2] *= k;
        }
        const alvoG = Math.sqrt(c[0] * c[2]);
        if (c[1] > 0) w[1] *= alvoG / c[1];
        const yy = 0.2126 * mm[0] * w[0] + 0.7152 * mm[1] * w[1] + 0.0722 * mm[2] * w[2];
        if (yy > 0) {
          const n = yb / yy;
          for (let i = 0; i < 3; i++) w[i] *= n;
        }
      }
      return w;
    };
    const mLuz = this.refLuz || C.cozinha && (C.cozinha.media_dentro || C.cozinha.media) || null;
    let mDiaW = pl.mDia;
    if (!mDiaW) {
      mDiaW = [0, 0, 0];
      for (const it of pl.lista) if (!it.luz) for (let i = 0; i < 3; i++) mDiaW[i] += it.g[i] * it.c.media[i];
      if (pl.dir && pl.dir.media) for (let i = 0; i < 3; i++) mDiaW[i] += pl.dir.g[i] * pl.dir.media[i];
    }
    const wN = mLuz ? balanco(mLuz, this.wbNoite, true) : balanco(m, this.wbNoite, true);
    const wD = lum(mDiaW) > 0 ? balanco(mDiaW, 0.6, false) : balanco(m, 0.6, false);
    U.wb.value.set(...wN.map((x, i) => x + (wD[i] - x) * kDia));
    {
      const c = m.map((x, i) => x * U.wb.value.getComponent(i)), yc = lum(c);
      if (yc > 0) U.corLuz.value.set(c[0] / yc, c[1] / yc, c[2] / yc);
    }
    const yDia = C.ceu ? (0.2126 * C.ceu.media[0] + 0.7152 * C.ceu.media[1] + 0.0722 * C.ceu.media[2]) * dhiLux(15) / LUX_W : 0;
    const eNoite = y > 0 ? Math.min(ALVO / y, 4.5) : 1;
    const yD = pl.mDia ? lum(pl.mDia) : y;
    const AD = ALVO * 0.45;
    const eDia = Math.min(yD > 0 ? yDia > yD ? AD / Math.sqrt(yD * yDia) : AD / yD : 1, +new URLSearchParams(location.search).get("etop") || 1.6);
    U.expo.value = Math.min(eNoite + (eDia - eNoite) * kDia, 8);
    const tFora = C.fora ? await this.textura(C.fora.arq) : null;
    if (this.liberado) return null;
    if (tFora) this.emUso.add(C.fora.arq);
    U.usaFora.value = tFora ? 1 : 0;
    if (!tFora) U.tFora.value = PRETO;
    if (tFora) {
      U.tFora.value = tFora;
      const yF = pl.mFora ? lum(pl.mFora) : 0;
      const alvoFora = 0.55;
      const eFora = yF > 0 ? Math.min(U.expo.value, alvoFora / yF) : U.expo.value;
      U.fatorFora.value = 1 + (eFora / U.expo.value - 1) * kDia;
    }
    const K = U.expo.value;
    {
      const c = m.map((x, i) => x * U.wb.value.getComponent(i));
      U.ambSala.value = Math.max(lum(c) * K, ALVO * (1 - kDia));
      const NN = +new URLSearchParams(location.search).get("pufeN") || this.pufeNoiteCena || 1;
      U.pufeNoite.value = NN + (1 - NN) * kDia;
    }
    for (let i = 0; i < 7; i++) U.esc.value[i] *= K;
    U.gDir.value.multiplyScalar(K);
    U.expo.value = 1;
    if (U.usaVis.value && this.mat.defines.USA_AC !== void 0) {
      const tac = prepassoAcesa(this.r, U);
      if (tac) U.tAc.value = tac;
    }
    let refUsado = null;
    const RB = this.p.ref_branca;
    if (RB && !new URLSearchParams(location.search).has("semref")) {   // 28/10: white-reference rule (see regraRef)
      const rK = this.medeRef(RB);
      if (rK) {
        const r0 = rK.map((v) => v / K), sol = regraRef(r0, kDia, U.ombro.value, RB), f = sol.ex / K;
        U.wb.value.set(...sol.wb);
        for (let i = 0; i < 7; i++) U.esc.value[i] *= f;
        U.gDir.value.multiplyScalar(f);
        refUsado = { r0, wb: sol.wb, ev: Math.log2(sol.ex), leitura: sol.leitura, kDia };
      }
    }
    const qs = new URLSearchParams(location.search).get("sloc"), sDia = refUsado ? 0 : qs !== null && qs !== "" ? +qs : 0.6;   // 28/10: no local key on top of the white-reference rule
    U.sLoc.value = 0;
    if (sDia > 0) {
      U.modoLum.value = 1;
      this.r.setRenderTarget(this.rtLum);
      this.r.render(this.cena, this.cam);
      U.modoLum.value = 0;
      this.r.setRenderTarget(this.rtLoc);
      this.r.render(this.cenaBorra, this.cam);
      const chaveDe = (b) => {
        let sl2 = 0, sw2 = 0;
        for (let j = 0; j < 32; j++) {
          const ca = Math.cos(((j + 0.5) / 32 - 0.5) * Math.PI);
          for (let i = 0; i < 64; i++) {
            const k = (j * 64 + i) * 4, w = b[k + 1] / 255 * ca;
            sl2 += ((b[k] + b[k + 2] / 255) / 255 * 20 - 16) * w;
            sw2 += w;
          }
        }
        return [sl2, sw2];
      };
      let sl, sw;
      const ant = this._anterior;
      this._anterior = usado;
      const seq = this._seq = (this._seq || 0) + 1;
      const dMin = ant ? Math.abs(ant.minutos - usado.minutos) : 1e9, passo = Math.min(dMin, 1440 - dMin);
      const continuo = !!ant && ant.estacao === usado.estacao && JSON.stringify(ant.luzes) === JSON.stringify(usado.luzes) && passo <= 60;
      if (!this.sincrono && this._chaveLoc && performance.now() - this._chaveLoc.t < 1500 && continuo && this.r.readRenderTargetPixelsAsync) {   // D11: MORADIA reads it now (no late pump)
        [sl, sw] = this._chaveLoc.v;
        if (this._lendo) this._reler = true;
        else {
          this._lendo = true;
          this._reler = false;
          const b = new Uint8Array(64 * 32 * 4), chaveUsada = sw > 0 ? sl / sw : 0;
          this.r.readRenderTargetPixelsAsync(this.rtLoc, 0, 0, 64, 32, b).then(() => {
            const v = chaveDe(b);
            if (!this._chaveLoc || this._chaveLoc.seq <= seq) this._chaveLoc = { v, t: performance.now(), seq };
            if ((this._reler || Math.abs((v[1] > 0 ? v[0] / v[1] : 0) - chaveUsada) > 0.1) && this.aoRefinar) setTimeout(() => this.aoRefinar && this.aoRefinar(), 120);
          }).catch(() => {
            this._chaveLoc = null;
            if (this._reler && this.aoRefinar) setTimeout(() => this.aoRefinar && this.aoRefinar(), 120);
          }).finally(() => {
            this._lendo = false;
            this._reler = false;
          });
        }
      } else {
        this.r.readRenderTargetPixels(this.rtLoc, 0, 0, 64, 32, this.bufLoc);
        [sl, sw] = chaveDe(this.bufLoc);
        this._chaveLoc = { v: [sl, sw], t: performance.now(), seq };
      }
      U.lG.value = sw > 0 ? sl / sw : 0;
      U.tLoc.value = this.rtLoc.texture;
      U.sLoc.value = sDia * (0.4 + 0.6 * kDia);
      const kq = new URLSearchParams(location.search).get("chave"), T = kq ? +kq : -4.3;
      if (sw > 0) U.expo.value = 2 ** (Math.max(-1, Math.min(2, (T - U.lG.value) * 1)) * kDia);
    }
    this.r.setRenderTarget(this.rt);
    this.r.render(this.cena, this.cam);
    this.r.setRenderTarget(null);
    this.ultimo = {
      ...pl,
      expo: K * U.expo.value,
      ref: refUsado,
      lG: U.lG.value + Math.log2(U.expo.value),
      estado: usado,
      veu: U.veuFora.value,
      nLo: this.nLo,
      bits12: pl.lista.map((it, i) => U.loIdx.value[i] >= 0 ? it.c.arq : null).filter(Boolean),
      bits8: pl.lista.map((it, i) => it.c.lo && U.loIdx.value[i] < 0 ? it.c.arq : null).filter(Boolean)
    };
    return this.rt.texture;
  }
  medeRef(RB) {   // 28/10: linear RGB of the composite (two 64x32 passes, 16 bits/channel, log2 -16..+4). v2 'chave': whole panorama,
    // white-albedo cells of the manifest mask (bottom row first), brightest 5 % dropped, median per channel = the point's white key
    const U = this.mat.uniforms, wb0 = U.wb.value.clone(), ex0 = U.expo.value, chave = RB.modo === "chave";
    U.wb.value.set(1, 1, 1); U.expo.value = 1; U.refUv.value.set(chave ? 0.5 : RB.uv[0], chave ? 0.5 : RB.uv[1]);
    if (chave) U.refSpan.value.set(1, 1); else if (RB.span) U.refSpan.value.set(RB.span[0], RB.span[1]);
    const hi = new Uint8Array(64 * 32 * 4), lo = new Uint8Array(64 * 32 * 4);
    U.modoLum.value = 2; this.r.setRenderTarget(this.rtLoc); this.r.render(this.cena, this.cam); this.r.readRenderTargetPixels(this.rtLoc, 0, 0, 64, 32, hi);
    U.modoLum.value = 3; this.r.render(this.cena, this.cam); this.r.readRenderTargetPixels(this.rtLoc, 0, 0, 64, 32, lo);
    U.modoLum.value = 0; this.r.setRenderTarget(null); U.wb.value.copy(wb0); U.expo.value = ex0;
    const px = (k) => [0, 1, 2].map((c) => 2 ** ((hi[k * 4 + c] + lo[k * 4 + c] / 255) / 255 * 20 - 16));
    if (chave) {
      if (!this._mascara) { const b = atob(RB.mascara); this._mascara = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) this._mascara[i] = b.charCodeAt(i); }
      let am = [];
      for (let k = 0; k < 64 * 32; k++) if (this._mascara[k >> 3] & (128 >> (k & 7))) am.push(px(k));
      if (am.length < 20) return null;
      am.sort((a, b) => lumJ(a) - lumJ(b)); am = am.slice(0, Math.max(1, Math.floor(am.length * 0.95)));
      const med = (c) => { const v = am.map((q) => q[c]).sort((a, b) => a - b), n = v.length; return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2; };
      const r = [med(0), med(1), med(2)]; return lumJ(r) > 1e-5 ? r : null;
    }
    const soma = [0, 0, 0];
    for (let k = 0; k < 64 * 32; k++) { const q = px(k); for (let c = 0; c < 3; c++) soma[c] += q[c]; }
    const r = soma.map((v) => v / (64 * 32));
    return lumJ(r) > 1e-5 ? r : null;
  }
  liberar() {
    this.liberado = true;
    this.rt.dispose();
    this.mat.dispose();
    this.rtLum.dispose();
    this.rtLoc.dispose();
    this.matBorra.dispose();
    for (const p of this.cache.values()) p.then((t) => t && t.dispose());
  }
}
// 28/10/2026 (re-audit 2 L1/L3, Fabrica-3D codigo/fase3/expoe_previas.py): WHITE-REFERENCE rule per point and mode. The point's manifest
// entry 'ref_branca' {uv, span} marks a plain white wall (the QA crop of material 'parede'). The composite there is measured LINEAR
// (wb = 1, expo = 1) and the white balance + exposure are solved so that, through this viewer's own display chain (shoulder, PBR-neutral,
// sRGB), the wall reads: DAY 205/255 with a partial (0.6) white balance; NIGHT the suite's approved white (175, 135, 97). Twilight blends
// the two (geometric, by kDia). '?semref' turns it off (old auto exposure). The previews (expoe_previas.py) use the same rule.
const REF_DIA = 205, REF_NOITE = [175, 135, 97];
const lumJ = (v) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
function neutralJ(c) {
  const st = 0.76, ds = 0.15; let x = Math.min(c[0], c[1], c[2]); const off = x < 0.08 ? x - 6.25 * x * x : 0.04; c = c.map((v) => v - off);
  const pk = Math.max(c[0], c[1], c[2]); if (pk < st) return c;
  const d = 1 - st, np = 1 - d * d / (pk + d - st); c = c.map((v) => v * np / pk); const gg = 1 - 1 / (ds * (pk - np) + 1);
  return c.map((v) => v * (1 - gg) + np * gg);
}
function telaJ(x, ombro) {
  const l = lumJ(x), k = (1 + 1 / ombro) / (1 + l / ombro); let o = neutralJ(x.map((v) => v * k));
  { const m = Math.max(o[0], o[1], o[2]); let t = Math.min(1, Math.max(0, (m - 0.85) / 0.15)); t = t * t * (3 - 2 * t); o = o.map((v) => v + (m - v) * t); }
  return o.map((v) => { v = Math.max(v, 0); return Math.min(255, (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255); });
}
function exPara(r, wb, alvoL, ombro) {
  let lo = -12, hi = 12;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, v = lumJ(telaJ(r.map((c, k) => c * wb[k] * 2 ** m), ombro)); if (v < alvoL) lo = m; else hi = m; }
  return 2 ** ((lo + hi) / 2);
}
function regraRef(r, kDia, ombro, RB = {}) {   // v2 28/10 (re-audit 3 G1): targets + per-mode EV cut from the manifest (expoe_previas.py)
  const ALD = RB.alvo_dia ? lumJ(RB.alvo_dia) : REF_DIA, ALN = RB.alvo_noite || REF_NOITE, AJ = RB.ajuste_ev || {};
  const Y = lumJ(r);
  let wbD = r.map((c) => (Y / Math.max(c, 1e-9)) ** 0.6); const nD = lumJ(wbD); wbD = wbD.map((w) => w / nD);
  const exD = exPara(r, wbD, ALD, ombro);
  let wbN = [1, 1, 1], exN = 1;
  for (let it = 0; it < 8; it++) {
    exN = exPara(r, wbN, lumJ(ALN), ombro); const cur = telaJ(r.map((c, k) => c * wbN[k] * exN), ombro);
    wbN = wbN.map((w, k) => w * (Math.max(ALN[k], 1) / Math.max(cur[k], 1)) ** 2.2); const n = lumJ(wbN); wbN = wbN.map((w) => w / n);
  }
  exN = exPara(r, wbN, lumJ(ALN), ombro);
  const aj = (AJ.noite || 0) * (1 - kDia) + (AJ.dia || 0) * kDia;   // cross-point clamp, measured offline (no point > +1 EV over P2)
  const wb = wbN.map((w, k) => w ** (1 - kDia) * wbD[k] ** kDia), ex = exN ** (1 - kDia) * exD ** kDia * 2 ** aj;
  return { wb, ex, leitura: telaJ(r.map((c, k) => c * wb[k] * ex), ombro).map(Math.round) };
}
let ALVO = 0.3;
function definirAlvo(x) {
  ALVO = x;
}
export {
  ALVO,
  INFO,
  MisturaPonto,
  ROTULO,
  VEU,
  ceuDoSol,
  definirAlvo,
  dhiLux,
  dniLux
};
