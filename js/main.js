/* ezequiel. — Reflexo
   espelho d'água (WebGL) · leitor de excertos (Web Audio) · cordas (Karplus-Strong + sala) */
(() => {
  'use strict';

  const FAIXAS = [
    ['Incipit', '0:58'],
    ['Saber chegar', '4:00'],
    ['Ciclo', '3:44'],
    ['A pressa e o pulso', '3:35'],
    ['Nada', '4:05'],
    ['Portugalidade', '3:23'],
    ['O resto da história', '4:06'],
    ['Pela metade', '3:08'],
    ['Quem sabe até casar', '3:13'],
  ];
  const $ = (s) => document.querySelector(s);
  const pad = (n) => String(n).padStart(2, '0');
  const calmo = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ════════════ áudio partilhado ════════════ */
  const audio = $('#audio');
  let ctx = null, analisador = null, filtro = null, espectro = null, ligado = false;

  function contexto() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  // o primeiro gesto na página desbloqueia o som (para as cordas responderem logo ao rato)
  const desbloquear = () => contexto();
  ['pointerdown', 'touchend', 'keydown'].forEach((t) => addEventListener(t, desbloquear, { passive: true }));

  function ligarAudio() {
    if (ligado || !contexto()) return;
    try {
      const fonte = ctx.createMediaElementSource(audio);
      analisador = ctx.createAnalyser();
      analisador.fftSize = 1024;
      analisador.smoothingTimeConstant = 0.72;
      espectro = new Uint8Array(analisador.frequencyBinCount);
      filtro = ctx.createBiquadFilter();
      filtro.type = 'lowpass';
      filtro.frequency.value = 20000;
      filtro.Q.value = 0.7;
      fonte.connect(analisador);
      fonte.connect(filtro);
      filtro.connect(ctx.destination);
      ligado = true;
    } catch (e) { analisador = null; filtro = null; }
  }

  /* ════════════ leitor ════════════ */
  const leitor = $('#leitor');
  const hero = $('#espelho');
  const btnOuvir = $('#ouvir');
  const btnLeitor = $('#leitor-play');
  const lista = $('#faixas');
  const topo = $('#top');
  let atual = -1, iniciado = false;

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  FAIXAS.forEach(([titulo, dur], i) => {
    const li = document.createElement('li');
    li.innerHTML =
      `<button class="track" type="button" aria-label="Ouvir excerto de ${titulo}">` +
      `<span class="track-n">${pad(i + 1)}</span><span class="track-t">${titulo}</span>` +
      `<span class="track-d">${dur}</span>${ICON}</button>`;
    li.firstChild.addEventListener('click', () => (i === atual ? alternar() : tocar(i)));
    lista.appendChild(li);
  });
  const linhas = [...lista.querySelectorAll('.track')];

  // o leitor flutuante só aparece depois de se sair do espelho, onde já existe o botão de ouvir
  function aoRolar() {
    const longe = scrollY > innerHeight * 0.55;
    topo.classList.toggle('solid', longe);
    leitor.classList.toggle('open', iniciado && longe);
  }
  addEventListener('scroll', aoRolar, { passive: true });
  aoRolar();

  function tocar(i) {
    ligarAudio();
    atual = i;
    audio.src = `assets/audio/${pad(i + 1)}.mp3`;
    audio.play().catch(() => {});
    $('#leitor-n').textContent = pad(i + 1);
    $('#leitor-t').textContent = FAIXAS[i][0];
    linhas.forEach((l, k) => l.classList.toggle('on', k === i));
    leitor.hidden = false;
    iniciado = true;
    hero.classList.add('a-ouvir');
    requestAnimationFrame(aoRolar);
  }
  function alternar() {
    if (atual < 0) return tocar(0);
    ligarAudio();
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  }
  function estado() {
    const on = !audio.paused;
    [btnOuvir, btnLeitor].forEach((b) => b.classList.toggle('tocar', on));
    btnOuvir.setAttribute('aria-pressed', on);
    btnOuvir.querySelector('.listen-label').textContent = on ? 'pausar' : 'ouvir';
    btnLeitor.setAttribute('aria-label', on ? 'Pausar' : 'Tocar');
  }
  audio.addEventListener('play', estado);
  audio.addEventListener('pause', estado);
  audio.addEventListener('ended', () => {
    if (atual < FAIXAS.length - 1) tocar(atual + 1);
    else { linhas.forEach((l) => l.classList.remove('on')); atual = -1; iniciado = false; estado(); aoRolar(); }
  });
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) $('#progresso').style.width = (100 * audio.currentTime / audio.duration) + '%';
  });
  btnOuvir.addEventListener('click', alternar);
  btnLeitor.addEventListener('click', alternar);
  $('#leitor-seguinte').addEventListener('click', () => tocar((atual + 1) % FAIXAS.length));

  /* ════════════ videoclips ════════════ */
  // o título gigante sai quando o vídeo toca e volta quando pára (estado lido do leitor do YouTube)
  const quadros = new Map();
  const mandar = (f, func) => {
    try { f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*'); } catch (_) {}
  };
  document.querySelectorAll('.video').forEach((b) => b.addEventListener('click', () => {
    const clip = b.closest('.clip');
    const existente = b.querySelector('iframe');
    if (existente) {            // estava em pausa, com o cartaz por cima: retoma
      audio.pause();
      mandar(existente, 'playVideo');
      marcar(b, clip, true);
      return;
    }
    audio.pause();
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.title = b.getAttribute('aria-label');
    f.addEventListener('load', () => {
      const escutar = () => {
        try {
          f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: b.dataset.yt, channel: 'widget' }), '*');
          f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: b.dataset.yt, channel: 'widget' }), '*');
        } catch (_) {}
      };
      escutar(); setTimeout(escutar, 800); setTimeout(escutar, 2500);
    });
    b.appendChild(f);
    quadros.set(f, { b, clip, t: 0 });
    marcar(b, clip, true);
  }));
  function marcar(b, clip, aTocar) {
    b.classList.toggle('a-tocar', aTocar);
    b.classList.toggle('pausa', !aTocar);
    if (clip) clip.classList.toggle('a-ver', aTocar);
  }
  addEventListener('message', (e) => {
    let host = ''; try { host = new URL(e.origin).hostname; } catch (_) { return; }
    if (!/youtube(-nocookie)?\.com$/.test(host)) return;
    let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (_) { return; }
    const st = d && (d.event === 'onStateChange' ? d.info : d.info && d.info.playerState);
    if (typeof st !== 'number') return;
    for (const [f, q] of quadros) {
      if (f.contentWindow !== e.source) continue;
      clearTimeout(q.t);
      if (st === 1 || st === 3) marcar(q.b, q.clip, true);
      // a pausa espera um instante: saltar no vídeo passa por «pausa» antes de voltar a tocar
      else if (st === 2 || st === 0) q.t = setTimeout(() => marcar(q.b, q.clip, false), 420);
    }
  });

  /* ════════════ página ════════════ */
  // paralaxe discreta: títulos dos videoclips e fotografia da janela
  const pars = [...document.querySelectorAll('[data-par]')];
  let parRaf = 0;
  function paralaxe() {
    parRaf = 0;
    const vh = innerHeight;
    for (const el of pars) {
      const m = el.dataset.par;
      const ref = m === 'y' ? el.closest('picture') : el.parentElement;
      const r = ref.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const t = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
      el.style.transform =
        m === 'x' ? `translate3d(${(t * 7).toFixed(2)}vw,0,0)` :
        m === '-x' ? `translate3d(${(-t * 7).toFixed(2)}vw,0,0)` :
        `translate3d(0,${(-13.2 - t * 12.6).toFixed(2)}%,0)`;
    }
  }
  if (!calmo && pars.length) {
    addEventListener('scroll', () => { if (!parRaf) parRaf = requestAnimationFrame(paralaxe); }, { passive: true });
    addEventListener('resize', paralaxe);
    paralaxe();
  }

  const rev = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !calmo) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    rev.forEach((el) => io.observe(el));
  } else rev.forEach((el) => el.classList.add('in'));

  /* ════════════ cordas: Mi com nona, aberto ════════════ */
  (function cordas() {
    const sec = $('#cordas'), cv = $('#cordas-cv');
    if (!sec || !cv || calmo) return;
    const c = cv.getContext('2d');
    // Mi maior aberto com a nona (0 2 4 1 0 0): E2 B2 F#3 G#3 B3 E4 — o Fá# roça no Sol# e o acorde fica a pairar
    const NOTAS = [82.41, 123.47, 185.0, 207.65, 246.94, 329.63];
    const GROSSO = [2.6, 2.2, 1.8, 1.5, 1.05, 0.9];   // calibres de um jogo acústico, de .053 a .012
    const BORDAO = 4;                                   // as quatro mais graves são bordões de bronze
    const n = NOTAS.length;
    const amp = new Float32Array(n), t0 = new Float64Array(n), ultimo = new Float64Array(n).fill(-1e9);
    const sons = NOTAS.map(() => []), vez = new Uint8Array(n), soando = new Array(n);
    let W = 0, H = 0, dpr = 1, raf = 0, fim = false, py = null, pronto = false, armar = 0;
    let entrou = 0, entrada = 0;
    sec.classList.add('js');

    const yCorda = (i) => H / 2 + (i - (n - 1) / 2) * Math.min(34 * dpr, H / 9);
    const X0 = 0.04, X1 = 0.96;

    /* ── som ── */
    let bus = null, seco = null, envio = null;

    // sala: resposta a impulso sintetizada, com cauda de ~5 s que vai escurecendo
    function salaIR() {
      const sr = ctx.sampleRate, L = Math.floor(sr * 6.2), pre = Math.floor(sr * 0.03);
      const ir = ctx.createBuffer(2, L, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let lp = 0;
        for (let k = pre; k < L; k++) {
          const t = (k - pre) / sr;
          const fecho = 0.35 + 0.55 * Math.min(1, t / 4);
          lp += (1 - fecho) * ((Math.random() * 2 - 1) - lp);
          d[k] = lp * Math.exp(-t * 6.9 / 5.2) * Math.min(1, t / 0.08);
        }
        [0.012, 0.019, 0.029, 0.043, 0.058].forEach((t, j) => {
          const k = pre + Math.floor((t + ch * 0.0035) * sr);
          if (k < L) d[k] += (0.22 - j * 0.03) * (j % 2 ? -1 : 1);
        });
      }
      return ir;
    }

    function cadeia() {
      if (bus) return true;
      if (!contexto()) return false;
      try {
        const filtro = (tipo, f, q, g) => {
          const b = ctx.createBiquadFilter();
          b.type = tipo; b.frequency.value = f; b.Q.value = q; if (g) b.gain.value = g;
          return b;
        };
        bus = ctx.createGain();
        // caixa de madeira: dois modos graves do tampo e agudos macios
        const tampo = filtro('peaking', 105, 1.4, 4), caixa = filtro('peaking', 230, 1.8, 2.5);
        const macio = filtro('highshelf', 2400, 0.7, -7), tecto = filtro('lowpass', 5200, 0.5);
        seco = ctx.createGain(); seco.gain.value = 0.9;
        envio = ctx.createGain(); envio.gain.value = 0.3;
        const sala = ctx.createConvolver(); sala.buffer = salaIR();
        const molhado = ctx.createGain(); molhado.gain.value = 0.75;
        bus.connect(tampo); tampo.connect(caixa); caixa.connect(macio); macio.connect(tecto);
        tecto.connect(seco); seco.connect(ctx.destination);
        tecto.connect(envio); envio.connect(sala); sala.connect(molhado); molhado.connect(ctx.destination);
      } catch (_) { bus = null; return false; }
      return true;
    }

    // Karplus-Strong afinado (atraso fracionário por passa-tudo) e dedilhado com a polpa do polegar
    function sintetizar(i) {
      const sr = ctx.sampleRate, f = NOTAS[i];
      const P = sr / f - 1;                                  // o filtro de perda atrasa uma amostra
      const Ni = Math.floor(P - 0.3), D = P - Ni, C = (1 - D) / (1 + D);
      const T60 = 6.5 - i * 0.6;                             // os bordões soam mais tempo
      const g = Math.pow(10, -3 / (f * T60));
      const L = Math.floor(sr * (T60 + 0.4));
      const buf = ctx.createBuffer(1, L, sr), out = buf.getChannelData(0);
      // excitação: corda puxada perto da boca (forma triangular) com um pouco de ruído, tudo amaciado
      const exc = new Float32Array(Ni), pico = (0.18 + Math.random() * 0.05) * Ni;
      let s = 0, media = 0;
      for (let k = 0; k < Ni; k++) {
        const tri = k < pico ? k / pico : (Ni - k) / (Ni - pico);
        s += (tri * 0.85 + (Math.random() * 2 - 1) * 0.22 - s) * 0.42;
        exc[k] = s; media += s;
      }
      media /= Ni;
      for (let k = 0; k < Ni; k++) exc[k] -= media;
      const linha = new Float32Array(Ni);
      let w = 0, x1 = 0, x2 = 0, ax = 0, ay = 0, max = 0;
      for (let k = 0; k < L; k++) {
        const x = linha[w];
        const lf = g * (0.25 * x + 0.5 * x1 + 0.25 * x2); // perda: os agudos morrem primeiro
        x2 = x1; x1 = x;
        const y = C * lf + ax - C * ay; ax = lf; ay = y;
        const v = y + (k < Ni ? exc[k] : 0);
        linha[w] = v; out[k] = v;
        if (Math.abs(v) > max) max = Math.abs(v);
        w = w + 1 === Ni ? 0 : w + 1;
      }
      const esc = 0.5 / (max || 1), cauda = Math.floor(sr * 0.3);
      for (let k = 0; k < L; k++) out[k] *= esc * Math.min(1, (L - k) / cauda);
      return buf;
    }

    function tocarCorda(i, forca) {
      if (!cadeia() || ctx.state !== 'running') return;
      try {
        vez[i] ^= 1;
        const buf = sons[i][vez[i]] || (sons[i][vez[i]] = sintetizar(i));
        const s = ctx.createBufferSource(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        s.buffer = buf;
        lp.type = 'lowpass'; lp.frequency.value = 1700 + forca * 2400; lp.Q.value = 0.4;
        g.gain.value = 0.32 + forca * 0.22;
        s.connect(lp); lp.connect(g);
        if (pan) { pan.pan.value = (i - (n - 1) / 2) * 0.1; g.connect(pan); pan.connect(bus); } else g.connect(bus);
        // voltar a tocar a mesma corda abafa a vibração anterior, como na guitarra
        const ant = soando[i];
        if (ant) try { ant.gain.setTargetAtTime(0, ctx.currentTime, 0.015); ant.src.stop(ctx.currentTime + 0.1); } catch (_) {}
        soando[i] = { gain: g.gain, src: s };
        s.start();
      } catch (_) {}
    }

    const rampa = (p, v, quando, tau) => { p.cancelScheduledValues(quando); p.setTargetAtTime(v, quando, tau); };
    function abrirSala() {           // o rasgado completo manda mais som para a sala
      if (bus) rampa(envio.gain, 0.7, ctx.currentTime, 0.25);
    }
    function soltarSala() {          // a frase aparece: as cordas calam-se e fica o eco da sala
      if (!bus) return;
      const t = ctx.currentTime;
      rampa(seco.gain, 0, t, 0.5);
      rampa(envio.gain, 0, t + 0.9, 0.5);
    }
    function reporSala() {
      if (!bus) return;
      const t = ctx.currentTime;
      rampa(seco.gain, 0.9, t, 0.05);
      rampa(envio.gain, 0.3, t, 0.05);
    }

    function dedilhar(i, forca) {
      if (performance.now() - ultimo[i] < 90) return;
      tocarCorda(i, forca);
      // a hora é registada depois do som: o arranque do áudio pode demorar no primeiro toque
      const agora = performance.now();
      ultimo[i] = agora; t0[i] = agora; amp[i] = Math.min(15, 6 + forca * 9);
      if (!raf) raf = requestAnimationFrame(pintar);
      // rasgado completo: as seis cordas soaram dentro do mesmo gesto
      if (!fim && pronto && ultimo.every((u) => agora - u < 1500)) {
        fim = true;
        abrirSala();
        setTimeout(() => { if (fim) { sec.classList.add('fim'); soltarSala(); } }, 1700); // deixa o acorde soar antes de se desfazer
      }
    }

    /* ── desenho: cordas de metal sobre o fundo ── */
    const suave = (x) => x * x * (3 - 2 * x);
    function traco(pts, desvio) {
      c.beginPath();
      for (let k = 0; k < pts.length; k += 2) (k ? c.lineTo : c.moveTo).call(c, pts[k], pts[k + 1] + desvio);
    }
    function pintar(agora) {
      raf = 0;
      c.clearRect(0, 0, W, H);
      if (!W) return;
      if (entrou) entrada = Math.min(1, (agora - entrou) / 2800);
      let vivo = entrou && entrada < 1;
      const x0 = W * X0, larg = W * (X1 - X0), M = 80;
      // luz a vir de cima e da esquerda: o brilho corre ao longo da corda e apaga-se nas pontas
      const luz = c.createLinearGradient(x0, 0, x0 + larg, 0);
      luz.addColorStop(0, 'rgba(255,246,228,0)');
      luz.addColorStop(0.38, 'rgba(255,246,228,.85)');
      luz.addColorStop(0.62, 'rgba(255,246,228,.55)');
      luz.addColorStop(1, 'rgba(255,246,228,.1)');
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        // entram uma a uma, das graves para as agudas, a emergir do fundo
        const vis = suave(Math.max(0, Math.min(1, entrada * 1.5 - i * 0.09)));
        if (vis <= 0) continue;
        const t = (agora - t0[i]) / 1000;
        const a = amp[i] * Math.exp(-t * (1.5 + i * 0.12)) * dpr;
        if (a > 0.15) vivo = true;
        const f = 7 + i * 1.6, y = yCorda(i), esp = Math.max(0.9, GROSSO[i] * dpr);
        const pts = new Float32Array((M + 1) * 2);
        for (let k = 0; k <= M; k++) {
          const u = k / M, sn = Math.sin(Math.PI * u);
          const dy = a > 0.15 ? 0.55 * a * sn * (Math.cos(t * f * 6.283) + 0.3 * Math.sin(2 * Math.PI * u) * Math.cos(t * f * 12.566)) : 0;
          pts[k * 2] = x0 + larg * u; pts[k * 2 + 1] = y + dy;
        }
        c.globalAlpha = vis;
        // a corda a vibrar vê-se como um véu desfocado entre os dois extremos
        if (a > 0.6) {
          c.beginPath();
          for (let k = 0; k <= M; k++) c.lineTo(pts[k * 2], y - a * Math.sin(Math.PI * k / M));
          for (let k = M; k >= 0; k--) c.lineTo(pts[k * 2], y + a * Math.sin(Math.PI * k / M));
          c.fillStyle = i < BORDAO ? 'rgba(196,160,112,.07)' : 'rgba(205,210,216,.07)';
          c.fill();
        }
        // corpo, com a sombra projetada no tampo
        traco(pts, 0);
        c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 4 * dpr; c.shadowOffsetY = 3.5 * dpr;
        c.strokeStyle = i < BORDAO ? 'rgb(128,98,64)' : 'rgb(150,155,162)';
        c.lineWidth = esp;
        c.stroke();
        c.shadowColor = 'transparent';
        // enrolamento dos bordões: espiras finas sobre o núcleo
        if (i < BORDAO) {
          c.setLineDash([0.8 * dpr, 0.75 * dpr]);
          c.strokeStyle = 'rgba(48,34,20,.5)';
          c.lineWidth = esp * 0.9;
          c.stroke();
          c.setLineDash([]);
        }
        // reflexo especular no dorso
        traco(pts, -esp * 0.22);
        c.strokeStyle = luz;
        c.lineWidth = Math.max(0.5 * dpr, esp * 0.34);
        c.stroke();
      }
      c.globalAlpha = 1;
      // as pontas fundem-se no fundo da página
      const mascara = c.createLinearGradient(x0, 0, x0 + larg, 0);
      mascara.addColorStop(0, 'rgba(0,0,0,0)');
      mascara.addColorStop(0.16, 'rgba(0,0,0,1)');
      mascara.addColorStop(0.84, 'rgba(0,0,0,1)');
      mascara.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = mascara;
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
      if (vivo) raf = requestAnimationFrame(pintar);
    }
    function medir() {
      const r = cv.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = cv.width = Math.round(r.width * dpr);
      H = cv.height = Math.round(r.height * dpr);
      pintar(performance.now());
    }

    const local = (e) => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
    };
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = local(e);
      py = y;
      if (x < W * X0 || x > W * X1) return;
      let m = 0;
      for (let i = 1; i < n; i++) if (Math.abs(yCorda(i) - y) < Math.abs(yCorda(m) - y)) m = i;
      if (Math.abs(yCorda(m) - y) < 16 * dpr) dedilhar(m, 0.6);
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = local(e);
      if (py !== null && x > W * X0 && x < W * X1) {
        const v = Math.min(1, Math.abs(y - py) / (40 * dpr));
        for (let i = 0; i < n; i++) {
          const s = yCorda(i);
          if (py !== y && (py - s) * (y - s) <= 0) dedilhar(i, v); // <= apanha o ponteiro pousado em cima da corda
        }
      }
      py = y;
    });
    ['pointerleave', 'pointercancel'].forEach((t) => cv.addEventListener(t, () => { py = null; }));
    // quem navega por teclado chega à frase sem ter de tocar
    sec.querySelector('a').addEventListener('focus', () => { if (!sec.matches(':hover')) { fim = true; sec.classList.add('fim'); } });

    // as cordas emergem do fundo quando a secção entra no ecrã; só contam para o rasgado depois de
    // estarem um momento à vista (evita dispará-lo ao atravessar a página) e voltam ao sítio ao sair
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) {
          if (!entrou) { entrou = performance.now(); if (!raf) raf = requestAnimationFrame(pintar); }
        } else { entrou = 0; entrada = 0; pintar(performance.now()); }
      }, { threshold: 0.25 }).observe(sec);
      new IntersectionObserver(([e]) => {
        clearTimeout(armar);
        if (e.isIntersecting) armar = setTimeout(() => { pronto = true; if (ctx) cadeia(); }, 900);
        else { pronto = false; fim = false; ultimo.fill(-1e9); sec.classList.remove('fim'); reporSala(); }
      }, { threshold: 0.6 }).observe(sec);
    } else { pronto = true; entrou = performance.now(); }
    if ('ResizeObserver' in window) new ResizeObserver(medir).observe(cv); else addEventListener('resize', medir);
    medir();
  })();

  /* ════════════ espelho d'água ════════════ */
  const cv = $('#agua');
  const titulo = $('#titulo');
  const agua = hero.querySelector('.hero-water');
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;

  const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS = `
precision highp float;
uniform sampler2D uCena, uTinta;
uniform vec2 uRes;
uniform float uT, uHz, uGrave, uMedio, uAgudo, uFundo, uGrao;
uniform vec4 uOnda[10];
const vec3 FUNDO = vec3(0.106, 0.129, 0.169);
const vec3 OSSO  = vec3(0.925, 0.902, 0.855);

float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  uv.y = 1.0 - uv.y;
  float asp = uRes.x / uRes.y;
  vec3 cor;
  // grão de impressão: fixo, com dois tamanhos (grão fino + fibra do papel)
  vec2 gp = gl_FragCoord.xy / uGrao;
  float grao = (h21(floor(gp)) - 0.5) * 0.7 + (h21(floor(gp * 0.37) + 7.0) - 0.5) * 0.3;

  if (uv.y < uHz) {
    cor = texture2D(uCena, uv).rgb;
    // pretos ligeiramente levantados e grão, como uma fotografia impressa em papel mate
    cor = cor * 0.975 + vec3(0.010, 0.012, 0.016);
    cor = mix(cor, cor * cor * (3.0 - 2.0 * cor), 0.34); // devolve contraste sem queimar
    cor += grao * (0.052 + 0.03 * (1.0 - dot(cor, vec3(0.33))));
    cor = mix(cor, FUNDO, uFundo * 0.35);
  } else {
    float d = (uv.y - uHz) / (1.0 - uHz);
    float per = 1.0 / (d * 1.7 + 0.14);
    float perto = smoothstep(0.0, 0.16, d);

    float amp = 0.0015 + uGrave * 0.0075 + uMedio * 0.003 + uFundo * 0.005;
    float w1 = sin(per * 8.0 + uT * 1.05 + uv.x * 5.0);
    float w2 = sin(per * 21.0 - uT * 1.6 + uv.x * 15.0);
    float w3 = sin(per * 47.0 + uT * 2.7 - uv.x * 37.0);
    vec2 des = vec2(w1 + w2 * 0.5, w1 * 0.7 + w2 * 0.35) * amp * (0.3 + d * 1.3);
    des += vec2(w3, w3 * 0.5) * (0.0003 + uAgudo * 0.004) * perto;
    float luz = (w1 * w2) * amp * 9.0;

    for (int i = 0; i < 10; i++) {
      vec4 o = uOnda[i];
      if (o.w <= 0.0) continue;
      vec2 dv = uv - o.xy;
      dv.x *= asp;
      dv.y *= 2.3;
      float dist = length(dv);
      float fase = dist - o.z * 0.26;
      float onda = sin(fase * 62.0) * exp(-abs(fase) * 13.0) * step(fase, 0.03)
                 * exp(-o.z * 0.85) * o.w / (1.0 + dist * 5.0);
      vec2 dir = dv / (dist + 0.0001);
      des += vec2(dir.x / asp, dir.y * 0.6) * onda * 0.02;
      luz += onda * 0.5;
    }

    float ry = uHz - (uv.y - uHz);
    vec2 ruv = vec2(uv.x + des.x, clamp(ry + des.y * 1.4, 0.002, uHz - 0.003));
    vec3 refl = texture2D(uCena, ruv).rgb;
    cor = mix(refl * 0.82, FUNDO, clamp(0.42 + 0.9 * pow(d, 1.1), 0.0, 1.0));

    float tinta = texture2D(uTinta, uv + des * 0.85).a;
    cor = mix(cor, OSSO, tinta * (0.95 - uFundo * 0.25));

    cor += vec3(0.80, 0.86, 1.0) * max(luz, 0.0) * 0.16 * (1.0 - d * 0.5);
    cor += vec3(0.85, 0.9, 1.0) * smoothstep(0.006, 0.0, d) * 0.10;
    cor = mix(cor, FUNDO * vec3(0.8, 0.95, 1.2), uFundo * 0.3);
    // a água dissolve-se no fundo da página, sem linha de fim
    float some = smoothstep(0.42, 0.96, d);
    cor = mix(cor, FUNDO, some);
    cor += grao * 0.035 * (1.0 - some);
  }
  gl_FragColor = vec4(cor, 1.0);
}`;

  const shader = (tipo, src) => {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('espelho:', e); return; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  ['uCena', 'uTinta', 'uRes', 'uT', 'uHz', 'uGrave', 'uMedio', 'uAgudo', 'uFundo', 'uGrao', 'uOnda']
    .forEach((nome) => (U[nome] = gl.getUniformLocation(prog, nome)));

  const textura = (unidade) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unidade);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  };
  const tCena = textura(0), tTinta = textura(1);
  gl.uniform1i(U.uCena, 0);
  gl.uniform1i(U.uTinta, 1);

  const cena = document.createElement('canvas');
  const tinta = document.createElement('canvas');
  const c2 = cena.getContext('2d'), t2 = tinta.getContext('2d');
  const fotoL = new Image(), fotoM = new Image(), letras = new Image();
  let hz = 0.58, W = 0, H = 0, dpr = 1, pronto = false;

  function desenhar() {
    const r = hero.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    W = Math.round(r.width * dpr); H = Math.round(r.height * dpr);
    hz = agua.offsetTop / r.height;
    cv.width = cena.width = tinta.width = W;
    cv.height = cena.height = tinta.height = H;
    gl.viewport(0, 0, W, H);

    // cena: fotografia assente na linha de água
    const alto = Math.round(H * hz);
    c2.fillStyle = '#1b212b';
    c2.fillRect(0, 0, W, H);
    const foto = (W / alto < 1.7 && fotoM.naturalWidth) ? fotoM : fotoL;
    if (foto.naturalWidth) {
      const s = Math.max(W / foto.naturalWidth, alto / foto.naturalHeight);
      const dw = foto.naturalWidth * s, dh = foto.naturalHeight * s;
      c2.save();
      c2.beginPath(); c2.rect(0, 0, W, alto); c2.clip();
      c2.drawImage(foto, (W - dw) / 2, alto - dh, dw, dh);
      c2.fillStyle = 'rgba(27,33,43,.16)';
      c2.fillRect(0, 0, W, alto);
      const g = c2.createLinearGradient(0, 0, 0, alto * 0.42);
      g.addColorStop(0, 'rgba(27,33,43,.62)');
      g.addColorStop(1, 'rgba(27,33,43,0)');
      c2.fillStyle = g;
      c2.fillRect(0, 0, W, alto * 0.42);
      c2.restore();
    }

    // tinta: o lettering do álbum, que vive dentro de água
    t2.clearRect(0, 0, W, H);
    if (letras.naturalWidth) {
      const tr = titulo.getBoundingClientRect();
      t2.drawImage(letras, (tr.left - r.left) * dpr, (tr.top - r.top) * dpr, tr.width * dpr, tr.height * dpr);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tCena);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cena);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tTinta);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tinta);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uHz, hz);
    gl.uniform1f(U.uGrao, Math.max(1, dpr * 0.9));
    pronto = true;
    if (calmo) pintar(performance.now());
  }

  /* ondas */
  const N = 10;
  const ondas = new Float32Array(N * 4);
  const nasc = new Float64Array(N);
  let prox = 0;
  function onda(x, y, forca) {
    const i = prox; prox = (prox + 1) % N;
    ondas[i * 4] = x; ondas[i * 4 + 1] = Math.max(y, hz + 0.01); ondas[i * 4 + 3] = forca;
    nasc[i] = performance.now();
  }

  /* toque */
  let preso = false, fundo = 0, fundoAlvo = 0, ultimoT = 0, ux = 0, uy = 0;
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const mergulho = (y) => Math.min(1, Math.max(0, (y - hz) / (1 - hz) * 1.6));
  function corte(prof, rapido) {
    if (!filtro) return;
    const f = prof <= 0 ? 20000 : 20000 * Math.pow(0.018, 0.12 + prof * 0.88);
    filtro.Q.setTargetAtTime(prof > 0 ? 3.5 : 0.7, ctx.currentTime, 0.1);
    filtro.frequency.setTargetAtTime(f, ctx.currentTime, rapido ? 0.07 : 0.28);
  }
  cv.addEventListener('pointerdown', (e) => {
    const [x, y] = pos(e);
    if (y < hz) return;
    onda(x, y, 1);
    preso = true; fundoAlvo = 0.35 + 0.65 * mergulho(y);
    corte(mergulho(y), true);
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  });
  cv.addEventListener('pointermove', (e) => {
    const [x, y] = pos(e);
    if (y < hz) return;
    const agora = performance.now();
    const dist = Math.hypot((x - ux) * W, (y - uy) * H);
    if (agora - ultimoT > 110 && dist > 26 * dpr) {
      onda(x, y, preso ? 0.8 : 0.42);
      ultimoT = agora; ux = x; uy = y;
    }
    if (preso) { fundoAlvo = 0.35 + 0.65 * mergulho(y); corte(mergulho(y), true); }
  });
  const soltar = () => { if (!preso) return; preso = false; fundoAlvo = 0; corte(0, false); };
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => cv.addEventListener(t, soltar));
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  /* desenho */
  let grave = 0, medio = 0, agudo = 0, mediaGrave = 0, ultimoBatida = 0, ultimoPulso = 0, visivel = true, raf = 0;
  const anel = btnOuvir.querySelector('.listen-ring');
  const banda = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += espectro[i]; return s / ((b - a) * 255); };

  function pintar(agora) {
    if (!pronto) return;
    let g = 0, m = 0, a = 0;
    // o botão de ouvir é a fonte do som: de 3,2 em 3,2 s nasce dele uma onda
    if (!audio.paused && agora - ultimoPulso > 3200) {
      ultimoPulso = agora;
      const h = hero.getBoundingClientRect(), b = anel.getBoundingClientRect();
      onda((b.left + b.width / 2 - h.left) / h.width, (b.top + b.height / 2 - h.top) / h.height, 0.75);
    }
    if (analisador && !audio.paused) {
      analisador.getByteFrequencyData(espectro);
      g = banda(1, 9); m = banda(9, 80); a = banda(80, 280);
      mediaGrave += (g - mediaGrave) * 0.04;
      if (g > mediaGrave * 1.22 + 0.05 && agora - ultimoBatida > 430) {
        ultimoBatida = agora;
        onda(0.5 + (Math.random() - 0.5) * 0.5, hz + (1 - hz) * (0.12 + Math.random() * 0.3), 0.5);
      }
    }
    grave += (g - grave) * 0.18; medio += (m - medio) * 0.14; agudo += (a - agudo) * 0.2;
    fundo += (fundoAlvo - fundo) * 0.07;
    for (let i = 0; i < N; i++) {
      const idade = (agora - nasc[i]) / 1000;
      ondas[i * 4 + 2] = idade;
      if (idade > 7) ondas[i * 4 + 3] = 0;
    }
    gl.uniform1f(U.uT, calmo ? 0 : agora / 1000);
    gl.uniform1f(U.uGrave, grave);
    gl.uniform1f(U.uMedio, medio);
    gl.uniform1f(U.uAgudo, agudo);
    gl.uniform1f(U.uFundo, fundo);
    gl.uniform4fv(U.uOnda, ondas);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function ciclo(agora) {
    pintar(agora);
    raf = visivel ? requestAnimationFrame(ciclo) : 0;
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
      if (visivel && !raf && !calmo) raf = requestAnimationFrame(ciclo);
    }).observe(hero);
  }

  /* arranque */
  const carregar = (img, src) => new Promise((ok) => { img.onload = img.onerror = ok; img.src = src; });
  const estreito = matchMedia('(max-width: 900px)').matches;
  Promise.all([
    carregar(estreito ? fotoM : fotoL, estreito ? 'assets/img/hero-m.jpg' : 'assets/img/hero.jpg'),
    carregar(letras, 'assets/img/reflexo.png'),
  ]).then(() => {
    desenhar();
    hero.classList.add('vivo');
    if (!calmo) {
      raf = requestAnimationFrame(ciclo);
      setTimeout(() => onda(0.5, hz + (1 - hz) * 0.3, 0.9), 900);
    }
    // a outra versão da fotografia só é pedida se a janela mudar de proporção
    carregar(estreito ? fotoL : fotoM, estreito ? 'assets/img/hero.jpg' : 'assets/img/hero-m.jpg').then(desenhar);
  });
  let espera = 0;
  const redesenhar = () => { clearTimeout(espera); espera = setTimeout(desenhar, 120); };
  if ('ResizeObserver' in window) new ResizeObserver(redesenhar).observe(hero);
  else addEventListener('resize', redesenhar);
})();
