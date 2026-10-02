import { useDeferredValue, useMemo, useState } from 'react';
import Icone from '../components/Icone';
import { cupom, moeda, numero, porcento } from '../lib/formato';

export const SUSPENSES = [
  { id: 'curto', rotulo: 'Curto', segundos: 4 },
  { id: 'medio', rotulo: 'Médio', segundos: 7 },
  { id: 'longo', rotulo: 'Longo', segundos: 11 },
];

const LIMITE_LISTA = 200;
const semAcento = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function Preparar({ config, mudar, participantes, total, digitos, ganhadores }) {
  const travado = ganhadores.length > 0;
  const [busca, setBusca] = useState('');
  const buscaAdiada = useDeferredValue(busca);
  const [reaisTexto, setReaisTexto] = useState(String(config.reaisPorCupom).replace('.', ','));

  const ganhouPor = useMemo(() => new Map(ganhadores.map(g => [g.id, g.premio])), [ganhadores]);

  const filtrados = useMemo(() => {
    const termo = semAcento(buscaAdiada.trim());
    if (!termo) return participantes;
    return participantes.filter(p => semAcento(`${p.nome} ${p.cidade} ${p.uf}`).includes(termo));
  }, [participantes, buscaAdiada]);

  const maior = useMemo(() => participantes.reduce((m, p) => (!m || p.cupons > m.cupons ? p : m), null), [participantes]);

  const mudarReais = texto => {
    setReaisTexto(texto);
    const valor = Number(texto.replace(',', '.'));
    if (Number.isFinite(valor) && valor >= 0.01) mudar('reaisPorCupom', Math.round(valor * 100) / 100);
  };

  const mudarPremio = (i, nome) => mudar('premios', config.premios.map((p, j) => (j === i ? nome : p)));
  const tirarPremio = i => mudar('premios', config.premios.filter((_, j) => j !== i));
  const porPremio = () => mudar('premios', [...config.premios, `Prêmio ${config.premios.length + 1}`]);

  return (
    <div className="preparar">
      <p className="aviso">
        <Icone nome="info" />
        <span>
          <strong>Dados de demonstração:</strong> {numero(participantes.length)} clientes inventados. A planilha de
          emissões entra aqui quando o formato dela estiver combinado.
        </span>
      </p>

      <section className="secao">
        <h3>Sorteio</h3>
        <label className="campo">
          <span className="campo-rotulo">Título que aparece no palco</span>
          <input type="text" value={config.titulo} onChange={e => mudar('titulo', e.target.value)} maxLength={80} />
        </label>
      </section>

      <section className="secao">
        <h3>Prêmios</h3>
        <p className="secao-ajuda">Sorteados nesta ordem, de cima para baixo.</p>
        <ol className="premios">
          {config.premios.map((nome, i) => {
            const sorteado = i < ganhadores.length;
            return (
              <li key={i} className="premio">
                <span className="premio-num" aria-hidden="true">
                  {i + 1}
                </span>
                <label className="so-leitor" htmlFor={`premio-${i}`}>
                  Nome do prêmio {i + 1}
                </label>
                <input id={`premio-${i}`} type="text" value={nome} maxLength={60} onChange={e => mudarPremio(i, e.target.value)} />
                {sorteado ? (
                  <span className="etiqueta etiqueta--ouro">Sorteado</span>
                ) : (
                  <button
                    type="button"
                    className="botao-icone"
                    onClick={() => tirarPremio(i)}
                    disabled={config.premios.length === 1}
                    aria-label={`Tirar ${nome || `prêmio ${i + 1}`}`}
                  >
                    <Icone nome="lixo" />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        <button type="button" className="botao-secundario" onClick={porPremio} disabled={config.premios.length >= 20}>
          <Icone nome="mais" />
          Adicionar prêmio
        </button>
      </section>

      <section className="secao">
        <h3>Regra dos cupons</h3>
        <div className="regra">
          <label className="campo campo--linha">
            <span className="campo-rotulo">1 cupom a cada</span>
            <span className="campo-dinheiro">
              <span aria-hidden="true">R$</span>
              <input
                type="text"
                inputMode="decimal"
                value={reaisTexto}
                onChange={e => mudarReais(e.target.value)}
                disabled={travado}
                aria-describedby="regra-ajuda"
              />
            </span>
            <span className="campo-rotulo">de ticket</span>
          </label>
        </div>
        <p className="secao-ajuda" id="regra-ajuda">
          Quem tem ticket maior recebe mais cupons e tem mais chance, na mesma proporção. Ticket abaixo do valor recebe 1
          cupom. Hoje: {numero(total)} cupons
          {maior && (
            <>
              ; a maior chance é de {maior.nome} ({porcento(maior.cupons / total)}).
            </>
          )}
        </p>

        <div className="interruptor-linha">
          <span id="um-por-cliente">Cada cliente ganha no máximo um prêmio</span>
          <button
            type="button"
            role="switch"
            aria-checked={config.umPorCliente}
            aria-labelledby="um-por-cliente"
            className="interruptor"
            onClick={() => mudar('umPorCliente', !config.umPorCliente)}
            disabled={travado}
          >
            <span className="interruptor-bola" />
          </button>
        </div>
        {travado && (
          <p className="secao-ajuda secao-ajuda--trava">
            Regra travada depois do primeiro sorteio, para os números dos cupons não mudarem. Para mudar, recomece o
            sorteio no painel Ganhadores.
          </p>
        )}
      </section>

      <section className="secao">
        <h3 id="suspense-titulo">Suspense do giro</h3>
        <div className="segmentos" role="radiogroup" aria-labelledby="suspense-titulo">
          {SUSPENSES.map(s => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={config.suspense === s.id}
              className="segmento"
              onClick={() => mudar('suspense', s.id)}
            >
              {s.rotulo}
              <span>{s.segundos} s</span>
            </button>
          ))}
        </div>
      </section>

      <section className="secao">
        <div className="secao-topo">
          <h3>Participantes</h3>
          <span className="secao-conta">
            {numero(participantes.length)} clientes · {numero(total)} cupons
          </span>
        </div>
        <label className="busca">
          <Icone nome="busca" />
          <span className="so-leitor">Buscar participante</span>
          <input type="search" placeholder="Buscar por nome ou cidade" value={busca} onChange={e => setBusca(e.target.value)} />
        </label>

        <ul className="pessoas">
          {filtrados.slice(0, LIMITE_LISTA).map(p => {
            const premio = ganhouPor.get(p.id);
            return (
              <li key={p.id} className="pessoa">
                <div className="pessoa-esq">
                  <span className="pessoa-nome">
                    {p.nome}
                    {premio != null && (
                      <span className="etiqueta etiqueta--ouro">
                        <Icone nome="trofeu" tamanho={13} />
                        {config.premios[premio] || `Prêmio ${premio + 1}`}
                      </span>
                    )}
                  </span>
                  <span className="pessoa-sub">
                    {p.cidade}/{p.uf} · {numero(p.emissoes)} {p.emissoes === 1 ? 'emissão' : 'emissões'}
                  </span>
                </div>
                <div className="pessoa-dir">
                  <span className="pessoa-ticket">{moeda(p.ticket)}</span>
                  <span className="pessoa-sub">
                    {numero(p.cupons)} {p.cupons === 1 ? 'cupom' : 'cupons'} ·{' '}
                    {p.cupons === 1 ? `nº ${cupom(p.inicio, digitos)}` : `nº ${cupom(p.inicio, digitos)} a ${cupom(p.fim, digitos)}`} ·{' '}
                    {porcento(p.cupons / total)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {filtrados.length === 0 && <p className="vazio">Ninguém encontrado com “{busca}”.</p>}
        {filtrados.length > LIMITE_LISTA && (
          <p className="vazio">
            Mostrando {LIMITE_LISTA} de {numero(filtrados.length)}. Use a busca para achar alguém.
          </p>
        )}
      </section>
    </div>
  );
}
