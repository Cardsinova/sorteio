import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Icone from './components/Icone';
import FundoFesta from './components/FundoFesta';
import Roda from './palco/Roda';
import NaSeta from './palco/NaSeta';
import Ganhador from './palco/Ganhador';
import Confete from './palco/Confete';
import Final from './palco/Final';
import Gaveta from './paineis/Gaveta';
import Configurar, { SUSPENSES } from './paineis/Configurar';
import Ganhadores from './paineis/Ganhadores';
import { PADRAO } from './data/padrao';
import { distribuirCupons, pedidoDoCupom, sortear } from './lib/sorteio';
import { numero } from './lib/formato';
import { NOMES_CIDADES } from './lib/cidades';
import { definirSom, prepararSom } from './lib/som';
import { ler, gravar } from './lib/guardar';

const CONFIG_PADRAO = {
  titulo: 'Sorteio de clientes Cardsinova',
  // a tela final tem título próprio (pedido do Enzo em 2026-10-02)
  tituloFinal: 'Campanha do Mês do Cliente',
  mensagemFinal:
    'Nosso time de Relacionamento entrará em contato com os ganhadores para orientar e combinar os detalhes da retirada dos prêmios.',
  premios: ['Prêmio 1', 'Prêmio 2', 'Prêmio 3'],
  umPorCliente: true,
  mostrarDocumento: true,
  suspense: 'medio',
  // só clientes destas cidades (pedido do Enzo, 2026-10-02); cidade sai do CEP do endereço
  cidades: NOMES_CIDADES,
  pausa: 8, // segundos entre mostrar um ganhador e começar o próximo sorteio (automático)
};

const EASE = [0.16, 1, 0.3, 1];

// Coluna ao lado da roda: os blocos entram um depois do outro (cascata), ao abrir
// a página e a cada prêmio. Saem juntos e mais rápido.
const CASCATA = {
  escondido: {},
  visivel: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
  saindo: { opacity: 0, y: -10, transition: { duration: 0.3, ease: [0.4, 0, 1, 1] } },
};
const BLOCO = {
  escondido: { opacity: 0, y: 22 },
  visivel: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

export default function App() {
  const [config, setConfig] = useState(() => ({ ...CONFIG_PADRAO, ...ler('sorteio-config', {}) }));
  const [ganhadores, setGanhadores] = useState(() => ler('sorteio-ganhadores', []));
  // Planilha carregada (só o necessário: pedido, nome, valor e CPF/CNPJ mascarado).
  // Fica guardada no navegador: recarregar a página no meio da live não perde nada.
  const [base, setBase] = useState(() => ler('sorteio-base', null));
  const [som, setSom] = useState(() => ler('sorteio-som', true));
  const [gaveta, setGaveta] = useState(null);
  const [apresentacao, setApresentacao] = useState(false);
  const [mouseAtivo, setMouseAtivo] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [travou, setTravou] = useState(false);
  // Automático: depois do primeiro "Sortear", cada sorteio começa sozinho (pedido do Enzo, 2026-10-02)
  const [automatico, setAutomatico] = useState(false);
  const semMovimento = useReducedMotion();
  const naSeta = useRef(null);

  // Se o último sorteio foi feito mas a página recarregou antes de mostrar o
  // ganhador, abre direto na revelação dele (sem girar de novo: o resultado já existe).
  const [fase, setFase] = useState(() => {
    const g = ler('sorteio-ganhadores', []);
    const premios = ler('sorteio-config', {}).premios ?? CONFIG_PADRAO.premios;
    if (g.length && !g[g.length - 1].mostrado) return 'revelado';
    return g.length >= premios.length ? 'final' : 'pronto';
  });
  const [resultado, setResultado] = useState(null);

  useEffect(() => gravar('sorteio-config', config), [config]);
  useEffect(() => gravar('sorteio-ganhadores', ganhadores), [ganhadores]);
  useEffect(() => gravar('sorteio-base', base), [base]);
  useEffect(() => {
    definirSom(som);
    gravar('sorteio-som', som);
  }, [som]);

  // ---------- cupons ----------
  // Planilha subida antes do filtro de cidades não tem a cidade de cada cliente:
  // nesse caso não filtra e o painel pede para subir de novo.
  const baseAntiga = Boolean(base) && base.versao !== 2;
  // Sem planilha subida: a planilha padrão (sorteio.csv já filtrado nas 9 cidades, src/data/padrao.js)
  const todosClientes = base?.participantes ?? PADRAO.participantes;
  const clientes = useMemo(() => {
    if (baseAntiga) return todosClientes;
    const permitidas = new Set(config.cidades);
    return todosClientes.filter(p => permitidas.has(p.cidade));
  }, [todosClientes, baseAntiga, config.cidades]);
  const { participantes, total } = useMemo(
    // Regra do Enzo (2026-10-02): todo mundo da planilha participa com a MESMA chance,
    // um por cliente, inclusive pedido de R$ 0. Por dentro, cada cliente tem 1 "cupom"
    // (é o número que o sorteio escolhe); na tela, cupom não aparece mais.
    () => distribuirCupons(clientes, 1, 'igual'),
    [clientes],
  );
  const digitos = Math.max(3, String(total).length);
  const excluidos = useMemo(
    () => (config.umPorCliente ? new Set(ganhadores.map(g => g.id)) : new Set()),
    [config.umPorCliente, ganhadores],
  );
  const elegiveis = useMemo(() => participantes.filter(p => !excluidos.has(p.id)), [participantes, excluidos]);
  const cuponsEmJogo = useMemo(() => elegiveis.reduce((s, p) => s + p.cupons, 0), [elegiveis]);

  const premioAtual = ganhadores.length; // índice do próximo prêmio
  const totalPremios = config.premios.length;
  const nomePremio = useCallback(i => config.premios[i]?.trim() || `Prêmio ${i + 1}`, [config.premios]);
  const duracao = (SUSPENSES.find(s => s.id === config.suspense) ?? SUSPENSES[1]).segundos;

  // Resultado mostrado na revelação: o do giro atual ou, depois de recarregar, o último guardado.
  const revelando = useMemo(() => {
    if (fase !== 'revelado') return null;
    if (resultado) return resultado;
    const g = ganhadores[ganhadores.length - 1];
    if (!g) return null;
    const p = participantes.find(x => x.id === g.id) ?? g;
    return {
      participante: { ...g, ...p },
      cupom: g.cupom,
      pedido: g.pedido ?? null,
      chance: g.chance,
      totalElegivel: g.totalElegivel,
      quando: g.quando,
      premio: g.premio,
    };
  }, [fase, resultado, ganhadores, participantes]);

  // Prêmio novo depois do fim (ou ganhador desfeito): volta a ter o que sortear.
  // Prêmios tirados até sobrarem só os sorteados: vai para o encerramento.
  useEffect(() => {
    if (fase === 'final' && premioAtual < totalPremios) setFase('pronto');
    if (fase === 'pronto' && premioAtual > 0 && premioAtual >= totalPremios) setFase('final');
    if (fase === 'revelado' && !revelando) setFase(premioAtual < totalPremios ? 'pronto' : 'final');
  }, [fase, premioAtual, totalPremios, revelando]);

  // A roda fica como estava no "Sortear" até o próximo prêmio:
  // o ganhador já saiu da conta, mas a fatia dele tem que continuar lá para a
  // seta parar nela.
  const congelado = useRef({ pool: elegiveis });
  if (fase === 'pronto') congelado.current = { pool: elegiveis };
  const idRecarregado = fase === 'revelado' && !resultado ? (revelando?.participante.id ?? null) : null;
  const poolRecarregado = useMemo(
    () => (idRecarregado ? participantes.filter(p => !excluidos.has(p.id) || p.id === idRecarregado) : null),
    [idRecarregado, participantes, excluidos],
  );
  const poolRoda = poolRecarregado ?? congelado.current.pool;

  // ---------- ações ----------
  const avisar = useCallback(texto => {
    setAviso({ texto, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2600);
    return () => clearTimeout(t);
  }, [aviso]);

  const iniciar = useCallback(() => {
    if (fase !== 'pronto' || premioAtual >= totalPremios) return;
    const sorteado = sortear(participantes, excluidos);
    if (!sorteado) return;
    // o pedido sai do cupom: cada cupom do cliente pertence a um pedido dele
    const r = { ...sorteado, pedido: pedidoDoCupom(sorteado.participante, sorteado.cupom)?.numero ?? null };
    prepararSom();
    const quando = Date.now();
    // O resultado é gravado ANTES do giro: se a página cair no meio, ele não se perde nem muda.
    setGanhadores(lista => [
      ...lista,
      {
        premio: premioAtual,
        id: r.participante.id,
        nome: r.participante.nome,
        cidade: r.participante.cidade,
        uf: r.participante.uf,
        cupom: r.cupom,
        pedido: r.pedido,
        chance: r.chance,
        totalElegivel: r.totalElegivel,
        quando,
        mostrado: false,
      },
    ]);
    setTravou(false);
    setResultado({ ...r, quando, premio: premioAtual });
    setFase('sorteando');
  }, [fase, premioAtual, totalPremios, participantes, excluidos]);

  // O operador aperta "Sortear" uma vez; daí em diante, o resto é automático.
  const comecar = useCallback(() => {
    setAutomatico(true);
    iniciar();
  }, [iniciar]);

  const aoTravar = useCallback(() => setTravou(true), []);

  const aoParar = useCallback(() => {
    setGanhadores(lista => lista.map((g, i) => (i === lista.length - 1 ? { ...g, mostrado: true } : g)));
    setFase('revelado');
  }, []);

  const proximo = useCallback(() => {
    if (fase !== 'revelado') return;
    setGanhadores(lista => lista.map(g => (g.mostrado ? g : { ...g, mostrado: true })));
    setResultado(null);
    setTravou(false);
    setFase(premioAtual >= totalPremios ? 'final' : 'pronto');
  }, [fase, premioAtual, totalPremios]);

  const desfazer = useCallback(() => {
    setGanhadores(lista => lista.slice(0, -1));
    setResultado(null);
    setTravou(false);
    setFase('pronto');
    setAutomatico(false);
    avisar('Último sorteio desfeito');
  }, [avisar]);

  const recomecar = useCallback(() => {
    setGanhadores([]);
    setResultado(null);
    setTravou(false);
    setFase('pronto');
    setAutomatico(false);
    avisar('Sorteio recomeçado');
  }, [avisar]);

  const mudar = useCallback((campo, valor) => setConfig(c => ({ ...c, [campo]: valor })), []);

  // Planilha nova (só com o sorteio zerado: os números dos cupons mudariam).
  const carregarBase = useCallback(
    nova => {
      setBase(nova);
      // contagem de pedidos LIDOS: a de clientes no sorteio depende das opções (ex.: R$ 0 de fora)
      avisar(`Planilha carregada: ${numero(nova.resumo.pedidos)} pedidos lidos`);
    },
    [avisar],
  );
  const voltarDemo = useCallback(() => {
    setBase(null);
    avisar('Voltou à planilha padrão');
  }, [avisar]);

  const alternarTelaCheia = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => avisar('O navegador não deixou abrir em tela cheia'));
  }, [avisar]);

  const alternarApresentacao = useCallback(() => {
    setApresentacao(a => {
      if (!a) avisar('Modo apresentação: os controles somem até o mouse mexer');
      return !a;
    });
  }, [avisar]);

  // Ligar o som do navegador custa ~100 ms na primeira vez. Isso é pago no
  // primeiro clique ou tecla qualquer, e não no "Sortear".
  useEffect(() => {
    const aquecer = () => prepararSom();
    window.addEventListener('pointerdown', aquecer, { once: true, capture: true });
    window.addEventListener('keydown', aquecer, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', aquecer, { capture: true });
      window.removeEventListener('keydown', aquecer, { capture: true });
    };
  }, []);

  useEffect(() => {
    const aoMudar = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);

  // No modo apresentação, os controles aparecem por 2,5 s quando o mouse mexe.
  const timerMouse = useRef(0);
  useEffect(() => {
    if (!apresentacao) return;
    const mexeu = () => {
      setMouseAtivo(true);
      clearTimeout(timerMouse.current);
      timerMouse.current = setTimeout(() => setMouseAtivo(false), 2500);
    };
    window.addEventListener('pointermove', mexeu);
    return () => {
      window.removeEventListener('pointermove', mexeu);
      clearTimeout(timerMouse.current);
      setMouseAtivo(false);
    };
  }, [apresentacao]);

  // ---------- teclado ----------
  // Espaço e Enter são interceptados no palco: na live, uma tecla não pode
  // apertar por engano o último botão clicado (som, tela cheia...).
  const teclas = useRef({});
  teclas.current = { fase, gaveta, iniciar, comecar, proximo, automatico, alternarTelaCheia, alternarApresentacao };

  // ---------- automático ----------
  // Ganhador na tela: espera a pausa e vai para o próximo prêmio; prêmio novo na
  // tela: 1,6 s e gira. No fim, para. Painel aberto segura tudo até fechar.
  useEffect(() => {
    if (!automatico || gaveta) return;
    if (fase === 'revelado') {
      const t = setTimeout(() => teclas.current.proximo(), config.pausa * 1000);
      return () => clearTimeout(t);
    }
    if (fase === 'pronto' && premioAtual < totalPremios) {
      const t = setTimeout(() => teclas.current.iniciar(), 1600);
      return () => clearTimeout(t);
    }
    if (fase === 'final') setAutomatico(false);
  }, [automatico, fase, gaveta, premioAtual, totalPremios, config.pausa]);
  useEffect(() => {
    const aoTeclar = e => {
      const t = teclas.current;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (t.gaveta) setGaveta(null);
        else if (t.automatico) {
          setAutomatico(false);
          avisar('Automático parado: o próximo sorteio espera você');
        }
        return;
      }
      if (t.gaveta || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.repeat) return;

      if (e.code === 'Space' || e.key === 'Enter') {
        if (e.code === 'Space' || t.fase === 'revelado') e.preventDefault();
        if (t.fase === 'pronto' && e.code === 'Space') t.comecar();
        else if (t.fase === 'revelado') t.proximo();
        return;
      }
      const acoes = {
        p: () => setGaveta('configurar'),
        g: () => setGaveta('ganhadores'),
        m: () => setSom(s => !s),
        f: t.alternarTelaCheia,
        h: t.alternarApresentacao,
      };
      const tecla = e.key.toLowerCase();
      const acao = acoes[tecla];
      // Durante o giro, os painéis não abrem; som e tela continuam livres.
      if (acao && !(t.fase === 'sorteando' && (tecla === 'p' || tecla === 'g'))) acao();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  // ---------- palco ----------
  const girando = fase === 'sorteando';
  const jaMostrados = ganhadores.filter(g => g.mostrado).length; // o contador não entrega nada durante o giro
  const semNinguem = fase === 'pronto' && cuponsEmJogo === 0;
  const premioEmCena = girando ? premioAtual - 1 : premioAtual;
  const estadoSeta = fase === 'pronto' ? 'pronto' : travou ? 'parou' : 'girando';

  const anuncio =
    fase === 'sorteando'
      ? `Sorteando ${nomePremio(premioAtual - 1)}`
      : fase === 'revelado' && revelando
        ? `Ganhador do ${nomePremio(revelando.premio)}: ${revelando.participante.nome}`
        : '';

  const classes = ['app'];
  if (apresentacao) classes.push('app--apresentacao');
  if (mouseAtivo) classes.push('app--mouse');

  return (
    <div className={classes.join(' ')}>
      <FundoFesta pausado={fase === 'sorteando' || fase === 'revelado'} />
      <div className="faixa-festa" aria-hidden="true" />

      <header className="barra">
        <div className="barra-marca">
          {/* Logo do Grupo Cardsinova: a mesma do e-mail do lembrete (Downloads\logo branco -
              vetorizado.svg), colorida para o fundo branco: símbolo em degradê, "GRUPO cards"
              roxo, "inova" laranja. Ela já escreve o nome do grupo. */}
          <img className="barra-logo" src="/logo-grupo.svg" alt="Grupo Cardsinova" width="230" height="61" />
        </div>
        <nav className="barra-acoes" aria-label="Controles do sorteio">
          {/* De onde vêm os participantes, sempre à vista: planilha ou demonstração */}
          <button
            type="button"
            className="fonte-dados"
            onClick={() => setGaveta('configurar')}
            disabled={girando}
            title="Abrir a configuração"
          >
            <span className="fonte-dados-ponto" aria-hidden="true" />
            {base ? (
              <span>
                <strong>{base.arquivo}</strong> · {numero(participantes.length)} clientes
              </span>
            ) : (
              <span>
                <strong>{PADRAO.arquivo}</strong> (padrão) · {numero(participantes.length)} clientes
              </span>
            )}
          </button>
          <button type="button" className="botao-barra botao-barra--principal" onClick={() => setGaveta('configurar')} disabled={girando}>
            <Icone nome="engrenagem" />
            <span>Configurar</span>
          </button>
          <button type="button" className="botao-barra" onClick={() => setGaveta('ganhadores')} disabled={girando}>
            <Icone nome="trofeu" />
            <span>Ganhadores</span>
            {jaMostrados > 0 && <span className="contador">{jaMostrados}</span>}
          </button>
          <span className="barra-divisor" aria-hidden="true" />
          <button
            type="button"
            className="botao-icone"
            onClick={() => setSom(s => !s)}
            aria-label={som ? 'Desligar som (M)' : 'Ligar som (M)'}
            title={som ? 'Desligar som (M)' : 'Ligar som (M)'}
            aria-pressed={!som}
          >
            <Icone nome={som ? 'som' : 'mudo'} />
          </button>
          <button
            type="button"
            className="botao-icone"
            onClick={alternarApresentacao}
            aria-label="Modo apresentação (H)"
            title="Modo apresentação (H)"
            aria-pressed={apresentacao}
          >
            <Icone nome="apresentar" />
          </button>
          <button
            type="button"
            className="botao-icone"
            onClick={alternarTelaCheia}
            aria-label={telaCheia ? 'Sair da tela cheia (F)' : 'Tela cheia (F)'}
            title={telaCheia ? 'Sair da tela cheia (F)' : 'Tela cheia (F)'}
          >
            <Icone nome={telaCheia ? 'sairTelaCheia' : 'telaCheia'} />
          </button>
        </nav>
      </header>

      <main className="palco">
        <AnimatePresence mode="wait" initial={false}>
          {fase === 'final' ? (
            <motion.div
              key="final"
              className="encerramento"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.4 } }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
            >
              <div className="cabeca cabeca--centro">
                <p className="cabeca-titulo">{config.tituloFinal}</p>
                <h1 className="cabeca-premio">Ganhadores</h1>
                <p className="cabeca-sub">
                  {totalPremios} {totalPremios === 1 ? 'prêmio sorteado' : 'prêmios sorteados'}
                </p>
              </div>
              <Final
                premios={config.premios.map((_, i) => nomePremio(i))}
                ganhadores={ganhadores}
                digitos={digitos}
                mensagem={config.mensagemFinal}
              />
            </motion.div>
          ) : (
            <motion.div
              key="arena"
              className="arena"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: 0.6, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
            >
              <div className="arena-roda">
                <Roda
                  participantes={poolRoda}
                  resultado={girando ? resultado : fase === 'revelado' ? revelando : null}
                  girar={girando}
                  duracao={duracao}
                  semMovimento={semMovimento}
                  onPassar={aqui => naSeta.current?.mostrar(aqui)}
                  onTravou={aoTravar}
                  onParou={aoParar}
                />
              </div>

              <div className="arena-info">
                <AnimatePresence mode="wait">
                  {fase === 'revelado' && revelando ? (
                    <Ganhador
                      key={`ganhador-${revelando.premio}`}
                      titulo={config.titulo}
                      resultado={revelando}
                      premio={nomePremio(revelando.premio)}
                      ultimo={premioAtual >= totalPremios}
                      mostrarDocumento={config.mostrarDocumento}
                      automatico={automatico && !gaveta}
                      pausa={config.pausa}
                      onParar={() => setAutomatico(false)}
                      onProximo={proximo}
                    />
                  ) : (
                    <motion.div
                      key={`preparo-${premioEmCena}`}
                      className="preparo"
                      variants={CASCATA}
                      initial="escondido"
                      animate="visivel"
                      exit="saindo"
                    >
                      <motion.div className="cabeca" variants={BLOCO}>
                        <p className="cabeca-titulo">{config.titulo}</p>
                        <h1 className="cabeca-premio">{nomePremio(premioEmCena)}</h1>
                        <p className="cabeca-sub">
                          Prêmio {premioEmCena + 1} de {totalPremios}
                        </p>
                      </motion.div>

                      <motion.div className="bloco-largo" variants={BLOCO}>
                        <NaSeta ref={naSeta} estado={estadoSeta} digitos={digitos} />
                      </motion.div>

                      {/* envoltório animado: a cascata escreve opacidade e posição no próprio
                          elemento, e isso anularia o movimento do botão ao passar o mouse */}
                      <motion.div variants={BLOCO}>
                        <button type="button" className="botao-principal botao-sortear" onClick={comecar} disabled={girando || semNinguem}>
                          {girando ? 'Girando…' : semNinguem ? 'Ninguém para sortear' : automatico ? 'Girando já…' : 'Sortear'}
                          {!girando && !semNinguem && <kbd>Espaço</kbd>}
                        </button>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="dicas" aria-hidden="true">
        <span>
          <kbd>Espaço</kbd> sortear
        </span>
        <span>
          <kbd>Enter</kbd> próximo
        </span>
        <span>
          <kbd>P</kbd> configurar
        </span>
        <span>
          <kbd>G</kbd> ganhadores
        </span>
        <span>
          <kbd>H</kbd> apresentação
        </span>
        <span>
          <kbd>F</kbd> tela cheia
        </span>
        <span>
          <kbd>M</kbd> som
        </span>
      </footer>

      {/* Confete no instante em que a roda para (travou), e não na revelação: o Enzo
          achou que demorava. A chave é a mesma do giro até a revelação, então ele
          não recomeça quando o nome aparece. */}
      {((fase === 'sorteando' && travou) || (fase === 'revelado' && revelando)) && (
        <Confete key={`confete-${girando ? premioAtual - 1 : revelando?.premio}`} semMovimento={semMovimento} />
      )}

      <AnimatePresence>
        {gaveta === 'configurar' && (
          <Gaveta
            key="configurar"
            de="topo"
            titulo="Configurar o sorteio"
            onFechar={() => setGaveta(null)}
            acoes={
              <button type="button" className="botao-pronto" onClick={() => setGaveta(null)}>
                <Icone nome="certo" />
                Pronto
              </button>
            }
          >
            <Configurar
              config={config}
              mudar={mudar}
              base={base}
              baseAntiga={baseAntiga}
              todosClientes={todosClientes}
              onCarregar={carregarBase}
              onVoltarDemo={voltarDemo}
              participantes={participantes}
              total={total}
              digitos={digitos}
              ganhadores={ganhadores}
            />
          </Gaveta>
        )}
        {gaveta === 'ganhadores' && (
          <Gaveta key="ganhadores" titulo="Ganhadores" onFechar={() => setGaveta(null)}>
            <Ganhadores
              titulo={config.titulo}
              nomePremio={nomePremio}
              totalPremios={totalPremios}
              ganhadores={ganhadores}
              digitos={digitos}
              onDesfazer={desfazer}
              onRecomecar={recomecar}
            />
          </Gaveta>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {aviso && (
          <motion.div
            key={aviso.id}
            className="aviso-flutuante"
            role="status"
            style={{ x: '-50%' }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
          >
            {aviso.texto}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="so-leitor" aria-live="polite">
        {anuncio}
      </div>
    </div>
  );
}
