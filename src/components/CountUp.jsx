'use client';

// Base: React Bits (CountUp-JS-CSS). Ajustes do projeto:
// - número em pt-BR (1.581; 12,4);
// - quando o valor muda, vai A PARTIR do valor atual (o original voltava a zero e piscava);
// - curva com tempo certo (0,6 s, desacelerando) no lugar da mola, que demorava a assentar;
// - o formatador é criado uma vez (o original criava um Intl.NumberFormat a cada quadro);
// - com "menos movimento" ligado no sistema, o número troca direto.
import { animate, useInView, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';

export default function CountUp({ to, from = 0, duration = 0.6, decimals = 0, prefix = '', suffix = '', className = '' }) {
  const ref = useRef(null);
  const valor = useMotionValue(from);
  const naTela = useInView(ref, { once: true, margin: '0px' });
  const reduz = useReducedMotion();

  const formatar = useMemo(() => {
    const f = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return n => prefix + f.format(n) + suffix;
  }, [decimals, prefix, suffix]);

  useEffect(() => {
    if (ref.current && !ref.current.textContent) ref.current.textContent = formatar(from);
  }, [from, formatar]);

  useEffect(() => {
    if (!naTela) return;
    if (reduz) {
      valor.set(to);
      return;
    }
    const controle = animate(valor, to, { duration, ease: [0.2, 0.8, 0.2, 1] });
    return () => controle.stop();
  }, [naTela, to, duration, valor, reduz]);

  useEffect(() => {
    let ultimo = '';
    return valor.on('change', n => {
      const txt = formatar(n);
      // Só toca na página quando o texto muda de fato (vários quadros dão o mesmo número).
      if (txt !== ultimo && ref.current) {
        ultimo = txt;
        ref.current.textContent = txt;
      }
    });
  }, [valor, formatar]);

  return <span className={className} ref={ref} />;
}
