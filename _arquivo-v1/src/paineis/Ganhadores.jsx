import { useEffect, useState } from 'react';
import Icone from '../components/Icone';
import { cupom, hora, numero, porcento } from '../lib/formato';

// Lista de ganhadores do lado do operador. Desfazer e recomeçar pedem uma
// segunda confirmação no próprio botão (nada de janela do navegador, que
// travaria a tela no meio da live).

function BotaoConfirmar({ icone, rotulo, pergunta, onConfirmar, perigo }) {
  const [perguntando, setPerguntando] = useState(false);

  useEffect(() => {
    if (!perguntando) return;
    const t = setTimeout(() => setPerguntando(false), 5000);
    return () => clearTimeout(t);
  }, [perguntando]);

  if (!perguntando) {
    return (
      <button type="button" className={`botao-secundario${perigo ? ' botao-secundario--perigo' : ''}`} onClick={() => setPerguntando(true)}>
        <Icone nome={icone} />
        {rotulo}
      </button>
    );
  }
  return (
    <div className="confirmar" role="group" aria-label={pergunta}>
      <span>{pergunta}</span>
      <button
        type="button"
        className="botao-secundario botao-secundario--perigo"
        onClick={() => {
          setPerguntando(false);
          onConfirmar();
        }}
        autoFocus
      >
        Sim
      </button>
      <button type="button" className="botao-secundario" onClick={() => setPerguntando(false)}>
        Não
      </button>
    </div>
  );
}

export default function Ganhadores({ titulo, nomePremio, totalPremios, ganhadores, digitos, onDesfazer, onRecomecar }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    const linhas = [
      titulo,
      ...ganhadores.map(g => `${nomePremio(g.premio)}: ${g.nome} (${g.cidade}/${g.uf}), cupom ${cupom(g.cupom, digitos)}`),
    ];
    try {
      await navigator.clipboard.writeText(linhas.join('\n'));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div className="ganhadores">
      <ol className="lista-ganhadores">
        {Array.from({ length: totalPremios }, (_, i) => {
          const g = ganhadores[i];
          return (
            <li key={i} className={`lg-item${g ? '' : ' lg-item--vazio'}`}>
              <span className="lg-premio">{nomePremio(i)}</span>
              {g ? (
                <>
                  <span className="lg-nome">{g.nome}</span>
                  <span className="lg-sub">
                    {g.cidade}/{g.uf} · cupom {cupom(g.cupom, digitos)} · chance de {porcento(g.chance)} · {hora(g.quando)}
                  </span>
                </>
              ) : (
                <span className="lg-sub">Ainda não sorteado</span>
              )}
            </li>
          );
        })}
      </ol>

      {ganhadores.length === 0 ? (
        <p className="vazio">Nenhum prêmio sorteado ainda.</p>
      ) : (
        <>
          <p className="secao-ajuda">
            {numero(ganhadores.length)} de {numero(totalPremios)} prêmios sorteados. A lista fica guardada neste navegador:
            recarregar a página não perde nada.
          </p>
          <div className="acoes">
            <button type="button" className="botao-secundario" onClick={copiar}>
              <Icone nome={copiado ? 'certo' : 'copiar'} />
              {copiado ? 'Copiado' : 'Copiar resultado'}
            </button>
            <BotaoConfirmar
              icone="desfazer"
              rotulo="Desfazer o último"
              pergunta={`Desfazer ${nomePremio(ganhadores.length - 1)}?`}
              onConfirmar={onDesfazer}
            />
            <BotaoConfirmar icone="recomecar" rotulo="Recomeçar sorteio" pergunta="Apagar todos os ganhadores?" onConfirmar={onRecomecar} perigo />
          </div>
        </>
      )}
    </div>
  );
}
