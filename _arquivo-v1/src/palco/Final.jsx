import { motion } from 'motion/react';
import { cupom } from '../lib/formato';

// Encerramento: todos os ganhadores juntos, na ordem em que foram sorteados.

const EASE = [0.16, 1, 0.3, 1];

export default function Final({ premios, ganhadores, digitos }) {
  return (
    <motion.section
      className="final"
      aria-label="Ganhadores do sorteio"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
    >
      <ol className="final-lista">
        {ganhadores.map((g, i) => (
          <motion.li
            key={g.premio}
            className="final-item"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE, delay: 0.1 + i * 0.09 } }}
          >
            <span className="final-premio">{premios[g.premio] ?? `Prêmio ${g.premio + 1}`}</span>
            <span className="final-nome">{g.nome}</span>
            <span className="final-detalhe">
              {g.cidade}/{g.uf}
              <span className="ponto" aria-hidden="true" />
              Cupom <strong>{cupom(g.cupom, digitos)}</strong>
            </span>
          </motion.li>
        ))}
      </ol>
    </motion.section>
  );
}
