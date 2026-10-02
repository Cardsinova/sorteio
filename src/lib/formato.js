// Formatadores criados uma vez só (criar Intl.NumberFormat a cada uso custa caro).

const fMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fNumero = new Intl.NumberFormat('pt-BR');
const fPorcento = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const moeda = n => fMoeda.format(n);
export const numero = n => fNumero.format(n);
export const porcento = n => fPorcento.format(n);
export const hora = ms => fHora.format(new Date(ms));

/** Número do cupom com zeros à esquerda: 42 com 5 dígitos → "00042". */
export const cupom = (n, digitos) => String(n).padStart(digitos, '0');

/** "1 cupom" / "12 cupons". */
export const cupons = n => `${numero(n)} ${n === 1 ? 'cupom' : 'cupons'}`;
