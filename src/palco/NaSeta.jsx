import { forwardRef, useImperativeHandle, useRef } from 'react';
import { pedidoDoCupom } from '../lib/sorteio';

// Caixa ao lado da roda com quem está passando na seta.
// Durante o giro ela muda até 12 vezes por segundo: por isso a roda escreve
// direto nos elementos (`mostrar`), sem passar pelo React a cada quadro.
//
// Mostra o NÚMERO DO PEDIDO, não o do cupom (pedido do Enzo em 2026-10-02): é a
// mesma conta da revelação, então o número em que a seta para é o que aparece
// depois. Cliente sem pedidos (planilha sem essa coluna): só o nome.

const NaSeta = forwardRef(function NaSeta({ estado, digitos }, ref) {
  const caixa = useRef(null);
  const nome = useRef(null);
  const detalhe = useRef(null);
  const atual = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      mostrar({ fatia, cupom: numero }) {
        if (!nome.current || !detalhe.current) return;
        if (atual.current !== fatia) {
          atual.current = fatia;
          nome.current.textContent = fatia.p.nome;
          caixa.current.style.setProperty('--cor', fatia.cor.fundo);
        }
        const pedido = pedidoDoCupom(fatia.p, numero);
        const numeroVisto = pedido ? `Pedido ${pedido.numero}` : '';
        // cidade só quando a planilha tiver (a do GFSIS não tem)
        detalhe.current.textContent = [numeroVisto, fatia.p.cidade ? `${fatia.p.cidade}/${fatia.p.uf}` : ''].filter(Boolean).join(' · ');
      },
    }),
    [digitos],
  );

  const rotulo = estado === 'pronto' ? 'A roda está pronta' : estado === 'parou' ? 'A seta parou em' : 'Passando na seta';

  return (
    <div ref={caixa} className={`na-seta na-seta--${estado}`}>
      <span className="na-seta-cor" aria-hidden="true" />
      <div className="na-seta-texto">
        <span className="na-seta-rotulo">{rotulo}</span>
        {estado === 'pronto' ? (
          <>
            <span className="na-seta-nome">Quem vai ganhar?</span>
            <span className="na-seta-detalhe">Aperte Espaço ou clique em Sortear</span>
          </>
        ) : (
          <>
            <span ref={nome} className="na-seta-nome" />
            <span ref={detalhe} className="na-seta-detalhe" />
          </>
        )}
      </div>
    </div>
  );
});

export default NaSeta;
