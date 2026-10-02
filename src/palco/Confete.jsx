import { useEffect, useRef } from 'react';
import { CORES } from '../lib/cores';

// A comemoração: dispara NO INSTANTE em que a roda para (antes era na revelação,
// ~1,5 s depois, e o Enzo achou que demorava). Pedido dele em 2026-10-02: "muito
// mais confete, uma animação realmente mais impressionante".
//
// Três ondas:
//   1. explosão saindo da seta, para cima e para os lados;
//   2. os dois canhões dos cantos de baixo (0,15 s depois);
//   3. chuva de papel caindo do alto da tela por ~2,5 s.
// Papel de verdade: gira, vira (achata e volta), balança de lado e flutua por
// causa do ar. Some sozinho quando o último papel sai da tela.
//
// Por que canvas (uma camada só) e não um elemento por papel: com elementos, o
// que pesava era o NÚMERO DE CAMADAS (270 camadas = 14 quadros/s no processador
// 4x mais lento). Aqui são ~650 papéis numa camada, que só existe durante a
// comemoração (não é "fundo animado rodando sempre", o que pesava no Dashboard Lab).
//
// Desenho barato: os papéis ficam em baldes por cor e cada balde é pintado de uma
// vez (trocar a cor do pincel a cada papel obrigava o navegador a reler a cor 650
// vezes por quadro). Só retângulos (círculo custa mais) e transparência só no fim.

const CORES_PAPEL = [...CORES.map(c => c.fundo), '#ffd54a', '#ff7eb6'];
const GRAVIDADE = 1150; // px/s²
const VIDA_MAX = 7; // segundos
const SUMIR = 0.8; // segundos finais em que o papel vai ficando transparente
const sorteio = (a, b) => a + Math.random() * (b - a);

function novoPapel(x, y, angulo, velocidade, tipo) {
  const chuva = tipo === 'chuva';
  const forma = Math.random() < 0.18 ? 1 : Math.random() < 0.12 ? 2 : 0; // 0 papel, 1 quadradinho, 2 fita
  const lado = sorteio(6, 8);
  return {
    x,
    y,
    vx: Math.cos(angulo) * velocidade,
    vy: Math.sin(angulo) * velocidade,
    w: forma === 2 ? sorteio(4, 6) : forma === 1 ? lado : sorteio(8, 13),
    h: forma === 2 ? sorteio(16, 24) : forma === 1 ? lado : sorteio(5, 9),
    giro: Math.random() * Math.PI * 2,
    vgiro: sorteio(-7, 7),
    vira: Math.random() * Math.PI * 2,
    vvira: sorteio(6, 14),
    // Resistência do ar: começa baixa (o papel sai disparado) e sobe em ~0,4 s
    // (aí ele flutua). Velocidade final de queda = gravidade ÷ resistência:
    // ~250 a 320 px/s na explosão e nos canhões, ~190 a 240 px/s na chuva.
    arrasto0: chuva ? 5 : tipo === 'canhao' ? 0.9 : 1.2,
    arrasto1: chuva ? sorteio(4.8, 6) : sorteio(3.6, 4.6),
    balanco: chuva ? sorteio(30, 90) : sorteio(10, 50),
    fase: Math.random() * Math.PI * 2,
    idade: 0,
    vivo: true,
  };
}

export default function Confete({ semMovimento }) {
  const tela = useRef(null);

  useEffect(() => {
    if (semMovimento || !tela.current) return;
    const canvas = tela.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25); // nitidez sem custo exagerado
    const L = window.innerWidth;
    const A = window.innerHeight;
    canvas.width = Math.round(L * dpr);
    canvas.height = Math.round(A * dpr);

    const baldes = CORES_PAPEL.map(() => []); // um balde por cor
    const por = papel => baldes[(Math.random() * baldes.length) | 0].push(papel);
    const agenda = []; // [quando (s), função], em ordem

    // 1. explosão na seta (o ponto onde a roda parou)
    const seta = document.querySelector('.roda-ponteiro')?.getBoundingClientRect();
    const ox = seta ? seta.left + seta.width / 2 : L / 2;
    const oy = seta ? seta.top + seta.height * 0.7 : A * 0.3;
    for (let i = 0; i < 180; i++) por(novoPapel(ox, oy, sorteio(-Math.PI * 0.95, -Math.PI * 0.05), sorteio(450, 1350), 'explosao'));

    // 2. canhões dos cantos, um pouco depois
    agenda.push([
      0.15,
      () => {
        for (let i = 0; i < 140; i++) {
          por(novoPapel(-10, A + 10, sorteio(-Math.PI * 0.42, -Math.PI * 0.2), sorteio(1100, 1900), 'canhao'));
          por(novoPapel(L + 10, A + 10, sorteio(-Math.PI * 0.8, -Math.PI * 0.58), sorteio(1100, 1900), 'canhao'));
        }
      },
    ]);

    // 3. chuva do alto, por ~2,5 s
    for (let k = 0; k < 25; k++) {
      agenda.push([
        0.45 + k * 0.1,
        () => {
          for (let i = 0; i < 8; i++) por(novoPapel(Math.random() * L, -20 - Math.random() * 60, Math.PI / 2, sorteio(40, 160), 'chuva'));
        },
      ]);
    }

    let t = 0;
    let anterior = performance.now();
    let quadro = 0;
    let id = 0;

    const passo = agora => {
      const dt = Math.min(0.05, (agora - anterior) / 1000); // um quadro atrasado não teleporta os papéis
      anterior = agora;
      t += dt;
      while (agenda.length && agenda[0][0] <= t) agenda.shift()[1]();

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let vivos = 0;
      let alfaAtual = 1;
      for (let b = 0; b < baldes.length; b++) {
        const balde = baldes[b];
        if (!balde.length) continue;
        ctx.fillStyle = CORES_PAPEL[b];
        for (let i = 0; i < balde.length; i++) {
          const p = balde[i];
          if (!p.vivo) continue;
          p.idade += dt;
          const arrasto = p.arrasto1 + (p.arrasto0 - p.arrasto1) * Math.exp(-p.idade * 2.5);
          const freio = Math.exp(-arrasto * dt);
          p.vx *= freio;
          p.vy = p.vy * freio + GRAVIDADE * dt;
          p.x += p.vx * dt + Math.cos(p.fase + p.idade * 5) * p.balanco * dt;
          p.y += p.vy * dt;
          p.giro += p.vgiro * dt;
          p.vira += p.vvira * dt;
          if (p.y > A + 40 || p.idade > VIDA_MAX) {
            p.vivo = false;
            continue;
          }
          vivos++;
          const alfa = p.idade > VIDA_MAX - SUMIR ? (VIDA_MAX - p.idade) / SUMIR : 1;
          if (alfa !== alfaAtual) {
            ctx.globalAlpha = alfa;
            alfaAtual = alfa;
          }
          const c = Math.cos(p.giro);
          const s = Math.sin(p.giro);
          const achata = Math.cos(p.vira); // papel virando: achata e volta
          ctx.setTransform(dpr * c, dpr * s, -dpr * s * achata, dpr * c * achata, dpr * p.x, dpr * p.y);
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
      }

      // de tempos em tempos, tira dos baldes os papéis que já saíram
      if (++quadro % 45 === 0) for (let b = 0; b < baldes.length; b++) baldes[b] = baldes[b].filter(p => p.vivo);

      if (vivos > 0 || agenda.length) id = requestAnimationFrame(passo);
      else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.dataset.fim = 'sim'; // para a conferência saber que acabou
      }
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [semMovimento]);

  if (semMovimento) return null;
  return <canvas ref={tela} className="confete-tela" aria-hidden="true" />;
}
