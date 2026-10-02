import { useEffect, useId, useRef } from 'react';
import { motion } from 'motion/react';
import Icone from '../components/Icone';

// Painel dos bastidores do operador: de lado (Ganhadores) ou de cima (Configurar).
// Entra deslizando por transform, segura o foco do teclado dentro dele e devolve
// o foco a quem abriu.

const FOCAVEIS =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const ENTRADA = {
  direita: { fora: { x: '100%' }, dentro: { x: 0 } },
  topo: { fora: { y: '-100%' }, dentro: { y: 0 } },
};

export default function Gaveta({ titulo, onFechar, children, de = 'direita', acoes = null }) {
  const painel = useRef(null);
  const id = useId();

  useEffect(() => {
    const anterior = document.activeElement;
    painel.current?.focus();
    return () => anterior?.focus?.();
  }, []);

  const prenderFoco = e => {
    if (e.key !== 'Tab') return;
    const itens = [...painel.current.querySelectorAll(FOCAVEIS)];
    if (!itens.length) return;
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];
    if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === painel.current)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  return (
    <div className="gaveta-raiz">
      <motion.div
        className="gaveta-veu"
        onClick={onFechar}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.25 } }}
        exit={{ opacity: 0, transition: { duration: 0.18 } }}
      />
      <motion.aside
        ref={painel}
        className={`gaveta gaveta--${de}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        onKeyDown={prenderFoco}
        initial={ENTRADA[de].fora}
        animate={{ ...ENTRADA[de].dentro, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }}
        exit={{ ...ENTRADA[de].fora, transition: { duration: 0.26, ease: [0.4, 0, 1, 1] } }}
      >
        <header className="gaveta-topo">
          <h2 id={id}>{titulo}</h2>
          <div className="gaveta-acoes">
            {acoes}
            <button type="button" className="botao-icone" onClick={onFechar} aria-label="Fechar painel">
              <Icone nome="fechar" />
            </button>
          </div>
        </header>
        <div className="gaveta-corpo">{children}</div>
      </motion.aside>
    </div>
  );
}
