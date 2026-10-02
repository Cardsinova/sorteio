// Sons do sorteio, gerados na hora (Web Audio): nenhum arquivo para baixar.
// O navegador só libera som depois de um clique ou tecla; por isso o contexto
// nasce no primeiro "Sortear", que já é um gesto de quem opera.

let ctx = null;
let saida = null;
let ligado = true;

function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    saida = ctx.createGain();
    saida.gain.value = 0.9;
    saida.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function definirSom(valor) {
  ligado = valor;
}

export function prepararSom() {
  if (ligado) contexto();
}

function nota(freq, duracao, ganho, tipo, atraso = 0) {
  const c = contexto();
  if (!c) return;
  const t = c.currentTime + atraso;
  const osc = c.createOscillator();
  const vol = c.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, t);
  vol.gain.setValueAtTime(0.0001, t);
  vol.gain.exponentialRampToValueAtTime(ganho, t + 0.005);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  osc.connect(vol).connect(saida);
  osc.start(t);
  osc.stop(t + duracao + 0.03);
}

let ultimoTique = 0;

/** Um "tic" a cada nome que passa pela faixa do meio. */
export function tique() {
  if (!ligado) return;
  const agora = performance.now();
  if (agora - ultimoTique < 32) return; // no pico do giro, vira zumbido sem esse limite
  ultimoTique = agora;
  nota(1500, 0.03, 0.045, 'triangle');
}

/** Um dígito do cupom travou. */
export function trava() {
  if (!ligado) return;
  nota(660, 0.16, 0.06, 'sine');
}

/** O ganhador aparece. */
export function revelar() {
  if (!ligado) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => nota(f, 1.6, 0.05, 'sine', i * 0.08));
}
