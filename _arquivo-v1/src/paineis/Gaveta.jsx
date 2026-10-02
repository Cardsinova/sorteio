import { useEffect, useId, useRef } from 'react';
import { motion } from 'motion/react';
import Icone from '../components/Icone';

// Painel lateral (bastidores do operador). Entra deslizando por transform,
// segura o foco do teclado dentro dele e devolve o foco a quem abriu.

const FOCAVEIS = 'button:not([disabled]), input:not([disabled]), select, [href], [tabindex]:not([tabindex="-1"])';

export default function Gaveta({ titulo, onFechar, children }) {
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
        className="gaveta"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        onKeyDown={prenderFoco}
        initial={{ x: '100%' }}
        animate={{ x: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }}
        exit={{ x: '100%', transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }}
      >
        <header className="gaveta-topo">
          <h2 id={id}>{titulo}</h2>
          <button type="button" className="botao-icone" onClick={onFechar} aria-label="Fechar painel">
            <Icone nome="fechar" />
          </button>
        </header>
        <div className="gaveta-corpo">{children}</div>
      </motion.aside>
    </div>
  );
}
