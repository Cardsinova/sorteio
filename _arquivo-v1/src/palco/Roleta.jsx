import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { amostraDoRolo } from '../lib/sorteio';
import { tique, trava } from '../lib/som';

// A máquina do sorteio: o número do cupom (um contador por dígito) em cima e o
// rolo de nomes embaixo. O resultado JÁ ESTÁ decidido quando o giro começa
// (veio do gerador criptográfico); a animação só mostra o caminho até ele.
//
// Coreografia (GSAP, uma linha do tempo):
// - o rolo acelera (power1.in) e depois desacelera longo (power2.out). Os dois
//   trechos se encontram na MESMA velocidade, senão o giro dá um tranco no meio;
// - os dígitos do cupom travam da esquerda para a direita, e o último trava
//   antes do rolo parar: o número aparece primeiro, o nome é o clímax;
// - só `transform` se move. Nada de layout por quadro.

const PRONTO = { id: '__pronto', nome: 'Pronto para sortear', marcador: true };
const VAZIO = { id: '__vazio', nome: '', marcador: true };
const VOLTAS_BASE = 2;

/** Quantas linhas o rolo anda em cada trecho para durar `D` segundos. */
function plano(D) {
  const t1 = Math.min(0.9, D * 0.15);
  const t2 = D - t1;
  const a = Math.max(4, Math.round(t1 * 15)); // fim da aceleração: 2a/t1 ≈ 30 nomes/s
  // power1.in termina com velocidade 2a/t1; power2.out começa com 3b/t2.
  const b = Math.round((2 * a * t2) / (3 * t1));
  return { t1, t2, a, b };
}

function linhasIniciais(participantes) {
  const [a, b, c] = amostraDoRolo(participantes, 3);
  return [a ?? VAZIO, PRONTO, b ?? VAZIO, c ?? VAZIO];
}

export default function Roleta({ participantes, digitos, resultado, duracao, semMovimento, onParou }) {
  const [linhas, setLinhas] = useState(() => linhasIniciais(participantes));
  const [alvo, setAlvo] = useState(-1);
  const [parou, setParou] = useState(false);

  const tiraRef = useRef(null);
  const colunasRef = useRef([]);
  const onParouRef = useRef(onParou);
  onParouRef.current = onParou;

  // 1. Chegou o resultado: monta o caminho do rolo até o ganhador.
  //    As duas primeiras linhas ficam iguais, então nada pula na tela.
  useLayoutEffect(() => {
    if (!resultado) return;
    const { a, b } = plano(duracao);
    const meio = amostraDoRolo(participantes, a + b - 1);
    const depois = amostraDoRolo(participantes, 2);
    setLinhas(atual => [atual[0], atual[1], ...meio, resultado.participante, ...depois]);
    setAlvo(1 + a + b);
    // participantes/duracao não mudam durante o giro (os controles ficam fechados)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado]);

  // 2. Caminho montado: roda a linha do tempo.
  useLayoutEffect(() => {
    if (alvo < 0 || !resultado) return;
    const tira = tiraRef.current;
    const altura = tira.firstElementChild.getBoundingClientRect().height;
    const texto = String(resultado.cupom).padStart(digitos, '0');
    const colunas = colunasRef.current.slice(0, digitos);

    const destinoDigito = i => {
      const celulas = colunas[i].tira.children.length;
      const indice = 1 + (VOLTAS_BASE + i) * 10 + Number(texto[i]);
      return -(indice / celulas) * 100;
    };

    const ctx = gsap.context(() => {
      if (semMovimento) {
        colunas.forEach((c, i) => {
          gsap.set(c.tira, { yPercent: destinoDigito(i) });
          c.el.classList.add('travado');
        });
        tira.style.transform = `translate3d(0, ${-(alvo - 1) * altura}px, 0)`;
        setParou(true);
        gsap.delayedCall(0.6, () => onParouRef.current());
        return;
      }

      const { t1, t2, a, b } = plano(duracao);
      const pos = { v: 1 };
      let ultimo = 1;
      const pintar = () => {
        tira.style.transform = `translate3d(0, ${(-(pos.v - 1) * altura).toFixed(2)}px, 0)`;
        const linha = Math.round(pos.v);
        if (linha !== ultimo) {
          ultimo = linha;
          tique();
        }
      };

      const tl = gsap.timeline({
        onComplete: () => {
          setParou(true);
          gsap.delayedCall(1.1, () => onParouRef.current());
        },
      });
      tl.to(pos, { v: 1 + a, duration: t1, ease: 'power1.in', onUpdate: pintar });
      tl.to(pos, { v: 1 + a + b, duration: t2, ease: 'power2.out', onUpdate: pintar });

      const D = t1 + t2;
      colunas.forEach((c, i) => {
        const fim = D * (0.42 + 0.44 * (digitos === 1 ? 1 : i / (digitos - 1)));
        tl.to(
          c.tira,
          {
            yPercent: destinoDigito(i),
            duration: fim,
            ease: 'power2.out',
            onComplete: () => {
              c.el.classList.add('travado');
              trava();
            },
          },
          0,
        );
      });
    });
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo]);

  const celulas = 1 + 10 * (VOLTAS_BASE + digitos + 1);

  return (
    <div className={`maquina${parou ? ' maquina--parou' : ''}${alvo >= 0 && !parou ? ' maquina--girando' : ''}`}>
      <div className="maquina-cupom">
        <span className="maquina-rotulo">Cupom</span>
        <div className="odometro" aria-hidden="true">
          {Array.from({ length: digitos }, (_, i) => (
            <span
              key={i}
              className="odo-coluna"
              ref={el => {
                if (el) colunasRef.current[i] = { el, tira: el.firstElementChild };
              }}
            >
              <span className="odo-tira">
                {Array.from({ length: celulas }, (_, j) => (
                  <span key={j} className="odo-celula">
                    {j === 0 ? <span className="odo-traco" /> : (j - 1) % 10}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="rolo" aria-hidden="true">
        <div className="rolo-faixa" />
        <div className="rolo-tira" ref={tiraRef}>
          {linhas.map((p, i) => (
            <div
              key={i}
              className={`rolo-linha${p.marcador ? ' rolo-linha--marcador' : ''}${parou && i === alvo ? ' rolo-linha--alvo' : ''}`}
            >
              <span className="rolo-nome">{p.nome}</span>
              {!p.marcador && (
                <span className="rolo-local">
                  {p.cidade}/{p.uf}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="rolo-sombra rolo-sombra--cima" />
        <div className="rolo-sombra rolo-sombra--baixo" />
      </div>
    </div>
  );
}
