// Leitura da planilha de participantes (CSV), sem biblioteca: tudo acontece no
// navegador, nada é enviado para fora.
//
// Feito em cima da exportação de pedidos do GFSIS (2026-10-02): separada por ";",
// acentos no padrão antigo do Windows (windows-1252), um pedido por linha, 77 colunas.
// Mas não depende dela: reconhece as colunas pelo nome e aceita "," ou tabulação.
//
// Dados pessoais: da planilha só se guarda o necessário para o sorteio (número do
// pedido, nome, valor e o CPF/CNPJ JÁ MASCARADO). E-mail, telefone, endereço e o
// documento completo não saem da memória da página. Do endereço, só a CIDADE (tirada
// do CEP); o CEP em si também não é guardado.

import { cepDoEndereco, cidadePorCep } from './cidades.js';

/** Texto do arquivo: tenta UTF-8; se não for, lê como windows-1252 (Excel/GFSIS). */
export function decodificar(buffer) {
  const bytes = new Uint8Array(buffer);
  const semBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(semBom);
  } catch {
    return new TextDecoder('windows-1252').decode(semBom);
  }
}

/** Separador mais provável, contando na primeira linha (fora de aspas). */
function separador(texto) {
  const primeira = texto.slice(0, texto.search(/\r|\n|$/));
  let melhor = ';';
  let maior = -1;
  for (const s of [';', ',', '\t']) {
    let n = 0;
    let aspas = false;
    for (const c of primeira) {
      if (c === '"') aspas = !aspas;
      else if (c === s && !aspas) n++;
    }
    if (n > maior) {
      maior = n;
      melhor = s;
    }
  }
  return melhor;
}

/** CSV → linhas de campos. Aceita aspas com ";" e quebra de linha dentro, e "" como aspas. */
export function lerCSV(texto) {
  const sep = separador(texto);
  const linhas = [];
  let campo = '';
  let linha = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      campo = '';
      linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  const uteis = linhas.filter(l => l.some(v => v.trim()));
  return { cabecalho: (uteis[0] ?? []).map(c => c.trim()), linhas: uteis.slice(1) };
}

const simples = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim();

// Nomes de coluna aceitos para cada informação, do mais provável ao menos.
const CANDIDATAS = {
  pedido: ['identificador', 'numero do pedido', 'n pedido', 'pedido', 'numero', 'id'],
  nome: ['nome', 'cliente', 'nome do cliente', 'razao social'],
  documento: ['cpf/cnpj', 'cpf cnpj', 'documento', 'cnpj', 'cpf'],
  valor: ['valor de venda', 'valor total', 'valor', 'ticket', 'total'],
  situacao: ['situacao', 'status'],
  cidade: ['cidade', 'municipio'],
  endereco: ['endereco cliente', 'endereco', 'cep'],
  uf: ['uf', 'estado'],
};

/** Qual coluna é o quê, pelo nome. Devolve o índice da coluna (ou -1). */
export function reconhecerColunas(cabecalho) {
  const nomes = cabecalho.map(simples);
  const mapa = {};
  for (const [chave, opcoes] of Object.entries(CANDIDATAS)) {
    mapa[chave] = -1;
    for (const op of opcoes) {
      const i = nomes.indexOf(op);
      if (i >= 0) {
        mapa[chave] = i;
        break;
      }
    }
  }
  return mapa;
}

/** "1.234,56" → 1234.56; "185" → 185; vazio → NaN. */
export function numeroBR(texto) {
  let s = String(texto ?? '')
    .replace(/[R$\s]/g, '')
    .trim();
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return Number(s);
}

/**
 * Tira números de documento de dentro do nome. Nome de MEI leva o CPF do dono
 * ("FULANO DE TAL 12345678901") ou a raiz do CNPJ ("12.345.678 FULANO DE TAL").
 * Achado na planilha de 2026-10-02: 25 nomes com CPF no fim, 73 com raiz de CNPJ
 * no começo. Sem isto, o CPF apareceria inteiro no telão.
 */
export function limparNome(nome) {
  return String(nome ?? '')
    .replace(/(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g, ' ') // CNPJ inteiro
    .replace(/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g, ' ') // CPF
    .replace(/^\s*\d{2}\.?\d{3}\.?\d{3}(?!\d)/, ' ') // raiz do CNPJ no começo
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–.,]+|[\s\-–.,]+$/g, '')
    .trim();
}

const MAIUSCULAS = new Set(['LTDA', 'ME', 'EPP', 'EIRELI', 'S/A', 'SA', 'S.A.', 'S/S', 'SS', 'MEI', 'CIA', 'SLU', 'EI', 'II', 'III', 'IV', 'CNPJ', 'CPF', 'ONG']);
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'para', 'com', 'a', 'o', 'ao']);

/** "ARARATE REFEICOES LTDA" → "Ararate Refeicoes LTDA" (preposições minúsculas, siglas de empresa mantidas). */
export function nomeBonito(nome) {
  const palavras = String(nome ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ');
  return palavras
    .map((p, i) => {
      const cima = p.toUpperCase();
      if (MAIUSCULAS.has(cima) || /\d/.test(p)) return cima;
      const baixo = p.toLocaleLowerCase('pt-BR');
      if (i > 0 && MINUSCULAS.has(baixo)) return baixo;
      // cada parte de "joao-paulo" e "d'avila" com a primeira letra maiúscula
      return baixo.replace(/(^|[-'’])(\p{L})/gu, (_, sep, letra) => sep + letra.toLocaleUpperCase('pt-BR'));
    })
    .join(' ');
}

// CPF → "***.456.789-**"; CNPJ → "12.***.***" + "/0001-**". Outro tamanho: só asteriscos.
// (Comentário de linha de propósito: o exemplo do CNPJ tem "*" seguido de "/", que fecharia um comentário de bloco.)
export function mascararDocumento(digitos) {
  if (digitos.length === 11) return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
  if (digitos.length === 14) return `${digitos.slice(0, 2)}.***.***/${digitos.slice(8, 12)}-**`;
  return digitos ? '***' : '';
}

/**
 * Identificador estável do cliente SEM guardar o CPF/CNPJ: dois resumos FNV-1a
 * de 32 bits, escritos só com letras (a–p). Em hexadecimal, às vezes saíam 11 ou
 * mais algarismos seguidos, que pareceriam um CPF numa conferência.
 */
function resumo(texto) {
  const fnv = semente => {
    let h = semente >>> 0;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h
      .toString(16)
      .padStart(8, '0')
      .replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
  };
  return fnv(2166136261) + fnv(0x9747b28c);
}

/**
 * Linhas da planilha → clientes do sorteio, cada um com os seus pedidos.
 * Entra quem tem número de pedido e nome (ou documento). Se houver coluna de
 * situação, só os pedidos "Aprovado". Clientes juntados pelo CPF/CNPJ (ou pelo
 * nome, se não houver documento).
 */
export function montarParticipantes({ cabecalho, linhas }, mapa = reconhecerColunas(cabecalho)) {
  const pega = (l, chave) => (mapa[chave] >= 0 ? String(l[mapa[chave]] ?? '').trim() : '');
  const ignorados = { semPedido: 0, semNome: 0, naoAprovado: 0, pedidoRepetido: 0 };
  const porCliente = new Map();
  const pedidosVistos = new Set();
  let validos = 0;
  let valorTotal = 0;
  let zerados = 0;

  for (const l of linhas) {
    const pedido = pega(l, 'pedido');
    const nomeCru = pega(l, 'nome');
    const digitos = pega(l, 'documento').replace(/\D/g, '');
    if (!pedido) {
      ignorados.semPedido++;
      continue;
    }
    if (!nomeCru && !digitos) {
      ignorados.semNome++;
      continue;
    }
    if (mapa.situacao >= 0 && simples(pega(l, 'situacao')) !== 'aprovado') {
      ignorados.naoAprovado++;
      continue;
    }
    if (pedidosVistos.has(pedido)) {
      ignorados.pedidoRepetido++;
      continue;
    }
    pedidosVistos.add(pedido);

    const valorLido = mapa.valor >= 0 ? numeroBR(pega(l, 'valor')) : NaN;
    const valor = Number.isFinite(valorLido) ? Math.max(0, valorLido) : 0;
    if (valor === 0) zerados++;
    valorTotal += valor;
    validos++;

    const chave = digitos || `nome:${simples(nomeCru)}`;
    let c = porCliente.get(chave);
    if (!c) {
      c = {
        id: `p${resumo(chave)}`,
        nome: nomeBonito(limparNome(nomeCru) || 'Cliente sem nome'),
        tipo: digitos.length === 11 ? 'CPF' : digitos.length === 14 ? 'CNPJ' : '',
        documento: mascararDocumento(digitos),
        // sem coluna de cidade (GFSIS): a cidade sai do CEP do endereço, se for uma das 9
        cidade: pega(l, 'cidade') ? nomeBonito(pega(l, 'cidade')) : cidadePorCep(cepDoEndereco(pega(l, 'endereco'))),
        uf: pega(l, 'uf').toUpperCase() || (mapa.cidade < 0 && mapa.endereco >= 0 ? 'SP' : ''),
        pedidos: [],
      };
      porCliente.set(chave, c);
    }
    const numero = /^\d+$/.test(pedido) ? Number(pedido) : pedido;
    c.pedidos.push({ numero, valor: Math.round(valor * 100) / 100 });
  }

  const participantes = [...porCliente.values()].map(c => {
    c.pedidos.sort((a, b) => String(a.numero).localeCompare(String(b.numero), 'pt-BR', { numeric: true }));
    const ticket = c.pedidos.reduce((s, p) => s + p.valor, 0);
    return { ...c, emissoes: c.pedidos.length, ticket: Math.round(ticket * 100) / 100 };
  });

  return {
    participantes,
    resumo: {
      linhas: linhas.length,
      pedidos: validos,
      clientes: participantes.length,
      valorTotal: Math.round(valorTotal * 100) / 100,
      zerados,
      ignorados,
    },
  };
}

/**
 * Quem entra no sorteio, conforme as opções:
 * - pedidos de R$ 0 ficam de fora (padrão): pela regra do ticket, valor zero é chance zero;
 * - cliente sem nenhum pedido que conte sai da lista.
 */
export function aplicarOpcoes(participantes, { zeradosParticipam = false } = {}) {
  if (zeradosParticipam) return participantes;
  const saida = [];
  for (const p of participantes) {
    if (!p.pedidos) {
      saida.push(p);
      continue;
    }
    const pedidos = p.pedidos.filter(x => x.valor > 0);
    if (!pedidos.length) continue;
    if (pedidos.length === p.pedidos.length) {
      saida.push(p);
      continue;
    }
    const ticket = Math.round(pedidos.reduce((s, x) => s + x.valor, 0) * 100) / 100;
    saida.push({ ...p, pedidos, emissoes: pedidos.length, ticket });
  }
  return saida;
}
