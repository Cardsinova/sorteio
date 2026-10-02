import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import Marca from '../components/Marca';
import { corDaFatia } from '../lib/cores';
import { tique, trava } from '../lib/som';

// A roda da sorte: UM CAMPO POR CLIENTE, todos do mesmo tamanho, cada um com o
// nome escrito dentro (pedidos do Enzo em 2026-10-02: "todas as pessoas que estão
// na planilha apareçam na roda, mesmo que fique muito pequeno o nome").
// Com 1.241 clientes cada campo tem 0,3° e a letra fica minúscula — combinado assim.
//
// Cores em 36 faixas (cada faixa junta clientes vizinhos): com uma cor por campo, a
// roda viraria listras finíssimas que "tremem" girando (já aconteceu). Cada faixa é
// UM desenho só, e por cima vão os nomes: a roda tem ~36 formas + 1 texto por cliente.
//
// Quando para: um véu branco cobre tudo, menos o campo do ganhador (o véu fica numa
// camada própria e só muda a opacidade; repintar 1.241 campos travaria o clímax).
// Quem decide o ganhador é o sorteio feito antes do giro; a roda só mostra o caminho.
//
// Fluidez: velocidade máxima ~600°/s; a seta se inclina com a velocidade e só "bate"
// nos pinos (divisas das faixas) com a roda devagar; parada, gira bem devagar.

const RAIO = 84; // campos, no viewBox -100…100
const CAMPOS = 72; // campos visíveis, cada um com UM nome (pedido do Enzo: "cada nome dentro de um campo")
const VEL_TROCA = 350; // acima disto ninguém lê os nomes: é quando a roda troca de nomes
const LAMPADAS = 28;
const VEL_MAX = 600; // graus por segundo no auge do giro (10° por quadro a 60 quadros/s)
const VEL_OCIOSA = 7; // graus por segundo com a roda esperando
const VEL_ENTRADA = 240; // velocidade com que a roda entra quando a página abre

const rad = g => (g * Math.PI) / 180;
const ponto = (g, r) => [r * Math.sin(rad(g)), -r * Math.cos(rad(g))];
const norm = g => ((g % 360) + 360) % 360;
const n3 = v => v.toFixed(3);

function caminho(a0, a1, r) {
  if (a1 - a0 >= 359.999) return `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}Z`;
  const [x0, y0] = ponto(a0, r);
  const [x1, y1] = ponto(a1, r);
  return `M0 0L${n3(x0)} ${n3(y0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${n3(x1)} ${n3(y1)}Z`;
}

/** Véu: o círculo inteiro MENOS o campo do ganhador (regra evenodd faz o buraco). */
function veu(a0, a1, r) {
  const circulo = `M0 ${-r - 2}A${r + 2} ${r + 2} 0 1 1 0 ${r + 2}A${r + 2} ${r + 2} 0 1 1 0 ${-r - 2}Z`;
  return `${circulo}${caminho(a0, a1, r + 2)}`;
}

/**
 * Até 72 clientes sorteados para aparecer na roda (todos com a mesma chance de
 * aparecer). Com mais de 72 clientes não cabe um nome legível por campo; a roda
 * mostra 72 e o GANHADOR SEMPRE ESTÁ entre eles (ver o giro).
 */
function amostra(lista, n, fora = null) {
  const resto = lista.filter(p => p.id !== fora);
  for (let i = resto.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [resto[i], resto[j]] = [resto[j], resto[i]];
  }
  return resto.slice(0, n);
}
const quantos = lista => Math.max(1, Math.min(CAMPOS, lista.length));

/**
 * O giro em dois trechos: acelera (power1.in) e freia longo (power3.out).
 * power1.in termina com velocidade 2·A1/t1; power3.out começa com 4·A2/t2.
 * Iguais na emenda: a roda não dá tranco quando para de acelerar. Com isso,
 * A1 = S·2t1/(t1 + D) e a velocidade máxima é 4·S/(t1 + D); o número de voltas
 * sai dela. (A primeira versão desta conta esqueceu um fator 2: girava ao dobro.)
 */
function plano(D, falta) {
  const t1 = Math.min(1.1, D * 0.18);
  const t2 = D - t1;
  const voltas = Math.max(2, Math.round((VEL_MAX * (t1 + D)) / 4 / 360 - falta / 360));
  const distancia = voltas * 360 + falta;
  const a1 = distancia / (1 + t2 / (2 * t1));
  return { t1, t2, a1, distancia };
}

// Espaço para o nome num campo: do miolo branco (raio 24) até perto da borda.
const ROTULO_FIM = RAIO - 4;
const ROTULO_ESPACO = ROTULO_FIM - 26;
const LARGURA_LETRA = 0.66; // largura média de uma letra da Satoshi em negrito, em "em" (com folga para MAIÚSCULAS)

const ALTURA_LETRA = 1.3; // altura visível de uma linha da Satoshi, em "em" (com acento e perna do "g")

/**
 * Tamanho da letra que cabe no campo SEM invadir o vizinho. O nome começa perto
 * da borda (raio 80) e vai para dentro; o campo fica mais estreito para dentro.
 * A letra tem que caber na largura do campo no PONTO MAIS PARA DENTRO que o nome
 * alcança:  ALTURA·f ≤ θ·(80 − 0,56·L·f)  →  f = 80θ / (ALTURA + 0,56·L·θ).
 * (A conta anterior usava a largura no meio do raio: medido em 2026-10-02, metade
 * dos 1.241 nomes passava do próprio campo e virava borrão.)
 * Sem tamanho mínimo: com mais de mil clientes a letra fica minúscula (combinado).
 */
function rotulo(nome, abertura) {
  const theta = rad(abertura);
  const L = Math.max(1, nome.length);
  const cabe = (ROTULO_FIM * theta) / (ALTURA_LETRA + LARGURA_LETRA * L * theta);
  const tamanho = Math.min(6.4, cabe);
  // nome que nem assim cabe no comprimento (campos grandes, poucos clientes): corta
  const letras = Math.floor(ROTULO_ESPACO / (tamanho * LARGURA_LETRA) + 1e-6);
  const texto = L > letras ? `${nome.slice(0, Math.max(1, letras - 1)).trimEnd()}…` : nome;
  return { tamanho, texto };
}

export default function Roda({ participantes, resultado, girar, duracao, semMovimento, onPassar, onTravou, onParou }) {
  const disco = useRef(null);
  const ponteiro = useRef(null);
  const giro = useRef(0); // graus acumulados: a roda continua de onde parou
  const [estado, setEstado] = useState('parada');
  const [lista, setLista] = useState(() => amostra(participantes, quantos(participantes))); // nomes desenhados agora
  const [trocando, setTrocando] = useState(false); // nomes somem e voltam já trocados
  const [destaque, setDestaque] = useState(null); // [a0, a1] do campo do ganhador
  const primeiraVez = useRef(true);

  const n = Math.max(1, lista.length);
  const passo = 360 / n;

  // campos estáveis (mesmo objeto enquanto a lista não muda): a caixa "na seta" só
  // reescreve o nome quando o campo embaixo da seta é outro
  const campos = useMemo(
    () => lista.map((p, i) => ({ p, cor: corDaFatia(i, lista.length) })),
    [lista],
  );
  const camposAtuais = useRef(campos);
  camposAtuais.current = campos;
  const avisos = useRef({});
  avisos.current = { onPassar, onTravou, onParou };

  const chave = resultado ? `${resultado.premio}-${resultado.cupom}` : null;

  const aplicar = v => {
    giro.current = v;
    if (disco.current) disco.current.style.transform = `rotate(${v.toFixed(3)}deg)`;
  };
  const inclinar = a => {
    if (ponteiro.current) ponteiro.current.style.transform = `rotate(${a.toFixed(2)}deg)`;
  };

  // ---------- quem está na roda mudou (prêmio novo, planilha nova) ----------
  // Os nomes somem, a roda é redesenhada e eles voltam (sem pulo seco).
  const primeiraLista = useRef(true);
  useEffect(() => {
    if (primeiraLista.current) {
      primeiraLista.current = false;
      return;
    }
    if (chave) return; // durante o giro e a revelação, a roda fica como está
    setTrocando(true);
    const t = setTimeout(() => {
      setLista(amostra(participantes, quantos(participantes)));
      setTrocando(false);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantes, chave]);

  // ---------- esperando: gira bem devagar ----------
  // Na primeira vez entra rápido e vai assentando; depois de um prêmio, volta a
  // andar aos poucos. A velocidade se aproxima da ociosa suavemente (sem degrau).
  useEffect(() => {
    if (semMovimento || estado !== 'parada' || chave) return;
    let vel = primeiraVez.current ? VEL_ENTRADA : 0;
    primeiraVez.current = false;
    const tick = (_t, dtMs) => {
      const dt = Math.min(dtMs, 100) / 1000;
      vel += (VEL_OCIOSA - vel) * (1 - Math.exp(-dt / 0.7));
      aplicar(giro.current + vel * dt);
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [estado, chave, semMovimento]);

  // ---------- o giro do sorteio ----------
  useLayoutEffect(() => {
    if (!chave) {
      setEstado('parada');
      setDestaque(null);
      return;
    }
    // nomes do giro: o ganhador num campo qualquer, os outros sorteados
    const ganhadorP = resultado.participante;
    const total = quantos(participantes);
    const w = Math.floor(Math.random() * total);
    const outros = amostra(participantes, total - 1, ganhadorP.id);
    const novos = [...outros.slice(0, w), ganhadorP, ...outros.slice(w)];
    const largura = 360 / novos.length;
    const camposDoGiro = novos.map((p, i) => ({ p, cor: corDaFatia(i, novos.length) }));
    setDestaque([w * largura, (w + 1) * largura]); // o véu é preparado agora (invisível até parar)
    // para dentro do campo dele, nem sempre no meio (fica mais natural)
    const alvo = (w + 0.5 + (Math.random() - 0.5) * 0.6) * largura;

    const inicio = giro.current;
    // A seta fica no topo: o ponto `alvo` da roda chega nela quando o giro é -alvo.
    const falta = norm(-alvo - inicio);
    const ganhadorId = resultado.participante.id;
    const aviso = campo => {
      // para o ganhador, o cupom sorteado (dá o pedido certo); para os outros, o dele
      const cupom = campo.p.id === ganhadorId ? resultado.cupom : campo.p.inicio;
      avisos.current.onPassar?.({ fatia: campo, cupom });
    };
    const ctx = gsap.context(() => {
      if (!girar || semMovimento) {
        setLista(novos);
        aplicar(inicio + falta);
        // um instante depois: a caixa "na seta" ainda está trocando de conteúdo neste quadro
        gsap.delayedCall(0.02, () => aviso(camposDoGiro[w]));
        setEstado('travada');
        avisos.current.onTravou?.();
        if (girar) gsap.delayedCall(0.6, () => avisos.current.onParou?.());
        return;
      }

      const { t1, t2, a1, distancia } = plano(duracao, falta);
      const pos = { v: inicio };
      const seta = { inclinacao: 0, batida: 0 };
      let trocou = false;
      const trocarNomes = () => {
        if (trocou) return;
        trocou = true;
        setLista(novos);
      };
      let ultimoPino = null;
      let ultimaBatida = 0;
      let ultimoAviso = 0;
      let ultimoT = performance.now();
      let ultimoV = inicio;

      const pintar = () => {
        aplicar(pos.v);
        const agora = performance.now();
        const dt = Math.max(1, agora - ultimoT);
        const vel = (Math.abs(pos.v - ultimoV) / dt) * 1000; // graus por segundo
        ultimoT = agora;
        ultimoV = pos.v;
        if (vel > VEL_TROCA) trocarNomes();

        const angulo = norm(-pos.v);
        const idx = Math.min(total - 1, Math.floor(angulo / largura));
        // o "pino" onde a seta bate é a divisa entre campos
        const pino = idx;
        if (pino !== ultimoPino) {
          ultimoPino = pino;
          tique();
          // devagar, a seta "bate" no pino (no máximo ~9 vezes por segundo); rápido, só inclina
          if (vel < 160 && agora - ultimaBatida > 110) {
            ultimaBatida = agora;
            seta.batida = Math.min(seta.batida + 8, 14);
          }
        }
        // caixa "na seta": no máximo ~12 trocas por segundo (dá para ler)
        if (agora - ultimoAviso >= 85) {
          ultimoAviso = agora;
          const campo = trocou ? camposDoGiro[idx] : camposAtuais.current[Math.min(camposAtuais.current.length - 1, Math.floor(angulo / (360 / camposAtuais.current.length)))];
          if (campo) aviso(campo);
        }
        seta.inclinacao += (Math.min(16, vel / 32) - seta.inclinacao) * 0.12;
        seta.batida *= 0.82;
        inclinar(-(seta.inclinacao + seta.batida));
      };

      setEstado('girando');
      const tl = gsap.timeline({
        onComplete: () => {
          trocarNomes();
          aviso(camposDoGiro[w]);
          setEstado('travada');
          trava();
          avisos.current.onTravou?.();
          // a seta volta ao lugar com um balanço só
          const a = { v: -(seta.inclinacao + seta.batida) };
          gsap.to(a, { v: 0, duration: 0.9, ease: 'elastic.out(1, 0.45)', onUpdate: () => inclinar(a.v) });
          // o confete já estourou na parada; o nome entra logo depois
          gsap.delayedCall(1.0, () => avisos.current.onParou?.());
        },
      });
      tl.to(pos, { v: inicio + a1, duration: t1, ease: 'power1.in', onUpdate: pintar });
      tl.call(trocarNomes); // no fim da aceleração a roda está no máximo
      tl.to(pos, { v: inicio + distancia, duration: t2, ease: 'power3.out', onUpdate: pintar });
    });
    // kill, e não revert: desfazer devolveria a roda para o ângulo de antes do giro.
    return () => ctx.kill();
    // o giro só recomeça quando muda o sorteio (chave), não a cada nova renderização
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  // O desenho só é refeito quando a lista muda (nunca durante o giro nem na parada).
  const desenho = useMemo(() => {
    const total = campos.length;
    const largura = 360 / total;
    // um campo por nome, cada um com a sua cor e a divisa branca
    const formas = campos.map((cp, i) => (
      <path key={`f${i}`} d={caminho(i * largura, (i + 1) * largura, RAIO)} fill={cp.cor.fundo} className="fatia" />
    ));
    return (
      <g className="roda-fatias">
        {formas}
        {campos.map((c, i) => {
          const { tamanho, texto } = rotulo(c.p.nome, largura);
          return (
            <text
              key={c.p.id}
              data-campo={i}
              className="fatia-nome"
              transform={`rotate(${n3((i + 0.5) * largura - 90)})`}
              x={ROTULO_FIM}
              y="0"
              fill={c.cor.texto}
              fontSize={tamanho.toFixed(3)}
              textAnchor="end"
              dominantBaseline="central"
            >
              {texto}
            </text>
          );
        })}
      </g>
    );
  }, [campos]);

  return (
    <div
      className={`roda roda--${estado}${trocando ? ' roda--mudando' : ''}`}
      role="img"
      aria-label={`Roda com ${lista.length} participantes`}
      data-passo={passo}
    >
      {/* Quando a roda para: um brilho dourado atrás dela e duas ondas de luz que se
          abrem (só transform e opacidade, junto com o confete) */}
      <span className="roda-brilho" aria-hidden="true" />
      <span className="roda-onda" aria-hidden="true" />
      <span className="roda-onda roda-onda--2" aria-hidden="true" />

      <svg className="roda-aro" viewBox="-100 -100 200 200" aria-hidden="true">
        <defs>
          <linearGradient id="aro-cor" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7a1a98" />
            <stop offset="0.5" stopColor="#661081" />
            <stop offset="1" stopColor="#4a0c60" />
          </linearGradient>
        </defs>
        <circle r="99" fill="url(#aro-cor)" />
        <circle r="88.5" fill="#ffffff" />
      </svg>

      {/* Lâmpadas em DOIS grupos (pares e ímpares) que acendem e apagam inteiros:
          2 animações em vez de 28 (com 28, o giro perdia quadros no processador lento). */}
      {['a', 'b'].map((grupo, g) => (
        <div key={grupo} className={`roda-lampadas roda-lampadas--${grupo}`} aria-hidden="true">
          {Array.from({ length: LAMPADAS / 2 }, (_, i) => (
            <span key={i} className="lampada" style={{ '--a': `${(360 / LAMPADAS) * (i * 2 + g)}deg` }}>
              <i />
            </span>
          ))}
        </div>
      ))}

      <div className="roda-disco" ref={disco} aria-hidden="true">
        <svg viewBox="-100 -100 200 200">{desenho}</svg>
        {/* véu com buraco no campo do ganhador: camada própria, só a opacidade muda */}
        <svg viewBox="-100 -100 200 200" className="roda-veu">
          {destaque && (
            <>
              <path d={veu(destaque[0], destaque[1], RAIO)} fillRule="evenodd" fill="#ffffff" />
              <path d={caminho(destaque[0], destaque[1], RAIO)} fill="none" stroke="#e01b74" strokeWidth="0.8" />
            </>
          )}
        </svg>
      </div>

      <div className="roda-centro" aria-hidden="true">
        <Marca className="roda-marca" />
      </div>

      <div className="roda-ponteiro" ref={ponteiro} aria-hidden="true">
        {/* gota com a ponta para baixo: círculo de raio 17 em (20,20) e as duas
            tangentes que saem da ponta (20,50) */}
        <svg viewBox="0 0 40 54">
          {/* sombra desenhada, não `filter`: filtro num elemento que balança pesa a cada quadro */}
          <path d="M20 53 5.99 32.63A17 17 0 1 1 34.01 32.63Z" fill="rgba(40, 0, 50, 0.2)" />
          <path d="M20 50 5.99 29.63A17 17 0 1 1 34.01 29.63Z" fill="#e01b74" stroke="#ffffff" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="20" cy="20" r="6" fill="#ffffff" />
        </svg>
      </div>
    </div>
  );
}
