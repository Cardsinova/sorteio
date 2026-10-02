import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { motion } from 'motion/react';
import gsap from 'gsap';
import Icone from '../components/Icone';
import { revelar } from '../lib/som';
import { cupom, hora, moeda, numero, porcento } from '../lib/formato';

// A revelação. Entrada pelo Motion (é o ciclo de vida do componente);
// a explosão de peças é uma única rajada de GSAP, só transform e opacidade,
// e não acontece para quem pede menos movimento.

const EASE = [0.16, 1, 0.3, 1];
const PECAS = 30;

const subir = atraso => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE, delay: atraso } },
});

export default function Ganhador({ resultado, premio, digitos, ultimo, onProximo, semMovimento }) {
  const p = resultado.participante;
  const explosao = useRef(null);
  const tocou = useRef(false);

  useEffect(() => {
    if (tocou.current) return; // o modo de desenvolvimento roda o efeito duas vezes
    tocou.current = true;
    revelar();
  }, []);

  useLayoutEffect(() => {
    if (semMovimento || !explosao.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('.anel', { scale: 0.35, opacity: 0.7 }, { scale: 2.4, opacity: 0, duration: 1.4, ease: 'power2.out', delay: 0.1 });
      explosao.current.querySelectorAll('.peca').forEach(el => {
        const angulo = Math.random() * Math.PI * 2;
        const distancia = 160 + Math.random() * 240;
        gsap.fromTo(
          el,
          { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 },
          {
            x: Math.cos(angulo) * distancia * 1.7, // elipse: o nome é largo
            y: Math.sin(angulo) * distancia,
            rotation: (Math.random() - 0.5) * 540,
            scale: 0.3,
            opacity: 0,
            duration: 1.2 + Math.random() * 0.7,
            ease: 'power3.out',
            delay: 0.16,
          },
        );
      });
    }, explosao);
    return () => ctx.revert();
  }, [semMovimento]);

  const palavras = p.nome.split(' ');

  return (
    <motion.section
      className="ganhador"
      aria-labelledby="ganhador-nome"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
      exit={{ opacity: 0, y: -12, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
    >
      <div className="explosao" ref={explosao} aria-hidden="true">
        <span className="anel" />
        {Array.from({ length: PECAS }, (_, i) => (
          <span key={i} className={`peca peca--${i % 3} peca--f${i % 2}`} />
        ))}
      </div>

      <motion.p className="ganhador-selo" {...subir(0)}>
        <Icone nome="trofeu" tamanho={18} />
        Ganhador
        <span className="ponto" aria-hidden="true" />
        {premio}
      </motion.p>

      <h2 className="ganhador-nome" id="ganhador-nome">
        {/* O espaço fica FORA da caixa de cada palavra: dentro dela, o navegador o descarta. */}
        {palavras.map((palavra, i) => (
          <Fragment key={i}>
            <span className="palavra">
              <motion.span
                initial={{ y: '110%' }}
                animate={{ y: '0%', transition: { duration: 0.85, ease: EASE, delay: 0.12 + i * 0.07 } }}
              >
                {palavra}
              </motion.span>
            </span>
            {i < palavras.length - 1 && ' '}
          </Fragment>
        ))}
      </h2>

      <motion.p className="ganhador-local" {...subir(0.35)}>
        {p.cidade}/{p.uf}
        <span className="ponto" aria-hidden="true" />
        {p.tipo} {p.documento}
      </motion.p>

      <motion.dl className="fatos" {...subir(0.48)}>
        <div className="fato fato--cupom">
          <dt>Cupom sorteado</dt>
          <dd>{cupom(resultado.cupom, digitos)}</dd>
        </div>
        <div className="fato">
          <dt>Ticket</dt>
          <dd>{moeda(p.ticket)}</dd>
        </div>
        <div className="fato">
          <dt>Cupons do cliente</dt>
          <dd>{numero(p.cupons)}</dd>
        </div>
        <div className="fato">
          <dt>Chance que tinha</dt>
          <dd>{porcento(resultado.chance)}</dd>
        </div>
      </motion.dl>

      <motion.div className="ganhador-rodape" {...subir(0.62)}>
        <button type="button" className="botao-principal" onClick={onProximo}>
          {ultimo ? 'Ver todos os ganhadores' : 'Próximo prêmio'}
          <Icone nome="seta" tamanho={20} />
          <kbd>Enter</kbd>
        </button>
        <p className="ganhador-prova">
          Sorteado às {hora(resultado.quando)} entre {numero(resultado.totalElegivel)} cupons, pelo gerador
          criptográfico do navegador
        </p>
      </motion.div>
    </motion.section>
  );
}
