import { Fragment, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import Icone from '../components/Icone';
import { revelar } from '../lib/som';
import { hora, numero } from '../lib/formato';

// A revelação, na coluna ao lado da roda (que continua parada no ganhador).
// Entrada pelo Motion (ciclo de vida do componente). O confete é outro
// componente (Confete.jsx), em tela cheia.

const EASE = [0.16, 1, 0.3, 1];

const subir = atraso => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE, delay: atraso } },
});

export default function Ganhador({ titulo, resultado, premio, ultimo, onProximo, mostrarDocumento = true, automatico = false, pausa = 8, onParar }) {
  const p = resultado.participante;
  const tocou = useRef(false);
  // Na planilha real há nome com 132 letras: a letra diminui conforme o tamanho.
  const tamanhoNome = p.nome.length > 60 ? 'ganhador-nome--longo' : p.nome.length > 32 ? 'ganhador-nome--medio' : '';
  // Linha de baixo: cidade (só se a planilha tiver) e documento mascarado (se ligado).
  const local = [p.cidade ? `${p.cidade}${p.uf ? `/${p.uf}` : ''}` : '', mostrarDocumento && p.documento ? `${p.tipo} ${p.documento}`.trim() : '']
    .filter(Boolean);

  useEffect(() => {
    if (tocou.current) return; // o modo de desenvolvimento roda o efeito duas vezes
    tocou.current = true;
    revelar();
  }, []);

  const palavras = p.nome.split(' ');

  return (
    <motion.section
      className="ganhador"
      aria-labelledby="ganhador-nome"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.3 } }}
      exit={{ opacity: 0, y: -12, transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }}
    >
      <p className="cabeca-titulo">{titulo}</p>

      <motion.p className="ganhador-selo" {...subir(0)}>
        <Icone nome="trofeu" tamanho={18} />
        Ganhador
        <span className="ponto" aria-hidden="true" />
        {premio}
      </motion.p>

      <h2 className={`ganhador-nome ${tamanhoNome}`} id="ganhador-nome">
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

      {local.length > 0 && (
        <motion.p className="ganhador-local" {...subir(0.35)}>
          {local.map((parte, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="ponto" aria-hidden="true" />}
              {parte}
            </Fragment>
          ))}
        </motion.p>
      )}

      {/* Só o número do pedido e o nome do cliente (pedido do Enzo em 2026-10-02).
          O pedido vem da planilha; nos dados de demonstração, é o pedido do cliente
          em que o cupom sorteado caiu. */}
      <motion.dl className="fatos" {...subir(0.48)}>
        <div className="fato fato--roxo">
          <dt>Número do pedido</dt>
          <dd>{resultado.pedido ?? '—'}</dd>
        </div>
        <div className="fato fato--laranja fato--nome">
          <dt>Cliente</dt>
          <dd>{p.nome}</dd>
        </div>
      </motion.dl>

      <motion.div className="ganhador-rodape" {...subir(0.62)}>
        <button type="button" className="botao-principal" onClick={onProximo}>
          {ultimo ? 'Ver todos os ganhadores' : 'Próximo prêmio'}
          <Icone nome="seta" tamanho={20} />
          <kbd>Enter</kbd>
        </button>
        {/* automático: a barra enche durante a pausa e o próximo sorteio começa sozinho */}
        {automatico && (
          <div className="auto" role="status">
            <div className="auto-barra" aria-hidden="true">
              <span style={{ animationDuration: `${pausa}s` }} />
            </div>
            <span>{ultimo ? 'Em instantes, todos os ganhadores' : 'O próximo sorteio começa sozinho'}</span>
            <button type="button" className="botao-texto" onClick={onParar}>
              Parar automático (Esc)
            </button>
          </div>
        )}
        <p className="ganhador-prova">
          Sorteado às {hora(resultado.quando)} entre {numero(resultado.totalElegivel)} clientes, pelo gerador
          criptográfico do navegador
        </p>
      </motion.div>
    </motion.section>
  );
}
