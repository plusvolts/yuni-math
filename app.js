/* 윤이 수학 — 앱 로직 (의존성 없음). 뼈대는 윤이 영어 v1.3.3에서 복사했어요. */
(() => {
  'use strict';
  const APP_VERSION = '0.1.0';
  const C = window.CONTENT;
  const U = C.units;
  const READY = U.filter(u => u.ready);
  const STEPS = [
    { id: 'greet', name: '오늘의 수', icon: '📅' },
    { id: 'review', name: '복습', icon: '🔁' },
    { id: 'unit', name: '오늘의 단원', icon: '📘' },
    { id: 'flash', name: '반짝 연산', icon: '⚡' },
    { id: 'explain', name: '설명하기', icon: '🗣️' },
  ];
  const MODES = { 1: '세어 봐요', 2: '수의 순서', 3: '더 큰 수는?', 4: '모으기·가르기', 5: '계산해요', 6: '이야기 문제' };
  const KEY = 'yuni-math-v1'; // 절대 바꾸지 않아요 (바꾸면 진도·별·보상이 사라져요). 영어 앱 저장 키와 따로예요.
  const $app = document.getElementById('app');

  /* ================= 저장소 ================= */
  function defaults() {
    return {
      settings: { robotName: '셈봇', childName: '윤이', dailyLimit: 20, koVoice: '', koRate: 0.9, goalStars: 50, goalText: '아빠와 약속한 선물', explainSave: true, ladderDays: 3, ladderPct: 90 },
      pos: { u: '2-1', d: 1, s: 0 }, done: {}, stars: 0, goalBase: 0,
      weak: {}, stats: {}, days: [], log: {}, stickers: {}, override: '', rewards: [],
      ladder: { rung: 0, streak: 0, lastDate: '', hist: [], badges: {} },
      explains: [], challenge: {}, reviewPick: null,
    };
  }
  function merge(o) {
    const d = defaults();
    return Object.assign(d, o, { settings: Object.assign(d.settings, o.settings || {}), ladder: Object.assign(d.ladder, o.ladder || {}) });
  }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return merge(JSON.parse(raw)); } catch (e) { /* 저장소 사용 불가 */ }
    return defaults();
  }
  let S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  /* ================= 날짜 ================= */
  const pad = n => String(n).padStart(2, '0');
  const ymd = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const today = () => ymd(new Date());
  const addDays = (n, from) => { const d = from ? new Date(from + 'T12:00:00') : new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  function todayLog() { const k = today(); S.log[k] = Object.assign({ sec: 0, stars: 0, n: 0, ok: 0 }, S.log[k] || {}); return S.log[k]; }
  function streak() {
    const set = new Set(S.days); let n = 0; let d = today();
    if (!set.has(d)) d = addDays(-1);
    while (set.has(d)) { n++; d = addDays(-1, d); }
    return n;
  }

  /* ================= 유틸 ================= */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = (a, r = Math.random) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2400); }
  const friendHtml = (id, lg) => { const f = C.friends[id]; return `<div class="friend${lg ? ' lg' : ''}" style="background:${f.color}">${esc(f.name)}</div>`; };
  const robotName = () => S.settings.robotName || '셈봇';
  const unitById = id => U.find(u => u.id === id);
  const unitNo = u => U.indexOf(u) + 1;
  const unitLabel = u => `${u.sem} ${u.title}`;

  /* 씨앗 난수: 같은 날·같은 자리의 문제는 언제나 같은 문제 (◀ 이전 버튼으로 돌아가도 같아요) */
  function hashStr(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return (h ^ (h >>> 16)) >>> 0; }
  function rngFrom(seed) { let a = hashStr(String(seed)); return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ================= 한국어 수 읽기 ================= */
  const SD = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  function sino(n) {
    n = Math.floor(Math.abs(Number(n)) || 0); if (n === 0) return '영';
    let out = ''; const parts = [[1000, '천'], [100, '백'], [10, '십']];
    for (const [v, w] of parts) { const k = Math.floor(n / v) % 10; if (k) out += (k > 1 ? SD[k] : '') + w; }
    return out + SD[n % 10];
  }
  const NO = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
  const NA = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
  const NT = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
  // 고유어 숫자: attr=true면 단위 앞 모양 (한 마리, 두 개, 스무 명)
  function native(n, attr) {
    n = Number(n); if (!(n > 0) || n >= 100) return sino(n);
    const t = Math.floor(n / 10), o = n % 10;
    if (attr && t === 2 && o === 0) return '스무';
    return NT[t] + (attr ? NA[o] : NO[o]);
  }
  const hasBatchim = ch => { const c = ch.charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; };
  const lastWord = w => { w = String(w); if (/\d$/.test(w)) return sino(w.match(/\d+$/)[0]); return w; };
  // 조사: josa(8, '은', '는') → '은' (팔은), josa(5,'은','는') → '는' (오는)
  function josa(w, a, b) { const s = lastWord(w); const ch = s[s.length - 1] || ''; if (a === '으로' && ch && (s.charCodeAt(s.length - 1) - 0xAC00) % 28 === 8) return b; return hasBatchim(ch) ? a : b; }
  const J = (n, a, b) => `${n}${josa(n, a, b)}`;
  const COUNTERS = '개|마리|명|장|살|대|송이|권|번|칸|문제|줄|쌍';
  // 화면 글 → 읽기 쉬운 말 (8+5=? → 팔 더하기 오는?, 7마리 → 일곱 마리)
  function speakify(t) {
    t = String(t);
    t = t.replace(/[()]/g, ' ');
    t = t.replace(/□/g, '몇');
    t = t.replace(/(\d+)월/g, (m, n) => ({ 6: '유월', 10: '시월' }[+n] || sino(n) + '월'));
    t = t.replace(new RegExp(`(\\d+)\\s*(${COUNTERS})(?!째)`, 'g'), (m, n, u) => `${+n < 100 ? native(+n, true) : sino(n)} ${u}`);
    t = t.replace(/\d+/g, m => sino(m));
    t = t.replace(/\s*\+\s*/g, ' 더하기 ').replace(/\s*[−–]\s*/g, ' 빼기 ').replace(/([가-힣])\s*-\s*(?=[가-힣])/g, '$1 빼기 ');
    t = t.replace(/([가-힣])\s*=\s*/g, (m, ch) => `${ch}${hasBatchim(ch) ? '은' : '는'} `);
    return t.replace(/\s+([?!.,])/g, '$1').replace(/\s+/g, ' ').trim();
  }

  /* ================= 소리 ================= */
  let voices = [];
  function loadVoices() { try { voices = speechSynthesis.getVoices(); } catch (e) { voices = []; } }
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  const koVoices = () => voices.filter(v => v.lang && v.lang.replace('_', '-').toLowerCase().startsWith('ko'));
  function voiceFor() {
    const ks = koVoices();
    const chosen = S.settings.koVoice && ks.find(v => v.voiceURI === S.settings.koVoice || v.name === S.settings.koVoice);
    // 아빠가 고른 목소리 → 구글(자연스러움) → 삼성 → 아무 한국어 목소리
    return chosen || ks.find(v => /google/i.test(v.name)) || ks.find(v => /samsung/i.test(v.name)) || ks[0] || null;
  }
  let sayToken = 0;
  function speak(text, rate) {
    return new Promise(resolve => {
      if (!('speechSynthesis' in window) || !text) return resolve();
      const my = sayToken;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ko-KR'; u.rate = rate; u.pitch = 1.0;
      const v = voiceFor(); if (v) { try { u.voice = v; } catch (e) { /* */ } }
      let done = false; const fin = () => { if (!done) { done = true; resolve(my === sayToken); } };
      u.onend = fin; u.onerror = fin;
      setTimeout(fin, 1500 + text.length * 180 / rate);
      try { speechSynthesis.speak(u); } catch (e) { fin(); }
    });
  }
  const spoken = []; // 테스트용: 읽은 문장 기록
  // 한국어는 문장부호마다 짧게 끊어서, 조금 천천히 읽어요. 숫자·식은 읽기 쉬운 말로 바꿔요.
  async function ko(t) {
    const parts = speakify(t).split(/(?<=[.!?,])\s+/).map(x => x.trim()).filter(Boolean);
    const my = sayToken; const rate = Number(S.settings.koRate) || 0.9;
    for (let i = 0; i < parts.length; i++) {
      if (my !== sayToken) return;
      spoken.push(parts[i]); if (spoken.length > 200) spoken.shift();
      await speak(parts[i], rate);
      if (i < parts.length - 1) await sleep(120);
    }
  }
  function hush() { sayToken++; try { speechSynthesis.cancel(); } catch (e) { /* */ } }
  const LINES = C.lines || {};
  const praise = () => pick(LINES.praise || ['잘했어!']);
  const callName = () => { const n = S.settings.childName || '윤이'; return n + (hasBatchim(n[n.length - 1]) ? '아' : '야'); };

  let actx = null;
  function tone(freqs, dur) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      freqs.forEach((f, i) => {
        const o = actx.createOscillator(); const g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
        const t0 = actx.currentTime + i * dur;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.start(t0); o.stop(t0 + dur + 0.02);
      });
    } catch (e) { /* */ }
  }
  const ding = () => tone([880, 1320], 0.14);
  const pop = () => tone([660], 0.06); // 구슬 넣는 소리 (틀렸을 때 "땡" 소리는 없어요)

  /* ================= 음성 인식 (설명하기, 한국어) ================= */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let micDenied = false;
  let rec = null;
  const canListen = () => !!SR && !micDenied;
  function recognize() {
    return new Promise(resolve => {
      const alts = []; let r;
      try { r = new SR(); } catch (e) { return resolve(alts); }
      r.lang = 'ko-KR'; r.interimResults = false; r.maxAlternatives = 3; r.continuous = false;
      r.onresult = e => { for (const res of e.results) for (let i = 0; i < res.length; i++) alts.push(res[i].transcript); };
      r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') micDenied = true; };
      let fin = false; const end = () => { if (fin) return; fin = true; clearTimeout(guard); if (rec === r) rec = null; resolve(alts); };
      r.onend = end;
      const guard = setTimeout(() => { try { r.abort(); } catch (e) { /* */ } end(); }, 15000); // 응답 없을 때 안전장치 (아이에게 보이는 시간 제한 아님)
      rec = r;
      try { r.start(); } catch (e) { end(); }
    });
  }
  function stopRec() { if (rec) { try { rec.stop(); } catch (e) { /* */ } } }
  const squash = s => String(s).replace(/\s+/g, '');
  const koMatch = (alts, kws) => alts.some(a => kws.some(k => squash(a).includes(squash(k))));

  /* ================= 화면 관리 ================= */
  let H = {}; let screen = ''; let actToken = 0;
  function render(name, html, handlers) {
    screen = name; hush(); stopRec(); actToken++;
    document.querySelectorAll('.confetti,.feedback,.ghost').forEach(x => x.remove());
    $app.innerHTML = html; H = handlers || {}; window.scrollTo(0, 0);
  }
  $app.addEventListener('click', e => {
    const say = e.target.closest('[data-say]');
    if (say) { e.stopPropagation(); hush(); ko(say.dataset.say); return; }
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled && H[b.dataset.act]) H[b.dataset.act](b.dataset.arg, b, e);
  });

  /* ================= 잠금 (하루 시간 제한만. 밤 시간 잠금은 없어요) ================= */
  function lockReason() {
    if (S.override === today()) return '';
    if (todayLog().sec >= Number(S.settings.dailyLimit) * 60) return 'time';
    return '';
  }
  function lockedScreen() {
    render('locked', `<div class="screen"><div class="reward">
      <div class="robot">😴</div>
      <div class="bubble">오늘 수학은 여기까지! 정말 잘했어요.
      <small>${esc(robotName())}도 이제 쉬러 가요</small></div>
      <div class="home-links"><button class="btn" data-act="home">처음으로</button><button class="btn small" data-act="parent">아빠 화면</button></div>
    </div></div>`, { home: homeScreen, parent: () => gateScreen(parentScreen) });
    ko('오늘 수학은 여기까지! 정말 잘했어요.');
  }
  // 오늘 사용 시간 기록 (아이 화면에는 시간이 보이지 않아요)
  setInterval(() => { if (screen === 'lesson' && !document.hidden) { todayLog().sec += 10; save(); } }, 10000);

  /* ================= 홈 ================= */
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (screen === 'home') homeScreen(); });
  function fixPos() { if (!unitById(S.pos.u) || !unitById(S.pos.u).ready) S.pos = { u: READY[0].id, d: 1, s: 0 }; const u = unitById(S.pos.u); if (S.pos.d > u.days.length) S.pos.d = 1; }
  function posLabel() {
    fixPos(); const { u, d, s } = S.pos; const un = unitById(u);
    return `${un.icon} ${un.title} ${d}일차 · ${STEPS[s].name}${s > 0 ? '부터 이어하기' : ''}`;
  }
  function goalInfo() { const g = Math.max(0, S.stars - S.goalBase); const goal = Math.max(1, Number(S.settings.goalStars)); return { g, goal, pct: Math.min(100, Math.round(g / goal * 100)) }; }
  function homeScreen() {
    const { g, goal, pct } = goalInfo(); const st = streak();
    render('home', `<div class="screen">
      <div class="topbar">
        <div class="stars">⭐ ${S.stars}</div>
        ${st ? `<div class="stars">🔥 ${st}일 연속</div>` : ''}
        <div class="spacer"></div>
        ${installEvt ? '<button class="btn small" data-act="install">📲 앱 설치</button>' : ''}
        <button class="icon-btn" data-act="parent" aria-label="아빠 화면">⚙️</button>
      </div>
      <div class="home-main">
        <div class="bubble">안녕, ${esc(callName())}!<small>나는 ${esc(robotName())}야. 오늘도 수학 놀이 하자!</small></div>
        <div class="robot" data-act="hello">🤖</div>
        <div class="friends">${Object.keys(C.friends).map(id => friendHtml(id)).join('')}</div>
        <button class="btn primary go-btn" data-act="go">오늘 수학<small>${esc(posLabel())}</small></button>
        <div class="home-links">
          <button class="btn" data-act="picker">🧭 단계 고르기</button>
          <button class="btn" data-act="stickers">📒 스티커북</button>
          <button class="btn" data-act="ladder">🪜 연산 사다리</button>
        </div>
        <button class="goal card" data-act="rewards" style="text-align:left"><div class="row"><b>🎁 ${esc(S.settings.goalText)}</b><div class="spacer"></div><span class="muted">${g >= goal ? '달성! 🎉' : `${g} / ${goal}`}</span></div>
          <div class="goal-bar"><i style="width:${pct}%"></i></div>
          <div class="row" style="margin-top:8px"><span class="muted">받은 보상 ${S.rewards.length}개</span><div class="spacer"></div><span class="muted">보상 목록 보기 ›</span></div></button>
      </div>
    </div>`, {
      go: () => startLesson(S.pos.u, S.pos.d, S.pos.s),
      picker: () => pickerScreen('units'),
      stickers: stickerScreen, ladder: ladderScreen, rewards: rewardScreen,
      parent: () => gateScreen(parentScreen),
      hello: () => { hush(); ko(`안녕, ${callName()}! 나는 ${robotName()}야.`); },
      install: async () => { if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { /* */ } installEvt = null; homeScreen(); } },
    });
  }

  /* ================= 단계 고르기 ================= */
  const doneCount = u => { const un = unitById(u); if (!un.ready) return 0; let n = 0; for (let d = 1; d <= un.days.length; d++) if (S.done[`${u}-${d}`]) n++; return n; };
  function parseCode(code) {
    const m = String(code).trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})(?:\s*-\s*(\d))?$/);
    if (!m) return null;
    const un = U[+m[1] - 1]; const d = +m[2], s = m[3] ? +m[3] - 1 : 0;
    if (!un || !un.ready || d < 1 || d > un.days.length || s < 0 || s >= STEPS.length) return null;
    return { u: un.id, d, s };
  }
  const posCode = p => `${unitNo(unitById(p.u))}-${p.d}-${p.s + 1}`;
  function pickerScreen(level, u, d) {
    let body = '';
    if (level === 'units') {
      body = `<h2 class="title">어떤 단원을 할까?</h2>
        <div class="grid">${U.map((un, i) => `<button class="tile${un.ready ? '' : ' locked'}${S.pos.u === un.id ? ' now' : ''}" data-act="unit" data-arg="${un.id}">
          <span class="em">${un.icon}</span><small>${un.sem}</small><b>${i + 1}. ${esc(un.title)}</b><small>${un.ready ? `${doneCount(un.id)} / ${un.days.length}일` : `준비 중 (${un.plan})`}</small></button>`).join('')}</div>
        <div class="card code-row"><b>진도 코드</b><input id="code" inputmode="numeric" placeholder="예: 6-3"><button class="btn small primary" data-act="code">바로 가기</button>
          <span class="muted">단원-일차(-단계). 다른 기기에서 하던 곳부터 시작해요.</span></div>`;
    } else if (level === 'days') {
      const un = unitById(u);
      body = `<h2 class="title">${un.icon} ${esc(un.title)} — 며칠째 할까?</h2>
        <div class="days">${un.days.map((dd, i) => `<button class="day${S.done[`${u}-${i + 1}`] ? ' done' : ''}${S.pos.u === u && S.pos.d === i + 1 ? ' now' : ''}" data-act="day" data-arg="${i + 1}">${dd.challenge ? '🏁' : i + 1}<small>${esc(dd.title)}</small></button>`).join('')}</div>`;
    } else {
      const un = unitById(u);
      body = `<h2 class="title">${un.icon} ${esc(un.title)} ${d}일차 — 어디부터 할까?</h2>
        <div class="steps">${STEPS.map((st, i) => `<button class="tile" data-act="step" data-arg="${i}"><span class="em">${st.icon}</span><b>${i + 1}. ${st.name}</b></button>`).join('')}</div>`;
    }
    render('picker', `<div class="screen">
      <div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">⬅️</button><div class="spacer"></div><button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button></div>
      ${body}</div>`, {
      back: () => level === 'units' ? homeScreen() : level === 'days' ? pickerScreen('units') : pickerScreen('days', u),
      home: homeScreen,
      unit: a => { const un = unitById(a); if (!un.ready) { hush(); ko(`${un.title} 단원은 아직 준비 중이에요.`); toast(`${un.title}: 준비 중이에요 (${un.plan})`); return; } pickerScreen('days', a); },
      day: a => pickerScreen('steps', u, +a),
      step: a => startLesson(u, d, +a),
      code: () => { const p = parseCode(document.getElementById('code').value); if (!p) return toast('예: 6-3 처럼 적어주세요'); startLesson(p.u, p.d, p.s); },
    });
  }

  /* ================= 받은 보상 ================= */
  function rewardScreen() {
    const { g, goal } = goalInfo(); const list = S.rewards.slice().reverse();
    render('rewards', `<div class="screen">
      <div class="topbar"><button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button><h2 class="title">🎁 받은 보상</h2></div>
      <div class="card goal" style="width:100%"><div class="row"><b>지금 목표: ${esc(S.settings.goalText)}</b><div class="spacer"></div><span class="muted">${Math.min(g, goal)} / ${goal}</span></div>
        <div class="goal-bar"><i style="width:${Math.min(100, Math.round(g / goal * 100))}%"></i></div>
        ${g >= goal ? '<p style="margin:10px 0 0;font-weight:800">목표 달성! 아빠에게 보여줘요 🎉</p>' : `<p class="muted" style="margin:10px 0 0">별 ${goal - g}개만 더 모으면 돼요!</p>`}</div>
      ${list.length ? `<div class="grid">${list.map((r, i) => `<div class="tile"><span class="em">🎁</span><b>${esc(r.text)}</b><small>${esc(r.date)} · 별 ${r.stars}개</small><small>${list.length - i}번째 보상</small></div>`).join('')}</div>`
        : '<p class="muted">아직 받은 보상이 없어요. 별을 모아서 첫 보상을 받아봐요!</p>'}
    </div>`, { home: homeScreen });
    if (g >= goal) ko('목표 달성! 아빠에게 보여줘요!');
  }

  /* ================= 스티커북 ================= */
  function stickerScreen() {
    const badges = Object.keys(S.ladder.badges).length;
    render('stickers', `<div class="screen">
      <div class="topbar"><button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button><h2 class="title">📒 스티커북</h2></div>
      <div class="grid">${U.map(un => `<button class="tile${S.stickers[un.id] ? '' : ' locked'}" data-act="st" data-arg="${un.id}">
        <span class="em">${S.stickers[un.id] ? un.sticker : '❔'}</span><small>${un.sem}</small><b>${esc(un.title)}</b><small>${un.ready ? `${doneCount(un.id)} / ${un.days.length}일` : '준비 중'}</small></button>`).join('')}</div>
      <div class="card"><b>🏅 연산 사다리 배지 ${badges}개</b><div class="badge-row">${C.ladder.map((l, i) => `<span class="${S.ladder.badges[i + 1] ? '' : 'off'}" title="${esc(l.name)}">🏅</span>`).slice(1).join('')}</div></div>
      <p class="muted">단원 마무리 도전에서 10문제 중 8개 이상 맞히면 스티커를 받아요. 연산 사다리를 한 칸 올라갈 때마다 🏅 배지!</p>
    </div>`, {
      home: homeScreen,
      st: a => { const un = unitById(a); hush(); if (S.stickers[a]) ko(`${un.title} 스티커! 정말 잘했어!`); else ko(un.ready ? `${un.title} 마무리 도전에서 8개 넘게 맞히면 받을 수 있어요.` : `${un.title} 단원은 아직 준비 중이에요.`); },
    });
  }

  /* ================= 연산 사다리 ================= */
  function ladderScreen() {
    const L0 = S.ladder; const need = Number(S.settings.ladderDays) || 3; const pct = Number(S.settings.ladderPct) || 90;
    render('ladder', `<div class="screen">
      <div class="topbar"><button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button><h2 class="title">🪜 연산 사다리</h2></div>
      <div class="card" style="text-align:center"><b style="font-size:var(--fs-md)">지금 ${L0.rung + 1}칸: ${esc(C.ladder[L0.rung].name)}</b>
        <div class="muted" style="margin-top:6px">${L0.rung >= C.ladder.length - 1 ? '맨 위 칸이에요! 대단해요 🎉' : `반짝 연산에서 ${pct}% 이상 맞힌 날: <b>${L0.streak} / ${need}일</b> (다 모으면 다음 칸!)`}</div></div>
      <div class="ladder">${C.ladder.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => `<div class="rung${i === L0.rung ? ' now' : i < L0.rung ? ' done' : ''}">
        <span class="no">${i + 1}</span><b>${esc(l.name)}</b><span class="muted">${esc(l.ex)}</span><span class="spacer"></span>${i < L0.rung ? '🏅' : i === L0.rung ? '🧗' : ''}</div>`).join('')}</div>
    </div>`, { home: homeScreen });
    const now = document.querySelector('.rung.now'); if (now && now.scrollIntoView) now.scrollIntoView({ block: 'center' });
    ko(`지금 연산 사다리 ${L0.rung + 1}칸이에요.`);
  }

  /* ================= 문제 만들기 ================= */
  const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const opSign = op => (op === '+' ? '+' : '−');
  function pickOp(r, op) { return op === 'mix' || !op ? (r() < 0.5 ? '+' : '-') : op; }
  function choicesFor(r, ans, extra = [], lo = 0, hi = 100) {
    const s = String(ans); const cands = [...extra, ans + 1, ans - 1, ans + 10, ans - 10];
    if (s.length === 2 && s[0] !== s[1] && s[1] !== '0') cands.push(+(s[1] + s[0]));
    const out = [];
    for (const c of shuffle(cands, r)) if (Number.isInteger(c) && c >= lo && c <= hi && c !== ans && !out.includes(c)) out.push(c);
    let k = 2; while (out.length < 3 && k < 30) { const c = ans + (r() < 0.5 ? -k : k); if (c >= lo && c <= hi && !out.includes(c) && c !== ans) out.push(c); k++; }
    return shuffle([ans, ...out.slice(0, 3)], r);
  }
  const TYPE_LABEL = {
    countTens: '몇십 알기', count: '몇십몇 세기', seq: '수의 순서', nextPrev: '1 큰 수·1 작은 수', compare: '두 수의 크기 비교', evenOdd: '짝수·홀수',
    join: '모으기', split: '가르기', splitTen: '10으로 가르기', make10: '10 만들기', from10: '10에서 빼기',
    'small5': '5까지 덧셈·뺄셈', 'small+': '10까지 덧셈', 'small-': '10까지 뺄셈', three: '세 수의 계산', three10: '10을 만들어 세 수 더하기', tenPlus: '10과 몇',
    tens: '(몇십)±(몇십)', tensOnes: '(몇십)+(몇)', twoOne: '(몇십몇)±(몇)', two: '받아올림 없는 두 자리', carry: '받아올림 있는 덧셈', borrow: '받아내림 있는 뺄셈',
  };
  // 계산 문제의 숫자 고르기 → {a, b, c?, op, op2?, ans, expr, kind, type}
  function makeCalc(r, p) {
    let kind = p.kind;
    if (kind === 'mixAll') kind = pick(['small', 'make10', 'from10', 'three', 'tenPlus', 'tensMix', 'two', 'carry', 'borrow', 'carry', 'borrow'], r);
    if (kind === 'tensMix') kind = r() < 0.5 ? 'tensOnes' : 'tens';
    const op = pickOp(r, p.op);
    let a, b, c, op2, ans, blank = false;
    switch (kind) {
      case 'small': {
        const max = p.max || 10;
        if (op === '+') { a = ri(r, 1, max - 1); b = ri(r, 1, max - a); ans = a + b; } else { a = ri(r, 2, max); b = ri(r, 1, a - 1); ans = a - b; }
        break;
      }
      case 'make10': a = ri(r, 1, 9); b = 10 - a; ans = b; blank = true; break;
      case 'from10': a = 10; b = ri(r, 1, 9); ans = 10 - b; return { a, b, op: '-', ans, kind, type: 'from10', expr: `10−${b}=□` };
      case 'three': {
        const o1 = op, o2 = p.op === 'mix' ? pickOp(r, 'mix') : op;
        if (o1 === '+' && o2 === '+') { a = ri(r, 1, 6); b = ri(r, 1, 6); c = ri(r, 1, Math.max(1, 15 - a - b)); }
        else if (o1 === '-' && o2 === '-') { a = ri(r, 6, 9); b = ri(r, 1, a - 3); c = ri(r, 1, a - b - 1); }
        else if (o1 === '+') { a = ri(r, 2, 6); b = ri(r, 1, 6); c = ri(r, 1, a + b - 1); }
        else { a = ri(r, 5, 9); b = ri(r, 1, a - 1); c = ri(r, 1, 6); }
        op2 = o2; const mid = o1 === '+' ? a + b : a - b; ans = o2 === '+' ? mid + c : mid - c;
        return { a, b, c, op: o1, op2, ans, kind, type: 'three', expr: `${a}${opSign(o1)}${b}${opSign(o2)}${c}=□`, mid };
      }
      case 'three10': {
        const x = ri(r, 1, 9), y = 10 - x, z = ri(r, 1, 9); const first = r() < 0.5;
        const [p1, p2, p3] = first ? [x, y, z] : [z, x, y];
        return { a: p1, b: p2, c: p3, op: '+', op2: '+', ans: 20 - 10 + z, kind, type: 'three10', expr: `${p1}+${p2}+${p3}=□`, pair: first ? [0, 1] : [1, 2], ten: [x, y], rest: z };
      }
      case 'tenPlus':
        if (op === '+') { const k = ri(r, 1, 9); if (r() < 0.5) { a = 10; b = k; } else { a = k; b = 10; } ans = 10 + k; }
        else { const k = ri(r, 1, 9); a = 10 + k; if (r() < 0.5) { b = k; ans = 10; } else { b = 10; ans = k; } }
        break;
      case 'tens':
        if (op === '+') { a = 10 * ri(r, 1, 8); b = 10 * ri(r, 1, 9 - a / 10); ans = a + b; } else { a = 10 * ri(r, 2, 9); b = 10 * ri(r, 1, a / 10 - 1); ans = a - b; }
        break;
      case 'tensOnes': { const t = 10 * ri(r, 1, 9), o = ri(r, 1, 9); if (r() < 0.7) { a = t; b = o; } else { a = o; b = t; } ans = a + b; return { a, b, op: '+', ans, kind, type: 'tensOnes', expr: `${a}+${b}=□` }; }
      case 'twoOne':
        if (op === '+') { do { a = ri(r, 11, 98); } while (a % 10 === 9 || a % 10 === 0 && r() < 0.6); b = ri(r, 1, 9 - a % 10); ans = a + b; }
        else { do { a = ri(r, 11, 99); } while (a % 10 === 0); b = ri(r, 1, a % 10); ans = a - b; }
        break;
      case 'two':
        if (op === '+') { const at = ri(r, 1, 7), ao = ri(r, 0, 8); a = at * 10 + ao; const bt = ri(r, 1, 9 - at), bo = ri(r, 0, 9 - ao); b = bt * 10 + bo; if (a % 10 === 0 && b % 10 === 0) b += 1; ans = a + b; }
        else { const at = ri(r, 2, 9), ao = ri(r, 1, 9); a = at * 10 + ao; const bt = ri(r, 1, at - 1), bo = ri(r, 0, ao); b = bt * 10 + bo; ans = a - b; }
        break;
      case 'carry': a = ri(r, 2, 9); b = ri(r, Math.max(2, 11 - a), 9); ans = a + b; return { a, b, op: '+', ans, kind, type: 'carry', expr: `${a}+${b}=□` };
      case 'borrow': a = ri(r, 11, 18); b = ri(r, Math.max(a % 10 + 1, a - 9), 9); ans = a - b; return { a, b, op: '-', ans, kind, type: 'borrow', expr: `${a}−${b}=□` };
      default: a = 1; b = 1; ans = 2;
    }
    let type = kind;
    if (kind === 'small') type = (p.max || 10) <= 5 ? 'small5' : `small${op}`;
    if (blank) return { a, b, op: '+', ans, kind, type, expr: `${a}+□=10`, blank: true };
    return { a, b, op, ans, kind, type, expr: `${a}${opSign(op)}${b}=□` };
  }
  // 풀이 과정 (힌트 2단계)
  function calcSteps(q) {
    const { a, b, c, ans, kind } = q;
    if (kind === 'carry') {
      const big = Math.max(a, b), small = Math.min(a, b), need = 10 - big, rest = small - need;
      return [`${J(small, '을', '를')} ${J(need, '과', '와')} ${J(rest, '으로', '로')} 갈라요.`, `${big}+${need}=10`, `10+${rest}=${ans}`];
    }
    if (kind === 'borrow') { const o = a - 10; return [`${J(a, '을', '를')} 10과 ${J(o, '으로', '로')} 갈라요.`, `10−${b}=${10 - b}`, `${10 - b}+${o}=${ans}`]; }
    if (kind === 'three') { const m = q.op === '+' ? a + b : a - b; return [`앞의 두 수부터: ${a}${opSign(q.op)}${b}=${m}`, `${m}${opSign(q.op2)}${c}=${ans}`]; }
    if (kind === 'three10') return [`${q.ten[0]}+${q.ten[1]}=10을 먼저 만들어요.`, `10+${q.rest}=${ans}`];
    if (kind === 'make10') return [`${J(a, '과', '와')} ${J(b, '을', '를')} 모으면 10이에요.`, `${a}+${b}=10`];
    if (kind === 'from10') return [`10칸 상자에서 ${b}개를 빼면 ${ans}개가 남아요.`, `10−${b}=${ans}`];
    if (kind === 'two' || kind === 'twoOne' || kind === 'tens' || kind === 'tensOnes') {
      const sg = opSign(q.op); const at = a - a % 10, bt = b - b % 10; const t = q.op === '+' ? at + bt : at - bt; const o = q.op === '+' ? a % 10 + b % 10 : a % 10 - b % 10;
      return [`십의 자리끼리: ${at}${sg}${bt}=${t}`, `일의 자리끼리: ${a % 10}${sg}${b % 10}=${o}`, `${t}+${o}=${ans}`];
    }
    if (kind === 'tenPlus') return q.op === '+' ? [`10과 ${J(a === 10 ? b : a, '을', '를')} 모으면 ${ans}`] : [`${J(a, '은', '는')} 10과 ${a - 10}`, `${a}−${b}=${ans}`];
    return [`${a}${opSign(q.op)}${b}=${ans}`];
  }
  function calcHint(q) {
    return {
      carry: '10을 먼저 만들어 봐요!', borrow: '10에서 먼저 빼 봐요!', three: '앞의 두 수부터 계산해요.', three10: '더해서 10이 되는 두 수를 찾아봐요!',
      make10: '빈 칸을 세어 봐요.', from10: '10칸 상자에서 빼 봐요.', tenPlus: '10과 몇을 생각해요.',
      two: '십의 자리끼리, 일의 자리끼리!', twoOne: '일의 자리끼리 계산해요.', tens: '10개씩 묶음끼리 계산해요.', tensOnes: '몇십과 몇을 모아요.',
    }[q.kind] || '구슬을 하나씩 세어 봐요.';
  }
  const TWO_DIGIT = ['two', 'twoOne', 'tens', 'tensOnes'];
  function calcVis(q) {
    if (TWO_DIGIT.includes(q.kind)) return { kind: 'base', a: q.a, b: q.b, op: q.op };
    if (q.kind === 'make10') return { kind: 'frames', parts: [q.a], cap: 10 };
    if (q.kind === 'three' || q.kind === 'three10') { if (q.op === '+' && q.op2 === '+') return { kind: 'frames', parts: [q.a, q.b, q.c] }; if (q.op === '-' && q.op2 === '-') return { kind: 'frames', parts: [q.a], x: q.b + q.c }; return null; }
    if (q.op === '+') return { kind: 'frames', parts: [q.a, q.b] };
    return { kind: 'frames', parts: [q.a], x: q.b };
  }
  const GEN = {
    countTens(r) {
      const k = ri(r, 3, 10), n = k * 10;
      return { mode: 1, input: 'choice', q: '모두 몇 개일까요?', sub: '10개씩 묶음을 세어 봐요.', answer: n, choices: choicesFor(r, n, [k, n + 1]), vis: { kind: 'tens', n, count: true },
        hint1: '10개씩 묶음을 하나씩 눌러 세어 봐요. 십, 이십, 삼십…', steps: [`10개씩 묶음 ${k}개`, `${n}${josa(n, '이에요', '예요')}.`] };
    },
    count(r, p = {}) {
      let n; do { n = ri(r, p.min || 21, p.max || 99); } while (n % 10 === 0);
      const k = Math.floor(n / 10), o = n % 10;
      return { mode: 1, input: 'choice', q: '모두 몇 개일까요?', answer: n, choices: choicesFor(r, n, [k + o, o * 10 + k]), vis: { kind: 'tens', n, count: true },
        hint1: '10개씩 묶음을 먼저 세고, 낱개를 세어 봐요.', steps: [`10개씩 묶음 ${k}개 → ${k * 10}`, `낱개 ${o}개 → ${n}`] };
    },
    seq(r, p = {}) {
      const step = p.step || 1;
      const start = step === 10 ? 10 * ri(r, 1, 6) : p.top ? 97 : ri(r, 21, 95);
      const nums = [0, 1, 2, 3].map(i => start + i * step); const bi = p.top ? 3 : ri(r, 0, 3); const ans = nums[bi];
      const prev = bi > 0 ? nums[bi - 1] : null;
      return { mode: 2, input: 'choice', q: '빈칸에 알맞은 수는?', answer: ans, choices: choicesFor(r, ans, [ans + step, ans - step]), vis: { kind: 'line', nums, blank: bi },
        hint1: step === 10 ? '10씩 커져요.' : '1씩 커져요.', steps: [prev != null ? `${prev} 다음은 ${J(ans, '이에요', '예요')}.`.replace('이에요이에요', '이에요') : `${nums[1]} 바로 앞은 ${ans}`, `정답은 ${ans}`] };
    },
    nextPrev(r) {
      const n = ri(r, 21, 99); const up = r() < 0.5 || n === 21; const ans = up ? n + 1 : n - 1;
      return { mode: 2, input: 'choice', q: `${n}보다 1 ${up ? '큰' : '작은'} 수는?`, answer: ans, choices: choicesFor(r, ans, [up ? n - 1 : n + 1, n + 10, n - 10]), vis: { kind: 'line', nums: [n - 1, n, n + 1], blank: up ? 2 : 0 },
        hint1: up ? '1 큰 수는 바로 뒤의 수예요.' : '1 작은 수는 바로 앞의 수예요.', steps: [`${n} 바로 ${up ? '뒤' : '앞'}의 수`, `정답은 ${ans}`] };
    },
    compare(r, p = {}) {
      let a, b;
      if (p.tens) { a = 10 * ri(r, 1, 10); do { b = 10 * ri(r, 1, 10); } while (b === a); }
      else if (r() < 0.4) { const t = ri(r, 2, 9); a = t * 10 + ri(r, 0, 9); do { b = t * 10 + ri(r, 0, 9); } while (b === a); }
      else { a = ri(r, 12, 98); do { b = ri(r, 12, 98); } while (Math.floor(b / 10) === Math.floor(a / 10)); if (r() < 0.4 && a % 10 !== Math.floor(a / 10) && a % 10) b = +(String(a)[1] + String(a)[0]); if (b === a) b = a + 10 > 99 ? a - 10 : a + 10; }
      const big = r() < 0.7; const ans = big ? Math.max(a, b) : Math.min(a, b);
      const sameT = Math.floor(a / 10) === Math.floor(b / 10);
      return { mode: 3, input: 'choice', two: true, q: big ? '더 큰 수는?' : '더 작은 수는?', answer: ans, choices: [a, b], vis: { kind: 'base2', a, b },
        hint1: sameT ? '묶음이 같으면 낱개를 비교해요.' : '10개씩 묶음을 비교해 봐요.',
        steps: sameT ? [`${a}${josa(a, '과', '와')} ${b}는 묶음 수가 같아요.`, `낱개가 ${big ? '많은' : '적은'} ${J(ans, '이', '가')} 더 ${big ? '커요' : '작아요'}.`]
          : [`${a}: 묶음 ${Math.floor(a / 10)}개, ${b}: 묶음 ${Math.floor(b / 10)}개`, `묶음이 ${big ? '많은' : '적은'} ${J(ans, '이', '가')} 더 ${big ? '커요' : '작아요'}.`] };
    },
    evenOdd(r) {
      const n = ri(r, 3, 20); const ev = n % 2 === 0; const em = pick(C.things, r);
      return { mode: 3, input: 'choice', two: true, q: `${J(n, '은', '는')} 짝수일까요, 홀수일까요?`, answer: ev ? '짝수' : '홀수', choices: ['짝수', '홀수'], vis: { kind: 'pairs', n, emoji: em },
        hint1: '둘씩 짝을 지어 봐요. 하나가 남을까요?', steps: [`${n}개를 둘씩 짝 지으면 ${ev ? '남는 게 없어요' : '하나가 남아요'}.`, `그래서 ${ev ? '짝수' : '홀수'}예요.`] };
    },
    join(r, p = {}) {
      let a, b; if (p.ten) { a = 10; b = ri(r, 1, 9); if (r() < 0.4) [a, b] = [b, a]; } else { a = ri(r, 1, 8); b = ri(r, 1, 9 - a); }
      const ans = a + b;
      return { mode: 4, input: 'choice', q: `${J(a, '과', '와')} ${J(b, '을', '를')} 모으면?`, answer: ans, choices: choicesFor(r, ans, [ans + 1, ans - 1, Math.abs(a - b)]), vis: { kind: 'frames', parts: [a, b] },
        hint1: '두 색깔 구슬을 모두 세어 봐요.', steps: [`${J(a, '과', '와')} ${J(b, '을', '를')} 모으면 ${ans}`], type: p.ten ? 'join' : 'join' };
    },
    split(r, p = {}) {
      let total, given;
      if (p.teen) { total = ri(r, 11, 19); given = 10; }
      else if (p.total) { total = p.total; given = p.big ? ri(r, 5, 9) : ri(r, 1, 9); }
      else { total = ri(r, 3, 9); given = ri(r, 1, total - 1); }
      const ans = total - given;
      return { mode: 4, input: 'frame', q: `${J(total, '은', '는')} ${J(given, '과', '와')} 몇?`, sub: `구슬을 넣어서 ${J(total, '을', '를')} 만들어요.`, answer: ans, frame: { given, cap: total > 10 ? 20 : 10 },
        hint1: `${total}${josa(total, '이', '가')} 될 때까지 구슬을 넣어 봐요.`, steps: [`${J(given, '과', '와')} ${J(ans, '을', '를')} 모으면 ${total}`, `그래서 ${ans}`], type: p.teen ? 'splitTen' : total === 10 ? 'make10' : 'split' };
    },
    calc(r, p = {}, ctx = {}) {
      const q = makeCalc(r, p);
      const concrete = ctx.concrete !== false;
      return { mode: 5, input: 'pad', q: q.blank ? '빈칸에 알맞은 수는?' : '계산해 봐요', expr: q.expr, answer: q.ans, calc: q, vis: calcVis(q), showVis: concrete, type: q.type,
        hint1: calcHint(q), steps: calcSteps(q) };
    },
    story(r, p = {}) {
      const q = makeCalc(r, { ...p, op: p.kind === 'carry' ? '+' : p.kind === 'borrow' || p.kind === 'from10' ? '-' : p.op });
      const add = q.op === '+'; const tpl = pick(add ? C.stories.add : C.stories.sub, r);
      const fid0 = pick(['hyun', 'chorok', 'eunhoo'], r); const fid = tpl.text.includes('{F}') ? fid0 : null; const f = C.friends[fid0];
      const text = tpl.text.replace(/\{F\}/g, f.subj).replace('{a}', q.a).replace('{b}', q.b);
      const expr = `${q.a}${opSign(q.op)}${q.b}=□`;
      return { mode: 6, input: 'pad', q: text, answer: q.ans, calc: q, friend: fid, unit: tpl.unit, pic: tpl.pic, expr: '', storyExpr: expr,
        vis: { kind: 'items', a: q.a, b: q.b, op: q.op, emoji: tpl.pic }, type: q.type,
        hint1: `${add ? '모두 몇? 이니까 더하기' : '남은 것은? 이니까 빼기'}예요. 식: ${expr}`, steps: [expr.replace('□', q.ans), ...calcSteps(q).slice(0, 2)] };
    },
  };
  function genProblem(g, p, seed, ctx = {}) {
    const r = rngFrom(seed); const prob = GEN[g](r, p || {}, ctx);
    prob.g = g; prob.p = p || {}; prob.type = prob.type || g; prob.label = TYPE_LABEL[prob.type] || TYPE_LABEL[g] || g;
    if (ctx.eunhoo !== false && (g === 'calc' || g === 'story') && r() < 0.25) {
      const wrong = pick([prob.answer + 1, prob.answer - 1, prob.answer + 10].filter(x => x >= 0), r);
      prob.eunhoo = r() < 0.5 ? prob.answer : wrong;
    }
    return prob;
  }

  /* ================= 수업 만들기 ================= */
  const seedOf = (s, i, extra = '') => `${today()}|${L.u}|${L.d}|${s}|${i}${extra}`;
  function flattenItems(items) { const out = []; items.forEach(it => { for (let k = 0; k < (it.n || 1); k++) out.push(it); }); return out; }
  function dueWeak() {
    const td = today();
    return Object.entries(S.weak).filter(([, w]) => w.due && w.due <= td).sort((a, b) => a[1].due.localeCompare(b[1].due)).slice(0, 3);
  }
  function reviewItems() {
    const key = `${L.u}-${L.d}`;
    if (S.reviewPick && S.reviewPick.date === today() && S.reviewPick.key === key) return S.reviewPick.items;
    let items = dueWeak().map(([type, w]) => ({ g: w.g, p: w.p, type }));
    if (items.length < 3) {
      // 복습할 유형이 부족하면 지난 날·지난 단원 문제로 채워요
      const r = rngFrom(`${today()}|${key}|reviewfill`); const pool = [];
      const un = unitById(L.u);
      un.days.slice(0, L.d - 1).forEach(dd => { if (!dd.challenge) dd.items.forEach(it => pool.push({ g: it.g, p: it.p })); });
      READY.slice(0, READY.indexOf(un)).forEach(pu => pu.days.forEach(dd => dd.items.forEach(it => pool.push({ g: it.g, p: it.p }))));
      const need = pool.length ? 3 - items.length : 0;
      for (let k = 0; k < need; k++) items.push(pick(pool, r));
    }
    S.reviewPick = { date: today(), key, items }; save();
    return items;
  }
  function buildStep(s) {
    if (L.cache[s]) return L.cache[s];
    const id = STEPS[s].id; const un = unitById(L.u); const day = un.days[L.d - 1];
    let acts = [];
    if (id === 'greet') acts = [{ type: 'greet' }];
    else if (id === 'review') {
      const items = reviewItems();
      acts = items.length ? items.map((it, i) => ({ type: 'prob', review: true, prob: genProblem(it.g, it.p, seedOf(s, i, '|rv')) }))
        : [{ type: 'msg', text: '복습할 문제가 아직 없어요! 바로 오늘의 단원으로 가요 🚀' }];
    } else if (id === 'unit') {
      if (day.challenge) {
        const list = shuffle(flattenItems(day.items), rngFrom(seedOf(s, 'order')));
        acts = [{ type: 'msg', text: `${un.title} 마무리 도전! 10문제 중 8개를 맞히면 스티커를 받아요 🏁` }]
          .concat(list.map((it, i) => ({ type: 'prob', chal: true, prob: genProblem(it.g, it.p, seedOf(s, i), { eunhoo: false }) })));
      } else {
        acts = (day.concept || []).map(cc => ({ type: 'concept', card: cc }))
          .concat(flattenItems(day.items).map((it, i) => ({ type: 'prob', prob: genProblem(it.g, it.p, seedOf(s, i)) })));
      }
    } else if (id === 'flash') {
      const rung = S.ladder.rung; const lr = C.ladder[rung];
      acts = [0, 1, 2, 3, 4].map(i => ({ type: 'prob', flash: true, prob: genProblem('calc', lr.p, seedOf(s, i, `|r${rung}`), { concrete: rung < 7, eunhoo: false }) }));
    } else {
      const ex = un.explain[(L.d - 1) % un.explain.length];
      acts = [{ type: 'explain', ex, asker: L.d % 2 ? 'hyun' : 'chorok' }];
    }
    L.cache[s] = acts; return acts;
  }

  /* ================= 수업 진행 ================= */
  let L = null;
  function startLesson(u, d, s) {
    const lr = lockReason(); if (lr) return lockedScreen(lr);
    const un = unitById(u); if (!un || !un.ready) { u = READY[0].id; d = 1; s = 0; }
    if (d < 1 || d > unitById(u).days.length) d = 1;
    S.pos = { u, d, s }; if (!S.days.includes(today())) S.days.push(today()); save();
    L = { u, d, s, acts: [], i: 0, earned: 0, awarded: {}, first: {}, heard: {}, cache: {}, chal: { ok: 0, n: 0 }, flash: { ok: 0, n: 0 } };
    L.acts = buildStep(s);
    showAct();
  }
  function stepIntro() {
    const st = STEPS[L.s];
    render('lesson', `<div class="screen"><div class="reward"><div class="robot">${st.icon}</div><div class="bubble">다음은 ${st.name}!</div></div></div>`);
    const my = actToken;
    ko(`다음은 ${st.name}!`).then(() => sleep(300)).then(() => { if (my === actToken) showAct(); });
  }
  function nextAct() {
    L.i++;
    if (L.i < L.acts.length) return showAct();
    L.s++; S.pos.s = L.s; save();
    if (L.s >= STEPS.length) return finishDay();
    const lr = lockReason(); if (lr) return lockedScreen(lr);
    L.acts = buildStep(L.s); L.i = 0;
    stepIntro();
  }
  // 별: 한 번에 맞히면 1개, 다시 맞히면 0개, 문제당 한 번만, 하루 끝 보너스 3개, 하루치 합계 20개 이하
  const DAY_STAR_MAX = 20, DAY_BONUS = 3;
  function award(attempts) {
    const key = `${L.s}:${L.i}`;
    let n = attempts === 0 ? 1 : 0;
    if (L.awarded[key] || todayLog().stars >= DAY_STAR_MAX - DAY_BONUS) n = 0; // 이전 버튼으로 다시 풀어도 별은 한 번만
    L.awarded[key] = 1;
    if (n) {
      S.stars += n; L.earned += n; todayLog().stars += n; save();
      const el = document.querySelector('.topbar .stars'); if (el) el.textContent = `⭐ ${S.stars}`;
    }
    return n;
  }
  // 첫 번째 답으로 기록: 유형별 정답률, 틀린 유형 복습(1·3·7일), 마무리 도전·반짝 연산 점수
  function record(a, ok) {
    const key = `${L.s}:${L.i}`; if (L.first[key] !== undefined) return; L.first[key] = ok;
    const pr = a.prob; const t = pr.type;
    const st = S.stats[t] || (S.stats[t] = { label: pr.label, n: 0, ok: 0 }); st.n++; if (ok) st.ok++; st.label = pr.label;
    const lg = todayLog(); lg.n++; if (ok) lg.ok++;
    if (!ok) { const w = S.weak[t] || (S.weak[t] = { g: pr.g, p: pr.p, label: pr.label, streak: 0, wrong: 0 }); w.g = pr.g; w.p = pr.p; w.wrong++; w.streak = 0; w.due = addDays(1); }
    else if (a.review && S.weak[t] && S.weak[t].due && S.weak[t].due <= today()) {
      const w = S.weak[t]; w.streak++;
      if (w.streak >= 3) delete S.weak[t]; else w.due = addDays(w.streak === 1 ? 3 : 7);
    }
    if (a.chal) { L.chal.n++; if (ok) L.chal.ok++; }
    if (a.flash) { L.flash.n++; if (ok) L.flash.ok++; }
    save();
  }
  function flash(emoji) { const f = document.createElement('div'); f.className = 'feedback'; f.innerHTML = `<span>${emoji}</span>`; document.body.appendChild(f); setTimeout(() => f.remove(), 950); }

  function lessonFrame(inner, opts = {}) {
    const total = L.acts.length; const p = Math.round(L.i / total * 100); const un = unitById(L.u);
    return `<div class="screen">
      <div class="topbar">
        <button class="icon-btn" data-act="quit" aria-label="처음으로">🏠</button>
        <button class="icon-btn" data-act="prev" aria-label="이전 문제"${L.s === 0 && L.i === 0 ? ' disabled style="opacity:.35"' : ''}>◀</button>
        <div class="train">${STEPS.map((st, i) => `<div class="car${i < L.s ? ' done' : i === L.s ? ' now' : ''}" style="--p:${p}%">${i === L.s ? '<i></i>' : ''}</div>`).join('')}</div>
        <div class="stars">⭐ ${S.stars}</div>
      </div>
      <div class="step-name">${un.icon} ${esc(un.title)} ${L.d}일차 · ${STEPS[L.s].name}${opts.tag && opts.tag !== STEPS[L.s].name ? ` · ${esc(opts.tag)}` : ''}</div>
      <div class="stage${opts.split ? ' split' : ''}">${inner}</div>
    </div>`;
  }
  const baseHandlers = () => ({ quit: homeScreen, prev: prevAct });
  // 이전 문제로 (단계 첫 문제면 앞 단계의 마지막 문제로). 문제는 저장해 둔 그대로 다시 나와요.
  function prevAct() {
    hush();
    let s = L.s, i = L.i, acts = L.acts;
    do {
      if (i > 0) i--;
      else if (s > 0) { s--; acts = buildStep(s); i = acts.length - 1; }
      else return;
    } while (acts[i].type === 'msg' && (i > 0 || s > 0));
    if (acts[i].type === 'msg') return;
    L.s = s; L.i = i; L.acts = acts; S.pos.s = s; save();
    showAct();
  }
  function showAct() {
    const a = L.acts[L.i];
    ({ greet: actGreet, msg: actMsg, concept: actConcept, prob: actProb, explain: actExplain })[a.type](a);
  }
  function actMsg(a) {
    render('lesson', lessonFrame(`<div class="prompt"><div class="robot">🤖</div><div class="bubble">${esc(a.text)}</div></div>
      <div class="next-row"><button class="btn primary" data-act="next">좋아요 ▶</button></div>`), { ...baseHandlers(), next: nextAct });
    const my = actToken; ko(a.text.replace(/[^\p{L}\p{N}\s!?.,]/gu, '')).then(() => sleep(600)).then(() => { if (my === actToken) nextAct(); });
  }

  /* ---------- 그림 (10칸 상자, 묶음, 수직선, 짝꿍) ---------- */
  const CLS = ['a', 'b', 'c'];
  function framesHtml(parts, cap, xCount, id) {
    const total = parts.reduce((s, x) => s + x, 0); cap = cap || Math.max(10, Math.ceil(total / 10) * 10);
    const cells = []; parts.forEach((n, pi) => { for (let k = 0; k < n; k++) cells.push(CLS[pi] || 'a'); });
    const xs = xCount ? new Set(Array.from({ length: xCount }, (_, k) => total - 1 - k)) : new Set();
    let html = '';
    for (let f = 0; f < cap / 10; f++) {
      html += `<div class="frame">${Array.from({ length: 10 }, (_, k) => { const i = f * 10 + k; const c = cells[i]; return `<span class="cell${c ? ' ' + c : ''}${xs.has(i) ? ' x' : ''}" data-i="${i}"></span>`; }).join('')}</div>`;
    }
    return `<div class="frames"${id ? ` id="${id}"` : ''}>${html}</div>`;
  }
  function bundleHtml(n, opts = {}) {
    const t = Math.floor(n / 10), o = n % 10; let h = '';
    for (let k = 0; k < t; k++) h += `<span class="bundle${opts.count ? ' tap' : ''}" data-v="10"${opts.count ? ' data-act="cnt" data-arg="10"' : ''}>${'<i></i>'.repeat(10)}</span>`;
    for (let k = 0; k < o; k++) h += `<span class="one${opts.count ? ' tap' : ''}"${opts.count ? ' data-act="cnt" data-arg="1"' : ''}><i></i></span>`;
    return `<div class="base${opts.cls ? ' ' + opts.cls : ''}">${h}</div>`;
  }
  function itemsHtml(v) {
    const big = Math.max(v.a, v.b) > 20;
    const grp = (n, cls) => big ? bundleHtml(n, { cls: cls === 'ga' ? '' : 'bb' }) : `<div class="items ${cls}">${Array.from({ length: n }, () => `<span>${v.emoji}</span>`).join('')}</div>`;
    if (v.op === '+') return `<div class="vis-row">${grp(v.a, 'ga')}<b class="opm">+</b>${grp(v.b, 'gb')}</div>`;
    if (big) return `<div class="vis-row">${grp(v.a, 'ga')}<b class="opm">−</b>${grp(v.b, 'gx')}</div>`;
    return `<div class="items ga">${Array.from({ length: v.a }, (_, k) => `<span class="${k >= v.a - v.b ? 'gone' : ''}">${v.emoji}</span>`).join('')}</div>`;
  }
  function visHtml(v) {
    if (!v) return '';
    if (v.kind === 'frames') return framesHtml(v.parts, v.cap, v.x);
    if (v.kind === 'tens') return `<div id="cntbox">${bundleHtml(v.n, { count: v.count })}</div><div class="count-total" id="counted"></div>`;
    if (v.kind === 'base') return `<div class="vis-row">${bundleHtml(v.a)}<b class="opm">${v.op === '+' ? '+' : '−'}</b>${bundleHtml(v.b, { cls: 'bb' })}</div>`;
    if (v.kind === 'base2') return '';
    if (v.kind === 'items') return itemsHtml(v);
    if (v.kind === 'line') return `<div class="nline">${v.nums.map((n, k) => `<span class="${k === v.blank ? 'blank' : ''}">${k === v.blank ? '?' : n}</span>`).join('<i>›</i>')}</div>`;
    if (v.kind === 'pairs') { const pr = []; for (let k = 0; k < v.n; k += 2) pr.push(`<span class="pair${k + 1 >= v.n ? ' lone' : ''}">${v.emoji}${k + 1 < v.n ? v.emoji : ''}</span>`); return `<div class="pairs" id="pairs">${pr.join('')}</div>`; }
    return '';
  }
  function conceptVisHtml(v) {
    if (!v) return '';
    if (v.tens != null) return `<div class="vis-row">${bundleHtml(v.tens)}${v.plus ? `<b class="opm">+</b>${bundleHtml(v.plus, { cls: 'bb' })}` : ''}</div>`;
    if (v.frame) return framesHtml(v.frame);
    if (v.line) { const nums = []; for (let n = v.line[0]; n <= v.line[1]; n++) nums.push(n); return `<div class="nline">${nums.map(n => `<span>${n}</span>`).join('<i>›</i>')}</div>`; }
    if (v.pairs) return visHtml({ kind: 'pairs', n: v.pairs, emoji: '🦋' });
    return '';
  }

  /* ---------- 개념 카드 ---------- */
  function actConcept(a) {
    const cc = a.card; const idx = L.acts.filter(x => x.type === 'concept').indexOf(a) + 1; const n = L.acts.filter(x => x.type === 'concept').length;
    render('lesson', lessonFrame(`<div class="prompt concept">
        <div class="pic">${esc(cc.pic || '📘')}</div>
        <div class="bubble">${esc(cc.title)}</div>
        <div class="concept-text">${esc(cc.text)}</div>
        ${conceptVisHtml(cc.vis)}
        <div class="listen-row"><button class="listen" data-act="play" aria-label="다시 듣기">🔊</button></div>
      </div>
      <div class="next-row"><span class="muted">개념 카드 ${idx} / ${n}</span><button class="btn primary" data-act="next">알겠어요 ▶</button></div>`, { tag: '개념' }), {
      ...baseHandlers(), play: () => { hush(); ko(cc.text); }, next: nextAct,
    });
    const my = actToken;
    (async () => { if (idx === 1) await ko(`${robotName()}${josa(robotName(), '과', '와')} 함께 배워요. ${cc.title}!`); if (my === actToken) ko(cc.text); })();
  }

  /* ---------- 오늘의 수 (인사) ---------- */
  function actGreet() {
    const dt = new Date(); const n = dt.getDate(); const m = dt.getMonth() + 1;
    const prob = { g: 'today', type: 'today', label: '오늘의 수', mode: 4, input: 'frame', answer: n, frame: { given: 0, cap: Math.max(20, Math.ceil(n / 10) * 10) },
      q: `오늘은 ${m}월 ${n}일! 오늘의 수는 ${n}`, sub: `10칸 상자에 구슬 ${n}개를 넣어 봐요.`, hint1: '10칸 상자 하나에 10개씩 들어가요.', steps: n % 10 === 0 ? [`10칸 상자 ${n / 10}개를 가득 채워요.`] : n > 10 ? [`10칸 상자 ${Math.floor(n / 10)}개를 가득 채우고`, `구슬 ${n % 10}개를 더 넣어요.`] : [`구슬 ${n}개를 넣어요.`] };
    actProb({ type: 'prob', prob, greet: true });
  }

  /* ---------- 문제 화면 (모드 1~6 공통) ---------- */
  function answerArea(pr) {
    if (pr.input === 'choice') {
      if (pr.vis && pr.vis.kind === 'base2') return `<div class="choices cmp">${pr.choices.map(c => `<button class="choice cmpc" data-act="pick" data-arg="${esc(c)}"><b>${esc(c)}</b>${bundleHtml(c, { cls: 'mini' })}</button>`).join('')}</div>`;
      return `<div class="choices${pr.two ? ' two' : ''}">${pr.choices.map(c => `<button class="choice num" data-act="pick" data-arg="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    }
    if (pr.input === 'pad') {
      const len = String(pr.answer).length; const names = { 1: ['일'], 2: ['십', '일'], 3: ['백', '십', '일'] }[len] || [];
      return `<div class="padwrap"><div class="ansboxes">${names.map((nm, k) => `<div class="abox" data-k="${k}"><span id="d${k}"></span><small>${nm}의 자리</small></div>`).join('')}</div>
        <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button class="key" data-act="key" data-arg="${k}">${k}</button>`).join('')}
        <button class="key del" data-act="del" aria-label="지우기">⌫</button><button class="key" data-act="key" data-arg="0">0</button><button class="key ok" data-act="ok" aria-label="확인">✔</button></div></div>`;
    }
    // frame: 10칸 상자에 구슬 넣기 (끌어놓기 또는 톡 누르기)
    return `<div class="framewrap">${framesHtml([pr.frame.given], pr.frame.cap, 0, 'fz')}
      <div class="tray"><button class="marble" data-act="add" aria-label="구슬 넣기"></button><span class="muted">구슬을 끌어다 놓거나 눌러요</span></div>
      <div class="next-row"><button class="btn small" data-act="clear">다시 담기</button><button class="btn good" data-act="ok">✔ 다 넣었어요</button></div></div>`;
  }
  const sayGuess = pr => { const w = `${pr.eunhoo}${pr.unit || ''}`; return w + josa(w, '이라고', '라고'); };
  function actProb(a) {
    const pr = a.prob; const att = { n: 0, done: false }; let typed = '';
    const tag = a.greet ? '오늘의 수' : a.flash ? `사다리 ${S.ladder.rung + 1}칸` : a.chal ? '마무리 도전' : a.review ? '복습' : MODES[pr.mode];
    const f = pr.friend && C.friends[pr.friend];
    const showVis = pr.vis && (pr.mode !== 5 || pr.showVis);
    const left = `<div class="prompt">
        ${a.review ? '<div class="muted" style="font-weight:800">🔁 지난번에 어려웠던 문제예요</div>' : ''}
        ${pr.mode === 6 ? `<div class="say">${f ? friendHtml(pr.friend, true) : ''}<span class="text story">${esc(pr.q)}</span></div>` : `<div class="bubble">${esc(pr.q)}</div>`}
        ${pr.sub ? `<div class="muted" style="font-weight:700">${esc(pr.sub)}</div>` : ''}
        ${pr.expr ? `<div class="expr" id="expr">${esc(pr.expr).replace('□', '<span class="qbox">□</span>')}</div>` : ''}
        <div id="visbox"${showVis ? '' : ' hidden'}>${pr.input === 'frame' ? '' : visHtml(pr.vis)}</div>
        ${pr.mode === 5 && !pr.showVis && pr.vis ? '<button class="btn small" data-act="helper">🧮 10칸 상자 도우미</button>' : ''}
        ${pr.eunhoo != null ? `<div class="say">${friendHtml('eunhoo')}<span class="text">나는 ${esc(sayGuess(pr))} 생각해. 너는?</span></div>` : ''}
        <div class="hintbox" id="hint" hidden></div>
        <div class="listen-row"><button class="listen" data-act="play" aria-label="다시 듣기">🔊</button></div>
      </div>`;
    const right = `<div class="prompt">${answerArea(pr)}<div class="next-row" id="nextRow" hidden><button class="btn primary" data-act="next">다음 ▶</button></div></div>`;
    const sayQ = () => ko([pr.q, pr.expr ? pr.expr.replace('=□', '=?') : '', pr.sub || ''].filter(Boolean).join(' '));
    // 맞았을 때
    const right_ = async () => {
      att.done = true; const my = actToken; ding();
      const n = award(att.n); flash(n ? '⭐' : '👍');
      if (!a.greet) record(a, att.n === 0);
      const hint = document.getElementById('hint'); if (hint) { hint.hidden = true; }
      document.querySelectorAll('.qbox').forEach(q => { q.textContent = pr.answer; q.classList.add('ok'); });
      let msg = praise();
      if (pr.eunhoo != null) msg += pr.eunhoo === pr.answer ? ' 은후도 맞았네!' : ` 은후는 ${sayGuess(pr)} 했지만, ${S.settings.childName}${josa(S.settings.childName, '이', '가')} 맞았어!`;
      const ansSay = pr.expr ? pr.expr.replace('□', pr.answer) : pr.storyExpr ? pr.storyExpr.replace('□', pr.answer) : `${pr.answer}${pr.unit || ''}`;
      hush(); await ko(`${msg} ${ansSay}`); await sleep(350); if (my === actToken) nextAct();
    };
    // 틀렸을 때: 힌트 1 → 풀이 과정 → 답 보여주고 넘어가기 ("땡"·빨간 X 없음)
    const wrong_ = async () => {
      const my = actToken; if (!a.greet && att.n === 0) record(a, false);
      att.n++; hush();
      const hint = document.getElementById('hint'); hint.hidden = false;
      if (att.n === 1) {
        hint.innerHTML = `💡 ${esc(pr.hint1)}`;
        const vb = document.getElementById('visbox'); if (vb && vb.hidden && pr.vis) vb.hidden = false;
        if (pr.vis && pr.vis.kind === 'pairs') document.getElementById('pairs')?.classList.add('show');
        await ko(`${pick(LINES.retry || ['다시 해볼까?'])} ${pr.hint1}`);
      } else if (att.n === 2) {
        hint.innerHTML = `🪜 ${pr.steps.map(esc).join('<br>')}`;
        const vb = document.getElementById('visbox'); if (vb && vb.hidden && pr.vis) vb.hidden = false;
        await ko(`같이 풀어 보자. ${pr.steps.join(' ')}`);
      } else {
        att.done = true; award(3); flash('👍');
        hint.innerHTML = `✨ 정답은 <b>${esc(pr.answer)}</b><br>${pr.steps.map(esc).join('<br>')}`;
        document.querySelectorAll('.qbox').forEach(q => { q.textContent = pr.answer; q.classList.add('ok'); });
        document.querySelectorAll('.choice').forEach(c => { if (c.dataset.arg === String(pr.answer)) c.classList.add('glow'); });
        if (pr.input === 'frame') fillTo(pr.answer);
        if (pr.input === 'pad') { typed = String(pr.answer); showTyped(); }
        document.getElementById('nextRow').hidden = false;
        await ko(`${LINES.showAnswer || '괜찮아!'} 정답은 ${pr.answer}${pr.unit ? pr.unit : ''}. 다음에 또 해보자!`);
      }
      if (my !== actToken) return;
    };
    const check = v => { if (att.done) return; if (String(v) === String(pr.answer)) right_(); else wrong_(); };
    // 구슬 (frame)
    let fz = null; const added = () => fz ? fz.filter(x => x === 'b').length : 0;
    const drawFrame = () => { document.querySelectorAll('#fz .cell').forEach((c, i) => { c.className = 'cell' + (fz[i] === 'g' ? ' a' : fz[i] === 'b' ? ' b' : ''); }); };
    const addOne = () => { const i = fz.indexOf(''); if (i < 0) return; fz[i] = 'b'; pop(); drawFrame(); };
    function fillTo(k) { fz = fz.map(x => (x === 'b' ? '' : x)); for (let j = 0; j < k; j++) { const i = fz.indexOf(''); if (i >= 0) fz[i] = 'b'; } drawFrame(); }
    const handlers = {
      ...baseHandlers(),
      play: () => { hush(); sayQ(); },
      next: nextAct,
      helper: (x, btn) => { const vb = document.getElementById('visbox'); vb.hidden = false; btn.remove(); },
      pick: (arg, btn) => { if (att.done || btn.classList.contains('wrong')) return; if (String(arg) === String(pr.answer)) { btn.classList.add('right'); check(arg); } else { btn.classList.add('wrong'); check(arg); } },
      key: k => { if (att.done) return; const len = String(pr.answer).length; if (typed.length >= len) return; typed += k; showTyped(); },
      del: () => { if (att.done) return; typed = typed.slice(0, -1); showTyped(); },
      ok: () => {
        if (att.done) return;
        if (pr.input === 'pad') { if (typed.length < String(pr.answer).length) { toast('칸을 모두 채워요'); return; } const v = +typed; typed = ''; if (String(v) !== String(pr.answer)) setTimeout(showTyped, 700); check(v); }
        else check(added());
      },
      add: () => { if (att.done) return; addOne(); },
      clear: () => { if (att.done) return; fillTo(0); },
      cnt: (v, el) => { if (el.classList.contains('counted')) return; el.classList.add('counted'); const tot = [...document.querySelectorAll('#cntbox .counted')].reduce((s, x) => s + (x.classList.contains('bundle') ? 10 : 1), 0); const c = document.getElementById('counted'); if (c) c.textContent = tot; hush(); ko(String(tot)); },
      cell: () => {},
    };
    function showTyped() { const len = String(pr.answer).length; for (let k = 0; k < len; k++) { const el = document.getElementById('d' + k); if (el) el.textContent = typed[k] || ''; } }
    render('lesson', lessonFrame(left + right, { split: true, tag }), handlers);
    if (pr.input === 'frame') {
      fz = Array.from({ length: pr.frame.cap }, (_, i) => (i < pr.frame.given ? 'g' : ''));
      const box = document.getElementById('fz');
      // 칸을 누르면 그 칸까지 채우기, 넣은 구슬을 누르면 그 뒤로 빼기 (너그럽게)
      box.addEventListener('click', e => {
        const c = e.target.closest('.cell'); if (!c || att.done) return; const i = +c.dataset.i; const f0 = Math.floor(i / 10) * 10;
        if (fz[i] === 'b') { for (let j = i; j < f0 + 10; j++) if (fz[j] === 'b') fz[j] = ''; }
        else if (fz[i] === '') { for (let j = f0; j <= i; j++) if (fz[j] === '') fz[j] = 'b'; }
        pop(); drawFrame();
      });
      setupDrag(document.querySelector('.marble'), box, () => { if (!att.done) addOne(); });
      drawFrame();
    }
    const my = actToken;
    (async () => {
      if (!a.greet && !L.heard[pr.mode + (a.flash ? 'f' : '')] && !a.chal) { L.heard[pr.mode + (a.flash ? 'f' : '')] = 1; if (a.flash) await ko('반짝 연산! 천천히 해도 돼요.'); }
      if (my !== actToken) return; await sayQ();
      if (my === actToken && pr.eunhoo != null) await ko(`은후는 ${sayGuess(pr)} 생각한대. ${S.settings.childName}${josa(S.settings.childName, '은', '는')}?`);
    })();
  }
  // 구슬 끌어놓기: 상자 근처에 놓으면 자석처럼 들어가요. 그냥 눌러도 들어가요.
  function setupDrag(marble, target, onDrop) {
    if (!marble) return;
    let ghost = null, sx = 0, sy = 0, moved = false;
    marble.addEventListener('pointerdown', e => {
      e.preventDefault(); sx = e.clientX; sy = e.clientY; moved = false;
      ghost = document.createElement('div'); ghost.className = 'ghost'; document.body.appendChild(ghost);
      const mv = ev => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) moved = true; ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; };
      mv(e);
      const up = ev => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        if (ghost) { ghost.remove(); ghost = null; }
        const rc = target.getBoundingClientRect(); const pad_ = 90;
        const near = ev.clientX > rc.left - pad_ && ev.clientX < rc.right + pad_ && ev.clientY > rc.top - pad_ && ev.clientY < rc.bottom + pad_;
        if (moved && near) onDrop();
        marble.dataset.moved = moved ? '1' : '';
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
    marble.addEventListener('click', e => { if (marble.dataset.moved) { e.stopPropagation(); marble.dataset.moved = ''; } }, true);
  }

  /* ---------- 설명하기 (현이·초록이에게 가르쳐주기) ---------- */
  function actExplain(a) {
    const ex = a.ex; const f = C.friends[a.asker]; const q = `${callName()}, ${ex.q}`; let closed = false;
    const finish = async (said, self) => {
      if (closed) return; closed = true; const my = actToken;
      const ok = said.length ? koMatch(said, ex.keywords) : !!self;
      const n = award(0); flash(n ? '⭐' : '👍'); ding();
      if (S.settings.explainSave !== false && S.settings.explainSave !== 'false') { S.explains.unshift({ date: today(), who: f.name, q: ex.q, said: said[0] || (self ? '(말했어요 버튼)' : ''), ok }); S.explains = S.explains.slice(0, 14); save(); }
      document.getElementById('model').hidden = false;
      document.getElementById('nextRow').hidden = false;
      const thanks = `${f.call || f.name}${josa(f.call || f.name, '이', '가')}`;
      await ko(ok ? `우와! ${thanks} 이제 알겠대. 고마워!` : `고마워! 이렇게도 말할 수 있어. ${ex.model}`);
      if (my === actToken) { await sleep(400); }
    };
    render('lesson', lessonFrame(`<div class="prompt">
        <div class="say">${friendHtml(a.asker, true)}<span class="text">${esc(q)}</span></div>
        <div class="muted" style="font-weight:700">${esc(f.call || f.name)}에게 가르쳐 줘요. 맞고 틀리고는 없어요!</div>
        <div class="hintbox" id="model" hidden>💬 이렇게 말할 수도 있어요<br><b>${esc(ex.model)}</b></div>
        <div class="listen-row"><button class="listen" data-act="play">🔊</button></div>
      </div><div class="prompt">
        ${canListen() ? `<div class="mic-area"><button class="mic" data-mic="1" aria-label="누르고 말하기">🎤</button><div class="heard" id="heard">버튼을 누르고 말해요</div></div>` : ''}
        <button class="btn good" data-act="selfok">🗣️ 말했어요!</button>
        <div class="next-row" id="nextRow" hidden><button class="btn primary" data-act="next">다음 ▶</button></div>
      </div>`, { split: true, tag: '가르쳐주기' }), {
      ...baseHandlers(), play: () => { hush(); ko(q); }, next: nextAct,
      selfok: () => finish([], true),
    });
    const b = document.querySelector('[data-mic]');
    if (b) {
      let busy = false;
      b.addEventListener('pointerdown', async e => {
        e.preventDefault(); if (busy || closed) return; busy = true; hush(); b.classList.add('on');
        const h = document.getElementById('heard'); if (h) h.textContent = '듣고 있어요…';
        const my = actToken; const alts = await recognize(); busy = false; b.classList.remove('on');
        if (my !== actToken) return;
        if (micDenied) { toast('마이크 권한이 없어요. "말했어요" 버튼을 눌러요'); b.parentElement.remove(); return; }
        if (!alts.length) { if (h) h.textContent = '잘 안 들렸어요. 한 번 더!'; return; }
        if (h) h.textContent = `들린 말: “${alts[0]}”`;
        finish(alts, false);
      });
      const up = () => setTimeout(stopRec, 250);
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }
    ko(`${f.name}${josa(f.name, '이', '가')} 물어봐요. ${q}`);
  }

  /* ================= 하루 끝 ================= */
  function confetti() {
    const em = ['⭐', '🌟', '🎉', '✨'];
    for (let i = 0; i < 24; i++) {
      const c = document.createElement('div'); c.className = 'confetti'; c.textContent = pick(em);
      c.style.left = Math.random() * 100 + 'vw'; c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's'; c.style.animationDelay = Math.random() * .6 + 's';
      document.body.appendChild(c); setTimeout(() => c.remove(), 4200);
    }
  }
  function nextReady(u) { const i = READY.findIndex(x => x.id === u); return READY[(i + 1) % READY.length].id; }
  // 연산 사다리: 하루 한 번, 반짝 연산 5문제의 첫 답 정답률이 기준 이상인 날이 연속으로 모이면 다음 칸
  function ladderCheck() {
    const LD = S.ladder; if (L.flash.n < 5 || LD.lastDate === today()) return null;
    const pctNow = Math.round(L.flash.ok / L.flash.n * 100); LD.lastDate = today();
    LD.hist.push({ date: today(), rung: LD.rung, pct: pctNow }); LD.hist = LD.hist.slice(-60);
    if (pctNow >= (Number(S.settings.ladderPct) || 90)) LD.streak++; else LD.streak = 0;
    if (LD.streak >= (Number(S.settings.ladderDays) || 3) && LD.rung < C.ladder.length - 1) { LD.rung++; LD.streak = 0; LD.badges[LD.rung] = today(); return LD.rung; }
    return null;
  }
  function finishDay() {
    const { u, d } = L; const un = unitById(u); const day = un.days[d - 1];
    S.done[`${u}-${d}`] = today();
    let newSticker = false; let chalMsg = '';
    if (day.challenge && L.chal.n) {
      S.challenge[u] = { date: today(), ok: L.chal.ok, n: L.chal.n };
      if (L.chal.ok >= 8 && !S.stickers[u]) { S.stickers[u] = today(); newSticker = true; }
      chalMsg = L.chal.ok >= 8 ? `마무리 도전 ${L.chal.ok} / ${L.chal.n} 성공!` : `마무리 도전 ${L.chal.ok} / ${L.chal.n}. 다음에 다시 도전해 봐요!`;
    }
    const up = ladderCheck();
    let nu = u, nd = d + 1; if (nd > un.days.length) { nd = 1; nu = nextReady(u); }
    S.pos = { u: nu, d: nd, s: 0 };
    const bonus = Math.max(0, Math.min(DAY_BONUS, DAY_STAR_MAX - todayLog().stars));
    S.stars += bonus; L.earned += bonus; todayLog().stars += bonus; save();
    render('reward', `<div class="screen"><div class="reward">
      <div class="friends">${Object.keys(C.friends).map(id => friendHtml(id, true)).join('')}</div>
      <div class="bubble">오늘 수학 끝! 정말 잘했어, ${esc(callName())}!<small>내일 또 만나요 👋</small></div>
      ${L.earned ? `<div class="big-stars">⭐ +${L.earned}</div>` : '<div class="bubble">오늘 별은 다 모았어요! ⭐<small>별은 하루에 20개까지 받아요</small></div>'}
      ${bonus ? `<div class="muted" style="font-weight:800;margin-top:-10px">끝까지 한 보너스 ⭐${bonus} 포함</div>` : ''}
      ${chalMsg ? `<div class="bubble">🏁 ${esc(chalMsg)}</div>` : ''}
      ${newSticker ? `<div class="sticker-new">${un.sticker}</div><div class="bubble">${esc(un.title)} 스티커를 받았어요!</div>` : ''}
      ${up != null ? `<div class="sticker-new">🏅</div><div class="bubble">연산 사다리 ${up + 1}칸으로 올라갔어요!<small>${esc(C.ladder[up].name)}</small></div>` : ''}
      ${un.mission ? `<div class="card mission">🏠 집에서 하는 수학 미션<br>${esc(un.mission)}</div>` : ''}
      <div class="home-links">
        <button class="btn" data-act="ladder">🪜 연산 사다리</button>
        <button class="btn" data-act="stickers">📒 스티커북</button>
        <button class="btn primary" data-act="home">끝!</button>
      </div>
    </div></div>`, { home: homeScreen, stickers: stickerScreen, ladder: ladderScreen });
    confetti(); tone([523, 659, 784, 1046], 0.16);
    ko(`오늘 수학 끝! 정말 잘했어, ${callName()}. ${newSticker ? '스티커도 받았어!' : up != null ? '연산 사다리도 한 칸 올라갔어!' : '내일 또 만나!'}`);
  }

  /* ================= 아빠 화면 ================= */
  function gateScreen(next) {
    const a = 3 + Math.floor(Math.random() * 7), b = 3 + Math.floor(Math.random() * 7);
    render('gate', `<div class="screen"><div class="topbar"><button class="icon-btn" data-act="home">🏠</button></div>
      <div class="gate"><div class="card"><b>어른 확인</b><div style="font-size:40px;font-weight:900">${a} × ${b} = ?</div>
      <input id="ans" inputmode="numeric" autocomplete="off"><button class="btn primary" data-act="ok">확인</button></div></div></div>`, {
      home: homeScreen,
      ok: () => { if (+document.getElementById('ans').value === a * b) next(); else { toast('다시 계산해 보세요'); gateScreen(next); } },
    });
    setTimeout(() => { const i = document.getElementById('ans'); if (i) { i.focus(); i.addEventListener('keydown', e => { if (e.key === 'Enter') H.ok(); }); } }, 50);
  }
  function restore(txt) {
    txt = String(txt || '').trim(); let o = null;
    try { o = JSON.parse(txt); } catch (e) { try { o = JSON.parse(decodeURIComponent(escape(atob(txt)))); } catch (e2) { o = null; } }
    if (!o || !o.pos || o.pos.u === undefined) return false; // 영어 앱 백업은 받지 않아요
    S = merge(o); save(); return true;
  }
  /* 새 버전 확인·적용 (진도·별·설정은 localStorage에 그대로 남아요) */
  const verNum = v => String(v || '0').split('.').map(Number);
  const isNewer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  let latestVer = null;
  async function checkUpdate() {
    const r = await fetch('app.js?check=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('fetch');
    const m = (await r.text()).match(/APP_VERSION = '([\d.]+)'/);
    latestVer = m ? m[1] : null; return latestVer;
  }
  async function applyUpdate() {
    toast('새 버전을 받는 중이에요…');
    const files = ['./', 'index.html', 'app.js', 'content.js', 'style.css', 'sw.js', 'manifest.webmanifest', '기획서.md'];
    try { await Promise.all(files.map(u => fetch(encodeURI(u), { cache: 'reload' }).catch(() => {}))); } catch (e) { /* */ }
    try { if (navigator.serviceWorker) for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister(); } catch (e) { /* */ }
    try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch (e) { /* */ }
    location.replace(location.pathname + '?v=' + Date.now());
  }
  /* 기획·변경 기록: 앱 안의 기획서.md를 읽어서 보여줘요 */
  function mdToHtml(md) {
    const inl = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
    const out = []; const lines = md.split('\n'); let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (l.startsWith('```')) { const buf = []; i++; while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]); i++; out.push(`<pre class="spec-code">${esc(buf.join('\n'))}</pre>`); continue; }
      if (/^#{1,3} /.test(l)) { const n = l.match(/^#+/)[0].length; out.push(`<h${n + 1}>${inl(l.replace(/^#+ /, ''))}</h${n + 1}>`); i++; continue; }
      if (l.startsWith('|')) {
        const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
        const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const body = rows.filter((r, k) => k !== 1);
        out.push(`<div class="spec-table"><table>${body.map((r, k) => `<tr>${cells(r).map(c => k === 0 ? `<th>${inl(c)}</th>` : `<td>${inl(c)}</td>`).join('')}</tr>`).join('')}</table></div>`); continue;
      }
      if (/^(- |\d+\. )/.test(l)) {
        const ol = /^\d+\. /.test(l); const items = [];
        while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\d+\. )/, ''));
        out.push(`<${ol ? 'ol' : 'ul'} class="list">${items.map(x => `<li>${inl(x)}</li>`).join('')}</${ol ? 'ol' : 'ul'}>`); continue;
      }
      if (l.trim()) out.push(`<p>${inl(l)}</p>`);
      i++;
    }
    return out.join('');
  }
  function specScreen() {
    render('spec', `<div class="screen"><div class="parent">
      <div class="topbar"><button class="icon-btn" data-act="back" aria-label="아빠 화면으로">⬅️</button><h2 class="title">📋 기획·변경 기록</h2><div class="spacer"></div><span class="muted">v${APP_VERSION}</span></div>
      <div class="card spec" id="spec">불러오는 중…</div></div></div>`, { back: parentScreen });
    const show = md => { const el = document.getElementById('spec'); if (el) el.innerHTML = mdToHtml(md); };
    if (window.__SPEC_INLINE) return show(window.__SPEC_INLINE);
    fetch(encodeURI('기획서.md')).then(r => { if (!r.ok) throw 0; return r.text(); }).then(show)
      .catch(() => { const el = document.getElementById('spec'); if (el) el.textContent = '기획서.md 파일을 찾지 못했어요. 앱 폴더에 기획서.md가 있는지 확인해 주세요.'; });
  }
  function exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(S)))); }
  function parentScreen() {
    fixPos();
    const weekAgo = addDays(-6);
    const days7 = S.days.filter(d => d >= weekAgo).length;
    const logs7 = Object.entries(S.log).filter(([d]) => d >= weekAgo).map(([, v]) => v);
    const n7 = logs7.reduce((s, v) => s + (v.n || 0), 0), ok7 = logs7.reduce((s, v) => s + (v.ok || 0), 0);
    const min = Math.round(todayLog().sec / 60);
    const st = S.settings; const code = posCode(S.pos); const un = unitById(S.pos.u);
    const types = Object.entries(S.stats).map(([t, v]) => ({ t, ...v, rate: v.n ? Math.round(v.ok / v.n * 100) : 0 })).sort((a, b) => a.rate - b.rate || b.n - a.n);
    const LD = S.ladder;
    render('parent', `<div class="screen"><div class="parent">
      <div class="topbar"><button class="icon-btn" data-act="home">🏠</button><h2 class="title">아빠 화면</h2><div class="spacer"></div><button class="btn small" data-act="spec">📋 기획·변경 기록</button><span class="muted">v${APP_VERSION}</span></div>
      <div class="card"><h3>이번 주 (최근 7일)</h3><div class="kv">
        <div>학습한 날<b>${days7}일</b></div><div>푼 문제<b>${n7}개</b></div><div>한 번에 맞힘<b>${n7 ? Math.round(ok7 / n7 * 100) : 0}%</b></div><div>오늘 사용<b>${min}분</b></div><div>연속<b>${streak()}일</b></div>
      </div></div>
      <div class="card"><h3>약한 유형 (유형별 정답률)</h3>
        ${types.length ? `<div class="spec-table"><table><tr><th>유형</th><th>한 번에 맞힘</th><th>푼 문제</th><th>다음 복습</th></tr>${types.map(x => `<tr><td>${esc(x.label)}</td><td><div class="rate"><i style="width:${x.rate}%;background:${x.rate < 70 ? 'var(--bad)' : x.rate < 90 ? 'var(--star)' : 'var(--good)'}"></i><span>${x.rate}%</span></div></td><td>${x.n}</td><td>${S.weak[x.t] ? `${esc(S.weak[x.t].due)}` : ''}</td></tr>`).join('')}</table></div>` : '<p class="muted">아직 푼 문제가 없어요</p>'}
        <p class="muted">틀린 유형은 다른 숫자로 1·3·7일 뒤 복습에 나와요. 복습에서 3번 연속 맞히면 목록에서 빠져요.</p></div>
      <div class="card"><h3>전체</h3><div class="kv">
        <div>누적 학습일<b>${S.days.length}일</b></div><div>별<b>${S.stars}개</b></div><div>스티커<b>${Object.keys(S.stickers).length} / ${U.length}</b></div><div>연산 사다리<b>${LD.rung + 1}칸</b></div>
      </div></div>
      <div class="card"><h3>앱 업데이트</h3>
        <p>이 기기의 앱: <b>v${APP_VERSION}</b> <span id="verInfo" class="muted">${latestVer ? (isNewer(latestVer, APP_VERSION) ? `· 새 버전 v${latestVer}이 있어요!` : '· 최신 버전이에요') : ''}</span></p>
        <div class="row" style="flex-wrap:wrap"><button class="btn small" data-act="checkver">🔄 새 버전 확인</button>
          <button class="btn small primary" data-act="doupdate" id="updBtn"${latestVer && isNewer(latestVer, APP_VERSION) ? '' : ' hidden'}>⬇️ 지금 업데이트</button></div>
        <p class="muted">업데이트해도 진도·별·보상·설정은 그대로 남아요. 인터넷이 연결돼 있어야 해요.</p>
      </div>
      <div class="card"><h3>🏫 지금 학교 단원</h3>
        <div class="form"><label>학교에서 배우는 단원<select id="school">${READY.map(x => `<option value="${x.id}"${S.pos.u === x.id ? ' selected' : ''}>${esc(unitLabel(x))}</option>`).join('')}</select></label></div>
        <div class="row" style="margin-top:10px"><button class="btn small primary" data-act="school">이 단원 1일차부터 시작</button></div>
        <p class="muted">“오늘 수학”이 이 단원 1일차부터 시작해요. 완료 기록·별·스티커는 그대로예요. (나머지 단원은 v0.2·v0.3에서 열려요)</p></div>
      <div class="card"><h3>진도 조정</h3>
        <p>지금 진도: <b>${esc(un.title)} ${S.pos.d}일차 · ${STEPS[S.pos.s].name}</b> <span class="muted">(코드 ${code})</span></p>
        <div class="form">
          <label>단원<select id="adjU">${READY.map(x => `<option value="${x.id}"${S.pos.u === x.id ? ' selected' : ''}>${unitNo(x)}. ${esc(unitLabel(x))} (${doneCount(x.id)}/${x.days.length}일)</option>`).join('')}</select></label>
          <label>일차<select id="adjD">${Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}"${S.pos.d === i + 1 ? ' selected' : ''}>${i + 1}일차</option>`).join('')}</select></label>
          <label>단계<select id="adjS">${STEPS.map((x, i) => `<option value="${i}"${S.pos.s === i ? ' selected' : ''}>${i + 1}. ${x.name}</option>`).join('')}</select></label>
          <label style="grid-template-columns:auto 1fr"><input type="checkbox" id="adjMark" style="width:24px;min-height:24px">이 단원의 앞 일차는 완료, 뒤 일차는 미완료로 맞추기</label>
        </div>
        <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn small primary" data-act="adjpos">이 진도로 바꾸기</button>
          <button class="btn small" data-act="resetprog">진도 초기화</button></div>
        <p class="muted">진도 초기화: 진도·완료한 날·스티커·복습·정답률·연산 사다리를 처음으로 돌려요. 별·받은 보상·설정은 그대로예요.</p>
      </div>
      <div class="card"><h3>🪜 연산 사다리 조정</h3>
        <p>지금: <b>${LD.rung + 1}칸 ${esc(C.ladder[LD.rung].name)}</b> · 기준을 넘은 날 ${LD.streak}일 연속</p>
        <div class="form">
          <label>칸<select id="rung">${C.ladder.map((l, i) => `<option value="${i}"${LD.rung === i ? ' selected' : ''}>${i + 1}. ${esc(l.name)} (${esc(l.ex)})</option>`).join('')}</select></label>
          <label>올라가는 기준(일)<select data-set="ladderDays">${[2, 3, 4, 5].map(v => `<option value="${v}"${Number(st.ladderDays) === v ? ' selected' : ''}>${v}일 연속</option>`).join('')}</select></label>
          <label>정답률 기준<select data-set="ladderPct">${[80, 90, 100].map(v => `<option value="${v}"${Number(st.ladderPct) === v ? ' selected' : ''}>${v}% 이상</option>`).join('')}</select></label>
        </div>
        <div class="row" style="margin-top:10px"><button class="btn small primary" data-act="setrung">이 칸으로 바꾸기</button></div>
        <p class="muted">반짝 연산은 하루 5문제라서 90%는 5문제를 모두 한 번에 맞혀야 해요. 너무 느리게 올라가면 80%로 바꿔 주세요.</p>
        ${LD.hist.length ? `<p class="muted">최근: ${LD.hist.slice(-7).map(h => `${h.date.slice(5)} ${h.rung + 1}칸 ${h.pct}%`).join(' · ')}</p>` : ''}
      </div>
      <div class="card"><h3>별 조정</h3>
        <p>지금 별: <b style="font-size:24px">${S.stars}개</b> <span class="muted">(현재 목표에 모은 별 ${Math.max(0, S.stars - S.goalBase)}개 · 오늘 ${todayLog().stars}개 / 하루 최대 ${DAY_STAR_MAX}개)</span></p>
        <div class="row" style="flex-wrap:wrap"><button class="btn small" data-act="star" data-arg="-10">−10</button><button class="btn small" data-act="star" data-arg="-1">−1</button><button class="btn small" data-act="star" data-arg="1">+1</button><button class="btn small" data-act="star" data-arg="10">+10</button></div>
        <div class="code-row" style="margin-top:10px"><input id="starSet" type="number" min="0" placeholder="개수"><button class="btn small primary" data-act="starset">이 개수로 맞추기</button></div>
      </div>
      <div class="card"><h3>받은 보상 (${S.rewards.length}개)</h3>
        ${S.rewards.length ? `<ol class="list">${S.rewards.map((r, i) => `<li>${esc(r.date)} — ${esc(r.text)} (별 ${r.stars}개) <button class="btn small" style="min-height:36px;padding:4px 10px" data-act="delrw" data-arg="${i}">삭제</button></li>`).join('')}</ol>` : '<p class="muted">아직 없어요. 목표를 달성하면 아래 설정의 “🎁 보상 줬어요”를 눌러 기록하세요.</p>'}
      </div>
      <div class="card"><h3>🗣️ 설명하기 기록 (최근 14개)</h3>
        ${S.explains.length ? `<ol class="list">${S.explains.map(x => `<li>${esc(x.date)} ${esc(x.who)}: “${esc(x.q)}” → <b>${esc(x.said || '(들리지 않음)')}</b>${x.ok ? ' 👍' : ''}</li>`).join('')}</ol>` : '<p class="muted">아직 없어요. 설명하기 단계에서 윤이가 말한 내용이 글자로 남아요.</p>'}
        <p class="muted">글자 기록은 이 태블릿 안에만 저장돼요. 목소리 녹음 저장은 v0.4에서 추가해요.</p>
      </div>
      <div class="card"><h3>진도 옮기기 (기기끼리 연동이 안 될 때)</h3>
        <p>이 기기의 현재 진도 코드: <b style="font-size:24px">${code}</b> <span class="muted">(단원-일차-단계)</span></p>
        <div class="code-row"><input id="pcode" placeholder="예: 6-3-1"><button class="btn small primary" data-act="setpos">이 진도로 맞추기</button></div>
        <p class="muted">별·스티커·복습 기록까지 모두 옮기려면 아래 백업 코드를 복사해 다른 기기의 같은 칸에 붙여넣고 “가져오기”를 누르세요.</p>
        <textarea id="backup" placeholder="백업 코드"></textarea>
        <div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="btn small" data-act="export">내보내기(복사)</button><button class="btn small" data-act="import">가져오기</button>
          <button class="btn small" data-act="savefile">💾 백업 파일 저장</button><label class="btn small" style="cursor:pointer">📂 백업 파일 불러오기<input type="file" id="loadFile" accept=".json,application/json,text/plain" hidden></label></div>
        <p class="muted">앱을 지웠다 다시 설치하기 전에는 “백업 파일 저장”을 꼭 눌러두세요.</p>
      </div>
      <div class="card"><h3>설정</h3><div class="form">
        <label>아이 이름<input data-set="childName" value="${esc(st.childName)}"></label>
        <label>로봇 친구 이름<input data-set="robotName" value="${esc(st.robotName)}"></label>
        <label>한국어 목소리<select data-set="koVoice"><option value="">자동 (구글 음성 우선)</option>${koVoices().map(v => `<option value="${esc(v.voiceURI || v.name)}"${st.koVoice === (v.voiceURI || v.name) ? ' selected' : ''}>${esc(v.name)}${v.localService ? '' : ' (온라인)'}</option>`).join('')}</select></label>
        <label>한국어 말 속도<select data-set="koRate">${[['0.8', '천천히'], ['0.9', '보통 (추천)'], ['1', '빠르게']].map(([v, n]) => `<option value="${v}"${Number(st.koRate) === Number(v) ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <div class="row" style="flex-wrap:wrap"><button class="btn small" data-act="kotest">🔈 한국어 들어보기</button>
          <span class="muted">${koVoices().length ? `이 기기의 한국어 목소리 ${koVoices().length}개` : '⚠️ 한국어 목소리를 못 찾았어요. 아래 안내를 보세요'}</span></div>
        <label>하루 최대 시간(분)<input data-set="dailyLimit" type="number" min="5" max="120" value="${st.dailyLimit}"></label>
        <label>별 목표(개)<input data-set="goalStars" type="number" min="5" max="999" value="${st.goalStars}"></label>
        <label>목표 보상<input data-set="goalText" value="${esc(st.goalText)}"></label>
        <label>설명하기 기록<select data-set="explainSave"><option value="true"${st.explainSave !== false && st.explainSave !== 'false' ? ' selected' : ''}>저장 (최근 14개)</option><option value="false"${st.explainSave === false || st.explainSave === 'false' ? ' selected' : ''}>저장 안 함</option></select></label>
      </div>
      <div class="row" style="margin-top:12px;flex-wrap:wrap">
        <button class="btn small" data-act="unlock">오늘 시간 잠금 풀기</button>
        <button class="btn small" data-act="gave">🎁 보상 줬어요 (목표 새로 시작)</button>
        <button class="btn small" data-act="reset">전체 초기화 (별·보상·설정까지)</button>
      </div></div>
      <div class="card"><h3>안내</h3><ul class="list">
        <li>단원·문제 구성·이야기 문제 문장은 <b>content.js</b> 파일에서 고쳐요. 고친 뒤 <b>sw.js</b>의 VERSION과 <b>app.js</b>의 APP_VERSION을 올리면 설치된 앱에 반영돼요.</li>
        <li>한국어가 잘 안 들리면: 태블릿 <b>설정 → 일반 → 글자 읽어주기(TTS) → 기본 엔진</b>을 <b>Google 음성 인식 및 합성</b>으로 바꾸고, 엔진 설정에서 <b>한국어 음성 데이터(고품질)</b>를 설치한 뒤 앱을 다시 켜세요.</li>
        <li>윤이 영어 앱과 진도·별·보상·시간 제한이 모두 따로예요 (저장 키 yuni-math-v1).</li>
        <li>음성인식(설명하기): ${SR ? (micDenied ? '마이크 권한이 꺼져 있어요 (크롬 설정 → 사이트 설정 → 마이크)' : '사용 가능') : '이 브라우저는 지원하지 않아요 → 크롬에서 열어주세요'}</li>
      </ul></div>
    </div></div>`, {
      home: homeScreen,
      school: () => { const u = document.getElementById('school').value; S.pos = { u, d: 1, s: 0 }; save(); toast(`${unitById(u).title} 1일차부터 시작해요`); parentScreen(); },
      setpos: () => { const p = parseCode(document.getElementById('pcode').value); if (!p) return toast('예: 6-3-1 처럼 적어주세요'); S.pos = p; save(); toast(`진도를 ${posCode(p)}로 맞췄어요`); parentScreen(); },
      export: async () => { const c = exportCode(); const ta = document.getElementById('backup'); ta.value = c; ta.select(); try { await navigator.clipboard.writeText(c); toast('복사했어요. 다른 기기에 붙여넣으세요'); } catch (e) { toast('코드를 길게 눌러 복사하세요'); } },
      import: () => { if (restore(document.getElementById('backup').value)) { toast('가져왔어요!'); parentScreen(); } else toast('백업 코드가 올바르지 않아요'); },
      savefile: () => {
        try {
          const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `yuni-math-backup-${today()}.json`;
          document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
          toast('백업 파일을 저장했어요 (다운로드 폴더)');
        } catch (e) { toast('저장하지 못했어요. 내보내기(복사)를 이용하세요'); }
      },
      adjpos: () => {
        const u = document.getElementById('adjU').value; const nd = unitById(u).days.length;
        const d = Math.min(nd, +document.getElementById('adjD').value), sIdx = +document.getElementById('adjS').value;
        if (document.getElementById('adjMark').checked) for (let di = 1; di <= nd; di++) { if (di < d) S.done[`${u}-${di}`] = S.done[`${u}-${di}`] || today(); else delete S.done[`${u}-${di}`]; }
        S.pos = { u, d, s: sIdx }; save(); toast(`진도를 ${unitById(u).title} ${d}일차 · ${STEPS[sIdx].name}(으)로 바꿨어요`); parentScreen();
      },
      resetprog: (x, btn) => {
        if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = '정말 진도 초기화? 한 번 더 누르기'; return; }
        const d = defaults(); S.pos = d.pos; S.done = {}; S.stickers = {}; S.weak = {}; S.stats = {}; S.challenge = {}; S.ladder = d.ladder; S.reviewPick = null;
        save(); toast('진도를 처음으로 돌렸어요'); parentScreen();
      },
      setrung: () => { const v = +document.getElementById('rung').value; S.ladder.rung = v; S.ladder.streak = 0; save(); toast(`연산 사다리를 ${v + 1}칸으로 바꿨어요`); parentScreen(); },
      star: a => { S.stars = Math.max(0, S.stars + Number(a)); S.goalBase = Math.min(S.goalBase, S.stars); save(); parentScreen(); },
      starset: () => { const v = parseInt(document.getElementById('starSet').value, 10); if (!(v >= 0)) return toast('0 이상의 숫자를 적어주세요'); S.stars = v; S.goalBase = Math.min(S.goalBase, S.stars); save(); toast(`별을 ${v}개로 맞췄어요`); parentScreen(); },
      delrw: (i, btn) => { if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = '한 번 더 누르면 삭제'; return; } S.rewards.splice(+i, 1); save(); parentScreen(); },
      spec: specScreen,
      checkver: async () => {
        const info = document.getElementById('verInfo'); if (info) info.textContent = '· 확인 중…';
        try {
          const v = await checkUpdate(); const nw = v && isNewer(v, APP_VERSION);
          if (info) info.textContent = nw ? `· 새 버전 v${v}이 있어요!` : `· 최신 버전이에요 (서버 v${v || '?'})`;
          const b = document.getElementById('updBtn'); if (b) b.hidden = !nw;
        } catch (e) { if (info) info.textContent = '· 확인하지 못했어요. 인터넷 연결을 확인해 주세요'; }
      },
      doupdate: applyUpdate,
      kotest: () => { hush(); ko(`현이가 개미 7마리를 찾았어요. 8+5=? 오늘 수학 끝! 정말 잘했어, ${callName()}.`); },
      unlock: () => { S.override = today(); save(); toast('오늘은 시간 제한 없이 할 수 있어요'); },
      gave: () => { S.rewards.push({ date: today(), text: S.settings.goalText, stars: Number(S.settings.goalStars) }); S.goalBase = S.stars; save(); toast('보상을 기록했어요. 새 목표를 시작해요!'); parentScreen(); },
      reset: (x, btn) => { if (btn.dataset.sure) { S = defaults(); save(); toast('초기화했어요'); homeScreen(); } else { btn.dataset.sure = 1; btn.textContent = '정말 초기화? 한 번 더 누르기'; } },
    });
    const lf = document.getElementById('loadFile');
    if (lf) lf.addEventListener('change', () => { const f = lf.files[0]; if (!f) return; f.text().then(txt => { if (restore(txt)) { toast('백업을 불러왔어요!'); parentScreen(); } else toast('백업 파일이 올바르지 않아요'); }); });
    document.querySelectorAll('[data-set]').forEach(el => el.addEventListener('change', () => {
      const k = el.dataset.set; let v = el.type === 'number' ? Number(el.value) : el.value.trim();
      if (k === 'explainSave') v = v === 'true'; if (k === 'ladderDays' || k === 'ladderPct') v = Number(v);
      S.settings[k] = v; save(); toast('저장했어요');
    }));
  }

  /* ================= 시작 ================= */
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && !window.__SPEC_INLINE) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* */ }
  document.addEventListener('visibilitychange', () => { if (document.hidden) { hush(); stopRec(); } });
  window.YUNI = { get state() { return S; }, get act() { return L && L.acts[L.i]; }, get lesson() { return L; }, get screen() { return screen; }, spoken, speakify, sino, native, josa, parseCode, genProblem, makeCalc, rngFrom, KEY, APP_VERSION }; // 테스트용
  fixPos(); save();
  homeScreen();
  setTimeout(() => { if (!/^https?:/.test(location.protocol) || window.__SPEC_INLINE || navigator.onLine === false) return;
    checkUpdate().then(v => { if (v && isNewer(v, APP_VERSION) && screen === 'home') toast(`새 버전 v${v}이 있어요. 아빠 화면에서 업데이트하세요`); }).catch(() => {}); }, 3000);
})();
