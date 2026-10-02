// Cidade pelo CEP. A planilha do GFSIS não tem coluna de cidade, só o endereço com
// o CEP no fim ("RUA X, 265 - JARDIM Y - 13466-510"). Pedido do Enzo em 2026-10-02:
// participam só clientes destas 9 cidades.
//
// Faixas dos Correios conferidas em 2026-10-02 (rainydays.com.br, ruacep.com.br,
// unasp.br, geografos.com.br). Cada faixa: 5 primeiros dígitos do CEP, de/até.

export const CIDADES = [
  { nome: 'Americana', faixas: [[13465, 13479]] },
  { nome: 'Campinas', faixas: [[13000, 13139]] },
  { nome: 'Sumaré', faixas: [[13170, 13182]] },
  { nome: 'Nova Odessa', faixas: [[13380, 13389]] },
  { nome: "Santa Bárbara d'Oeste", faixas: [[13450, 13459]] },
  { nome: 'Paulínia', faixas: [[13140, 13149]] },
  { nome: 'Limeira', faixas: [[13480, 13489]] },
  { nome: 'Hortolândia', faixas: [[13183, 13189]] },
  { nome: 'Artur Nogueira', faixas: [[13160, 13169]] },
];

// Engenheiro Coelho usava o CEP geral 13165-000 (dentro da faixa de Artur Nogueira)
// até ganhar CEP por rua (13445–13449). Cadastro antigo com ele NÃO é Artur Nogueira.
const FORA = new Set(['13165000']);

/** "…- 13466-510" → "13466510" (último CEP do texto), ou '' se não houver. */
export function cepDoEndereco(texto) {
  const achados = String(texto ?? '').match(/\d{5}-?\d{3}/g);
  return achados ? achados[achados.length - 1].replace('-', '') : '';
}

/** Nome da cidade (das 9) pelo CEP, ou '' se for de outra cidade. */
export function cidadePorCep(cep) {
  if (!/^\d{8}$/.test(cep) || FORA.has(cep)) return '';
  const cinco = Number(cep.slice(0, 5));
  const c = CIDADES.find(x => x.faixas.some(([de, ate]) => cinco >= de && cinco <= ate));
  return c ? c.nome : '';
}

export const NOMES_CIDADES = CIDADES.map(c => c.nome);
