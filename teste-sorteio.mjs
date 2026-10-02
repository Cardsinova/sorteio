// Confere a regra do sorteio sem abrir a página: node teste-sorteio.mjs
import { distribuirCupons, sortear, inteiroSeguro, amostraDoRolo, cuponsPorPedido, pedidoDoCupom } from './src/lib/sorteio.js';
import { CLIENTES_DEMO } from './src/data/demo.js';

let falhas = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'}  ${msg}`);
  if (!cond) falhas++;
};

// 1. Cupons: 1 a cada R$ X, mínimo 1, numeração contínua sem buraco.
const mini = [
  { id: 'a', nome: 'Bia', ticket: 0.3 },
  { id: 'b', nome: 'Ana', ticket: 25 },
  { id: 'c', nome: 'Caio', ticket: 4 },
];
const m = distribuirCupons(mini, 0.1);
ok(m.participantes.map(p => p.nome).join(',') === 'Ana,Bia,Caio', 'ordem alfabética');
ok(m.participantes[1].cupons === 3, 'R$ 0,30 a R$ 0,10 por cupom = 3 cupons (sem erro de arredondamento)');
const m10 = distribuirCupons(mini, 10);
ok(m10.participantes.map(p => p.cupons).join(',') === '2,1,1', 'R$ 25 → 2; R$ 0,30 e R$ 4 → mínimo de 1');
ok(m10.total === 4 && m10.participantes[2].inicio === 4 && m10.participantes[2].fim === 4, 'faixas 1–2, 3, 4');

const demo = distribuirCupons(CLIENTES_DEMO, 10);
let esperado = 1;
let continuo = true;
for (const p of demo.participantes) {
  if (p.inicio !== esperado) continuo = false;
  esperado = p.fim + 1;
}
ok(continuo && esperado - 1 === demo.total, `demonstração: ${demo.participantes.length} clientes, ${demo.total} cupons, sem buraco`);

// 2. Gerador: uniforme dentro do intervalo.
let foraDoIntervalo = 0;
for (let i = 0; i < 50000; i++) {
  const n = inteiroSeguro(7);
  if (n < 0 || n > 6 || !Number.isInteger(n)) foraDoIntervalo++;
}
ok(foraDoIntervalo === 0, 'inteiroSeguro(7) sempre entre 0 e 6');

// 3. Chance proporcional ao ticket: 300 mil sorteios num grupo pequeno.
const grupo = distribuirCupons(
  [
    { id: 'x', nome: 'X', ticket: 100 },
    { id: 'y', nome: 'Y', ticket: 300 },
    { id: 'z', nome: 'Z', ticket: 600 },
  ],
  10,
);
const contagem = { x: 0, y: 0, z: 0 };
const N = 300000;
for (let i = 0; i < N; i++) contagem[sortear(grupo.participantes).participante.id]++;
const fx = contagem.x / N, fy = contagem.y / N, fz = contagem.z / N;
console.log(`      X ${(fx * 100).toFixed(2)}% (esperado 10%) · Y ${(fy * 100).toFixed(2)}% (30%) · Z ${(fz * 100).toFixed(2)}% (60%)`);
ok(Math.abs(fx - 0.1) < 0.004 && Math.abs(fy - 0.3) < 0.006 && Math.abs(fz - 0.6) < 0.006, 'frequência bate com o ticket');

// 4. Cupom sorteado pertence ao ganhador; quem já ganhou não sai de novo.
let cupomCerto = true;
let repetiu = false;
const fora = new Set(['z']);
for (let i = 0; i < 20000; i++) {
  const r = sortear(demo.participantes);
  if (r.cupom < r.participante.inicio || r.cupom > r.participante.fim) cupomCerto = false;
  if (sortear(grupo.participantes, fora).participante.id === 'z') repetiu = true;
}
ok(cupomCerto, 'o cupom sorteado está sempre na faixa do ganhador');
ok(!repetiu, 'cliente excluído (já ganhou) nunca sai');
const semNinguem = sortear(grupo.participantes, new Set(['x', 'y', 'z']));
ok(semNinguem === null, 'sem ninguém elegível: não sorteia');

// 5. Com exclusão, a chance se redistribui entre os que sobram (X 1/4, Y 3/4).
const c2 = { x: 0, y: 0 };
for (let i = 0; i < 100000; i++) c2[sortear(grupo.participantes, fora).participante.id]++;
ok(Math.abs(c2.x / 100000 - 0.25) < 0.006, `sem Z: X ${(c2.x / 1000).toFixed(2)}% (esperado 25%)`);

// 6. Pedido: os cupons do cliente se repartem entre os pedidos dele, sem sobrar nem faltar.
const pDemo = demo.participantes.find(p => p.pedidos.length >= 5);
const partes = cuponsPorPedido(pDemo);
ok(partes.reduce((s, x) => s + x, 0) === pDemo.cupons, `${pDemo.nome}: ${pDemo.pedidos.length} pedidos, ${pDemo.cupons} cupons repartidos sem sobra`);
let todosCasam = true;
for (const p of demo.participantes) {
  if (cuponsPorPedido(p).reduce((s, x) => s + x, 0) !== p.cupons) todosCasam = false;
}
ok(todosCasam, 'repartição fecha para os 140 clientes');
const contagemPedido = new Map();
for (let c = pDemo.inicio; c <= pDemo.fim; c++) {
  const ped = pedidoDoCupom(pDemo, c);
  contagemPedido.set(ped.numero, (contagemPedido.get(ped.numero) ?? 0) + 1);
}
ok(
  pDemo.pedidos.every((ped, i) => contagemPedido.get(ped.numero) === partes[i] || (partes[i] === 0 && !contagemPedido.has(ped.numero))),
  'cada cupom do cliente cai num pedido dele, na quantidade repartida',
);
const doisPedidos = { inicio: 1, cupons: 4, pedidos: [{ numero: 10, valor: 30 }, { numero: 11, valor: 10 }] };
ok(
  [1, 2, 3, 4].map(c => pedidoDoCupom(doisPedidos, c).numero).join(',') === '10,10,10,11',
  'pedido de R$ 30 fica com 3 cupons e o de R$ 10 com 1',
);
ok(pedidoDoCupom({ inicio: 1, cupons: 2 }, 1) === null, 'cliente sem pedidos: sem número de pedido');

// 7. Rolo: tamanho certo e sem o mesmo nome duas vezes seguidas.
const rolo = amostraDoRolo(demo.participantes, 200);
ok(rolo.length === 200 && rolo.every((p, i) => i === 0 || p !== rolo[i - 1]), 'rolo com 200 nomes, sem repetir em sequência');

console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
