// Gera src/data/padrao.js a partir da planilha do sorteio: node gerar-padrao.mjs <arquivo.csv>
// Só clientes das 9 cidades: nome, cidade, número do pedido e CPF/CNPJ MASCARADO
// (pedido do Enzo, 2026-10-02). NÃO vai: documento completo, valores, e-mail, telefone, endereço.
// Atenção: este arquivo entra no site publicado. Quem abrir o site consegue ler esta lista.
import { readFileSync, writeFileSync } from 'node:fs';
import { decodificar, lerCSV, montarParticipantes } from './src/lib/planilha.js';
import { NOMES_CIDADES } from './src/lib/cidades.js';

const arquivo = process.argv[2];
if (!arquivo) throw new Error('uso: node gerar-padrao.mjs <arquivo.csv>');
const { participantes, resumo } = montarParticipantes(lerCSV(decodificar(readFileSync(arquivo))));
const lista = participantes
  .filter(p => NOMES_CIDADES.includes(p.cidade))
  .map(p => ({
    id: p.id,
    nome: p.nome,
    tipo: p.tipo,
    documento: p.documento, // já mascarado na leitura (ex.: 12.***.***/0001-**)
    cidade: p.cidade,
    uf: p.uf,
    emissoes: p.pedidos.length,
    ticket: 0,
    pedidos: p.pedidos.map(x => ({ numero: x.numero, valor: 0 })),
  }));
const nome = arquivo.split(/[\\/]/).pop();
const conteudo = `// GERADO por gerar-padrao.mjs a partir de "${nome}" em ${new Date().toISOString().slice(0, 10)}.
// ${lista.length} clientes das 9 cidades (de ${resumo.clientes} na planilha). Nome, cidade, pedido e CPF/CNPJ mascarado.
// ATENÇÃO: este arquivo vai junto no site publicado (dado pessoal: nome de cliente).
export const PADRAO = ${JSON.stringify({ arquivo: nome, versao: 2, clientes: lista.length, participantes: lista })};
`;
writeFileSync('src/data/padrao.js', conteudo);
console.log(`src/data/padrao.js: ${lista.length} clientes, ${(conteudo.length / 1024).toFixed(0)} KB`);
console.log(
  'documento mascarado em todos:',
  lista.every(p => p.documento.includes('*')),
  '| nenhum número de 8+ dígitos (documento completo):',
  !/\d{8,}/.test(JSON.stringify(lista)),
);
