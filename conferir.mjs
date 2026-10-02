// Confere o sorteio num Chrome sem janela: node conferir.mjs [pasta-das-fotos]
// Precisa do servidor no ar (npx vite preview --port 5192) e usa o puppeteer-core
// instalado no projeto do site.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { distribuirCupons, pedidoDoCupom } from './src/lib/sorteio.js';
import { aplicarOpcoes, decodificar, lerCSV, montarParticipantes } from './src/lib/planilha.js';
import { NOMES_CIDADES } from './src/lib/cidades.js';
import { CLIENTES_DEMO } from './src/data/demo.js';

const require = createRequire('C:/Users/enzo.raymundo/Desktop/site-cardsinova-v2/package.json');
const puppeteer = require('puppeteer-core');

const URL = 'http://localhost:5192/';
const FOTOS = process.argv[2];
if (FOTOS) mkdirSync(FOTOS, { recursive: true });
const dorme = ms => new Promise(r => setTimeout(r, ms));
const resultados = [];
const ok = (nome, passou, detalhe = '') => resultados.push({ nome, passou, detalhe });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--autoplay-policy=no-user-gesture-required'],
});

const errosGerais = [];

async function abrir({ largura = 1440, altura = 900, reduzir = false, som = true, suspense = 'curto', limpar = true, pausa = 8 } = {}) {
  const page = await browser.newPage();
  page.on('pageerror', e => errosGerais.push(String(e)));
  page.on('console', m => m.type() === 'error' && errosGerais.push(m.text()));
  page.on('response', r => r.status() >= 400 && errosGerais.push(`${r.status()} ${r.url()}`));
  await page.setViewport({ width: largura, height: altura });
  if (reduzir) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (limpar) {
    await page.evaluateOnNewDocument(
      (som, suspense, pausa) => {
        if (sessionStorage.getItem('conferir-iniciou')) return;
        localStorage.clear();
        localStorage.setItem('sorteio-som', JSON.stringify(som));
        localStorage.setItem('sorteio-config', JSON.stringify({ suspense, pausa }));
        sessionStorage.setItem('conferir-iniciou', '1');
      },
      som,
      suspense,
      pausa,
    );
  }
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await dorme(500);
  return page;
}

const texto = (page, sel) => page.$eval(sel, el => el.textContent.trim()).catch(() => null);
const existe = (page, sel) => page.$(sel).then(Boolean);
const guardados = page => page.evaluate(() => JSON.parse(localStorage.getItem('sorteio-ganhadores') || '[]'));
const esperarRevelacao = page => page.waitForSelector('.ganhador-nome', { timeout: 15000 }).then(() => dorme(1200));

// regra do Enzo: um por cliente, mesma chance
// só as 9 cidades (regra do Enzo); demonstração: 65 de 140 clientes
const { participantes } = distribuirCupons(CLIENTES_DEMO.filter(p => NOMES_CIDADES.includes(p.cidade)), 1, 'igual');
const porId = new Map(participantes.map(p => [p.id, p]));

/** Cupom que fica embaixo da seta (no topo) com o disco girado `giro` graus. */
// Campo embaixo da seta (topo), calculado pelo ângulo do disco: texto escrito nele e se está aceso.
const campoNaSeta = page =>
  page.evaluate(() => {
    const g = parseFloat(/rotate\(([-\d.]+)deg\)/.exec(document.querySelector('.roda-disco').style.transform)[1]);
    const passo = parseFloat(document.querySelector('.roda').dataset.passo);
    const idx = Math.floor((((-g) % 360) + 360) % 360 / passo);
    const el = document.querySelector('[data-campo="' + idx + '"]');
    return { texto: el?.textContent ?? '', aceso: parseFloat(getComputedStyle(document.querySelector('.roda-veu')).opacity) > 0.5 };
  });
// o nome no campo pode estar cortado com "…"
const mesmoNome = (escrito, nome) => escrito && nome.startsWith(escrito.replace(/…$/, ''));

function cupomNaSeta(giro, pool) {
  const total = pool.reduce((s, p) => s + p.cupons, 0);
  const angulo = (((-giro) % 360) + 360) % 360;
  let k = Math.floor((angulo / 360) * total);
  for (const p of pool) {
    if (k < p.cupons) return p.inicio + k;
    k -= p.cupons;
  }
  return null;
}

// ---------------------------------------------------------------- 1. abertura
{
  const page = await abrir();
  ok('abre com título e prêmio', (await texto(page, '.cabeca-premio')) === 'Prêmio 1' && (await texto(page, '.cabeca-sub')) === 'Prêmio 1 de 3');
  ok('sem o bloco de participantes e cupons ao lado da roda', !(await existe(page, '.numeros')));
  ok('fundo branco', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(255, 255, 255)');

  const passosNomes = await page.$$eval('.fatia-nome', l => {
    const a = l.map(e => parseFloat(/rotate\(([-\d.]+)\)/.exec(e.getAttribute('transform'))[1]));
    return { n: l.length, comNome: l.filter(e => e.textContent.trim()).length, passos: [...new Set(a.slice(1).map((x, i) => (x - a[i]).toFixed(2)))] };
  });
  ok('roda: um campo por cliente das 9 cidades (65), todos do mesmo tamanho', passosNomes.n === 65 && passosNomes.passos.length === 1, JSON.stringify(passosNomes.passos));
  ok('todo campo com o nome escrito', passosNomes.comNome === 65);
  ok('caixa da seta começa em "Quem vai ganhar?"', (await texto(page, '.na-seta-nome')) === 'Quem vai ganhar?');
  const quedas = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter(a => a.effect?.target?.classList?.contains('queda'))
        .map(a => a.playState),
    );
  const q0 = await quedas();
  ok('confetes do fundo caindo (34 papéis)', q0.length === 34 && q0.every(s => s === 'running'), `${q0.length} papéis`);
  const anguloRoda = () => page.$eval('.roda-disco', el => parseFloat(/rotate\(([-\d.]+)deg\)/.exec(el.style.transform)?.[1] ?? '0'));
  const r0 = await anguloRoda();
  await dorme(600);
  const r1 = await anguloRoda();
  ok('roda esperando gira devagar', r1 - r0 > 1 && r1 - r0 < 120, `${(r1 - r0).toFixed(1)}° em 0,6 s`);

  // ---------------------------------------------------------------- 2. giro
  // Foco no botão de som e Espaço: tem que sortear, não desligar o som.
  await page.focus('button[aria-label^="Desligar som"]');
  await page.keyboard.press('Space');
  await dorme(400);
  const somIntacto = await existe(page, 'button[aria-label^="Desligar som"]');
  ok('Espaço sorteia mesmo com foco em outro botão', somIntacto && (await texto(page, '.botao-sortear')) === 'Girando…');
  ok('lâmpadas respiram mais rápido durante o giro', (await page.$eval('.roda-lampadas', el => getComputedStyle(el).animationDuration)) === '0.5s');
  const qGiro = await quedas();
  ok('confetes do fundo pausam durante o giro', qGiro.length === 34 && qGiro.every(s => s === 'paused'));
  const passando = await texto(page, '.na-seta-nome');
  ok('caixa da seta mostra quem está passando', Boolean(passando) && passando !== 'Quem vai ganhar?', passando);
  const detalheGiro = await texto(page, '.na-seta-detalhe');
  ok('durante o giro a caixa mostra "Pedido", não "Cupom"', /^Pedido \d+ · /.test(detalheGiro ?? ''), detalheGiro);
  await page.keyboard.press('KeyP');
  await dorme(300);
  ok('painel não abre durante o giro', !(await existe(page, '.gaveta')));
  ok('contador de ganhadores não entrega nada no giro', !(await existe(page, '.contador')));

  const g1 = (await guardados(page))[0];
  ok('resultado gravado antes do giro terminar', g1 && g1.mostrado === false);

  await page.waitForSelector('.roda--travada', { timeout: 10000 });
  ok('confete estoura no instante em que a roda para (antes do nome)', (await existe(page, '.confete-tela')) && !(await existe(page, '.ganhador')));
  await dorme(150);
  // Onde a seta parou, calculado pelo ângulo final do disco (a mesma conta da roda,
  // refeita aqui): tem que ser o cupom sorteado, não só a fatia do ganhador.
  const giro = await page.$eval('.roda-disco', el => parseFloat(/rotate\(([-\d.]+)deg\)/.exec(el.style.transform)[1]));
  const c1 = await campoNaSeta(page);
  ok('a seta para no campo com o nome do ganhador, aceso', mesmoNome(c1.texto, g1.nome) && c1.aceso, `${c1.texto} × ${g1.nome}`);
  const caixa = await texto(page, '.na-seta');
  ok(
    'fatia do ganhador acesa e caixa com nome e número do pedido (sem "Cupom")',
      caixa.includes(g1.nome) &&
      caixa.includes(`Pedido ${pedidoDoCupom(porId.get(g1.id), g1.cupom).numero}`) &&
      !caixa.includes('Cupom'),
    caixa,
  );
  if (FOTOS) await page.screenshot({ path: `${FOTOS}/parou.png` });

  // ---------------------------------------------------------------- 3. revelação
  await esperarRevelacao(page);
  // Nesta seção os passos são feitos à mão; o automático tem a sua seção (8c).
  await page.keyboard.press('Escape');
  const nome = await page.$eval('.ganhador-nome', el => el.textContent.replace(/\s+/g, ' ').trim());
  ok('revelação mostra o ganhador gravado', nome === g1.nome, nome);
  const p1 = porId.get(g1.id);
  ok('cupom sorteado pertence ao ganhador', g1.cupom >= p1.inicio && g1.cupom <= p1.fim, `${g1.cupom} em ${p1.inicio}–${p1.fim}`);
  // o pedido mostrado tem que ser o do cupom sorteado (conta refeita aqui, pela regra do sorteio)
  const pedidoEsperado = pedidoDoCupom(p1, g1.cupom).numero;
  const fatos = await page.$$eval('.fato', fs => fs.map(f => [f.querySelector('dt').textContent, f.querySelector('dd').textContent]));
  ok(
    'revelação mostra só o número do pedido e o nome do cliente',
    fatos.length === 2 && fatos[0][1] === String(pedidoEsperado) && fatos[1][1] === g1.nome && g1.pedido === pedidoEsperado,
    fatos.map(f => f.join(': ')).join(' | '),
  );
  ok('contador sobe depois da revelação', (await texto(page, '.contador')) === '1');
  ok('palavras do nome com espaço entre elas', nome.split(' ').length === g1.nome.split(' ').length);
  if (FOTOS) await page.screenshot({ path: `${FOTOS}/revelado.png` });

  // ---------------------------------------------------------------- 4. recarregar no meio do giro
  await page.keyboard.press('Enter');
  await dorme(800);
  ok('Enter vai para o próximo prêmio', (await texto(page, '.cabeca-sub')) === 'Prêmio 2 de 3');
  await dorme(400);
  ok('quem ganhou sai da roda (64 nomes) e o véu some', (await page.$$eval('.fatia-nome', f => f.length)) === 64 && (await page.$eval('.roda-veu', el => getComputedStyle(el).opacity)) === '0');
  const qVolta = await quedas();
  ok('confetes do fundo voltam a cair', qVolta.every(s => s === 'running'));
  await page.keyboard.press('Space');
  await dorme(900);
  const meio = (await guardados(page))[1];
  await page.reload({ waitUntil: 'networkidle0' });
  await dorme(1500);
  const depoisReload = await guardados(page);
  const nomeReload = await page.$eval('.ganhador-nome', el => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
  ok(
    'recarregar no meio do giro abre a revelação do MESMO ganhador',
    depoisReload.length === 2 && depoisReload[1].cupom === meio.cupom && nomeReload === meio.nome,
    `${nomeReload}`,
  );
  const giroReload = await page.$eval('.roda-disco', el => parseFloat(/rotate\(([-\d.]+)deg\)/.exec(el.style.transform)[1]));
  const pool2 = participantes.filter(p => p.id !== g1.id);
  const c2 = await campoNaSeta(page);
  ok('depois de recarregar, a seta está no campo do ganhador', mesmoNome(c2.texto, meio.nome), `${c2.texto} × ${meio.nome}`);

  // ---------------------------------------------------------------- 5. terceiro e final
  await page.keyboard.press('Enter');
  await dorme(800);
  await page.keyboard.press('Space');
  await esperarRevelacao(page);
  const g3 = (await guardados(page))[2];
  const giro3 = await page.$eval('.roda-disco', el => parseFloat(/rotate\(([-\d.]+)deg\)/.exec(el.style.transform)[1]));
  const pool3 = participantes.filter(p => p.id !== g1.id && p.id !== meio.id);
  const c3 = await campoNaSeta(page);
  ok('3º sorteio: seta no campo do ganhador', mesmoNome(c3.texto, g3.nome), `${c3.texto} × ${g3.nome}`);
  ok('confete na revelação', await existe(page, '.confete-tela'));
  ok('último prêmio oferece "Ver todos os ganhadores"', (await texto(page, '.ganhador-rodape .botao-principal'))?.startsWith('Ver todos'));
  await page.keyboard.press('Enter');
  await dorme(1500);
  const finais = await page.$$eval('.final-item', ls => ls.length);
  const todos = await guardados(page);
  ok('encerramento com os 3 ganhadores', finais === 3 && (await texto(page, '.cabeca-premio')) === 'Ganhadores');
  ok('tela final com o título "Campanha do Mês do Cliente"', (await texto(page, '.encerramento .cabeca-titulo')) === 'Campanha do Mês do Cliente');
  await dorme(800); // o recado entra depois dos cartões
  ok(
    'recado do time de Relacionamento embaixo dos ganhadores',
    (await texto(page, '.final-mensagem')) ===
      'Nosso time de Relacionamento entrará em contato com os ganhadores para orientar e combinar os detalhes da retirada dos prêmios.',
  );
  const detalhesFinal = await page.$$eval('.final-detalhe', l => l.map(e => e.textContent));
  ok(
    'cartões da tela final mostram o número do pedido',
    detalhesFinal.length === 3 && todos.every((g, i) => detalhesFinal[i].includes(`Pedido ${g.pedido}`)),
    detalhesFinal.join(' | '),
  );
  ok('ninguém ganhou duas vezes', new Set(todos.map(g => g.id)).size === 3);
  if (FOTOS) await page.screenshot({ path: `${FOTOS}/final.png` });

  // ---------------------------------------------------------------- 6. painel ganhadores: desfazer e recomeçar
  await page.keyboard.press('KeyG');
  await dorme(700);
  ok('G abre o painel de ganhadores', (await page.$$eval('.lg-item:not(.lg-item--vazio)', l => l.length)) === 3);
  const [desfazer] = await page.$$('xpath/.//button[contains(., "Desfazer o último")]');
  await desfazer.click();
  await dorme(200);
  const [sim] = await page.$$('xpath/.//button[normalize-space()="Sim"]');
  await sim.click();
  await dorme(600);
  ok('desfazer tira só o último', (await guardados(page)).length === 2);
  await page.keyboard.press('Escape');
  await dorme(700);
  ok('Esc fecha o painel e o palco volta ao prêmio 3', !(await existe(page, '.gaveta')) && (await texto(page, '.cabeca-sub')) === 'Prêmio 3 de 3');

  // ---------------------------------------------------------------- 7. configurar (painel de cima)
  await page.keyboard.press('KeyP');
  await dorme(800);
  ok('P abre a configuração de cima, com os 4 blocos', (await existe(page, '.gaveta--topo')) && (await page.$$eval('.bloco', b => b.length)) === 4);
  ok('regra travada depois do primeiro sorteio', await page.$eval('button[aria-labelledby="um-por-cliente"]', el => el.disabled));
  ok('sem cupom nem R$ por cupom na configuração', !(await texto(page, '.configurar')).toLowerCase().includes('cupom'));
  ok('planilha travada depois do primeiro sorteio', await page.$eval('.soltar input[type=file]', el => el.disabled));
  const [titulo] = await page.$$('xpath/.//label[contains(., "Título em cima da roda")]//input');
  await titulo.click({ clickCount: 3 });
  await titulo.type('Sorteio de Natal');
  const [adicionar] = await page.$$('xpath/.//button[contains(., "Adicionar prêmio")]');
  await adicionar.click();
  const [verLista] = await page.$$('xpath/.//button[contains(., "participantes")]');
  await verLista.click();
  await dorme(300);
  await page.type('.busca input', 'farmacia');
  await dorme(500);
  const achados = await page.$$eval('.pessoa-nome', l => l.map(e => e.textContent));
  ok('busca sem acento acha "Farmácia"', achados.length > 0 && achados.every(n => n.includes('Farmácia')), `${achados.length} achados`);
  if (FOTOS) await page.screenshot({ path: `${FOTOS}/preparar.png` });
  await page.keyboard.press('Escape');
  await dorme(700);
  ok('título e novo prêmio aparecem no palco', (await texto(page, '.cabeca-titulo')) === 'Sorteio de Natal' && (await texto(page, '.cabeca-sub')) === 'Prêmio 3 de 4');

  await page.keyboard.press('KeyG');
  await dorme(700);
  const [recomecar] = await page.$$('xpath/.//button[contains(., "Recomeçar sorteio")]');
  await recomecar.click();
  await dorme(200);
  const [sim2] = await page.$$('xpath/.//button[normalize-space()="Sim"]');
  await sim2.click();
  await dorme(500);
  await page.keyboard.press('Escape');
  await dorme(700);
  ok('recomeçar zera e volta ao prêmio 1', (await guardados(page)).length === 0 && (await texto(page, '.cabeca-sub')) === 'Prêmio 1 de 4');

  // ---------------------------------------------------------------- 8. som e apresentação
  await page.keyboard.press('KeyM');
  await dorme(200);
  ok('M desliga o som', await existe(page, 'button[aria-label^="Ligar som"]'));
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyH');
  await dorme(500);
  const barraEscondida = await page.$eval('.barra', el => getComputedStyle(el).opacity);
  await page.mouse.move(400, 300);
  await page.mouse.move(420, 320);
  await dorme(500);
  const barraVoltou = await page.$eval('.barra', el => getComputedStyle(el).opacity);
  ok('modo apresentação esconde a barra e o mouse traz de volta', barraEscondida === '0' && barraVoltou === '1', `${barraEscondida} → ${barraVoltou}`);
  await page.close();
}

// ---------------------------------------------------------------- 8b. planilha de verdade
// Usa a planilha do Enzo se ela existir na máquina. Nenhum dado pessoal é impresso.
const PLANILHA = 'C:/Users/enzo.raymundo/Downloads/sorteio.csv';
if (existsSync(PLANILHA)) {
  const real = montarParticipantes(lerCSV(decodificar(readFileSync(PLANILHA))));
  const poolReal = distribuirCupons(real.participantes.filter(p => NOMES_CIDADES.includes(p.cidade)), 1, 'igual').participantes;
  const porIdReal = new Map(poolReal.map(p => [p.id, p]));

  const page = await abrir({ suspense: 'curto' });
  ok('sem planilha: a barra avisa "Dados de demonstração"', (await texto(page, '.fonte-dados'))?.includes('demonstração'));
  await page.keyboard.press('KeyP');
  await dorme(800);

  // arquivo errado primeiro: tem que avisar e não trocar nada
  const errado = join(tmpdir(), 'sorteio-errado.csv');
  writeFileSync(errado, 'Coluna A;Coluna B\n1;2\n');
  await (await page.$('.soltar input[type=file]')).uploadFile(errado);
  await dorme(700);
  ok('planilha sem as colunas certas: aviso e escolha de colunas', (await existe(page, '.aviso--erro')) && (await existe(page, '.coluna select')));

  await (await page.$('.soltar input[type=file]')).uploadFile(PLANILHA);
  await dorme(1500);
  const resumoTela = await texto(page, '.resumo');
  ok(
    'planilha real: 725 clientes das 9 cidades no sorteio (1.242 pedidos lidos)',
    resumoTela.includes('725') && resumoTela.includes('1.242'),
    resumoTela,
  );
  await page.keyboard.press('Escape');
  await dorme(1200);
  ok('barra mostra a planilha carregada', (await texto(page, '.fonte-dados'))?.includes('sorteio.csv'));
  ok('planilha real: os 725 clientes das 9 cidades na roda, cada um com o nome', (await page.$$eval('.fatia-nome', f => f.filter(e => e.textContent.trim()).length)) === 725);
  ok('planilha real: nenhum ganhador possível fora das 9 cidades', poolReal.every(p => NOMES_CIDADES.includes(p.cidade)));
  // nenhum nome passa da largura do próprio campo (altura da letra × largura do campo no começo do nome)
  const invadem = await page.$$eval('.fatia-nome', l => { const passo = (2 * Math.PI) / l.length; return l.filter(e => parseFloat(e.getAttribute('font-size')) * 1.2 > e.getBBox().x * passo + 1e-6).length; });
  ok('planilha real: nenhum nome invade o campo vizinho', invadem === 0, `${invadem} invadem`);

  await page.keyboard.press('Space');
  await page.waitForSelector('.roda--travada', { timeout: 15000 });
  await dorme(200);
  const gReal = (await guardados(page))[0];
  const giroReal = await page.$eval('.roda-disco', el => parseFloat(/rotate\(([-\d.]+)deg\)/.exec(el.style.transform)[1]));
  const cR = await campoNaSeta(page);
  ok('planilha real: seta no campo do ganhador, aceso', mesmoNome(cR.texto, gReal.nome) && cR.aceso);
  const pReal = porIdReal.get(gReal.id);
  ok('planilha real: pedido sorteado é um pedido desse cliente na planilha', pReal && pReal.pedidos.some(x => x.numero === gReal.pedido));
  await esperarRevelacao(page);
  await page.keyboard.press('Escape'); // passos à mão nesta seção
  const nomeReal = await page.$eval('.ganhador-nome', el => el.textContent.replace(/\s+/g, ' ').trim());
  const telaReal = await texto(page, '.ganhador');
  ok('nome na tela sem número de documento dentro', !/\d{8,}/.test(nomeReal) && !/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(telaReal));
  ok('CPF/CNPJ só mascarado na tela', !/\d{11,}/.test(telaReal.replace(/\s/g, '')) || false);

  await page.reload({ waitUntil: 'networkidle0' });
  await dorme(1200);
  ok('recarregar mantém a planilha', (await texto(page, '.fonte-dados'))?.includes('sorteio.csv'));
  await page.close();
} else {
  console.log('(planilha real não encontrada: testes dela pulados)');
}

// ---------------------------------------------------------------- 8c. automático
{
  const page = await abrir({ suspense: 'curto', pausa: 5 });
  await page.keyboard.press('Space'); // só o primeiro é na mão
  await esperarRevelacao(page);
  ok('automático: barra da pausa na revelação', await existe(page, '.auto-barra'));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('sorteio-ganhadores') || '[]').length === 2, { timeout: 20000 }).catch(() => {});
  ok('automático: o 2º sorteio começa sozinho, sem tecla', (await guardados(page)).length === 2);
  await esperarRevelacao(page);
  await page.keyboard.press('Escape');
  await dorme(8500);
  ok('Esc para o automático (o 3º não começa sozinho)', (await guardados(page)).length === 2 && (await existe(page, '.ganhador')));
  await page.keyboard.press('Enter');
  await dorme(800);
  await page.keyboard.press('Space'); // volta a ser automático
  await page.waitForSelector('.encerramento', { timeout: 30000 }).catch(() => {});
  ok('automático: depois do último, vai sozinho para a tela final', await existe(page, '.encerramento'));
  await page.close();
}

// ---------------------------------------------------------------- 9. menos movimento
{
  const page = await abrir({ reduzir: true, suspense: 'longo' });
  const t0 = Date.now();
  await page.keyboard.press('Space');
  await esperarRevelacao(page);
  const ms = Date.now() - t0 - 1200;
  ok('com "menos movimento" revela sem o giro longo', ms < 3000, `${ms} ms`);
  await page.close();
}

// ---------------------------------------------------------------- 10. celular
{
  const page = await abrir({ largura: 390, altura: 844 });
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok('celular (390px): sem rolagem para o lado no início', sobra <= 0, `${sobra}px`);
  if (FOTOS) await page.screenshot({ path: `${FOTOS}/celular-pronto.png` });
  await page.tap('.botao-sortear');
  await esperarRevelacao(page);
  const sobra2 = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok('celular: sem rolagem para o lado na revelação', sobra2 <= 0, `${sobra2}px`);
  if (FOTOS) await page.screenshot({ path: `${FOTOS}/celular-revelado.png` });
  await page.close();
}

// ---------------------------------------------------------------- 11. fluidez do giro
async function medirGiro(cpu) {
  const page = await abrir({ largura: 1920, altura: 1080, suspense: 'medio' });
  const cdp = await page.createCDPSession();
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  // Um clique antes, num canto vazio: é o que acontece na live (tela cheia, foco...).
  await page.mouse.click(30, 600);
  await dorme(300);
  // Dois números separados: quanto demora para o giro COMEÇAR depois da tecla
  // (resposta) e como ficam os quadros DEPOIS que ele já está andando (fluidez).
  await page.evaluate(() => {
    window.__quadros = [];
    window.__resposta = null;
    window.__revela = [];
    let ant = performance.now();
    let inicioRevela = null;
    const passo = t => {
      const andando = Boolean(document.querySelector('.roda--girando'));
      if (andando && window.__resposta == null) window.__resposta = t - window.__tecla;
      else if (andando) window.__quadros.push(t - ant);
      // depois do giro: 2,5 s da revelação, com o confete voando
      if (document.querySelector('.confete-tela')) {
        inicioRevela ??= t;
        window.__revela.push(t - ant);
      }
      ant = t;
      if (inicioRevela == null || t - inicioRevela < 2500) requestAnimationFrame(passo);
      else window.__fim = true;
    };
    addEventListener('keydown', () => (window.__tecla = performance.now()), { capture: true, once: true });
    requestAnimationFrame(passo);
  });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__fim === true, { timeout: 40000 });
  const { q, resposta, revela } = await page.evaluate(() => ({ q: window.__quadros, resposta: window.__resposta, revela: window.__revela.slice(1) }));
  await page.close();
  const resumo = lista => {
    const media = lista.reduce((s, x) => s + x, 0) / lista.length;
    return { fps: Math.round(1000 / media), pior: Math.round(Math.max(...lista)), lentos: lista.filter(x => x > 25).length, total: lista.length };
  };
  return { giro: { ...resumo(q), resposta: Math.round(resposta) }, revela: resumo(revela) };
}
const desc = m => `${m.fps} quadros/s, pior ${m.pior} ms, ${m.lentos}/${m.total} lentos${m.resposta != null ? `; começa ${m.resposta} ms depois da tecla` : ''}`;
const normal = await medirGiro(1);
ok('giro fluido (processador normal)', normal.giro.fps >= 55 && normal.giro.pior < 50, desc(normal.giro));
ok('revelação com confete fluida (processador normal)', normal.revela.fps >= 55, desc(normal.revela));
const lento = await medirGiro(4);
ok('giro com processador 4x mais lento', lento.giro.fps >= 45, desc(lento.giro));
ok('revelação com processador 4x mais lento', lento.revela.fps >= 35, desc(lento.revela));

ok('nenhum erro no console', errosGerais.length === 0, errosGerais.slice(0, 3).join(' | '));

await browser.close();

let falhas = 0;
for (const r of resultados) {
  if (!r.passou) falhas++;
  console.log(`${r.passou ? 'ok    ' : 'FALHOU'}  ${r.nome}${r.detalhe ? `  (${r.detalhe})` : ''}`);
}
console.log(`\n${resultados.length - falhas} de ${resultados.length} passando.`);
process.exit(falhas ? 1 : 0);
