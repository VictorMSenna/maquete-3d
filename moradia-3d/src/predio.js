// demo de moradia (Fabrica-3D, 26/10/2026): configuração mínima do motor do tour 360 (sem prédio e sem marca)
const PREDIO_CFG = { id: "moradia-demo", geo: { sol: { lat: -23.5878, lon: -46.6519 }, rumoSolReserva: 220 }   /* 27/10 E1 Av. Pedro Alvares Cabral (balcony SW 220 deg); before D2 VNC 67.4 */, marca: {},
  // 26/10 Google window (rule 27): same fields the Upper predio.json gives google-vista.js (fachadas-angulo extent; window eye)
  entorno: { extensaoFachadas_m: 4096 /* 27/10 E1 maps: LiDAR facades + OSM street lights over +-4096 m (gera_mapas_noite.py) */ }, tour360: { olhoJanela: [3.7, 4.3, 1.55] } };
const chaveLocal = (nome) => `${PREDIO_CFG.id}:${nome}`;
function migraChave(area, nome) {
  try {
    const velho = area.getItem(nome);
    if (velho != null && area.getItem(chaveLocal(nome)) == null) area.setItem(chaveLocal(nome), velho);
    if (velho != null) area.removeItem(nome);
  } catch (e) {
  }
}
export {
  PREDIO_CFG,
  chaveLocal,
  migraChave
};
