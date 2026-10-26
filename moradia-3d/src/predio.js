// demo de moradia (Fabrica-3D, 26/10/2026): configuração mínima do motor do tour 360 (sem prédio e sem marca)
const PREDIO_CFG = { id: "moradia-demo", geo: { sol: { lat: -23.59, lon: -46.67 }, rumoSolReserva: 67.4 }, marca: {} };
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
