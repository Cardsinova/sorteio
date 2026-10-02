// DADOS DE DEMONSTRAÇÃO. Nomes, documentos e cidades são inventados.
// A planilha de emissões de verdade entra quando o formato dela estiver definido.
//
// Gerados por um sorteador com semente fixa: toda vez saem os mesmos 140 clientes,
// então a lista não muda entre uma abertura e outra.

function semente(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = semente(20261002);
const um = lista => lista[Math.floor(rnd() * lista.length)];
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const NOMES = [
  'Ana', 'Beatriz', 'Bruno', 'Camila', 'Carlos', 'Clara', 'Daniel', 'Débora', 'Eduardo', 'Elisa', 'Fábio',
  'Fernanda', 'Gabriel', 'Giovana', 'Gustavo', 'Helena', 'Henrique', 'Isabela', 'Igor', 'Juliana', 'João',
  'Larissa', 'Leonardo', 'Lívia', 'Lucas', 'Marcela', 'Marcos', 'Mariana', 'Matheus', 'Natália', 'Otávio',
  'Patrícia', 'Paulo', 'Rafaela', 'Renato', 'Sabrina', 'Sérgio', 'Talita', 'Thiago', 'Valéria', 'Vinícius',
];

const SOBRENOMES = [
  'Albuquerque', 'Almeida', 'Andrade', 'Barbosa', 'Bastos', 'Cardoso', 'Carvalho', 'Castro', 'Correia', 'Costa',
  'Dias', 'Duarte', 'Esteves', 'Farias', 'Fonseca', 'Freitas', 'Gomes', 'Guimarães', 'Lacerda', 'Lemos', 'Lopes',
  'Macedo', 'Machado', 'Martins', 'Medeiros', 'Moreira', 'Nogueira', 'Pacheco', 'Peixoto', 'Pereira', 'Pinheiro',
  'Queiroz', 'Ramos', 'Rezende', 'Ribeiro', 'Rocha', 'Sampaio', 'Siqueira', 'Teixeira', 'Valente', 'Vieira',
];

const EMPRESAS = [
  s => `${s} Contabilidade`,
  s => `${s} & ${um(SOBRENOMES)} Assessoria Contábil`,
  s => `Escritório ${s} de Contabilidade`,
  s => `${s} Transportes Ltda`,
  s => `Clínica ${s}`,
  s => `Mercado ${s}`,
  s => `${s} Engenharia e Projetos`,
  s => `Auto Peças ${s}`,
  s => `${s} Advogados Associados`,
  s => `Farmácia ${s}`,
  s => `${s} Comércio de Alimentos`,
  s => `Construtora ${s}`,
];

const CIDADES = [
  ['Americana', 'SP'], ['Campinas', 'SP'], ['Limeira', 'SP'], ['Piracicaba', 'SP'], ['Sumaré', 'SP'],
  ["Santa Bárbara d'Oeste", 'SP'], ['Nova Odessa', 'SP'], ['Hortolândia', 'SP'], ['Paulínia', 'SP'],
  ['Rio Claro', 'SP'], ['Indaiatuba', 'SP'], ['Valinhos', 'SP'], ['Jundiaí', 'SP'], ['Ribeirão Preto', 'SP'],
  ['São Paulo', 'SP'], ['Sorocaba', 'SP'], ['Belo Horizonte', 'MG'], ['Curitiba', 'PR'],
];

const PRECO_CPF = [129.9, 149.9, 169.9, 189.9];
const PRECO_CNPJ = [189.9, 229.9, 259.9, 289.9, 349.9];

const d = n => String(entre(0, 10 ** n - 1)).padStart(n, '0');
const cpfMascarado = () => `***.${d(3)}.${d(3)}-**`;
const cnpjMascarado = () => `${d(2)}.***.***/0001-**`;

function gerar(qtd) {
  const usados = new Set();
  const lista = [];
  while (lista.length < qtd) {
    const empresa = rnd() < 0.45;
    const nome = empresa
      ? um(EMPRESAS)(um(SOBRENOMES))
      : `${um(NOMES)} ${um(SOBRENOMES)}${rnd() < 0.5 ? ` ${um(SOBRENOMES)}` : ''}`;
    if (usados.has(nome)) continue;
    usados.add(nome);

    // Pessoa física costuma ter 1 emissão; contabilidade e empresa, várias.
    const emissoes = empresa
      ? rnd() < 0.25
        ? entre(8, 42)
        : entre(1, 6)
      : rnd() < 0.85
        ? 1
        : entre(2, 3);
    let ticket = 0;
    const valores = [];
    for (let i = 0; i < emissoes; i++) {
      const v = um(empresa ? PRECO_CNPJ : PRECO_CPF);
      valores.push(v);
      ticket += v;
    }

    const [cidade, uf] = um(CIDADES);
    lista.push({
      id: `c${String(lista.length + 1).padStart(3, '0')}`,
      nome,
      tipo: empresa ? 'CNPJ' : 'CPF',
      documento: empresa ? cnpjMascarado() : cpfMascarado(),
      cidade,
      uf,
      emissoes,
      ticket: Math.round(ticket * 100) / 100,
      valores, // vira a lista de pedidos logo abaixo
    });
  }
  return lista;
}

// Números de pedido inventados (6 dígitos, como os do GFSIS), um por emissão.
// Sorteador SEPARADO: assim os clientes acima continuam exatamente os mesmos de antes.
function comPedidos(lista) {
  const rndPedido = semente(4242);
  const usados = new Set();
  const novoNumero = () => {
    for (;;) {
      const n = 170000 + Math.floor(rndPedido() * 9999);
      if (!usados.has(n)) {
        usados.add(n);
        return n;
      }
    }
  };
  return lista.map(({ valores, ...c }) => ({
    ...c,
    pedidos: valores.map(valor => ({ numero: novoNumero(), valor })).sort((a, b) => a.numero - b.numero),
  }));
}

export const CLIENTES_DEMO = comPedidos(gerar(140));
