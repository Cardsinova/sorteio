// Paleta da festa: roxo e laranja da marca mais seis cores.
// Na roda, a ordem alterna cor escura e cor clara, para fatias vizinhas
// nunca se confundirem. `texto` é a cor do nome escrito em cima da fatia
// (branco nas escuras, quase preto nas claras: contraste para ler de longe).
// `forte` é a versão escura da cor, para número escrito sobre fundo branco.

export const CORES = [
  { nome: 'roxo', fundo: '#661081', texto: '#ffffff', forte: '#661081' },
  { nome: 'laranja', fundo: '#f19800', texto: '#2a1600', forte: '#a85d00' },
  { nome: 'azul', fundo: '#2f6fed', texto: '#ffffff', forte: '#1f56c3' },
  { nome: 'amarelo', fundo: '#ffc928', texto: '#2a1d00', forte: '#8a6100' },
  { nome: 'rosa', fundo: '#e01b74', texto: '#ffffff', forte: '#c2185b' },
  { nome: 'turquesa', fundo: '#17b3d0', texto: '#03232b', forte: '#0b7285' },
  { nome: 'violeta', fundo: '#9c3fd6', texto: '#ffffff', forte: '#7a2bb0' },
  { nome: 'verde', fundo: '#16b07a', texto: '#03261a', forte: '#0b7a52' },
];

/** Cor de cada fatia, sem repetir a vizinha (nem na emenda entre a última e a primeira). */
export function corDaFatia(i, total) {
  const n = CORES.length;
  let c = i % n;
  if (i === total - 1 && total > 1 && c === 0) c = (c + 1) % n;
  return CORES[c];
}
