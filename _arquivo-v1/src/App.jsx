import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Marca from './components/Marca';
import Icone from './components/Icone';
import CountUp from './components/CountUp';
import Roleta from './palco/Roleta';
import Ganhador from './palco/Ganhador';
import Final from './palco/Final';
import Gaveta from './paineis/Gaveta';
import Preparar, { SUSPENSES } from './paineis/Preparar';
import Ganhadores from './paineis/Ganhadores';
import { CLIENTES_DEMO } from './data/demo';
import { distribuirCupons, sortear } from './lib/sorteio';
import { definirSom, prepararSom } from './lib/som';
import { ler, gravar } from './lib/guardar';
import { moeda } from './lib/formato';

const CONFIG_PADRAO = {
  titulo: 'Sorteio de clientes Cardsinova',
  premios: ['Prêmio 1', 'Prêmio 2', 'Prêmio 3'],
  reaisPorCupom: 10,
  umPorCliente: true,
  suspense: 'medio',
};

const EASE = [0.16, 1, 0.3, 1];

export default function App() {
  const [config, setConfig] = useState(() => ({ ...CONFIG_PADRAO, ...ler('sorteio-config', {}) }));
  const [ganhadores, setGanhadores] = useState(() => ler('sorteio-ganhadores', []));
  const [tema, setTema] = useState(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  const [som, setSom] = useState(() => ler('sorteio-som', true));
  const [gaveta, setGaveta] = useState(null);
  const [apresentacao, setApresentacao] = useState(false);
  const [mouseAtivo, setMouseAtivo] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const [aviso, setAviso] = useState(null);
  const semMovimento = useReducedMotion();

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
  useEffect(() => {
    definirSom(som);
    gravar('sorteio-som', som);
  }, [som]);
  useEffect(() => {
    document.documentElement.dataset.theme = tema;
    try {
      localStorage.setItem('sorteio-tema', tema);
    } catch {
      /* sem armazenamento */
    }
  }, [tema]);

  // ---------- cupons ----------
  const { participantes, total } = useMemo(() => distribuirCupons(CLIENTES_DEMO, config.reaisPorCupom), [config.reaisPorCupom]);
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
    return { participante: { ...g, ...p }, cupom: g.cupom, chance: g.chance, totalElegivel: g.totalElegivel, quando: g.quando, premio: g.premio };
  }, [fase, resultado, ganhadores, participantes]);

  // Prêmio novo depois do fim (ou ganhador desfeito): volta a ter o que sortear.
  // Prêmios tirados até sobrarem só os sorteados: vai para o encerramento.
  useEffect(() => {
    if (fase === 'final' && premioAtual < totalPremios) setFase('pronto');
    if (fase === 'pronto' && premioAtual > 0 && premioAtual >= totalPremios) setFase('final');
    if (fase === 'revelado' && !revelando) setFase(premioAtual < totalPremios ? 'pronto' : 'final');
  }, [fase, premioAtual, totalPremios, revelando]);

  // Os números embaixo da máquina ficam parados durante o giro
  // (o ganhador já saiu da conta, mas a plateia ainda não sabe quem é).
  const numerosVistos = useRef({ pessoas: 0, cupons: 0 });
  if (fase !== 'sorteando') numerosVistos.current = { pessoas: elegiveis.length, cupons: cuponsEmJogo };

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
    const r = sortear(participantes, excluidos);
    if (!r) return;
    prepararSom();
    const quando = Date.now();
    const novo = { ...r, quando, premio: premioAtual };
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
        chance: r.chance,
        totalElegivel: r.totalElegivel,
        quando,
        mostrado: false,
      },
    ]);
    setResultado(novo);
    setFase('sorteando');
  }, [fase, premioAtual, totalPremios, participantes, excluidos]);

  const aoParar = useCallback(() => {
    setGanhadores(lista => lista.map((g, i) => (i === lista.length - 1 ? { ...g, mostrado: true } : g)));
    setFase('revelado');
  }, []);

  const proximo = useCallback(() => {
    if (fase !== 'revelado') return;
    setGanhadores(lista => lista.map(g => (g.mostrado ? g : { ...g, mostrado: true })));
    setResultado(null);
    setFase(premioAtual >= totalPremios ? 'final' : 'pronto');
  }, [fase, premioAtual, totalPremios]);

  const desfazer = useCallback(() => {
    setGanhadores(lista => lista.slice(0, -1));
    setResultado(null);
    setFase('pronto');
    avisar('Último sorteio desfeito');
  }, [avisar]);

  const recomecar = useCallback(() => {
    setGanhadores([]);
    setResultado(null);
    setFase('pronto');
    avisar('Sorteio recomeçado');
  }, [avisar]);

  const mudar = useCallback((campo, valor) => setConfig(c => ({ ...c, [campo]: valor })), []);

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
  // apertar por engano o último botão clicado (tema, som...).
  const teclas = useRef({});
  teclas.current = { fase, gaveta, iniciar, proximo, alternarTelaCheia, alternarApresentacao };
  useEffect(() => {
    const aoTeclar = e => {
      const t = teclas.current;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (t.gaveta) setGaveta(null);
        return;
      }
      if (t.gaveta || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.repeat) return;

      if (e.code === 'Space' || e.key === 'Enter') {
        if (e.code === 'Space' || t.fase === 'revelado') e.preventDefault();
        if (t.fase === 'pronto' && e.code === 'Space') t.iniciar();
        else if (t.fase === 'revelado') t.proximo();
        return;
      }
      const acoes = {
        p: () => setGaveta('preparar'),
        g: () => setGaveta('ganhadores'),
        t: () => setTema(x => (x === 'dark' ? 'light' : 'dark')),
        m: () => setSom(s => !s),
        f: t.alternarTelaCheia,
        h: t.alternarApresentacao,
      };
      const tecla = e.key.toLowerCase();
      const acao = acoes[tecla];
      // Durante o giro, os painéis não abrem; som, tema e tela continuam livres.
      if (acao && !(t.fase === 'sorteando' && (tecla === 'p' || tecla === 'g'))) acao();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  // ---------- leitura de tela ----------
  const anuncio =
    fase === 'sorteando'
      ? `Sorteando ${nomePremio(premioAtual - 1)}`
      : fase === 'revelado' && revelando
        ? `Ganhador do ${nomePremio(revelando.premio)}: ${revelando.participante.nome}`
        : '';

  // ---------- palco ----------
  const premioEmCena = fase === 'sorteando' || fase === 'revelado' ? (revelando?.premio ?? premioAtual - 1) : premioAtual;
  const girando = fase === 'sorteando';
  const jaMostrados = ganhadores.filter(g => g.mostrado).length; // o contador não entrega nada durante o giro
  const semNinguem = fase === 'pronto' && cuponsEmJogo === 0;

  let cabecaPrincipal;
  let cabecaSub;
  if (fase === 'final') {
    cabecaPrincipal = 'Ganhadores';
    cabecaSub = `${totalPremios} ${totalPremios === 1 ? 'prêmio sorteado' : 'prêmios sorteados'}`;
  } else {
    cabecaPrincipal = nomePremio(premioEmCena);
    cabecaSub = `Prêmio ${premioEmCena + 1} de ${totalPremios}`;
  }

  const classes = ['app'];
  if (apresentacao) classes.push('app--apresentacao');
  if (mouseAtivo) classes.push('app--mouse');

  return (
    <div className={classes.join(' ')}>
      <div className="fundo" aria-hidden="true">
        <div className={`fundo-halo${fase === 'revelado' ? ' fundo-halo--ouro' : ''}`} />
        <Marca className="fundo-marca" />
      </div>

      <header className="barra">
        <div className="barra-marca">
          <Marca className="barra-simbolo" />
          <span className="barra-nome">Cardsinova</span>
          <span className="barra-divisor" aria-hidden="true" />
          <span className="barra-sub">Sorteio ao vivo</span>
        </div>
        <nav className="barra-acoes" aria-label="Controles do sorteio">
          <button type="button" className="botao-barra" onClick={() => setGaveta('preparar')} disabled={girando}>
            <Icone nome="preparar" />
            <span>Preparar</span>
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
            onClick={() => setTema(x => (x === 'dark' ? 'light' : 'dark'))}
            aria-label={tema === 'dark' ? 'Tema claro (T)' : 'Tema escuro (T)'}
            title={tema === 'dark' ? 'Tema claro (T)' : 'Tema escuro (T)'}
          >
            <Icone nome={tema === 'dark' ? 'sol' : 'lua'} />
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
        <div className="cabeca">
          <p className="cabeca-titulo">{config.titulo}</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={cabecaPrincipal + cabecaSub}
              className="cabeca-troca"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
            >
              <h1 className="cabeca-premio">{cabecaPrincipal}</h1>
              <p className="cabeca-sub">{cabecaSub}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {(fase === 'pronto' || fase === 'sorteando') && (
            <motion.div
              key={`maquina-${premioAtual - (girando ? 1 : 0)}`}
              className="cena"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } }}
              exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.25, ease: [0.4, 0, 1, 1] } }}
            >
              <Roleta
                participantes={elegiveis}
                digitos={digitos}
                resultado={girando ? resultado : null}
                duracao={duracao}
                semMovimento={semMovimento}
                onParou={aoParar}
              />

              <p className={`numeros${girando ? ' numeros--apagado' : ''}`}>
                <span>
                  <strong>
                    <CountUp to={numerosVistos.current.pessoas} />
                  </strong>{' '}
                  participantes
                </span>
                <span className="ponto" aria-hidden="true" />
                <span>
                  <strong>
                    <CountUp to={numerosVistos.current.cupons} />
                  </strong>{' '}
                  cupons em jogo
                </span>
                <span className="ponto" aria-hidden="true" />
                <span>1 cupom a cada {moeda(config.reaisPorCupom)} de ticket</span>
              </p>

              <button type="button" className="botao-principal botao-sortear" onClick={iniciar} disabled={girando || semNinguem}>
                {girando ? 'Sorteando…' : semNinguem ? 'Ninguém para sortear' : 'Sortear'}
                {!girando && !semNinguem && <kbd>Espaço</kbd>}
              </button>
            </motion.div>
          )}

          {fase === 'revelado' && revelando && (
            <Ganhador
              key={`ganhador-${revelando.premio}`}
              resultado={revelando}
              premio={nomePremio(revelando.premio)}
              digitos={digitos}
              ultimo={premioAtual >= totalPremios}
              onProximo={proximo}
              semMovimento={semMovimento}
            />
          )}

          {fase === 'final' && <Final key="final" premios={config.premios.map((_, i) => nomePremio(i))} ganhadores={ganhadores} digitos={digitos} />}
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
          <kbd>P</kbd> preparar
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
      </footer>

      <AnimatePresence>
        {gaveta === 'preparar' && (
          <Gaveta key="preparar" titulo="Preparar o sorteio" onFechar={() => setGaveta(null)}>
            <Preparar
              config={config}
              mudar={mudar}
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
