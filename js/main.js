/* ezequiel. — Reflexo
   espelho d'água (WebGL) + leitor de excertos (Web Audio) */
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

  /* ════════════ leitor ════════════ */
  const audio = $('#audio');
  const leitor = $('#leitor');
  const btnOuvir = $('#ouvir');
  const btnLeitor = $('#leitor-play');
  const lista = $('#faixas');
  let atual = -1, iniciado = false;
  let ctx = null, analisador = null, filtro = null, espectro = null;

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="p" d="M8 5.5v13l11-6.5z"/></svg>';
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

  function ligarAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
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
    } catch (e) { ctx = null; analisador = null; filtro = null; }
  }

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

  /* ════════════ vídeos ════════════ */
  document.querySelectorAll('.video').forEach((b) => b.addEventListener('click', () => {
    if (b.querySelector('iframe')) return;
    audio.pause();
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.title = b.getAttribute('aria-label');
    b.appendChild(f);
  }));

  /* ════════════ página ════════════ */
  const topo = $('#top');
  // o leitor flutuante só aparece depois de se sair do espelho, onde já existe o botão de ouvir
  function aoRolar() {
    const longe = scrollY > innerHeight * 0.55;
    topo.classList.toggle('solid', longe);
    leitor.classList.toggle('open', iniciado && longe);
  }
  addEventListener('scroll', aoRolar, { passive: true });
  aoRolar();

  const rev = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !calmo) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    rev.forEach((el) => io.observe(el));
  } else rev.forEach((el) => el.classList.add('in'));

  /* ════════════ espelho d'água ════════════ */
  const hero = $('#espelho');
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
uniform float uT, uHz, uGrave, uMedio, uAgudo, uFundo;
uniform vec4 uOnda[10];
const vec3 FUNDO = vec3(0.106, 0.129, 0.169);
const vec3 OSSO  = vec3(0.925, 0.902, 0.855);

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  uv.y = 1.0 - uv.y;
  float asp = uRes.x / uRes.y;
  vec3 cor;

  if (uv.y < uHz) {
    cor = texture2D(uCena, uv).rgb;
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
    cor = mix(refl * 0.82, FUNDO, clamp(0.44 + 0.56 * pow(d, 1.2), 0.0, 1.0));

    float tinta = texture2D(uTinta, uv + des * 0.85).a;
    cor = mix(cor, OSSO, tinta * (0.95 - uFundo * 0.25));

    cor += vec3(0.80, 0.86, 1.0) * max(luz, 0.0) * 0.16 * (1.0 - d * 0.5);
    cor += vec3(0.85, 0.9, 1.0) * smoothstep(0.006, 0.0, d) * 0.10;
    cor = mix(cor, FUNDO * vec3(0.8, 0.95, 1.2), uFundo * 0.3);
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
  ['uCena', 'uTinta', 'uRes', 'uT', 'uHz', 'uGrave', 'uMedio', 'uAgudo', 'uFundo', 'uOnda']
    .forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));

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
  const fotoL = new Image(), fotoM = new Image();
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

    // tinta: o título, que vive dentro de água
    t2.clearRect(0, 0, W, H);
    const tr = titulo.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(titulo).fontSize) * dpr;
    t2.font = `400 ${fs}px Baskervville, Baskerville, Georgia, serif`;
    t2.textBaseline = 'alphabetic';
    t2.fillStyle = '#fff';
    const partes = ['refl', 'e', 'xo'];
    const larg = partes.map((p) => t2.measureText(p).width);
    let x = (tr.left - r.left + tr.width / 2) * dpr - (larg[0] + larg[1] + larg[2]) / 2;
    const y = (tr.top - r.top) * dpr + fs * 0.74;
    t2.fillText(partes[0], x, y); x += larg[0];
    t2.save(); t2.translate(x + larg[1], y); t2.scale(-1, 1); t2.fillText('e', 0, 0); t2.restore();
    x += larg[1];
    t2.fillText(partes[2], x, y);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tCena);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cena);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tTinta);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tinta);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform1f(U.uHz, hz);
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
  const dica = $('#dica');
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const mergulho = (y) => Math.min(1, Math.max(0, (y - hz) / (1 - hz)));
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
    dica.classList.add('off');
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
  let grave = 0, medio = 0, agudo = 0, mediaGrave = 0, ultimoBatida = 0, visivel = true, raf = 0;
  const banda = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += espectro[i]; return s / ((b - a) * 255); };

  function pintar(agora) {
    if (!pronto) return;
    let g = 0, m = 0, a = 0;
    if (analisador && !audio.paused) {
      analisador.getByteFrequencyData(espectro);
      g = banda(1, 9); m = banda(9, 80); a = banda(80, 280);
      mediaGrave += (g - mediaGrave) * 0.04;
      if (g > mediaGrave * 1.22 + 0.05 && agora - ultimoBatida > 430) {
        ultimoBatida = agora;
        onda(0.5 + (Math.random() - 0.5) * 0.5, hz + (1 - hz) * (0.2 + Math.random() * 0.45), 0.5);
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
  const estreito = matchMedia('(max-width: 820px)').matches;
  Promise.all([
    carregar(estreito ? fotoM : fotoL, estreito ? 'assets/img/hero-m.jpg' : 'assets/img/hero.jpg'),
    document.fonts ? document.fonts.load('400 100px Baskervville').catch(() => {}) : null,
  ]).then(() => {
    desenhar();
    hero.classList.add('vivo');
    if (!calmo) {
      raf = requestAnimationFrame(ciclo);
      setTimeout(() => onda(0.5, hz + (1 - hz) * 0.42, 0.9), 900);
    }
    // a outra versão da fotografia só é pedida se a janela mudar de proporção
    carregar(estreito ? fotoL : fotoM, estreito ? 'assets/img/hero.jpg' : 'assets/img/hero-m.jpg').then(desenhar);
  });
  let espera = 0;
  const redesenhar = () => { clearTimeout(espera); espera = setTimeout(desenhar, 120); };
  if ('ResizeObserver' in window) new ResizeObserver(redesenhar).observe(hero);
  else addEventListener('resize', redesenhar);
})();
