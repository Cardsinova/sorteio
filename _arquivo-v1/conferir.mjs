// Confere o sorteio num Chrome sem janela: node conferir.mjs [pasta-das-fotos]
// Precisa do servidor no ar (npx vite preview --port 5192) e usa o puppeteer-core
// instalado no projeto do site.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { distribuirCupons } from './src/lib/sorteio.js';
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

async function abrir({ largura = 1440, altura = 900, reduzir = false, som = true, suspense = 'curto', limpar = true } = {}) {
  const page = await browser.newPage();
  page.on('pageerror', e => errosGerais.push(String(e)));
  page.on('console', m => m.type() === 'error' && errosGerais.push(m.text()));
  page.on('response', r => r.status() >= 400 && errosGerais.push(`${r.status()} ${r.url()}`));
  await page.setViewport({ width: largura, height: altura });
  if (reduzir) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (limpar) {
    await page.evaluateOnNewDocument(
      (som, suspense) => {
        if (sessionStorage.getItem('conferir-iniciou')) return;
        localStorage.clear();
        localStorage.setItem('sorteio-som', JSON.stringify(som));
        localStorage.setItem('sorteio-config', JSON.stringify({ suspense }));
        sessionStorage.setItem('conferir-iniciou', '1');
      },
      som,
      suspense,
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

const { participantes } = distribuirCupons(CLIENTES_DEMO, 10);
const porId = new Map(participantes.map(p => [p.id, p]));

// ---------------------------------------------------------------- 1. abertura
{
  const page = await abrir();
  ok('abre com título e prêmio', (await texto(page, '.cabeca-premio')) === 'Prêmio 1' && (await texto(page, '.cabeca-sub')) === 'Prêmio 1 de 3');
  const numeros = await texto(page, '.numeros');
  ok('mostra 140 participantes e 16.872 cupons', numeros.includes('140') && numeros.includes('16.872'), numeros);
  ok('rolo começa em "Pronto para sortear"', (await page.$$eval('.rolo-linha', ls => ls[1].textContent)).includes('Pronto para sortear'));

  // ---------------------------------------------------------------- 2. giro
  // Foco no botão de tema e Espaço: tem que sortear, não trocar o tema.
  await page.focus('button[aria-label^="Tema"]');
  const temaAntes = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.keyboard.press('Space');
  await dorme(400);
  const temaDepois = await page.evaluate(() => document.documentElement.dataset.theme);
  ok('Espaço sorteia mesmo com foco em outro botão', temaAntes === temaDepois && (await texto(page, '.botao-sortear')) === 'Sorteando…');
  await page.keyboard.press('KeyP');
  await dorme(300);
  ok('painel não abre durante o giro', !(await existe(page, '.gaveta')));
  ok('contador de ganhadores não entrega nada no giro', !(await existe(page, '.contador')));

  const g1 = (await guardados(page))[0];
  ok('resultado gravado antes do giro terminar', g1 && g1.mostrado === false);

  await page.waitForSelector('.maquina--parou', { timeout: 10000 });
  await dorme(150);
  const odometro = await page.$$eval('.odo-coluna', cols =>
    cols
      .map(c => {
        const tira = c.firstElementChild;
        const m = new DOMMatrix(getComputedStyle(tira).transform);
        const altura = c.getBoundingClientRect().height;
        const indice = Math.round(-m.m42 / altura);
        return tira.children[indice]?.textContent ?? '?';
      })
      .join(''),
  );
  ok('odômetro para no número do cupom sorteado', odometro === String(g1.cupom).padStart(5, '0'), `${odometro} × ${g1.cupom}`);
  const noRolo = await page.$eval('.rolo-linha--alvo .rolo-nome', el => el.textContent).catch(() => null);
  // DOMRect não atravessa para o Node: copiar os números num objeto comum.
  const centro = sel => page.$eval(sel, el => {
    const r = el.getBoundingClientRect();
    return r.top + r.height / 2;
  });
  const cFaixa = await centro('.rolo-faixa');
  const cAlvo = await centro('.rolo-linha--alvo').catch(() => NaN);
  ok('rolo para no ganhador, dentro da faixa do meio', noRolo === g1.nome && Math.abs(cAlvo - cFaixa) < 2, `${noRolo}; centros ${cAlvo.toFixed(1)} × ${cFaixa.toFixed(1)}`);
  if (FOTOS) await page.screenshot({ path: `${FOTOS}/parou.png` });

  // ---------------------------------------------------------------- 3. revelação
  await esperarRevelacao(page);
  const nome = await page.$eval('.ganhador-nome', el => el.textContent.replace(/\s+/g, ' ').trim());
  ok('revelação mostra o ganhador gravado', nome === g1.nome, nome);
  const p1 = porId.get(g1.id);
  ok('cupom sorteado pertence ao ganhador', g1.cupom >= p1.inicio && g1.cupom <= p1.fim, `${g1.cupom} em ${p1.inicio}–${p1.fim}`);
  const fatos = await texto(page, '.fatos');
  ok('fatos: cupom, ticket e chance certos', fatos.includes(String(g1.cupom).padStart(5, '0')) && fatos.includes(new Intl.NumberFormat('pt-BR').format(p1.cupons)));
  ok('contador sobe depois da revelação', (await texto(page, '.contador')) === '1');
  ok('palavras do nome com espaço entre elas', nome.split(' ').length === g1.nome.split(' ').length);
  if (FOTOS) await page.screenshot({ path: `${FOTOS}/revelado.png` });

  // ---------------------------------------------------------------- 4. recarregar no meio do giro
  await page.keyboard.press('Enter');
  await dorme(800);
  ok('Enter vai para o próximo prêmio', (await texto(page, '.cabeca-sub')) === 'Prêmio 2 de 3');
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

  // ---------------------------------------------------------------- 5. terceiro e final
  await page.keyboard.press('Enter');
  await dorme(800);
  await page.keyboard.press('Space');
  await esperarRevelacao(page);
  ok('último prêmio oferece "Ver todos os ganhadores"', (await texto(page, '.ganhador-rodape .botao-principal'))?.startsWith('Ver todos'));
  await page.keyboard.press('Enter');
  await dorme(1500);
  const finais = await page.$$eval('.final-item', ls => ls.length);
  const todos = await guardados(page);
  ok('encerramento com os 3 ganhadores', finais === 3 && (await texto(page, '.cabeca-premio')) === 'Ganhadores');
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

  // ---------------------------------------------------------------- 7. preparar
  await page.keyboard.press('KeyP');
  await dorme(700);
  ok('regra travada depois do primeiro sorteio', await page.$eval('.campo-dinheiro input', el => el.disabled));
  const titulo = await page.$('.secao input[type="text"]');
  await titulo.click({ clickCount: 3 });
  await titulo.type('Sorteio de Natal');
  const [adicionar] = await page.$$('xpath/.//button[contains(., "Adicionar prêmio")]');
  await adicionar.click();
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

  // ---------------------------------------------------------------- 8. tema e apresentação
  await page.keyboard.press('KeyT');
  await dorme(200);
  ok('T troca o tema', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  await page.keyboard.press('KeyT');
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
    const tira = () => document.querySelector('.rolo-tira');
    let ant = performance.now();
    const passo = t => {
      const andando = Boolean(tira()?.style.transform);
      if (andando && window.__resposta == null) window.__resposta = t - window.__tecla;
      else if (andando) window.__quadros.push(t - ant);
      ant = t;
      if (!document.querySelector('.maquina--parou')) requestAnimationFrame(passo);
    };
    addEventListener('keydown', () => (window.__tecla = performance.now()), { capture: true, once: true });
    requestAnimationFrame(passo);
  });
  await page.keyboard.press('Space');
  await page.waitForSelector('.maquina--parou', { timeout: 30000 });
  const { q, resposta } = await page.evaluate(() => ({ q: window.__quadros, resposta: window.__resposta }));
  await page.close();
  const media = q.reduce((s, x) => s + x, 0) / q.length;
  const lentos = q.filter(x => x > 25).length;
  return { fps: Math.round(1000 / media), pior: Math.round(Math.max(...q)), lentos, total: q.length, resposta: Math.round(resposta) };
}
const desc = m => `${m.fps} quadros/s, pior ${m.pior} ms, ${m.lentos}/${m.total} lentos; começa ${m.resposta} ms depois da tecla`;
const normal = await medirGiro(1);
ok('giro fluido (processador normal)', normal.fps >= 55 && normal.pior < 50, desc(normal));
const lento = await medirGiro(4);
ok('giro com processador 4x mais lento', lento.fps >= 45, desc(lento));

ok('nenhum erro no console', errosGerais.length === 0, errosGerais.slice(0, 3).join(' | '));

await browser.close();

let falhas = 0;
for (const r of resultados) {
  if (!r.passou) falhas++;
  console.log(`${r.passou ? 'ok    ' : 'FALHOU'}  ${r.nome}${r.detalhe ? `  (${r.detalhe})` : ''}`);
}
console.log(`\n${resultados.length - falhas} de ${resultados.length} passando.`);
process.exit(falhas ? 1 : 0);
