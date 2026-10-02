import { useDeferredValue, useMemo, useRef, useState } from 'react';
import Icone from '../components/Icone';
import { numero, porcento } from '../lib/formato';
import { decodificar, lerCSV, montarParticipantes, reconhecerColunas } from '../lib/planilha';
import { NOMES_CIDADES } from '../lib/cidades';

// Configurar o sorteio: tudo numa tela só, aberta de cima (pedido do Enzo em
// 2026-10-02: "no topo, bem intuitivo, otimizando o máximo das opções").
// Quatro blocos numerados: ① Planilha ② Chances ③ Prêmios ④ Tela.
// O que quase nunca se mexe fica em "Mais opções", fechado.

export const SUSPENSES = [
  { id: 'curto', rotulo: 'Curto', segundos: 4 },
  { id: 'medio', rotulo: 'Médio', segundos: 7 },
  { id: 'longo', rotulo: 'Longo', segundos: 11 },
];

const LIMITE_LISTA = 200;
const semAcento = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const COLUNAS = [
  { chave: 'pedido', rotulo: 'Número do pedido', obrigatoria: true },
  { chave: 'nome', rotulo: 'Nome do cliente', obrigatoria: true },
  { chave: 'valor', rotulo: 'Valor (ticket)', obrigatoria: false },
  { chave: 'documento', rotulo: 'CPF/CNPJ', obrigatoria: false },
];

function Interruptor({ ligado, onMudar, rotulo, desligado = false, id }) {
  return (
    <div className="interruptor-linha">
      <span id={id}>{rotulo}</span>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-labelledby={id}
        className="interruptor"
        onClick={() => onMudar(!ligado)}
        disabled={desligado}
      >
        <span className="interruptor-bola" />
      </button>
    </div>
  );
}

function Segmentos({ opcoes, valor, onMudar, rotuloId, desligado = false }) {
  return (
    <div className="segmentos" role="radiogroup" aria-labelledby={rotuloId}>
      {opcoes.map(o => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={valor === o.id}
          className="segmento"
          onClick={() => onMudar(o.id)}
          disabled={desligado}
        >
          {o.rotulo}
          {o.sub && <span>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

function Bloco({ numero: n, titulo, children }) {
  return (
    <section className="bloco">
      <h3 className="bloco-titulo">
        <span className="bloco-numero" aria-hidden="true">
          {n}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

export default function Configurar({ config, mudar, base, baseAntiga, todosClientes, onCarregar, onVoltarDemo, participantes, total, digitos, ganhadores }) {
  const travado = ganhadores.length > 0;
  const [tabela, setTabela] = useState(null); // planilha lida, só na memória (nunca guardada)
  const [mapa, setMapa] = useState(null);
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const [verLista, setVerLista] = useState(false);
  const [busca, setBusca] = useState('');
  const buscaAdiada = useDeferredValue(busca);
  const entrada = useRef(null);

  // ---------- ① planilha ----------
  const aplicarTabela = (lida, mapaUsado, arquivo) => {
    const faltando = COLUNAS.filter(c => c.obrigatoria && mapaUsado[c.chave] < 0);
    if (faltando.length) {
      setErro(`Não achei a coluna de ${faltando.map(c => c.rotulo.toLowerCase()).join(' e ')}. Escolha em "Colunas" abaixo.`);
      setMaisOpcoes(true);
      return;
    }
    const { participantes: lista, resumo } = montarParticipantes(lida, mapaUsado);
    if (!lista.length) {
      setErro('Nenhum pedido válido na planilha (com número, nome e situação "Aprovado").');
      return;
    }
    setErro('');
    onCarregar({
      versao: 2, // com a cidade de cada cliente (tirada do CEP)
      arquivo,
      carregadoEm: Date.now(),
      colunas: Object.fromEntries(COLUNAS.map(c => [c.chave, mapaUsado[c.chave] >= 0 ? lida.cabecalho[mapaUsado[c.chave]] : null])),
      resumo,
      participantes: lista,
    });
  };

  const abrirArquivo = async arquivo => {
    if (!arquivo) return;
    if (travado) return;
    if (!/\.(csv|txt)$/i.test(arquivo.name)) {
      setErro('Use o arquivo .csv exportado do GFSIS (ou Excel salvo como CSV).');
      return;
    }
    try {
      const lida = lerCSV(decodificar(await arquivo.arrayBuffer()));
      const m = reconhecerColunas(lida.cabecalho);
      setTabela({ ...lida, arquivo: arquivo.name });
      setMapa(m);
      aplicarTabela(lida, m, arquivo.name);
    } catch {
      setErro('Não consegui ler esse arquivo. Confira se é a planilha em CSV.');
    }
  };

  const mudarColuna = (chave, indice) => {
    const novo = { ...mapa, [chave]: Number(indice) };
    setMapa(novo);
    aplicarTabela(tabela, novo, tabela.arquivo);
  };

  // ---------- ③ prêmios ----------
  const mudarPremio = (i, nome) => mudar('premios', config.premios.map((p, j) => (j === i ? nome : p)));
  const tirarPremio = i => mudar('premios', config.premios.filter((_, j) => j !== i));
  const porPremio = () => mudar('premios', [...config.premios, `Prêmio ${config.premios.length + 1}`]);

  // ---------- lista ----------
  const ganhouPor = useMemo(() => new Map(ganhadores.map(g => [g.id, g.premio])), [ganhadores]);
  const filtrados = useMemo(() => {
    const termo = semAcento(buscaAdiada.trim());
    if (!termo) return participantes;
    return participantes.filter(p =>
      semAcento(`${p.nome} ${p.cidade ?? ''} ${(p.pedidos ?? []).map(x => x.numero).join(' ')}`).includes(termo),
    );
  }, [participantes, buscaAdiada]);

  const resumo = base?.resumo;
  const contagemCidades = useMemo(() => {
    const m = new Map();
    for (const p of todosClientes) m.set(p.cidade, (m.get(p.cidade) ?? 0) + 1);
    return m;
  }, [todosClientes]);

  return (
    <div className="configurar">
      <div className="blocos">
        {/* ① PLANILHA */}
        <Bloco numero="1" titulo="Planilha">
          <label
            className={`soltar${arrastando ? ' soltar--sobre' : ''}${travado ? ' soltar--travado' : ''}`}
            onDragOver={e => {
              e.preventDefault();
              if (!travado) setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={e => {
              e.preventDefault();
              setArrastando(false);
              abrirArquivo(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={entrada}
              type="file"
              accept=".csv,.txt,text/csv"
              className="so-leitor"
              disabled={travado}
              onChange={e => {
                abrirArquivo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Icone nome="planilha" tamanho={26} />
            {base ? (
              <>
                <strong className="soltar-arquivo">{base.arquivo}</strong>
                <span>{travado ? 'Planilha travada durante o sorteio' : 'Clique ou arraste outra para trocar'}</span>
              </>
            ) : (
              <>
                <strong>Subir a planilha de participantes</strong>
                <span>Clique ou arraste o arquivo .csv aqui</span>
              </>
            )}
          </label>

          {erro && (
            <p className="aviso aviso--erro" role="alert">
              <Icone nome="info" />
              <span>{erro}</span>
            </p>
          )}

          {base ? (
            <ul className="resumo">
              <li>
                <strong>{numero(participantes.length)}</strong> clientes no sorteio
              </li>
              <li>
                <strong>{numero(resumo.pedidos)}</strong> pedidos aprovados lidos
              </li>
              {Object.values(resumo.ignorados).some(Boolean) && (
                <li className="resumo-nota">
                  Ignorados:{' '}
                  {[
                    resumo.ignorados.naoAprovado && `${numero(resumo.ignorados.naoAprovado)} não aprovados`,
                    resumo.ignorados.pedidoRepetido && `${numero(resumo.ignorados.pedidoRepetido)} repetidos`,
                    resumo.ignorados.semNome && `${numero(resumo.ignorados.semNome)} sem nome`,
                    resumo.ignorados.semPedido && `${numero(resumo.ignorados.semPedido)} sem número`,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </li>
              )}
            </ul>
          ) : (
            <p className="aviso">
              <Icone nome="info" />
              <span>
                Usando a <strong>planilha padrão</strong> (sorteio.csv, {numero(participantes.length)} clientes das 9 cidades). Suba
                outra para trocar.
              </span>
            </p>
          )}

          <button type="button" className="botao-texto" onClick={() => setMaisOpcoes(v => !v)} aria-expanded={maisOpcoes}>
            <Icone nome={maisOpcoes ? 'menos' : 'mais'} tamanho={16} />
            Mais opções
          </button>
          {maisOpcoes && (
            <div className="mais-opcoes">
              {tabela ? (
                <div className="colunas">
                  <span className="campo-rotulo">Colunas usadas da planilha</span>
                  {COLUNAS.map(c => (
                    <label key={c.chave} className="coluna">
                      <span>{c.rotulo}</span>
                      <select value={mapa[c.chave]} onChange={e => mudarColuna(c.chave, e.target.value)} disabled={travado}>
                        {!c.obrigatoria && <option value={-1}>— nenhuma —</option>}
                        {c.obrigatoria && mapa[c.chave] < 0 && <option value={-1}>Escolha a coluna</option>}
                        {tabela.cabecalho.map((nome, i) => (
                          <option key={i} value={i}>
                            {nome || `Coluna ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {mapa.situacao >= 0 && <span className="resumo-nota">Só entram pedidos com situação “Aprovado”.</span>}
                </div>
              ) : base ? (
                <p className="resumo-nota">
                  Colunas: pedido = “{base.colunas.pedido}”, cliente = “{base.colunas.nome}”
                  {base.colunas.valor ? `, valor = “${base.colunas.valor}”` : ''}. Para mudar, suba a planilha de novo.
                </p>
              ) : null}
              {base && !travado && (
                <button type="button" className="botao-texto" onClick={onVoltarDemo}>
                  <Icone nome="desfazer" tamanho={16} />
                  Voltar à planilha padrão
                </button>
              )}
            </div>
          )}
        </Bloco>

        {/* ② QUEM PARTICIPA — regra do Enzo (2026-10-02): todo mundo da planilha, mesma chance */}
        <Bloco numero="2" titulo="Quem participa">
          <p className="regra-texto">
            <strong>Todos os clientes da planilha</strong>, cada um com a mesma chance
            {participantes.length ? ` (${porcento(1 / participantes.length)})` : ''}. Todos aparecem na roda, com o nome.
          </p>
          <span className="campo-rotulo" id="cidades-titulo">
            Cidades que participam
          </span>
          {baseAntiga ? (
            <p className="aviso aviso--erro">
              <Icone nome="info" />
              <span>Esta planilha foi carregada antes do filtro de cidades. Suba de novo para valer.</span>
            </p>
          ) : (
            <>
              <div className="cidades" role="group" aria-labelledby="cidades-titulo">
                {NOMES_CIDADES.map(nome => {
                  const qtd = contagemCidades.get(nome) ?? 0;
                  const ligada = config.cidades.includes(nome);
                  return (
                    <button
                      key={nome}
                      type="button"
                      className="cidade"
                      aria-pressed={ligada}
                      disabled={travado}
                      onClick={() => mudar('cidades', ligada ? config.cidades.filter(c => c !== nome) : [...config.cidades, nome])}
                    >
                      {nome} <span>{numero(qtd)}</span>
                    </button>
                  );
                })}
              </div>
              <p className="resumo-nota">
                {numero(todosClientes.length - participantes.length)} clientes de outras cidades (ou de cidades desligadas) ficam de
                fora.
              </p>
            </>
          )}
          <Interruptor
            id="um-por-cliente"
            rotulo="Cada cliente ganha um prêmio só"
            ligado={config.umPorCliente}
            onMudar={v => mudar('umPorCliente', v)}
            desligado={travado}
          />
          {travado && <p className="resumo-nota resumo-nota--trava">Travado depois do primeiro sorteio. Para mudar, recomece em Ganhadores.</p>}
        </Bloco>

        {/* ③ PRÊMIOS */}
        <Bloco numero="3" titulo="Prêmios">
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
          <button type="button" className="botao-texto" onClick={porPremio} disabled={config.premios.length >= 20}>
            <Icone nome="mais" tamanho={16} />
            Adicionar prêmio
          </button>
          <span className="campo-rotulo" id="suspense-titulo">
            Tempo da roda girando
          </span>
          <Segmentos
            rotuloId="suspense-titulo"
            valor={config.suspense}
            onMudar={v => mudar('suspense', v)}
            opcoes={SUSPENSES.map(s => ({ id: s.id, rotulo: s.rotulo, sub: `${s.segundos} s` }))}
          />
          <span className="campo-rotulo" id="pausa-titulo">
            Ganhador na tela antes do próximo sorteio (automático)
          </span>
          <Segmentos
            rotuloId="pausa-titulo"
            valor={String(config.pausa)}
            onMudar={v => mudar('pausa', Number(v))}
            opcoes={[5, 8, 12].map(s => ({ id: String(s), rotulo: `${s} s` }))}
          />
        </Bloco>

        {/* ④ TELA */}
        <Bloco numero="4" titulo="Textos da tela">
          <label className="campo">
            <span className="campo-rotulo">Título em cima da roda</span>
            <input type="text" value={config.titulo} onChange={e => mudar('titulo', e.target.value)} maxLength={80} />
          </label>
          <label className="campo">
            <span className="campo-rotulo">Título da tela final</span>
            <input type="text" value={config.tituloFinal} onChange={e => mudar('tituloFinal', e.target.value)} maxLength={80} />
          </label>
          <label className="campo">
            <span className="campo-rotulo">Recado embaixo dos ganhadores</span>
            <textarea rows={5} value={config.mensagemFinal} onChange={e => mudar('mensagemFinal', e.target.value)} maxLength={240} />
          </label>
          <Interruptor
            id="mostrar-documento"
            rotulo="Mostrar CPF/CNPJ (com ***) no ganhador"
            ligado={config.mostrarDocumento}
            onMudar={v => mudar('mostrarDocumento', v)}
          />
        </Bloco>
      </div>

      {/* Lista de quem está no sorteio: fechada, para conferir quando precisar */}
      <section className="lista-participantes">
        <button type="button" className="botao-texto" onClick={() => setVerLista(v => !v)} aria-expanded={verLista}>
          <Icone nome={verLista ? 'menos' : 'mais'} tamanho={16} />
          Ver os {numero(participantes.length)} participantes
        </button>
        {verLista && (
          <>
            <label className="busca">
              <Icone nome="busca" />
              <span className="so-leitor">Buscar participante</span>
              <input type="search" placeholder="Buscar por nome ou número do pedido" value={busca} onChange={e => setBusca(e.target.value)} />
            </label>
            <ul className="pessoas">
              {filtrados.slice(0, LIMITE_LISTA).map(p => {
                const premio = ganhouPor.get(p.id);
                const pedidos = p.pedidos ?? [];
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
                        {pedidos.length === 1
                          ? `Pedido ${pedidos[0].numero}`
                          : `${numero(pedidos.length)} pedidos: ${pedidos
                              .slice(0, 4)
                              .map(x => x.numero)
                              .join(', ')}${pedidos.length > 4 ? '…' : ''}`}
                        {p.cidade ? ` · ${p.cidade}/${p.uf}` : ''}
                      </span>
                    </div>
                    <div className="pessoa-dir">
                      <span className="pessoa-sub">{porcento(1 / total)} de chance</span>
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
          </>
        )}
      </section>
    </div>
  );
}
