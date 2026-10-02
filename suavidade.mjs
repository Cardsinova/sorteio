// Mede a suavidade do giro num Chrome sem janela: node suavidade.mjs
// Precisa do servidor no ar (npx vite preview --port 5192).
//
// O que mede, quadro a quadro, durante um giro médio (7 s):
// - quantos graus a roda anda por quadro no auge (muito = listras "tremendo");
// - quantas vezes a seta muda de direção com a roda rápida (muitas = seta nervosa);
// - quantas vezes a caixa "na seta" troca de nome por segundo no auge;
// - se a roda, a coluna e o título saem do lugar (página "pulando");
// - quadros por segundo esperando (confete do fundo caindo), girando e revelando,
//   com o processador normal e 4x mais lento.
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/enzo.raymundo/Desktop/site-cardsinova-v2/package.json');
const puppeteer = require('puppeteer-core');
const dorme = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
});

async function medir(cpu, L = 1920, A = 1080) {
  const page = await browser.newPage();
  await page.setViewport({ width: L, height: A });
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem('sorteio-som', 'false');
    localStorage.setItem('sorteio-config', JSON.stringify({ suspense: 'medio' }));
  });
  await page.goto('http://localhost:5192/', { waitUntil: 'networkidle0' });
  await dorme(2500); // entrada da roda termina
  const cdp = await page.createCDPSession();
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

  await page.evaluate(() => {
    const q = s => document.querySelector(s);
    const angulo = el => {
      const m = /rotate\(([-\d.]+)deg\)/.exec(el?.style.transform || '');
      return m ? parseFloat(m[1]) : 0;
    };
    const d = (window.__d = { espera: [], giro: [], revela: [], passo: [], seta: [], nomes: [], pos: [] });
    let ant = performance.now();
    let inicio = performance.now();
    let revelaIni = null;
    let rodaAnt = angulo(q('.roda-disco'));
    let nomeAnt = '';
    const passo = t => {
      const dt = t - ant;
      ant = t;
      const girando = Boolean(q('.roda--girando'));
      const ang = angulo(q('.roda-disco'));
      if (!girando && !q('.ganhador') && t - inicio < 1500) d.espera.push(dt);
      if (girando) {
        d.giro.push(dt);
        d.passo.push(Math.abs(ang - rodaAnt));
        d.vel = d.vel || [];
        d.vel.push((Math.abs(ang - rodaAnt) / dt) * 1000);
        d.seta.push(angulo(q('.roda-ponteiro')));
        const nome = q('.na-seta-nome')?.textContent;
        if (nome !== nomeAnt) d.nomes.push(t);
        nomeAnt = nome;
        const r = q('.roda').getBoundingClientRect();
        const c = q('.arena-info').getBoundingClientRect();
        d.pos.push([r.left, r.top, c.left, c.top, c.width]);
      }
      rodaAnt = ang;
      if (q('.ganhador')) {
        revelaIni ??= t;
        d.revela.push(dt);
      }
      if (revelaIni == null || t - revelaIni < 2500) requestAnimationFrame(passo);
      else d.fim = true;
    };
    requestAnimationFrame(passo);
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })), 1600);
  });
  await page.waitForFunction(() => window.__d?.fim, { timeout: 60000 });
  const d = await page.evaluate(() => window.__d);
  await page.close();

  const fps = l => Math.round(1000 / (l.reduce((s, x) => s + x, 0) / l.length));
  const lentos = l => l.filter(x => x > 25).length;
  // seta: troca de direção (sinal da variação) enquanto a roda anda mais de 3° por quadro
  let viradas = 0;
  let sinalAnt = 0;
  for (let i = 1; i < d.seta.length; i++) {
    if (d.passo[i] < 3) continue;
    const s = Math.sign(d.seta[i] - d.seta[i - 1]);
    if (s && sinalAnt && s !== sinalAnt) viradas++;
    if (s) sinalAnt = s;
  }
  // nomes por segundo no pior segundo
  let picoNomes = 0;
  for (const t of d.nomes) picoNomes = Math.max(picoNomes, d.nomes.filter(x => x >= t && x < t + 1000).length);
  const variacao = k => {
    const v = d.pos.map(p => p[k]);
    return Math.max(...v) - Math.min(...v);
  };
  const pulo = Math.max(variacao(0), variacao(1), variacao(2), variacao(3), variacao(4));
  return {
    espera: `${fps(d.espera)} q/s (${lentos(d.espera)} lentos)`,
    giro: `${fps(d.giro)} q/s (${lentos(d.giro)}/${d.giro.length} lentos)`,
    revela: `${fps(d.revela)} q/s (${lentos(d.revela)}/${d.revela.length} lentos)`,
    // velocidade de verdade (graus/segundo) no auge, e quanto isso dá por quadro a 60 por segundo
    // em janelas de 12 quadros: um quadro atrasado sozinho não vira "pico" falso
    velocidadeMaxima: (() => {
      let v = 0;
      for (let i = 12; i < d.passo.length; i++) {
        const graus = d.passo.slice(i - 12, i).reduce((s, x) => s + x, 0);
        const ms = d.giro.slice(i - 12, i).reduce((s, x) => s + x, 0);
        v = Math.max(v, (graus / ms) * 1000);
      }
      return `${Math.round(v)}°/s = ${(v / 60).toFixed(1)}° por quadro a 60 q/s`;
    })(),
    setaViradasComRodaRapida: viradas,
    nomesPorSegundoNoPico: picoNomes,
    paginaSaiDoLugar: `${pulo.toFixed(1)} px`,
  };
}

for (const cpu of [1, 4]) {
  const r = await medir(cpu);
  console.log(`processador ${cpu === 1 ? 'normal' : `${cpu}x mais lento`}:`);
  for (const [k, v] of Object.entries(r)) console.log(`  ${k}: ${v}`);
}
await browser.close();
