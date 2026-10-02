import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { CORES } from '../lib/cores';

// Fundo da festa: manchas de cor suaves nos cantos e confetes CAINDO sem parar
// pelas duas laterais da tela (pedido do Enzo em 2026-10-02: "esses confetes
// que ficam no canto da tela pode ficar caindo como animação").
//
// Como no confete da revelação: uma camada por papel e uma animação só por papel
// (Web Animations, criada uma vez, repetindo para sempre). O navegador toca
// sozinho, sem JavaScript a cada quadro. Para quem pede menos movimento, os
// papéis ficam parados onde estão.
//
// Cada papel cai de cima a baixo em 9–17 s, balançando de lado e girando. O
// atraso negativo espalha os papéis pela altura da tela desde o primeiro quadro.

function semente(s) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const QTD = 34;
const PONTOS = 12;

const PAPEIS = (() => {
  const rnd = semente(7);
  return Array.from({ length: QTD }, (_, i) => {
    const esquerda = i % 2 === 0;
    // faixas laterais: 0,5–9% e 91–99,5% da largura (o miolo fica para a roda e o texto)
    const x = esquerda ? 0.5 + rnd() * 8.5 : 91 + rnd() * 8.5;
    return {
      x,
      yParado: 10 + rnd() * 85, // onde fica para quem pede menos movimento
      forma: Math.floor(rnd() * 3),
      cor: CORES[i % CORES.length].fundo,
      escala: 0.7 + rnd() * 0.7,
      dur: 9000 + rnd() * 8000,
      fase: rnd(), // em que ponto da queda começa
      balanco: 10 + rnd() * 18, // px para cada lado
      giro0: rnd() * 360,
      giro: (rnd() < 0.5 ? -1 : 1) * (200 + rnd() * 340),
    };
  });
})();

function Forma({ forma, cor }) {
  if (forma === 1) return <span className="queda-bolinha" style={{ background: cor }} />;
  if (forma === 2)
    return (
      <svg width="20" height="10" viewBox="-10 -5 20 10" overflow="visible">
        <path d="M-9 0q3-6 6 0t6 0t6 0" fill="none" stroke={cor} strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  return <span className="queda-fita" style={{ background: cor }} />;
}

function FundoFesta({ pausado = false }) {
  const caixa = useRef(null);
  const animacoes = useRef([]);
  const semMovimento = useReducedMotion();

  // Durante o giro e a revelação os papéis param e somem devagar (CSS): o olho fica
  // na roda e na chuva de confete da revelação, e o
  // computador mais fraco ganha fôlego (medido: com o fundo caindo, o giro caía de
  // ~56 para ~36 quadros/s com o processador 4x mais lento). Voltam no prêmio seguinte.
  useEffect(() => {
    for (const a of animacoes.current) {
      if (pausado) a.pause();
      else a.play();
    }
  }, [pausado]);

  useLayoutEffect(() => {
    if (semMovimento || !caixa.current) return;
    const lista = [...caixa.current.children].map((el, i) => {
      const p = PAPEIS[i];
      const quadros = Array.from({ length: PONTOS + 1 }, (_, k) => {
        const t = k / PONTOS;
        const x = Math.sin(t * Math.PI * 4) * p.balanco; // dois balanços por queda
        return {
          transform: `translate(${x.toFixed(1)}px, ${(-8 + t * 116).toFixed(2)}vh) rotate(${(p.giro0 + p.giro * t).toFixed(1)}deg) scale(${p.escala.toFixed(2)})`,
        };
      });
      return el.animate(quadros, {
        duration: p.dur,
        delay: -p.fase * p.dur,
        iterations: Infinity,
        easing: 'linear',
      });
    });
    animacoes.current = lista;
    return () => {
      lista.forEach(a => a.cancel());
      animacoes.current = [];
    };
  }, [semMovimento]);

  const classes = ['fundo-queda'];
  if (semMovimento) classes.push('fundo-queda--parada');
  if (pausado) classes.push('fundo-queda--descansa');

  return (
    <div className="fundo" aria-hidden="true">
      <div className="fundo-manchas" />
      <div className={classes.join(' ')} ref={caixa}>
        {PAPEIS.map((p, i) => (
          <i
            key={i}
            className="queda"
            style={{
              left: `${p.x}%`,
              top: semMovimento ? `${p.yParado}%` : 0,
              transform: semMovimento ? `rotate(${p.giro0}deg) scale(${p.escala})` : undefined,
            }}
          >
            <Forma forma={p.forma} cor={p.cor} />
          </i>
        ))}
      </div>
    </div>
  );
}

// Só é refeito quando `pausado` ou "menos movimento" mudam.
export default memo(FundoFesta);
