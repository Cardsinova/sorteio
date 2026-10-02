// O coração do sorteio. Sem React aqui: dá para testar sozinho (teste-sorteio.mjs).
//
// Regra: cada cliente recebe 1 cupom a cada R$ X de ticket, no mínimo 1.
// Os cupons são numerados de 1 até o total, em ordem alfabética dos clientes.
// Sorteia-se UM número de cupom; o dono dele ganha. Quem tem mais cupons tem
// mais chance, na proporção exata do ticket.

const ordemNome = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

const centavos = v => Math.round(Number(v) * 100);

export function distribuirCupons(lista, reaisPorCupom) {
  // Conta em centavos: 0,30 / 0,10 em ponto flutuante dá 2,999…, e o cliente perderia um cupom.
  const passo = Math.max(1, centavos(reaisPorCupom) || 1);
  const ordenada = [...lista].sort((a, b) => ordemNome.compare(a.nome, b.nome) || String(a.id).localeCompare(String(b.id)));

  let proximo = 1;
  const participantes = ordenada.map(p => {
    const qtd = Math.max(1, Math.floor(centavos(p.ticket) / passo));
    const item = { ...p, cupons: qtd, inicio: proximo, fim: proximo + qtd - 1 };
    proximo += qtd;
    return item;
  });
  return { participantes, total: proximo - 1 };
}

/**
 * Inteiro de 0 a max-1, do gerador criptográfico do navegador.
 * O descarte acima de `limite` evita o viés do resto da divisão: sem ele,
 * os primeiros números teriam uma chance minúscula a mais.
 */
export function inteiroSeguro(max) {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError('max fora do intervalo');
  const limite = Math.floor(2 ** 32 / max) * max;
  const caixa = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(caixa);
    if (caixa[0] < limite) return caixa[0] % max;
  }
}

/**
 * Sorteia entre os cupons de quem ainda pode ganhar.
 * Os números dos cupons não mudam quando alguém sai: só deixam de valer.
 * É o mesmo que sortear de novo sempre que sai um cupom de quem já ganhou,
 * mas sem a cena repetida na tela.
 */
export function sortear(participantes, excluidos = new Set()) {
  const elegiveis = participantes.filter(p => !excluidos.has(p.id));
  const totalElegivel = elegiveis.reduce((s, p) => s + p.cupons, 0);
  if (!totalElegivel) return null;

  let r = inteiroSeguro(totalElegivel);
  for (const p of elegiveis) {
    if (r < p.cupons) {
      return { participante: p, cupom: p.inicio + r, totalElegivel, chance: p.cupons / totalElegivel };
    }
    r -= p.cupons;
  }
  return null; // não acontece: r < totalElegivel
}

/**
 * Nomes que passam no rolo durante o giro. Só enfeite (Math.random basta),
 * mas ponderado: quem tem mais cupons aparece mais, e a tela mostra isso.
 */
export function amostraDoRolo(participantes, n) {
  if (!participantes.length) return [];
  const acumulado = [];
  let soma = 0;
  for (const p of participantes) acumulado.push((soma += p.cupons));

  const saida = [];
  let anterior = null;
  for (let i = 0; i < n; i++) {
    let p;
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const alvo = Math.random() * soma;
      let lo = 0;
      let hi = acumulado.length - 1;
      while (lo < hi) {
        const meio = (lo + hi) >> 1;
        if (acumulado[meio] > alvo) hi = meio;
        else lo = meio + 1;
      }
      p = participantes[lo];
      if (p !== anterior || participantes.length === 1) break;
    }
    saida.push(p);
    anterior = p;
  }
  return saida;
}
