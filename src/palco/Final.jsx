import { motion } from 'motion/react';
import { CORES } from '../lib/cores';

// Encerramento: todos os ganhadores juntos, na ordem em que foram sorteados.

const EASE = [0.16, 1, 0.3, 1];

export default function Final({ premios, ganhadores, digitos, mensagem }) {
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
            style={{ '--cor': CORES[i % CORES.length].fundo, '--cor-forte': CORES[i % CORES.length].forte }}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE, delay: 0.1 + i * 0.09 } }}
          >
            <span className="final-premio">{premios[g.premio] ?? `Prêmio ${g.premio + 1}`}</span>
            <span className="final-nome">{g.nome}</span>
            {/* o número do pedido, como na revelação */}
            <span className="final-detalhe">
              {g.cidade && (
                <>
                  {g.cidade}
                  {g.uf ? `/${g.uf}` : ''}
                  <span className="ponto" aria-hidden="true" />
                </>
              )}
              {g.pedido != null && (
                <>
                  Pedido <strong>{g.pedido}</strong>
                </>
              )}
            </span>
          </motion.li>
        ))}
      </ol>
      {/* recado embaixo dos ganhadores (pedido do Enzo em 2026-10-02); entra depois dos cartões */}
      {mensagem?.trim() && (
        <motion.p
          className="final-mensagem"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE, delay: 0.25 + ganhadores.length * 0.09 } }}
        >
          {mensagem}
        </motion.p>
      )}
    </motion.section>
  );
}
