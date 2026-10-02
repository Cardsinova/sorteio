// Tira fotos das etapas do sorteio: node fotos.mjs <pasta> [largura] [altura] [tema]
// Precisa do servidor no ar (npx vite preview --port 5192).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire('C:/Users/enzo.raymundo/Desktop/site-cardsinova-v2/package.json');
const puppeteer = require('puppeteer-core');

const PASTA = process.argv[2] ?? 'fotos';
const LARGURA = Number(process.argv[3] ?? 1920);
const ALTURA = Number(process.argv[4] ?? 1080);
const TEMA = process.argv[5] ?? 'dark';
mkdirSync(PASTA, { recursive: true });
const dorme = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
});
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push(String(e)));
page.on('console', m => m.type() === 'error' && erros.push(m.text()));
await page.setViewport({ width: LARGURA, height: ALTURA });
await page.evaluateOnNewDocument(tema => {
  if (!sessionStorage.getItem('fotos-iniciou')) {
    localStorage.clear();
    localStorage.setItem('sorteio-tema', tema);
    localStorage.setItem('sorteio-som', 'false');
    localStorage.setItem('sorteio-config', JSON.stringify({ suspense: 'curto' }));
    sessionStorage.setItem('fotos-iniciou', '1');
  }
}, TEMA);
await page.goto('http://localhost:5192/', { waitUntil: 'networkidle0' });
await dorme(900);
const foto = async nome => page.screenshot({ path: `${PASTA}/${nome}.png` });

await foto('1-pronto');
await page.keyboard.press('Space');
await dorme(1500);
await foto('2-girando');
await dorme(2900);
await foto('3-parou');
await dorme(1050);
await foto('4a-revelando');
await dorme(1150);
await foto('4-ganhador');
await page.keyboard.press('Enter');
await dorme(900);
await page.keyboard.press('Space');
await dorme(7200);
await page.keyboard.press('Enter');
await dorme(900);
await page.keyboard.press('Space');
await dorme(7200);
await foto('5-ultimo-ganhador');
await page.keyboard.press('Enter');
await dorme(1500);
await foto('6-final');
await page.keyboard.press('KeyG');
await dorme(800);
await foto('7-painel-ganhadores');
await page.keyboard.press('Escape');
await dorme(500);
await page.keyboard.press('KeyP');
await dorme(800);
await foto('8-painel-preparar');

console.log(erros.length ? `Erros:\n${erros.join('\n')}` : 'Sem erros no console.');
await browser.close();
