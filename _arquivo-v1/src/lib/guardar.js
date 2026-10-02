// Guarda no navegador o que não pode se perder se a página recarregar no meio da live
// (ganhadores e ajustes). O armazenamento pode falhar (aba anônima, bloqueio):
// nesse caso o sorteio continua funcionando, só não lembra depois.

export function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto == null ? padrao : JSON.parse(bruto);
  } catch {
    return padrao;
  }
}

export function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: segue sem lembrar */
  }
}
