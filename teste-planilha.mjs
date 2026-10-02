// Confere a leitura da planilha: node teste-planilha.mjs [caminho-do-csv]
// Com um arquivo de verdade, só imprime contagens e totais (nenhum dado pessoal).
import { readFileSync } from 'node:fs';
import { decodificar, lerCSV, reconhecerColunas, montarParticipantes, aplicarOpcoes, nomeBonito, limparNome, mascararDocumento, numeroBR } from './src/lib/planilha.js';
import { distribuirCupons, cuponsPorPedido } from './src/lib/sorteio.js';

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'}  ${msg}`);
  if (!cond) falhas++;
};

// 1. Peças, com exemplos inventados.
ok(nomeBonito('ARARA AZUL REFEICOES LTDA') === 'Arara Azul Refeicoes LTDA', 'nome de empresa: palavras com maiúscula e LTDA mantido');
ok(nomeBonito('MARIA DA SILVA E SOUZA') === 'Maria da Silva e Souza', 'preposições em minúscula');
ok(nomeBonito('JOAO-PAULO D\'AVILA ME') === "Joao-Paulo D'Avila ME", 'hífen, apóstrofo e ME');
ok(mascararDocumento('12345678901') === '***.456.789-**', 'CPF mascarado');
ok(mascararDocumento('12345678000199') === '12.***.***/0001-**', 'CNPJ mascarado');
ok(limparNome('FULANO DE TAL 12345678901') === 'FULANO DE TAL', 'CPF no fim do nome (MEI) sai');
ok(limparNome('12.345.678 FULANA DE TAL') === 'FULANA DE TAL' && limparNome('12345678FULANA') === 'FULANA', 'raiz do CNPJ no começo sai');
ok(limparNome('LOJA 123.456.789-01 CENTRO') === 'LOJA CENTRO' && limparNome('X 12.345.678/0001-99') === 'X', 'CPF e CNPJ formatados saem');
ok(limparNome('PADARIA 2 IRMAOS') === 'PADARIA 2 IRMAOS', 'número curto do nome fica');
ok(numeroBR('1.234,56') === 1234.56 && numeroBR('185') === 185 && numeroBR('99,9') === 99.9 && Number.isNaN(numeroBR('')), 'valores em formato brasileiro');

const csv = [
  'Identificador;Situação;Nome;CPF/CNPJ;Valor de Venda;Observação',
  '1001;Aprovado;ANA LIMA;111.222.333-44;150,00;"texto com ; e\nquebra de linha"',
  '1002;Aprovado;ANA LIMA;111.222.333-44;50;',
  '1003;Cancelado;BRUNO REIS;555.666.777-88;300;',
  '1004;Aprovado;CASA AZUL LTDA;12.345.678/0001-99;0;',
  '1001;Aprovado;ANA LIMA;111.222.333-44;150,00;',
  ';;;;;',
].join('\r\n');
const lido = lerCSV(csv);
ok(lido.cabecalho.length === 6 && lido.linhas.length === 5, 'CSV com aspas, ";" e quebra de linha dentro do campo');
const mapa = reconhecerColunas(lido.cabecalho);
ok(mapa.pedido === 0 && mapa.situacao === 1 && mapa.nome === 2 && mapa.documento === 3 && mapa.valor === 4, 'colunas reconhecidas pelo nome');
const m = montarParticipantes(lido);
ok(m.resumo.pedidos === 3 && m.resumo.clientes === 2, '3 pedidos válidos de 2 clientes (cancelado e repetido ficam de fora)');
ok(m.resumo.ignorados.naoAprovado === 1 && m.resumo.ignorados.pedidoRepetido === 1, 'motivos de fora contados');
const ana = m.participantes.find(p => p.nome === 'Ana Lima');
ok(ana && ana.pedidos.length === 2 && ana.ticket === 200 && ana.documento === '***.222.333-**', 'cliente com 2 pedidos somados (R$ 200)');
ok(!JSON.stringify(m.participantes).includes('11122233344'), 'documento completo não fica guardado');
const semZero = aplicarOpcoes(m.participantes);
ok(semZero.length === 1 && semZero[0].nome === 'Ana Lima', 'pedido de R$ 0 fica de fora por padrão');
ok(aplicarOpcoes(m.participantes, { zeradosParticipam: true }).length === 2, 'com a opção, R$ 0 participa');
const igual = distribuirCupons(m.participantes, 10, 'igual');
ok(igual.participantes.every(p => p.cupons === 1) && igual.total === 2, 'modo "igual para todos": 1 cupom cada');

// 2. Planilha de verdade (se passada): só números.
const caminho = process.argv[2];
if (caminho) {
  const real = lerCSV(decodificar(readFileSync(caminho)));
  const r = montarParticipantes(real);
  console.log(`\nplanilha: ${real.cabecalho.length} colunas, ${real.linhas.length} linhas`);
  console.log('colunas usadas:', JSON.stringify(Object.fromEntries(Object.entries(reconhecerColunas(real.cabecalho)).map(([k, i]) => [k, i >= 0 ? real.cabecalho[i] : '—']))));
  console.log('resumo:', JSON.stringify(r.resumo));
  const entram = aplicarOpcoes(r.participantes);
  const d = distribuirCupons(entram, 10);
  const maior = d.participantes.reduce((a, b) => (b.cupons > a.cupons ? b : a));
  console.log(`no sorteio (sem R$ 0): ${entram.length} clientes, ${d.total} cupons; maior chance ${((maior.cupons / d.total) * 100).toFixed(3)}%`);
  ok(d.participantes.every(p => cuponsPorPedido(p).reduce((s, x) => s + x, 0) === p.cupons), 'cupons de cada cliente repartidos entre os pedidos dele sem sobra');
  // Pedido tem 6 dígitos; 8 ou mais seguidos seria CPF, CNPJ ou raiz de CNPJ (inclusive dentro do nome).
  ok(r.participantes.every(p => !/\d{8,}/.test(JSON.stringify(p))), 'nenhum CPF/CNPJ (nem raiz de CNPJ) guardado, nem dentro do nome');
  ok(r.participantes.every(p => p.nome && p.nome !== 'Cliente sem nome'), 'todo cliente ficou com nome depois da limpeza');
  const tamanho = JSON.stringify(r.participantes).length;
  console.log(`tamanho guardado no navegador: ${(tamanho / 1024).toFixed(0)} KB`);
  ok(tamanho < 2_000_000, 'cabe no armazenamento do navegador');
}

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
