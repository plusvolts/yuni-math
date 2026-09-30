/* 윤이 수학 — 앱 로직 (의존성 없음). 뼈대는 윤이 영어 v1.3.3에서 복사했어요. */
(() => {
  'use strict';
  const APP_VERSION = '0.5.0';
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
  const MODES = { 1: '세어 봐요', 2: '수의 순서', 3: '더 큰 수는?', 4: '모으기·가르기', 5: '계산해요', 6: '이야기 문제', 7: '모양·도형', 8: '시계 보기', 9: '규칙 찾기', 10: '큰 수', 11: '길이 재기', 12: '분류·표·그래프', 13: '곱셈', 14: '가르쳐주기' };
  const KEY = 'yuni-math-v1'; // 절대 바꾸지 않아요 (바꾸면 진도·별·보상이 사라져요). 영어 앱 저장 키와 따로예요.
  const $app = document.getElementById('app');

  /* ================= 저장소 ================= */
  function defaults() {
    return {
      settings: { parentPin: '1234', robotName: '셈봇', childName: '윤이', dailyLimit: 20, koVoice: '', koVoiceMode: 'rec', koRate: 0.9, goalStars: 50, goalText: '아빠와 약속한 선물', explainSave: true, ladderDays: 3, ladderPct: 90 },
      pos: { u: '2-1', d: 1, s: 0 }, done: {}, stars: 0, goalBase: 0,
      weak: {}, stats: {}, days: [], log: {}, stickers: {}, override: '', rewards: [],
      ladder: { rung: 0, streak: 0, lastDate: '', hist: [], badges: {} },
      explains: [], challenge: {}, reviewPick: null,
      drill: { date: '', round: 0, n: 0, total: 0 }, // 연산 연습 (v0.5.0)
    };
  }
  function merge(o) {
    const d = defaults();
    return Object.assign(d, o, { settings: Object.assign(d.settings, o.settings || {}), ladder: Object.assign(d.ladder, o.ladder || {}), drill: Object.assign(d.drill, o.drill || {}) });
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
  const semName = sem => { const [g, h] = String(sem).split('-'); return `${g}학년 ${h}학기`; };

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
  const COUNTERS = '개|마리|명|장|살|대|송이|권|번|칸|문제|줄|쌍|군데|묶음|자루|봉지|접시|모둠|켤레|달';
  // 화면 글 → 읽기 쉬운 말 (8+5=? → 팔 더하기 오는?, 7마리 → 일곱 마리)
  function speakify(t) {
    t = String(t);
    t = t.replace(/[()]/g, ' ').replace(/\p{Extended_Pictographic}\uFE0F?/gu, ' ');
    t = t.replace(/×/g, ' 곱하기 ').replace(/÷/g, ' 나누기 ');
    t = t.replace(/□\s*cm/g, '몇 센티미터').replace(/□\s*m(?![a-z])/g, '몇 미터');
    t = t.replace(/□/g, '몇');
    t = t.replace(/(\d+)월/g, (m, n) => ({ 6: '유월', 10: '시월' }[+n] || sino(n) + '월'));
    // 시각·길이 (v0.5.0): 3시 30분 → 세 시 삼십 분, 2시간 → 두 시간, 15cm → 십오 센티미터, 1m → 일 미터
    t = t.replace(/(\d+)\s*시간/g, (m, n) => `${+n < 100 ? native(+n, true) : sino(n)} 시간`);
    t = t.replace(/(\d+)\s*시(?![작험])/g, (m, n) => `${+n <= 24 ? native(+n, true) : sino(n)} 시`);
    t = t.replace(/(\d+)\s*분/g, (m, n) => `${sino(n)} 분`);
    t = t.replace(/(\d+)\s*cm/g, (m, n) => `${sino(n)} 센티미터`).replace(/(\d+)\s*m(?![a-z])/g, (m, n) => `${sino(n)} 미터`);
    t = t.replace(/cm/g, '센티미터').replace(/(^|[^a-z])m(?![a-z])/g, '$1미터');
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
  // 기기 음성: 문장부호마다 짧게 끊어서, 조금 천천히 읽어요. 숫자·식은 읽기 쉬운 말로 바꿔요.
  async function speakDevice(t, rate) {
    const parts = speakify(t).split(/(?<=[.!?,])\s+/).map(x => x.trim()).filter(Boolean);
    const my = sayToken;
    for (let i = 0; i < parts.length; i++) {
      if (my !== sayToken) return;
      spoken.push(parts[i]); if (spoken.length > 200) spoken.shift();
      await speak(parts[i], rate);
      if (i < parts.length - 1) await sleep(120);
    }
  }

  /* ================= 한국어 녹음 재생 (공통 65번) — 세 앱 같은 코드 (plan/0_COMMON_spec.md 5-2) =================
     audio-ko/index.json = { "문장": "파일.mp3" } (tools/make_ko_audio.py로 만든 Supertonic 3 목소리 6, 속도 보통).
     ko(t): ① 전체 문장 녹음이 있으면 재생 ② 없으면 문장(. ! ?) 단위로 나눠 녹음이 있는 문장은 재생, 없는 문장만 기기 음성
     아빠 화면 설정 koVoiceMode: 'rec'(녹음 목소리, 기본) | 'device'(기기 음성). 속도 설정 koRate는 녹음에도 적용(0.9 = 보통)
     녹음 열쇠(key)는 ko()가 받은 글 그대로(숫자·기호 포함). 읽는 말(say)은 tools/ko_sentences.js가 speakify로 만들어요 */
  let KO_IDX = null; let koAudio = null; let koDone = null; let koChain = Promise.resolve();
  const koKey = t => String(t).replace(/\s+/g, ' ').trim();
  fetch('audio-ko/index.json').then(r => (r.ok ? r.json() : {})).then(j => { KO_IDX = j || {}; }).catch(() => { KO_IDX = {}; });
  const koRec = t => (S.settings.koVoiceMode !== 'device' && KO_IDX && KO_IDX[koKey(t)]) || null;
  const koSentences = t => String(t).split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  function koStop() { const d = koDone; if (koAudio) { try { koAudio.pause(); } catch (e) { /* */ } koAudio = null; } if (d) d(false); }
  // 국어 앱: 녹음도 기기 음성처럼 차례로 재생해요(재생 중에 새 말이 오면 끝난 뒤에). hush()가 sayToken을 올리고 koStop()으로 모두 멈춰요.
  // (받아쓰기 정답 뒤 낱말 읽기 + "은후: 고마워!"처럼 겹칠 때 앞 재생이 끊겨 다음 문제로 안 넘어가던 문제 방지)
  function playKo(file, rate) {
    const my = sayToken;
    const p = koChain.then(() => (my !== sayToken ? false : new Promise(resolve => {
      const a = new Audio('audio-ko/' + file); koAudio = a;
      a.playbackRate = Math.max(0.7, Math.min(1.3, (Number(rate) || 0.9) / 0.9));
      let fin = false;
      const done = ok => { if (fin) return; fin = true; if (koAudio === a) koAudio = null; if (koDone === done) koDone = null; resolve(ok); };
      koDone = done;
      a.onended = () => done(true); a.onerror = () => done(false);
      a.play().catch(() => done(false));
      setTimeout(() => done(true), 20000); // 끝 신호가 안 와도 다음 말이 막히지 않게
    })));
    koChain = p.catch(() => false); return p;
  }
  async function ko(t) {
    if (window.__KO_LOG) window.__KO_LOG.push(String(t)); // 테스트·문장 수집용
    const my = sayToken; const rate = Number(S.settings.koRate) || 0.9;
    const whole = koRec(t);
    if (whole) { if (await playKo(whole, rate)) return; if (my !== sayToken) return; }
    const parts = koSentences(t);
    for (let i = 0; i < parts.length; i++) {
      if (my !== sayToken) return;
      const f = koRec(parts[i]);
      if (!(f && await playKo(f, rate))) { if (my !== sayToken) return; await speakDevice(parts[i], rate); }
      if (i < parts.length - 1) await sleep(120);
    }
  }
  // 여러 글을 차례로 따로 읽기 (마침표 없는 식·풀이 줄도 녹음 한 개씩)
  async function koSeq(list) {
    const my = sayToken; const ps = list.filter(Boolean);
    for (let i = 0; i < ps.length; i++) { if (my !== sayToken) return; if (i) await sleep(120); await ko(ps[i]); }
  }
  function hush() { sayToken++; koStop(); try { speechSynthesis.cancel(); } catch (e) { /* */ } }
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

  /* ================= 화면 관리 ================= */
  let H = {}; let screen = ''; let actToken = 0;
  function render(name, html, handlers) {
    screen = name; hush(); actToken++;
    document.querySelectorAll('.confetti,.feedback,.ghost').forEach(x => x.remove());
    $app.innerHTML = html; H = handlers || {}; window.scrollTo(0, 0);
  }
  $app.addEventListener('click', e => {
    const say = e.target.closest('[data-say]');
    if (say) { e.stopPropagation(); hush(); ko(say.dataset.say); return; }
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled && H[b.dataset.act]) H[b.dataset.act](b.dataset.arg, b, e);
  });

  // 실제 키보드로 정답 넣기 (v0.5.0): 숫자 키 → 숫자 패드, Backspace → 지우기, Enter → 확인. 보기 문제는 1~4 키로 고르기
  document.addEventListener('keydown', e => {
    if (screen !== 'lesson' || e.ctrlKey || e.altKey || e.metaKey) return;
    const tg = e.target; if (tg && tg.closest && tg.closest('input, textarea, select')) return;
    if (document.querySelector('.pad')) {
      if (/^[0-9]$/.test(e.key) && H.key) { e.preventDefault(); H.key(e.key); }
      else if (e.key === 'Backspace' && H.del) { e.preventDefault(); H.del(); }
      else if (e.key === 'Enter' && H.ok) { e.preventDefault(); H.ok(); }
      return;
    }
    const cs = document.querySelectorAll('.choices .choice');
    if (cs.length && /^[1-9]$/.test(e.key) && !cs[0].dataset.arg.match(/^\d+$/)) { const b = cs[+e.key - 1]; if (b) { e.preventDefault(); b.click(); } return; }
    if (e.key === 'Enter') { const nx = document.querySelector('#nextRow:not([hidden]) [data-act=next], .next-row [data-act=next]'); if (nx) { e.preventDefault(); nx.click(); } }
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
        <button class="btn good drill-btn" data-act="drill">🧮 연산 연습<small>더하기 · 빼기 · 곱하기 · 나누기</small></button>
        <div class="home-links">
          <button class="btn" data-act="picker">🧭 단계 고르기</button>
          <button class="btn" data-act="stickers">📒 스티커북</button>
          <button class="btn" data-act="ladder">🪜 연산 사다리</button>
        </div>
        <button class="goal card" data-act="rewards" style="text-align:left"><div class="row"><b>🎁 ${esc(S.settings.goalText)}</b><div class="spacer"></div><span class="muted">${g >= goal ? '달성! 🎉' : `${g} / ${goal}`}</span></div>
          <div class="goal-bar"><i style="width:${pct}%"></i></div>
          <div class="row" style="margin-top:8px"><span class="muted">받은 보상 ${S.rewards.length}개${rwCount().left ? ` · 안 쓴 보상 ${rwCount().left}개` : ''}</span><div class="spacer"></div><span class="muted">보상 목록 보기 ›</span></div></button>
      </div>
    </div>`, {
      go: () => startLesson(S.pos.u, S.pos.d, S.pos.s),
      picker: () => pickerScreen('units'), drill: () => drillScreen(),
      stickers: stickerScreen, ladder: ladderScreen, rewards: rewardScreen,
      parent: () => gateScreen(parentScreen),
      hello: () => { hush(); ko(`안녕, ${callName()}! 나는 ${robotName()}야.`); },
      install: async () => { if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) { /* */ } installEvt = null; homeScreen(); } },
    });
  }


  /* ================= 연산 연습 (v0.5.0, MREQ-39) =================
     하루 공부와 따로, 원하는 연산을 골라 10문제씩 더 풀어요. 별 규칙·하루 50개·시간 제한은 그대로.
     문제 종류는 content.js drill 에서 고쳐요. 같은 날 같은 회차는 ◀ 이전으로 돌아가도 같은 문제예요. */
  function drillScreen(opId) {
    const D = C.drill; const op = opId && D.ops.find(o => o.id === opId);
    const dl = S.drill.date === today() ? S.drill : { n: 0 };
    const body = !op
      ? `<h2 class="title">🧮 어떤 연산을 연습할까?</h2>
        <div class="grid drill-grid">${D.ops.map(o => `<button class="tile" data-act="op" data-arg="${o.id}"><span class="em">${o.icon}</span><b>${esc(o.name)}</b><small>${esc(o.sizes.map(z => z.name).join(' · '))}</small></button>`).join('')}</div>
        <p class="muted" style="text-align:center">한 번에 ${D.count}문제 · 맞히면 별 1개 · 오늘 연산 연습 ${dl.n || 0}번</p>`
      : `<h2 class="title">${op.icon} ${esc(op.name)} — 어떤 수로 할까?</h2>
        <div class="grid drill-grid">${op.sizes.map(z => `<button class="tile" data-act="size" data-arg="${z.id}"><span class="em">${esc(z.em || op.icon)}</span><b>${esc(z.name)}</b><small>${esc(z.ex || '')}</small></button>`).join('')}</div>`;
    render('drill', `<div class="screen">
      <div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">⬅️</button><div class="spacer"></div><div class="stars">⭐ ${S.stars}</div><button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button></div>
      ${body}</div>`, {
      back: () => (op ? drillScreen() : homeScreen()), home: homeScreen,
      op: a => drillScreen(a), size: a => startDrill(op.id, a),
    });
    ko(op ? `${op.name}! 어떤 수로 할까?` : '어떤 연산을 연습할까?');
  }
  function startDrill(opId, sizeId) {
    const lr = lockReason(); if (lr) return lockedScreen(lr);
    const D = C.drill; const op = D.ops.find(o => o.id === opId); const sz = op && op.sizes.find(z => z.id === sizeId); if (!sz) return drillScreen();
    if (S.drill.date !== today()) S.drill = Object.assign(S.drill, { date: today(), round: 0, n: 0 });
    S.drill.round++; if (!S.days.includes(today())) S.days.push(today()); save();
    const round = S.drill.round;
    L = { drill: { op, sz, round }, u: S.pos.u, d: S.pos.d, s: 0, acts: [], i: 0, earned: 0, awarded: {}, first: {}, heard: {}, cache: {}, chal: { ok: 0, n: 0 }, flash: { ok: 0, n: 0 }, drillRes: { ok: 0, n: 0 } };
    L.acts = Array.from({ length: D.count || 10 }, (_, i) => ({ type: 'prob', drill: true, prob: genProblem('calc', sz.p, `${today()}|drill|${op.id}|${sz.id}|${round}|${i}`, { concrete: false, eunhoo: false }) }));
    L.cache[0] = L.acts;
    showAct();
  }
  function drillDone() {
    const { op, sz } = L.drill; const res = L.drillRes; S.drill.n++; S.drill.total = (S.drill.total || 0) + 1; save();
    const great = res.n && res.ok / res.n >= 0.8;
    render('reward', `<div class="screen"><div class="reward">
      <div class="robot">${great ? '🏆' : '🤖'}</div>
      <div class="bubble">연산 연습 끝! ${esc(op.name)} ${esc(sz.name)}<small>${res.n}문제 중 한 번에 ${res.ok}개 맞혔어요</small></div>
      ${L.earned ? `<div class="big-stars">⭐ +${L.earned}</div>` : `<div class="bubble">오늘 별은 다 모았어요! ⭐<small>별은 하루에 ${DAY_STAR_MAX}개까지 받아요</small></div>`}
      <div class="home-links">
        <button class="btn primary" data-act="again">🔁 한 번 더</button>
        <button class="btn" data-act="other">🧮 다른 연산</button>
        <button class="btn" data-act="home">끝!</button>
      </div>
    </div></div>`, { again: () => startDrill(op.id, sz.id), other: () => drillScreen(), home: homeScreen });
    if (great) confetti();
    tone([523, 659, 784], 0.14);
    ko(`연산 연습 끝! ${great ? '정말 잘했어!' : '끝까지 잘했어!'}`);
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
        ${[...new Set(U.map(un => un.sem))].map(sem => `<h3 class="sem-h">${semName(sem)}</h3><div class="grid">${U.map((un, i) => un.sem !== sem ? '' : `<button class="tile${un.ready ? '' : ' locked'}${S.pos.u === un.id ? ' now' : ''}" data-act="unit" data-arg="${un.id}">
          <span class="em">${un.icon}</span><small>${un.sem}</small><b>${i + 1}. ${esc(un.title)}</b><small>${un.ready ? `${doneCount(un.id)} / ${un.days.length}일` : `준비 중 (${un.plan})`}</small></button>`).join('')}</div>`).join('')}
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
  // 보상마다 used: 사용한 날짜(YYYY-MM-DD) 또는 없음. 아빠 화면에서 체크하면 윤이 보상 목록에도 사용완료로 보여요 (공통 v2026-09)
  function rwCount() { const n = S.rewards.length, u = S.rewards.filter(r => r.used).length; return { n, u, left: n - u }; }
  function rwHeadText() { const c = rwCount(); return `받은 보상 ${c.n}개 · 안 쓴 보상 ${c.left}개 · 사용완료 ${c.u}개`; }
  function rwSummary() { const c = rwCount(); return `아직 안 쓴 보상 ${c.left}개 · 사용완료 ${c.u}개`; }
  function rewardScreen() {
    const { g, goal } = goalInfo(); const list = S.rewards.slice().reverse();
    render('rewards', `<div class="screen">
      <div class="topbar"><button class="icon-btn" data-act="home" aria-label="처음으로">🏠</button><h2 class="title">🎁 받은 보상</h2></div>
      <div class="card goal" style="width:100%"><div class="row"><b>지금 목표: ${esc(S.settings.goalText)}</b><div class="spacer"></div><span class="muted">${Math.min(g, goal)} / ${goal}</span></div>
        <div class="goal-bar"><i style="width:${Math.min(100, Math.round(g / goal * 100))}%"></i></div>
        ${g >= goal ? '<p style="margin:10px 0 0;font-weight:800">목표 달성! 아빠에게 보여줘요 🎉</p>' : `<p class="muted" style="margin:10px 0 0">별 ${goal - g}개만 더 모으면 돼요!</p>`}</div>
      ${list.length ? `<p class="muted" style="margin:0;font-weight:800">${rwSummary()}</p>` : ''}
      ${list.length ? `<div class="grid">${list.map((r, i) => `<div class="tile${r.used ? ' used' : ''}"><span class="em">${r.used ? '✅' : '🎁'}</span><b>${esc(r.text)}</b><small>${esc(r.date)} · 별 ${r.stars}개</small><small>${list.length - i}번째 보상</small><span class="rw-tag${r.used ? ' done' : ''}">${r.used ? `사용완료 · ${esc(r.used)}` : '아직 안 썼어요'}</span></div>`).join('')}</div>`
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
  const opSign = op => ({ '+': '+', '×': '×', '÷': '÷' }[op] || '−');
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
    // v0.5.0: 2학년·연산 연습
    carry21: '(두 자리)+(한 자리) 받아올림', carry22: '(두 자리)+(두 자리) 받아올림', borrow21: '(두 자리)−(한 자리) 받아내림', borrow22: '(두 자리)−(두 자리) 받아내림',
    threeBig: '두 자리 세 수의 계산', blankAdd: '□가 있는 덧셈식', blankSub: '□가 있는 뺄셈식', 'd1+': '한 자리 덧셈', 'd1-': '한 자리 뺄셈',
    'big2+': '두 자리 덧셈', 'big2-': '두 자리 뺄셈', 'big3+': '세 자리 덧셈', 'big3-': '세 자리 뺄셈', mulBlank: '곱셈구구 □ 구하기', mulBig: '(두 자리)×(한 자리)', divBig: '(두 자리)÷(한 자리)',
    shapeName1: '모양 이름', shapeCorner1: '뾰족한 곳 세기', shapeCount1: '모양 세기', shapeName2: '도형 이름', shapeCorner2: '변·꼭짓점 세기', shapeCount2: '도형 세기',
    clock60: '몇 시', clock30: '몇 시 30분', clock5: '몇 시 몇 분(5분)', clock1: '몇 시 몇 분(1분)', clockAfter: '몇 시간·몇 분 뒤', clockBefore: '몇 시 몇 분 전', clockMin: '시간과 분', clockDay: '하루·1주일·1년',
    patShape: '무늬 규칙', patNum: '수의 규칙', patMul: '곱셈표 규칙',
    bigHund: '백·천 알기', bigMake: '자릿값으로 수 만들기', bigPlace: '숫자가 나타내는 값', bigSkip: '뛰어 세기', bigCmp: '큰 수 비교', bigRead: '수로 쓰기',
    lenRuler: '자로 길이 재기', lenMcm: 'm와 cm', lenAdd: '길이의 덧셈·뺄셈', sortCount: '분류해서 세기', sortMost: '가장 많은 것', chartCount: '그래프 읽기', chartMost: '그래프 가장 많은·적은 것', chartTotal: '표의 합계',
    mulGroup: '묶어 세기', mulTimes: '몇의 몇 배', teach: '가르쳐주기',
  };
  for (let k = 0; k <= 9; k++) { TYPE_LABEL['mul' + k] = `곱셈구구 ${k}단`; TYPE_LABEL['div' + k] = `나눗셈 (÷${k})`; }
  // 세로셈처럼 자리마다 풀이 (두 자리·세 자리 덧셈·뺄셈)
  const PLACE = ['일', '십', '백', '천'];
  function columnSteps(a, b, op, ans) {
    const out = []; const n = Math.max(String(a).length, String(b).length); let c = 0;
    for (let k = 0; k < n; k++) {
      const x = Math.floor(a / 10 ** k) % 10, y = Math.floor(b / 10 ** k) % 10; const nm = PLACE[k];
      if (op === '+') {
        const v = x + y + c; out.push(`${nm}의 자리: ${x}+${y}${c ? '+1' : ''}=${v}${v >= 10 && k < n - 1 ? ', 10은 받아올려요.' : ''}`); c = v >= 10 && k < n - 1 ? 1 : 0;
      } else {
        const x2 = x - c; if (x2 < y) { out.push(`${nm}의 자리: ${x2}에서 ${J(y, '을', '를')} 뺄 수 없어서 10을 받아내려요. ${x2 + 10}−${y}=${x2 + 10 - y}`); c = 1; }
        else { out.push(`${nm}의 자리: ${c ? `${x}−1−${y}` : `${x}−${y}`}=${x2 - y}`); c = 0; }
      }
    }
    out.push(`답은 ${ans}`); return out;
  }
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
      // ---- v0.5.0: 2학년 덧셈과 뺄셈 · 곱셈구구 · 나눗셈 · 연산 연습 ----
      case 'carry2': { // 받아올림 있는 (두 자리)+(한/두 자리), p.big이면 합이 100을 넘어도 돼요
        const one = p.one != null ? p.one : r() < 0.35; let ao, bo; do { ao = ri(r, 1, 9); bo = ri(r, 1, 9); } while (ao + bo < 10);
        const at = ri(r, 1, p.big ? 9 : 7); const bt = one ? 0 : ri(r, 1, p.big ? 9 : Math.max(1, 8 - at));
        a = at * 10 + ao; b = bt * 10 + bo; if (!one && r() < 0.3) [a, b] = [b, a];
        return { a, b, op: '+', ans: a + b, kind, type: one ? 'carry21' : 'carry22', expr: `${a}+${b}=□` };
      }
      case 'borrow2': { // 받아내림 있는 (두 자리)−(한/두 자리)
        const one = p.one != null ? p.one : r() < 0.35; let ao, bo; do { ao = ri(r, 0, 8); bo = ri(r, 1, 9); } while (ao >= bo);
        const at = ri(r, 2, 9); const bt = one ? 0 : ri(r, 1, at - 1); a = at * 10 + ao; b = bt * 10 + bo;
        return { a, b, op: '-', ans: a - b, kind, type: one ? 'borrow21' : 'borrow22', expr: `${a}−${b}=□` };
      }
      case 'threeBig': {
        const o1 = pickOp(r, p.op), o2 = pickOp(r, p.op); let m;
        do { a = ri(r, 12, 60); b = ri(r, 5, 39); c = ri(r, 5, 39); m = o1 === '+' ? a + b : a - b; ans = o2 === '+' ? m + c : m - c; } while (m < 0 || ans < 0 || ans > 99);
        return { a, b, c, op: o1, op2: o2, ans, kind, type: 'threeBig', expr: `${a}${opSign(o1)}${b}${opSign(o2)}${c}=□`, mid: m };
      }
      case 'blank': { // □가 있는 식 (덧셈과 뺄셈의 관계)
        const add = pickOp(r, p.op) === '+'; const x = ri(r, 3, 29);
        if (add) { a = ri(r, 11, 60); c = a + x; return { a, b: x, c, op: '+', ans: x, kind, type: 'blankAdd', expr: `${a}+□=${c}`, blank: true }; }
        a = ri(r, x + 5, Math.min(99, x + 60)); c = a - x; return { a, b: x, c, op: '-', ans: x, kind, type: 'blankSub', expr: `${a}−□=${c}`, blank: true };
      }
      case 'd1': // 한 자리 수끼리 (받아올림·받아내림 섞임)
        if (op === '+') { a = ri(r, 1, 9); b = ri(r, 1, 9); ans = a + b; } else { a = ri(r, 2, 18); b = ri(r, Math.max(1, a - 9), Math.min(9, a)); ans = a - b; }
        return { a, b, op, ans, kind, type: `d1${op}`, expr: `${a}${opSign(op)}${b}=□` };
      case 'big2': // 두 자리 수끼리 (아무 수)
        if (op === '+') { a = ri(r, 10, 99); b = ri(r, 10, 99); } else { a = ri(r, 20, 99); b = ri(r, 10, a - 1); }
        return { a, b, op, ans: op === '+' ? a + b : a - b, kind, type: `big2${op}`, expr: `${a}${opSign(op)}${b}=□` };
      case 'big3': // 세 자리 수끼리
        if (op === '+') { a = ri(r, 100, 850); b = ri(r, 100, 999 - a); } else { a = ri(r, 200, 999); b = ri(r, 100, a - 50); }
        return { a, b, op, ans: op === '+' ? a + b : a - b, kind, type: `big3${op}`, expr: `${a}${opSign(op)}${b}=□` };
      case 'mul': { // 곱셈구구 (p.dans: 단 목록, p.bmin: 곱하는 수 최소)
        a = pick(p.dans || [2, 3, 4, 5, 6, 7, 8, 9], r); b = ri(r, p.bmin != null ? p.bmin : 2, p.bmax || 9);
        if (p.swap && r() < 0.3) return { a: b, b: a, op: '×', ans: a * b, kind, type: `mul${a}`, expr: `${b}×${a}=□`, dan: a };
        return { a, b, op: '×', ans: a * b, kind, type: `mul${a}`, expr: `${a}×${b}=□`, dan: a };
      }
      case 'mulBlank': a = pick(p.dans || [2, 3, 4, 5, 6, 7, 8, 9], r); b = ri(r, 2, 9); return { a, b, c: a * b, op: '×', ans: b, kind, type: 'mulBlank', expr: `${a}×□=${a * b}`, blank: true };
      case 'div': { // 나눗셈 (곱셈구구로): 전체 ÷ 나누는 수 = 몫
        const d = pick(p.dans || [2, 3, 4, 5, 6, 7, 8, 9], r), qn = ri(r, 1, 9);
        return { a: d * qn, b: d, op: '÷', ans: qn, kind, type: `div${d}`, expr: `${d * qn}÷${d}=□` };
      }
      case 'mul2': a = ri(r, 11, 49); b = ri(r, 2, 9); return { a, b, op: '×', ans: a * b, kind, type: 'mulBig', expr: `${a}×${b}=□` };
      case 'div2': { const d = ri(r, 2, 9), qn = ri(r, 11, Math.floor(99 / d)); return { a: d * qn, b: d, op: '÷', ans: qn, kind, type: 'divBig', expr: `${d * qn}÷${d}=□` }; }
      case 'mix4': { // 연산 연습 섞기: 더하기·빼기·곱하기·나누기
        const lv1 = [{ kind: 'd1', op: '+' }, { kind: 'd1', op: '-' }, { kind: 'mul', dans: [2, 3, 4, 5] }, { kind: 'div', dans: [2, 3, 4, 5] }];
        const lv2 = [{ kind: 'big2', op: '+' }, { kind: 'big2', op: '-' }, { kind: 'mul' }, { kind: 'div' }, { kind: 'big3', op: '+' }];
        return makeCalc(r, pick(p.lv === 2 ? lv2 : lv1, r));
      }
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
    if (['carry2', 'borrow2', 'd1', 'big2', 'big3'].includes(kind)) {
      if (kind === 'd1' && q.op === '+' && ans >= 10) { const big = Math.max(a, b), small = Math.min(a, b), need = 10 - big; return [`${J(small, '을', '를')} ${need}${josa(need, '과', '와')} ${J(small - need, '으로', '로')} 갈라요.`, `${big}+${need}=10`, `10+${small - need}=${ans}`]; }
      if (kind === 'd1' && q.op === '-' && a >= 10) { const o = a - 10; return [`${J(a, '을', '를')} 10과 ${J(o, '으로', '로')} 갈라요.`, `10−${b}=${10 - b}`, `${10 - b}+${o}=${ans}`]; }
      if (kind === 'd1') return [`${a}${opSign(q.op)}${b}=${ans}`];
      return columnSteps(a, b, q.op, ans);
    }
    if (kind === 'blank') return q.op === '+' ? [`${J(q.c, '에서', '에서')} ${J(a, '을', '를')} 빼면 □를 알 수 있어요.`, `${q.c}−${a}=${ans}`] : [`${J(a, '에서', '에서')} ${J(q.c, '을', '를')} 빼면 □를 알 수 있어요.`, `${a}−${q.c}=${ans}`];
    if (kind === 'mul') {
      const d = q.dan, m = d === a ? b : a;
      if (d === 0 || m === 0) return ['0에 어떤 수를 곱해도, 어떤 수에 0을 곱해도 0이에요.', `${a}×${b}=0`];
      if (d === 1) return [`1에 어떤 수를 곱하면 그 수가 돼요.`, `${a}×${b}=${ans}`];
      return [`${d}씩 ${m}묶음이에요.`, `${d}단: ${Array.from({ length: m }, (_, k) => d * (k + 1)).join(', ')}`, `${a}×${b}=${ans}`];
    }
    if (kind === 'mulBlank') return [`${a}단에서 ${J(q.c, '을', '를')} 찾아봐요.`, `${a}×${ans}=${q.c}`];
    if (kind === 'div' || kind === 'div2') return [`${b}×□=${a}${josa(a, '을', '를')} 생각해요.`, `${b}×${ans}=${a}`, `그래서 ${a}÷${b}=${ans}`];
    if (kind === 'mul2') { const t = a - a % 10, o = a % 10; return [`${t}×${b}=${t * b}`, `${o}×${b}=${o * b}`, `${t * b}+${o * b}=${ans}`]; }
    if (kind === 'three' || kind === 'threeBig') { const m = q.op === '+' ? a + b : a - b; return [`앞의 두 수부터: ${a}${opSign(q.op)}${b}=${m}`, `${m}${opSign(q.op2)}${c}=${ans}`]; }
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
      carry2: '일의 자리끼리 더해서 10이 넘으면 받아올려요!', borrow2: '일의 자리끼리 뺄 수 없으면 십의 자리에서 10을 받아내려요!', threeBig: '앞의 두 수부터 계산해요.',
      blank: '덧셈과 뺄셈의 관계를 생각해요.', d1: '10을 만들어 생각해 봐요.', big2: '같은 자리끼리 계산해요.', big3: '일의 자리부터 같은 자리끼리 계산해요.',
      mul: `${q.dan}단을 외워 봐요!`, mulBlank: `${q.a}단을 외워 봐요!`, div: '곱셈구구로 생각해요!', div2: '곱셈으로 생각해요!', mul2: '십의 자리와 일의 자리를 따로 곱해요.',
    }[q.kind] || '구슬을 하나씩 세어 봐요.';
  }
  const TWO_DIGIT = ['two', 'twoOne', 'tens', 'tensOnes'];
  function calcVis(q) {
    if (q.kind === 'mul' && q.a <= 9 && q.b <= 9 && q.a && q.b) return { kind: 'groups', size: q.dan, n: q.dan === q.a ? q.b : q.a };
    if (q.kind === 'mulBlank') return { kind: 'groups', size: q.a, n: q.ans };
    if (q.kind === 'div') return { kind: 'groups', size: q.b, n: q.ans, share: true };
    if (['mul', 'mul2', 'div2', 'big3', 'threeBig', 'blank'].includes(q.kind) || q.ans > 99 || q.a > 99) return null;
    if (['carry2', 'borrow2', 'big2'].includes(q.kind)) return { kind: 'base', a: q.a, b: q.b, op: q.op };
    if (q.kind === 'd1') return q.op === '+' ? { kind: 'frames', parts: [q.a, q.b] } : { kind: 'frames', parts: [q.a], x: q.b };
    if (TWO_DIGIT.includes(q.kind)) return { kind: 'base', a: q.a, b: q.b, op: q.op };
    if (q.kind === 'make10') return { kind: 'frames', parts: [q.a], cap: 10 };
    if (q.kind === 'three' || q.kind === 'three10') { if (q.op === '+' && q.op2 === '+') return { kind: 'frames', parts: [q.a, q.b, q.c] }; if (q.op === '-' && q.op2 === '-') return { kind: 'frames', parts: [q.a], x: q.b + q.c }; return null; }
    if (q.op === '+') return { kind: 'frames', parts: [q.a, q.b] };
    return { kind: 'frames', parts: [q.a], x: q.b };
  }

  /* ---------- v0.5.0 그림 도우미: 모양·시계·자 (SVG) ---------- */
  const SHAPES1 = [{ n: '네모', k: 4, d: '곧은 선 4개, 뾰족한 곳 4군데' }, { n: '세모', k: 3, d: '곧은 선 3개, 뾰족한 곳 3군데' }, { n: '동그라미', k: 0, d: '뾰족한 곳이 없고 둥글어요' }];
  const SHAPES2 = [{ n: '원', k: 0, d: '곧은 선도 꼭짓점도 없고 둥글어요' }, { n: '삼각형', k: 3, d: '변 3개, 꼭짓점 3개' }, { n: '사각형', k: 4, d: '변 4개, 꼭짓점 4개' }, { n: '오각형', k: 5, d: '변 5개, 꼭짓점 5개' }, { n: '육각형', k: 6, d: '변 6개, 꼭짓점 6개' }];
  const SH_COLORS = ['#22a06b', '#3b82f6', '#f59e0b', '#ef6f9b', '#8b5cf6', '#06b6d4'];
  function shapeSvg(k, r, size) {
    const col = pick(SH_COLORS, r); const st = `fill="${col}" fill-opacity=".85" stroke="#334" stroke-width="3" stroke-linejoin="round"`;
    let body;
    if (!k) { const rx = 36 + ri(r, 0, 6), ry = rx; body = `<ellipse cx="50" cy="50" rx="${rx}" ry="${ry}" ${st}/>`; }
    else if (k === 4 && r() < 0.6) { const w = ri(r, 44, 84), h = ri(r, 40, 80), rot = pick([0, 0, 15, -20, 45], r); body = `<rect x="${50 - w / 2}" y="${50 - h / 2}" width="${w}" height="${h}" transform="rotate(${rot} 50 50)" ${st}/>`; }
    else {
      const rot = r() * 360, jit = k === 3 ? 10 : 3;
      const pts = Array.from({ length: k }, (_, i) => { const t = (rot + i * 360 / k) * Math.PI / 180, rr = 40 - r() * jit; return `${(50 + rr * Math.cos(t)).toFixed(1)},${(50 + rr * Math.sin(t)).toFixed(1)}`; }).join(' ');
      body = `<polygon points="${pts}" ${st}/>`;
    }
    return `<svg class="shp" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
  }
  const tlabel = (h, m) => (m ? `${h}시 ${m}분` : `${h}시`);
  function clockChoices(r, h, m, step) {
    const hh = x => (x + 11) % 12 + 1; const c = [];
    if (step >= 60) c.push([hh(h + 1), m], [hh(h - 1), m], [hh(h + 2), m]);
    if (step === 30) c.push([hh(h + 1), m], [h, m ? 0 : 30], [hh(h + 1), m ? 0 : 30], [hh(h - 1), m]);
    if (step <= 5) { const mm = x => (x + 60) % 60; c.push([h, mm(m + 5)], [h, mm(m - 5)], [hh(h + 1), m]); if (m % 5 === 0 && m / 5 !== h) c.push([hh(m / 5) , (h * 5) % 60]); c.push([h, mm(m + 10)]); if (step === 1) c.unshift([h, mm(m + 1)], [h, mm(m - 1)]); }
    const out = []; for (const [x, y] of c) { const l = tlabel(x, y); if (l !== tlabel(h, m) && !out.includes(l)) out.push(l); }
    return shuffle([tlabel(h, m), ...out.slice(0, 3)], r);
  }
  function clockSvg(h, m, ticks) {
    const nums = Array.from({ length: 12 }, (_, i) => { const t = (i + 1) * 30 * Math.PI / 180; return `<text x="${(100 + 74 * Math.sin(t)).toFixed(1)}" y="${(100 - 74 * Math.cos(t) + 8).toFixed(1)}" text-anchor="middle" font-size="22" font-weight="800" fill="#223">${i + 1}</text>`; }).join('');
    const tk = Array.from({ length: 60 }, (_, i) => { const t = i * 6 * Math.PI / 180, big = i % 5 === 0; if (!ticks && !big) return ''; const r1 = big ? 86 : 89; return `<line x1="${(100 + r1 * Math.sin(t)).toFixed(1)}" y1="${(100 - r1 * Math.cos(t)).toFixed(1)}" x2="${(100 + 94 * Math.sin(t)).toFixed(1)}" y2="${(100 - 94 * Math.cos(t)).toFixed(1)}" stroke="#556" stroke-width="${big ? 3 : 1.5}"/>`; }).join('');
    const ha = ((h % 12) + m / 60) * 30, ma = m * 6;
    return `<svg class="clock" viewBox="0 0 200 200" width="230" height="230" role="img" aria-label="시계"><circle cx="100" cy="100" r="96" fill="#fff" stroke="#22a06b" stroke-width="6"/>${tk}${nums}
      <line x1="100" y1="100" x2="100" y2="48" stroke="#e8590c" stroke-width="8" stroke-linecap="round" transform="rotate(${ha} 100 100)"/>
      <line x1="100" y1="100" x2="100" y2="24" stroke="#1d4ed8" stroke-width="5" stroke-linecap="round" transform="rotate(${ma} 100 100)"/><circle cx="100" cy="100" r="6" fill="#223"/></svg>`;
  }
  function rulerSvg(s0, n) {
    const L = 14, W = 30; let tk = '';
    for (let i = 0; i <= L * 2; i++) { const x = 10 + i * W / 2; const big = i % 2 === 0; tk += `<line x1="${x}" y1="70" x2="${x}" y2="${big ? 50 : 60}" stroke="#334" stroke-width="${big ? 2 : 1}"/>${big ? `<text x="${x}" y="90" text-anchor="middle" font-size="13" font-weight="700" fill="#334">${i / 2}</text>` : ''}`; }
    return `<svg class="ruler" viewBox="0 0 ${L * W + 20} 100" width="${L * W + 20}" height="100" role="img" aria-label="자"><rect x="${10 + s0 * W}" y="14" width="${n * W}" height="26" rx="10" fill="#f59e0b" stroke="#b45309" stroke-width="2"/>
      <rect x="2" y="44" width="${L * W + 16}" height="52" rx="6" fill="#fff8dc" stroke="#caa" stroke-width="1.5"/>${tk}</svg>`;
  }
  // 곱셈·나눗셈 이야기 문제 (content.js stories.mul / stories.div)
  function storyMulDiv(r, q) {
    const mul = q.op === '×'; const tpl = pick(mul ? C.stories.mul : C.stories.div, r);
    const fid0 = pick(['hyun', 'chorok', 'eunhoo'], r); const fid = tpl.text.includes('{F}') ? fid0 : null; const f = C.friends[fid0];
    const text = tpl.text.replace(/\{F\}/g, f.subj).replace('{a}', q.a).replace('{b}', q.b);
    const expr = `${q.a}${opSign(q.op)}${q.b}=□`;
    return { mode: 6, input: 'pad', q: text, answer: q.ans, calc: q, friend: fid, unit: tpl.unit, pic: tpl.pic, expr: '', storyExpr: expr,
      vis: mul ? { kind: 'groups', size: q.a, n: q.b, emoji: tpl.pic } : { kind: 'groups', size: q.a, n: 1, emoji: tpl.pic }, type: q.type,
      hint1: `${mul ? '똑같은 수가 여러 묶음이니까 곱하기' : '똑같이 나누니까 나누기'}예요. 식: ${expr}`, steps: [expr.replace('□', q.ans), ...calcSteps(q).slice(0, 2)] };
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
      const concrete = ctx.concrete !== false && !['div', 'div2', 'blank'].includes(q.kind);
      return { mode: 5, input: 'pad', q: q.blank ? '빈칸에 알맞은 수는?' : '계산해 봐요', expr: q.expr, answer: q.ans, calc: q, vis: calcVis(q), showVis: concrete, type: q.type,
        hint1: calcHint(q), steps: calcSteps(q) };
    },
    story(r, p = {}) {
      const q = makeCalc(r, { ...p, swap: false, op: p.kind === 'carry' ? '+' : p.kind === 'borrow' || p.kind === 'from10' ? '-' : p.op });
      if (q.op === '×' || q.op === '÷') return storyMulDiv(r, q);
      const add = q.op === '+'; const tpl = pick(add ? C.stories.add : C.stories.sub, r);
      const fid0 = pick(['hyun', 'chorok', 'eunhoo'], r); const fid = tpl.text.includes('{F}') ? fid0 : null; const f = C.friends[fid0];
      const text = tpl.text.replace(/\{F\}/g, f.subj).replace('{a}', q.a).replace('{b}', q.b);
      const expr = `${q.a}${opSign(q.op)}${q.b}=□`;
      return { mode: 6, input: 'pad', q: text, answer: q.ans, calc: q, friend: fid, unit: tpl.unit, pic: tpl.pic, expr: '', storyExpr: expr,
        vis: { kind: 'items', a: q.a, b: q.b, op: q.op, emoji: tpl.pic }, type: q.type,
        hint1: `${add ? '모두 몇? 이니까 더하기' : '남은 것은? 이니까 빼기'}예요. 식: ${expr}`, steps: [expr.replace('□', q.ans), ...calcSteps(q).slice(0, 2)] };
    },

    /* ---------- v0.5.0: 모양·시계·규칙·큰 수·길이·분류·곱셈 ---------- */
    shape(r, p = {}) {
      const lv = p.level || 1; const set = lv === 1 ? SHAPES1 : SHAPES2; const ask = p.ask || 'name';
      if (ask === 'count') {
        const n = ri(r, 6, 9); const list = Array.from({ length: n }, () => pick(set, r)); let tgt = pick(set, r);
        if (!list.includes(tgt)) list[ri(r, 0, n - 1)] = tgt;
        const cnt = list.filter(x => x === tgt).length; const svgs = list.map(sh => shapeSvg(sh.k, r, 64));
        return { mode: 7, input: 'pad', q: `${tgt.n}${josa(tgt.n, '은', '는')} 몇 개일까요?`, answer: cnt, vis: { kind: 'shapes', svgs, mark: list.map(x => x === tgt) }, type: `shapeCount${lv}`,
          hint1: `${tgt.n}${josa(tgt.n, '을', '를')} 하나씩 손가락으로 짚으며 세어 봐요.`, steps: [`${tgt.n}: ${tgt.d}`, `${tgt.n}${josa(tgt.n, '은', '는')} ${cnt}개예요.`] };
      }
      const sh = ask === 'corner' ? pick(set.filter(x => lv === 1 || x.k), r) : pick(set, r);
      const svg = shapeSvg(sh.k, r, 150);
      if (ask === 'corner') {
        const what = lv === 1 ? '뾰족한 곳' : pick(['변', '꼭짓점'], r); const unitW = lv === 1 ? '군데' : '개';
        return { mode: 7, input: 'pad', q: `이 모양에서 ${what}${josa(what, '은', '는')} 몇 ${unitW}일까요?`, answer: sh.k, vis: { kind: 'svg', svg }, type: `shapeCorner${lv}`, unit: unitW,
          hint1: lv === 1 ? '뾰족한 곳을 하나씩 눌러 보듯이 세어 봐요.' : what === '변' ? '변은 곧은 선이에요. 하나씩 세어 봐요.' : '꼭짓점은 두 변이 만나는 뾰족한 점이에요.',
          steps: [sh.k ? `${sh.n}${josa(sh.n, '은', '는')} ${what}${josa(what, '이', '가')} ${sh.k}${unitW === '개' ? '개' : '군데'}예요.` : `${sh.n}${josa(sh.n, '은', '는')} 뾰족한 곳이 없어요.`, `정답은 ${sh.k}`] };
      }
      const choices = shuffle([sh.n, ...shuffle(set.filter(x => x !== sh).map(x => x.n), r).slice(0, 3)], r);
      return { mode: 7, input: 'choice', q: lv === 1 ? '이 모양은 어떤 모양일까요?' : '이 도형의 이름은 무엇일까요?', answer: sh.n, choices, vis: { kind: 'svg', svg }, type: `shapeName${lv}`,
        hint1: lv === 1 ? '뾰족한 곳이 있는지, 둥근지 살펴봐요.' : '변과 꼭짓점이 몇 개인지 세어 봐요.', steps: [`${sh.n}: ${sh.d}`, `그래서 ${sh.n}${josa(sh.n, '이에요', '예요')}.`] };
    },
    clock(r, p = {}) {
      const ask = p.ask || 'read'; const step = p.step || 60;
      const h = ri(r, 1, 12); let m = step === 60 ? 0 : step === 30 ? (r() < 0.75 ? 30 : 0) : step === 5 ? 5 * ri(r, 1, 11) : ri(r, 1, 59);
      if (step === 1 && m % 5 === 0) m += 1 + Math.floor(r() * 3);
      if (ask === 'min') { // 1시간 20분 = 몇 분
        const hh = ri(r, 1, 2), mm = 5 * ri(r, 1, 11); const ans = hh * 60 + mm;
        return { mode: 8, input: 'pad', q: `${hh}시간 ${mm}분은 몇 분일까요?`, answer: ans, type: 'clockMin', unit: '분', vis: null,
          hint1: '1시간은 60분이에요.', steps: [`${hh}시간=${hh * 60}분`, `${hh * 60}분+${mm}분=${ans}분`] };
      }
      if (ask === 'day') {
        const qs = [['하루는 몇 시간일까요?', 24, '시간', '오전 12시간과 오후 12시간이에요.'], ['1주일은 며칠일까요?', 7, '일', '일요일부터 토요일까지 세어 봐요.'], ['1년은 몇 개월일까요?', 12, '개월', '1월부터 12월까지 세어 봐요.'],
          ['1시간은 몇 분일까요?', 60, '분', '긴바늘이 한 바퀴 도는 데 60분이 걸려요.'], ['2주일은 며칠일까요?', 14, '일', '1주일은 7일이에요. 7+7=14'], ['이틀은 몇 시간일까요?', 48, '시간', '하루는 24시간이에요. 24+24=48']];
        const [q, ans, u, hint] = pick(qs, r);
        return { mode: 8, input: 'pad', q, answer: ans, type: 'clockDay', vis: null, hint1: hint, steps: [hint, `정답은 ${ans}`] };
      }
      if (ask === 'before') { // 2시 50분은 3시 몇 분 전
        const mm = 5 * ri(r, 7, 11); const ans = 60 - mm; const nh = h % 12 + 1;
        return { mode: 8, input: 'pad', q: `${h}시 ${mm}분은 ${nh}시 몇 분 전일까요?`, answer: ans, type: 'clockBefore', unit: '분', vis: { kind: 'svg', svg: clockSvg(h, mm, true) },
          hint1: `${nh}시가 되려면 몇 분이 더 있어야 할까요?`, steps: [`${h}시 ${mm}분에서 ${ans}분이 지나면 ${nh}시`, `그래서 ${nh}시 ${ans}분 전`] };
      }
      if (ask === 'after') { // 몇 시간 뒤·몇 분 뒤
        const hours = step >= 30; const add = hours ? ri(r, 1, 4) : 5 * ri(r, 2, 8);
        const t0 = h * 60 + m, t1 = t0 + (hours ? add * 60 : add); const h1 = (Math.floor(t1 / 60) - 1) % 12 + 1, m1 = t1 % 60;
        const ans = tlabel(h1, m1); const choices = clockChoices(r, h1, m1, hours ? 60 : 5); const now = tlabel(h, m);
        return { mode: 8, input: 'choice', q: `지금은 ${now}${josa(now, '이에요', '예요')}. ${hours ? `${add}시간` : `${add}분`} 뒤는 몇 시${m1 ? ' 몇 분' : ''}일까요?`, answer: ans, choices, type: 'clockAfter',
          vis: { kind: 'svg', svg: clockSvg(h, m, step < 30) }, hint1: hours ? '짧은바늘이 한 칸 가면 1시간이에요.' : '긴바늘이 작은 눈금 한 칸 가면 1분, 숫자 한 칸 가면 5분이에요.',
          steps: [`${tlabel(h, m)}에서 ${hours ? `${add}시간` : `${add}분`} 뒤`, `정답은 ${ans}`] };
      }
      const ans = tlabel(h, m); const choices = clockChoices(r, h, m, step);
      const mSay = m === 0 ? '긴바늘이 12를 가리키면 정각이에요.' : m % 5 === 0 ? `긴바늘이 ${J(m / 5, '을', '를')} 가리키면 ${m}분이에요.` : `긴바늘이 ${Math.floor(m / 5) || 12}에서 작은 눈금 ${m % 5}칸 더 가서 ${m}분이에요.`;
      return { mode: 8, input: 'choice', q: '시계가 가리키는 시각은 몇 시 몇 분일까요?'.replace(' 몇 분', step === 60 ? '' : ' 몇 분'), answer: ans, choices, vis: { kind: 'svg', svg: clockSvg(h, m, step < 30) }, type: `clock${step}`,
        hint1: '짧은바늘은 시, 긴바늘은 분을 알려 줘요.', steps: [`짧은바늘을 보면 ${h}시${m ? ` (${J(h, '과', '와')} ${h % 12 + 1} 사이)` : ''}`, mSay, `정답은 ${ans}`] };
    },
    pattern(r, p = {}) {
      const kind = p.kind || 'shape';
      if (kind === 'shape') {
        const pool = shuffle(C.patternThings || [['🐞', '무당벌레']], r); const shapes = p.abc ? ['AB', 'ABC', 'AAB', 'ABB', 'ABCC'] : ['AB', 'AAB', 'ABB'];
        const pat = pick(shapes, r); const letters = [...new Set(pat)]; const map = {}; letters.forEach((L, i) => { map[L] = pool[i]; });
        const unit = [...pat].map(L => map[L]); const len = unit.length * 2 + ri(r, 1, unit.length); const seq = Array.from({ length: len + 1 }, (_, i) => unit[i % unit.length]);
        const ans = seq[len]; const choices = shuffle([...new Set([...letters.map(L => map[L][0]), pool[letters.length][0]])], r).slice(0, 4);
        if (!choices.includes(ans[0])) choices[0] = ans[0];
        return { mode: 9, input: 'choice', q: '규칙에 따라 빈칸에 올 것은 무엇일까요?', answer: ans[0], sayAns: ans[1], choices: shuffle(choices, r), vis: { kind: 'seq', items: seq.slice(0, len).map(x => x[0]) }, type: 'patShape',
          hint1: '되풀이되는 부분을 찾아봐요.', steps: [`되풀이되는 부분: ${unit.map(x => x[1]).join(', ')}`, `그래서 빈칸은 ${ans[1]}`] };
      }
      if (kind === 'mul') {
        const d = pick(p.dans || [2, 3, 4, 5, 6, 7, 8, 9], r);
        return { mode: 9, input: 'pad', q: `곱셈표에서 ${d}단의 곱은 몇씩 커질까요?`, answer: d, vis: { kind: 'line', nums: [d, d * 2, d * 3, d * 4, d * 5] }, type: 'patMul',
          hint1: '이웃한 두 수의 차를 구해 봐요.', steps: [`${d * 2}−${d}=${d}`, `${d}단은 ${d}씩 커져요.`] };
      }
      // 수의 규칙: 몇씩 커지거나 작아지는 수 (빈칸)
      const d = p.step || pick(p.steps || [2, 5, 10], r); const down = p.down != null ? p.down : r() < 0.3; const n = 5;
      const start = down ? ri(r, d * n, Math.min(p.max || 99, d * n + 40)) : ri(r, 1, Math.max(1, (p.max || 99) - d * n));
      const nums = Array.from({ length: n }, (_, i) => start + (down ? -i : i) * d); const bi = r() < 0.6 ? n - 1 : ri(r, 1, n - 2); const ans = nums[bi];
      return { mode: 9, input: 'pad', q: '규칙에 맞게 빈칸에 알맞은 수를 넣어요.', sub: p.sub || '', answer: ans, vis: { kind: 'line', nums, blank: bi }, type: 'patNum',
        hint1: '앞의 수와 뒤의 수를 비교해 봐요. 몇씩 달라지나요?', steps: [`${d}씩 ${down ? '작아지는' : '커지는'} 규칙이에요.`, `${nums[bi - 1]}${down ? '−' : '+'}${d}=${ans}`] };
    },
    bigNum(r, p = {}) {
      const dg = p.digits || 3; const ask = p.ask || 'make'; const top = 10 ** (dg - 1);
      const rnd = () => { let v; do { v = ri(r, top, top * 10 - 1); } while (p.noZero && String(v).includes('0')); return v; };
      if (ask === 'hund') {
        const qs = dg === 3 ? [() => { const k = ri(r, 2, 9); return [`100이 ${k}개이면 얼마일까요?`, k * 100, `100이 ${k}개이면 ${k * 100}`]; }, () => [`10이 10개이면 얼마일까요?`, 100, '10이 10개이면 100'], () => [`99보다 1 큰 수는 얼마일까요?`, 100, '99 다음 수는 100'], () => [`90보다 10 큰 수는 얼마일까요?`, 100, '90+10=100']]
          : [() => { const k = ri(r, 2, 9); return [`1000이 ${k}개이면 얼마일까요?`, k * 1000, `1000이 ${k}개이면 ${k * 1000}`]; }, () => [`100이 10개이면 얼마일까요?`, 1000, '100이 10개이면 1000'], () => [`999보다 1 큰 수는 얼마일까요?`, 1000, '999 다음 수는 1000'], () => [`900보다 100 큰 수는 얼마일까요?`, 1000, '900+100=1000']];
        const [q, ans, st] = pick(qs, r)();
        return { mode: 10, input: 'pad', q, answer: ans, vis: null, type: 'bigHund', hint1: dg === 3 ? '10개씩 묶음 10개가 100이에요.' : '100이 10개 모이면 1000이에요.', steps: [st, `정답은 ${ans}`] };
      }
      if (ask === 'make') {
        const v = rnd(); const ds = String(v).split('').map(Number); const units = [1000, 100, 10, 1].slice(4 - dg);
        const txt = ds.map((d, i) => `${units[i]}이 ${d}개`).join(', ');
        return { mode: 10, input: 'pad', q: `${txt}이면 얼마일까요?`, answer: v, vis: { kind: 'places', ds, units }, type: 'bigMake',
          hint1: '자리마다 숫자를 차례로 써요. 0개인 자리는 0을 써요.', steps: ds.map((d, i) => `${PLACE[dg - 1 - i]}의 자리 숫자 ${d}`).concat([`그래서 ${v}`]) };
      }
      if (ask === 'place') {
        let v, pos, d; do { v = rnd(); pos = ri(r, 0, dg - 1); d = Math.floor(v / 10 ** pos) % 10; } while (!d || String(v).split(String(d)).length !== 2);
        const val = d * 10 ** pos; const choices = shuffle(Array.from({ length: dg }, (_, k) => d * 10 ** k), r);
        return { mode: 10, input: 'choice', q: `${v}에서 숫자 ${J(d, '은', '는')} 얼마를 나타낼까요?`, answer: val, choices, vis: { kind: 'placeTable', v, hi: pos, dg }, type: 'bigPlace',
          hint1: '숫자가 어느 자리에 있는지 봐요.', steps: [`${d}${josa(d, '은', '는')} ${PLACE[pos]}의 자리 숫자예요.`, `그래서 ${val}${josa(val, '을', '를')} 나타내요.`] };
      }
      if (ask === 'skip') {
        const st = pick(p.steps || (dg === 3 ? [1, 10, 100] : [10, 100, 1000]), r); let start = ri(r, top, top * 10 - 1 - st * 4); if (st >= 100) start = start - start % 10;
        const nums = [0, 1, 2, 3].map(k => start + k * st); const bi = ri(r, 1, 3); const ans = nums[bi];
        return { mode: 10, input: 'choice', q: `${st}씩 뛰어 세어요. 빈칸에 알맞은 수는?`, answer: ans, choices: shuffle([...new Set([ans, ans + st, ans - st, ans + (st === 1 ? 10 : st / 10), ans - (st === 1 ? 10 : st / 10)])].filter(x => x !== ans).slice(0, 3).concat(ans), r), vis: { kind: 'line', nums, blank: bi }, type: 'bigSkip',
          hint1: `${st}씩 뛰어 세면 ${PLACE[String(st).length - 1]}의 자리 숫자가 1씩 커져요.`, steps: [`${nums[bi - 1]}보다 ${st} 큰 수`, `정답은 ${ans}`] };
      }
      if (ask === 'cmp') {
        const a = rnd(); let b; const k = ri(r, 0, dg - 2); // 앞의 k자리는 같게
        do { const lead = Math.floor(a / 10 ** (dg - k)); b = lead * 10 ** (dg - k) + ri(r, k ? 0 : top, 10 ** (dg - k) - 1); } while (b === a || b < top);
        const big = r() < 0.7; const ans = big ? Math.max(a, b) : Math.min(a, b);
        let pos = dg - 1; while (pos > 0 && Math.floor(a / 10 ** pos) % 10 === Math.floor(b / 10 ** pos) % 10) pos--;
        return { mode: 10, input: 'choice', two: true, q: big ? '더 큰 수는?' : '더 작은 수는?', answer: ans, choices: [a, b], vis: null, type: 'bigCmp',
          hint1: '높은 자리 숫자부터 차례로 비교해요.', steps: [`${PLACE[pos]}의 자리 숫자가 달라요: ${Math.floor(a / 10 ** pos) % 10}, ${Math.floor(b / 10 ** pos) % 10}`, `그래서 ${J(ans, '이', '가')} 더 ${big ? '커요' : '작아요'}.`] };
      }
      // read: "삼백오를 수로 쓰면?"
      let v; do { v = rnd(); } while (!String(v).includes('0') && r() < 0.6);
      const word = sino(v);
      return { mode: 10, input: 'pad', q: `${word}${josa(word, '을', '를')} 수로 쓰면 얼마일까요?`, answer: v, vis: null, type: 'bigRead',
        hint1: '읽지 않은 자리에는 0을 써요.', steps: String(v).split('').map((d, i) => `${PLACE[dg - 1 - i]}의 자리: ${d}`).concat([`그래서 ${v}`]) };
    },
    length(r, p = {}) {
      const ask = p.ask || 'ruler';
      if (ask === 'ruler') {
        const n = ri(r, 2, p.max || 10); const s0 = p.shift ? ri(r, 1, 12 - n) : 0; const em = pick(['✏️', '🐛', '🖍️', '🥕', '🐍', '🐟'], r);
        return { mode: 11, input: 'pad', q: `${em} 길이는 몇 cm일까요?`, answer: n, unit: 'cm', vis: { kind: 'svg', svg: rulerSvg(s0, n) }, type: 'lenRuler',
          hint1: s0 ? `0이 아닌 ${s0}에서 시작해요. 1cm가 몇 번인지 세어 봐요.` : '끝이 가리키는 눈금을 읽어요.', steps: s0 ? [`${s0}부터 ${s0 + n}까지`, `1cm가 ${n}번이니까 ${n}cm`] : [`0부터 ${n}까지`, `${n}cm`] };
      }
      if (ask === 'mcm') {
        const mm = ri(r, 1, 4), cc = ri(r, 1, 99); const tot = mm * 100 + cc;
        if (r() < 0.5) return { mode: 11, input: 'pad', q: `${mm}m ${cc}cm는 몇 cm일까요?`, answer: tot, unit: 'cm', vis: null, type: 'lenMcm', hint1: '1m는 100cm예요.', steps: [`${mm}m=${mm * 100}cm`, `${mm * 100}cm+${cc}cm=${tot}cm`] };
        return { mode: 11, input: 'pad', q: '빈칸에 알맞은 수를 넣어요.', expr: `${tot}cm=□m ${cc}cm`, answer: mm, unit: 'm', vis: null, type: 'lenMcm', hint1: '100cm가 1m예요.', steps: [`${tot}cm=${mm * 100}cm+${cc}cm`, `${mm * 100}cm=${mm}m`] };
      }
      // 길이의 합·차: 1m 20cm+2m 50cm=□m 70cm
      const add = r() < 0.6; let m1 = ri(r, 1, 5), c1 = 5 * ri(r, 1, 17), m2 = ri(r, 1, 4), c2 = 5 * ri(r, 1, 17);
      if (add) { while (c1 + c2 >= 100) c2 -= 10; } else { if (m1 <= m2) m1 = m2 + ri(r, 1, 3); if (c1 < c2) [c1, c2] = [c2, c1]; }
      const cm = add ? c1 + c2 : c1 - c2, mm = add ? m1 + m2 : m1 - m2;
      return { mode: 11, input: 'pad', q: '빈칸에 알맞은 수를 넣어요.', expr: `${m1}m ${c1}cm${add ? '+' : '−'}${m2}m ${c2}cm=□m ${cm}cm`, answer: mm, unit: 'm', vis: null, type: 'lenAdd',
        hint1: 'm는 m끼리, cm는 cm끼리 계산해요.', steps: [`cm끼리: ${c1}${add ? '+' : '−'}${c2}=${cm}`, `m끼리: ${m1}${add ? '+' : '−'}${m2}=${mm}`] };
    },
    sortCount(r, p = {}) {
      const ask = p.ask || 'count'; const grp = pick((C.sortSets || []).filter(g => p.chart || !g.chartOnly), r); const kinds = shuffle(grp.items, r).slice(0, p.kinds || 3);
      let counts; do { counts = kinds.map(() => ri(r, p.chart ? 2 : 1, p.chart ? 7 : 5)); } while (new Set(counts).size < counts.length);
      const list = shuffle(kinds.flatMap((k, i) => Array(counts[i]).fill(k)), r);
      const vis = p.chart ? { kind: 'chart', rows: kinds.map((k, i) => [k[0], k[1], counts[i]]), title: grp.chart } : { kind: 'collection', items: list.map(k => k[0]) };
      const U_ = p.chart ? '명' : grp.unit; const pre = p.chart ? `${grp.chart}. ` : '';
      if (ask === 'most' || ask === 'least') {
        const most = ask === 'most'; const v = most ? Math.max(...counts) : Math.min(...counts); const k = kinds[counts.indexOf(v)];
        return { mode: 12, input: 'choice', q: `${pre}가장 ${most ? '많은' : '적은'} 것은 무엇일까요?`, answer: k[0], sayAns: k[1], choices: kinds.map(x => x[0]), vis, type: p.chart ? 'chartMost' : 'sortMost',
          hint1: p.chart ? '○가 가장 ' + (most ? '긴' : '짧은') + ' 줄을 찾아봐요.' : '종류별로 나누어 세어 봐요.', steps: kinds.map((x, i) => `${x[1]} ${counts[i]}${U_}`).concat([`가장 ${most ? '많은' : '적은'} 것은 ${k[1]}`]) };
      }
      if (ask === 'total') {
        const tot = counts.reduce((a, b) => a + b, 0);
        return { mode: 12, input: 'pad', q: `${pre}모두 몇 ${U_}일까요?`, answer: tot, unit: U_, vis, type: 'chartTotal',
          hint1: '종류별 수를 모두 더해요.', steps: [counts.join('+') + `=${tot}`] };
      }
      const i = ri(r, 0, kinds.length - 1); const k = kinds[i];
      return { mode: 12, input: 'pad', q: `${pre}${k[1]}${josa(k[1], '은', '는')} 몇 ${U_}일까요?`, answer: counts[i], unit: U_, vis, type: p.chart ? 'chartCount' : 'sortCount',
        hint1: p.chart ? `${k[1]} 줄의 ○를 세어 봐요.` : `${k[1]}만 골라서 하나씩 세어 봐요.`, steps: [`${k[1]}: ${counts[i]}${U_}`] };
    },
    mulWord(r, p = {}) {
      const a = pick(p.dans || [2, 3, 4, 5], r), b = ri(r, 2, p.bmax || 5); const ans = a * b; const style = p.style || pick(['group', 'times'], r); const em = pick(C.things, r);
      const q = style === 'times' ? `${a}의 ${b}배는 얼마일까요?` : `${em} ${a}개씩 ${b}묶음은 모두 몇 개일까요?`;
      return { mode: 13, input: 'pad', q, answer: ans, vis: { kind: 'groups', size: a, n: b, emoji: em }, type: style === 'times' ? 'mulTimes' : 'mulGroup', unit: style === 'times' ? '' : '개',
        hint1: `${a}씩 뛰어 세어 봐요.`, steps: [`${a}씩 ${b}묶음은 ${a}의 ${b}배`, `${Array(b).fill(a).join('+')}=${ans}`, `${a}×${b}=${ans}`] };
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
      const ex = un.explain[(L.d - 1) % un.explain.length]; const asker = L.d % 2 ? 'hyun' : 'chorok';
      acts = [{ type: 'prob', teach: true, ex, asker, prob: teachProb(ex, asker) }];
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
    if (L.drill) return drillDone();
    L.s++; S.pos.s = L.s; save();
    if (L.s >= STEPS.length) return finishDay();
    const lr = lockReason(); if (lr) return lockedScreen(lr);
    L.acts = buildStep(L.s); L.i = 0;
    stepIntro();
  }
  // 별 (공통 64번, v0.3.1): 몇 번째 시도든 윤이가 정답을 넣으면 1개(solved=true), 못 맞히고 "다음 ▶"으로 넘어가면 0개(solved=false).
  // 문제당 한 번만, 하루 끝 보너스 3개, 하루치(날짜 기준) 합계 50개 이하 (v0.1.1: 20 → 50)
  const DAY_STAR_MAX = 50, DAY_BONUS = 3;
  function award(solved) {
    const key = `${L.s}:${L.i}`;
    let n = solved ? 1 : 0;
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
    if (a.drill) { L.drillRes.n++; if (ok) L.drillRes.ok++; }
    save();
  }
  function flash(emoji) { const f = document.createElement('div'); f.className = 'feedback'; f.innerHTML = `<span>${emoji}</span>`; document.body.appendChild(f); setTimeout(() => f.remove(), 950); }

  function lessonFrame(inner, opts = {}) {
    const total = L.acts.length; const p = Math.round(L.i / total * 100); const un = unitById(L.u);
    if (L.drill) return `<div class="screen">
      <div class="topbar">
        <button class="icon-btn" data-act="quit" aria-label="처음으로">🏠</button>
        <button class="icon-btn" data-act="prev" aria-label="이전 문제"${L.i === 0 ? ' disabled style="opacity:.35"' : ''}>◀</button>
        <div class="train"><div class="car now" style="--p:${p}%"><i></i></div></div>
        <div class="stars">⭐ ${S.stars}</div>
      </div>
      <div class="step-name">🧮 연산 연습 · ${esc(L.drill.op.name)} ${esc(L.drill.sz.name)} · ${L.i + 1} / ${total}</div>
      <div class="stage${opts.split ? ' split' : ''}">${inner}</div>
    </div>`;
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
    ({ greet: actGreet, msg: actMsg, concept: actConcept, prob: actProb })[a.type](a);
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
    // v0.5.0 그림
    if (v.kind === 'groups') { const em = v.emoji || '🟢'; const tot = v.size * v.n; return `<div class="groups${tot > 30 ? ' sm' : ''}">${Array.from({ length: v.n }, () => `<span class="grp">${Array.from({ length: v.size }, () => `<i>${em}</i>`).join('')}</span>`).join('')}</div>`; }
    if (v.kind === 'svg') return `<div class="svgvis">${v.svg}</div>`;
    if (v.kind === 'shapes') return `<div class="shapes">${v.svgs.join('')}</div>`;
    if (v.kind === 'seq') return `<div class="seq">${v.items.map(x => `<span>${x}</span>`).join('')}<span class="blank">?</span></div>`;
    if (v.kind === 'places') return `<div class="places">${v.ds.map((d, i) => `<span class="pgrp">${Array.from({ length: d }, () => `<b class="pv p${v.units[i]}">${v.units[i]}</b>`).join('') || '<em>없음</em>'}</span>`).join('')}</div>`;
    if (v.kind === 'placeTable') { const ds = String(v.v).split(''); return `<table class="ptable"><tr>${ds.map((_, i) => `<th>${PLACE[v.dg - 1 - i]}의 자리</th>`).join('')}</tr><tr>${ds.map(d => `<td>${d}</td>`).join('')}</tr></table>`; }
    if (v.kind === 'chart') return `<div class="chart"><div class="muted">${esc(v.title || '')}</div><table>${v.rows.map(([em, nm, n]) => `<tr><th>${em} ${esc(nm)}</th><td>${'<i>○</i>'.repeat(n)}</td></tr>`).join('')}</table></div>`;
    if (v.kind === 'collection') return `<div class="items coll">${v.items.map(x => `<span>${x}</span>`).join('')}</div>`;
    if (v.kind === 'pairs') { const pr = []; for (let k = 0; k < v.n; k += 2) pr.push(`<span class="pair${k + 1 >= v.n ? ' lone' : ''}">${v.emoji}${k + 1 < v.n ? v.emoji : ''}</span>`); return `<div class="pairs" id="pairs">${pr.join('')}</div>`; }
    return '';
  }
  function conceptVisHtml(v) {
    if (!v) return '';
    if (v.tens != null) return `<div class="vis-row">${bundleHtml(v.tens)}${v.plus ? `<b class="opm">+</b>${bundleHtml(v.plus, { cls: 'bb' })}` : ''}</div>`;
    if (v.frame) return framesHtml(v.frame);
    const cr = rngFrom('concept|' + JSON.stringify(v));
    if (v.shapes) return `<div class="shapes">${v.shapes.map(k => shapeSvg(k, cr, 90)).join('')}</div>`;
    if (v.clock) return `<div class="svgvis">${clockSvg(v.clock[0], v.clock[1], v.clock[1] % 5 !== 0)}</div>`;
    if (v.groups) return visHtml({ kind: 'groups', size: v.groups[0], n: v.groups[1], emoji: '🍓' });
    if (v.ruler) return `<div class="svgvis">${rulerSvg(v.ruler[0], v.ruler[1])}</div>`;
    if (v.places) { const units = [1000, 100, 10, 1].slice(4 - v.places.length); return visHtml({ kind: 'places', ds: v.places, units }); }
    if (v.line) { const nums = []; for (let n = v.line[0]; n <= v.line[1]; n += (v.line[2] || 1)) nums.push(n); return `<div class="nline">${nums.map(n => `<span>${n}</span>`).join('<i>›</i>')}</div>`; }
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
      const cls = pr.choices.some(c => /[가-힣]/.test(String(c)) && String(c).length > 2) ? 'text' : 'num';
      return `<div class="choices${pr.two ? ' two' : ''}">${pr.choices.map(c => `<button class="choice ${cls}" data-act="pick" data-arg="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
    }
    if (pr.input === 'pad') {
      const len = String(pr.answer).length; const names = { 1: ['일'], 2: ['십', '일'], 3: ['백', '십', '일'], 4: ['천', '백', '십', '일'] }[len] || [];
      return `<div class="padwrap"><div class="ansboxes${len > 3 ? ' four' : ''}">${names.map((nm, k) => `<div class="abox" data-k="${k}"><span id="d${k}"></span><small>${nm}의 자리</small></div>`).join('')}</div>
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
    const tag = a.greet ? '오늘의 수' : a.teach ? '가르쳐주기' : a.drill ? '연산 연습' : a.flash ? `사다리 ${S.ladder.rung + 1}칸` : a.chal ? '마무리 도전' : a.review ? '복습' : MODES[pr.mode];
    const ansWord = () => `${pr.sayAns || pr.answer}${pr.unit ? pr.unit : ''}`;
    const f = pr.friend && C.friends[pr.friend];
    const showVis = pr.vis && (pr.mode !== 5 || pr.showVis);
    const left = `<div class="prompt">
        ${a.review ? '<div class="muted" style="font-weight:800">🔁 지난번에 어려웠던 문제예요</div>' : ''}
        ${pr.mode === 6 || pr.mode === 14 ? `<div class="say">${f ? friendHtml(pr.friend, true) : ''}<span class="text story">${esc(pr.q)}</span></div>` : `<div class="bubble">${esc(pr.q)}</div>`}
        ${a.teach ? `<div class="muted" style="font-weight:700">${esc(f.call || f.name)}에게 정답을 넣어서 알려 줘요!</div>` : ''}
        ${pr.sub ? `<div class="muted" style="font-weight:700">${esc(pr.sub)}</div>` : ''}
        ${pr.expr ? `<div class="expr${pr.expr.length > 11 ? ' long' : ''}" id="expr">${esc(pr.expr).replace('□', '<span class="qbox">□</span>')}</div>` : ''}
        <div id="visbox"${showVis ? '' : ' hidden'}>${pr.input === 'frame' ? '' : visHtml(pr.vis)}</div>
        ${pr.mode === 5 && !pr.showVis && pr.vis ? `<button class="btn small" data-act="helper">🧮 ${pr.vis.kind === 'frames' ? '10칸 상자 도우미' : '그림으로 보기'}</button>` : ''}
        ${pr.eunhoo != null ? `<div class="say">${friendHtml('eunhoo')}<span class="text">나는 ${esc(sayGuess(pr))} 생각해. 너는?</span></div>` : ''}
        <div class="hintbox" id="hint" hidden></div>
        <div class="listen-row"><button class="listen" data-act="play" aria-label="다시 듣기">🔊</button></div>
      </div>`;
    const right = `<div class="prompt">${answerArea(pr)}<div class="next-row" id="nextRow" hidden><button class="btn primary" data-act="next">다음 ▶</button></div></div>`;
    const sayQ = () => koSeq([pr.q, pr.expr ? pr.expr.replace('=□', '=?') : '', pr.sub || '']); // 문제·식·설명을 따로 읽어요 (녹음 문장 단위)
    // 맞았을 때
    const right_ = async () => {
      att.done = true; const my = actToken; ding();
      const n = award(true); flash(n ? '⭐' : '👍');
      if (!a.greet && !a.teach) record(a, att.n === 0);
      const hint = document.getElementById('hint'); if (hint) { hint.hidden = true; }
      if (a.teach) { // 가르쳐주기: 정답을 넣으면 설명을 보여주고 기록해요 (v0.5.0, 말하기 대신 숫자 입력)
        teachLog(a, String(pr.answer), att.n === 0);
        if (hint) { hint.hidden = false; hint.innerHTML = `💬 이렇게 설명할 수 있어요<br><b>${esc(pr.model)}</b>`; }
        const fr = C.friends[a.asker]; const thanks = `${fr.call || fr.name}${josa(fr.call || fr.name, '이', '가')}`;
        hush(); await ko(`${praise()} 우와! ${thanks} 이제 알겠대. 고마워!`); if (my !== actToken) return; await ko(pr.model); await sleep(900); if (my === actToken) nextAct();
        return;
      }
      const nr = document.getElementById('nextRow'); if (nr) nr.hidden = true;
      document.querySelectorAll('.qbox').forEach(q => { q.textContent = pr.answer; q.classList.add('ok'); });
      let msg = praise();
      if (pr.eunhoo != null) msg += pr.eunhoo === pr.answer ? ' 은후도 맞았네!' : ` 은후는 ${sayGuess(pr)} 했지만, ${S.settings.childName}${josa(S.settings.childName, '이', '가')} 맞았어!`;
      const ansSay = pr.expr ? pr.expr.replace('□', pr.answer) : pr.storyExpr ? pr.storyExpr.replace('□', pr.answer) : ansWord();
      hush(); await ko(`${msg} ${ansSay}`); await sleep(350); if (my === actToken) nextAct();
    };
    // 틀렸을 때: 힌트 1 → 풀이 과정 → 정답·풀이 보여주기 ("땡"·빨간 X 없음)
    // 공통 64번: 정답을 보여줘도 빈칸·보기·구슬·패드는 채우지 않아요. 윤이가 직접 넣으면 별 1개, "다음 ▶"으로 넘어가면 0개
    const wrong_ = async () => {
      const my = actToken; if (!a.greet && !a.teach && att.n === 0) record(a, false);
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
        await koSeq(['같이 풀어 보자.', ...pr.steps]);
      } else if (att.n === 3) {
        hint.innerHTML = `✨ 정답은 <b>${esc(pr.answer)}</b><br>${pr.steps.map(esc).join('<br>')}<br>⭐ 정답을 넣으면 별을 받아요`;
        document.querySelectorAll('.choice').forEach(c => { if (c.dataset.arg === String(pr.answer)) c.classList.add('glow'); });
        if (pr.input === 'frame') fillTo(0);
        if (pr.input === 'pad') { typed = ''; showTyped(); }
        document.getElementById('nextRow').hidden = false;
        await ko(`${LINES.showAnswer || '괜찮아!'} 정답은 ${ansWord()}. 정답을 넣으면 별을 받아요!`);
      } else {
        // 정답을 보여준 뒤에 또 틀려도 괜찮아요 (벌점 없음)
        if (pr.input === 'frame') fillTo(0);
        await ko(`괜찮아, 천천히 해 보자. 정답은 ${ansWord()}.`);
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
      next: () => { if (!att.done) { att.done = true; award(false); if (a.teach) teachLog(a, '(넘어감)', false); } nextAct(); },
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
      if (!a.greet && !L.heard[pr.mode + (a.flash ? 'f' : '')] && !a.chal) { L.heard[pr.mode + (a.flash ? 'f' : '')] = 1; if (a.flash) await ko('반짝 연산! 천천히 해도 돼요.'); if (a.drill && L.i === 0) await ko('연산 연습! 천천히 해도 돼요.'); }
      if (a.teach && my === actToken) { const fr = C.friends[a.asker]; await ko(`${fr.name}${josa(fr.name, '이', '가')} 물어봐요.`); }
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

  /* ---------- 설명하기 (현이·초록이에게 가르쳐주기) ----------
     v0.5.0: 말하기(음성인식) 대신 숫자 패드·보기로 정답을 넣어요. 맞히면 "이렇게 설명할 수 있어요"를 보여주고 읽어줘요.
     content.js explain: { q, ans, choices?, unit?, hint?, model } */
  function teachProb(ex, asker) {
    return { g: 'teach', type: 'teach', label: '가르쳐주기', mode: 14, input: ex.choices ? 'choice' : 'pad', two: !!(ex.choices && ex.choices.length === 2),
      q: `${callName()}, ${ex.q}`, answer: ex.ans, choices: ex.choices, friend: asker, unit: ex.unit || '', model: ex.model,
      hint1: ex.hint || '천천히 생각해 봐요. 그림을 떠올려 봐요.', steps: [ex.model] };
  }
  function teachLog(a, said, ok) {
    if (S.settings.explainSave === false || S.settings.explainSave === 'false') return;
    const fr = C.friends[a.asker]; S.explains.unshift({ date: today(), who: fr.name, q: a.ex.q, said, ok }); S.explains = S.explains.slice(0, 14); save();
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
  // 다음 단원: 아직 하루도 안 한 단원 중 교과서 순서로 가장 앞 단원 (v0.5.0 — 새로 열린 1학년 모양·시계 단원을 건너뛰지 않게). 모두 했으면 바로 다음 단원
  function nextReady(u) {
    const fresh = READY.find(x => x.id !== u && doneCount(x.id) === 0); if (fresh) return fresh.id;
    const i = READY.findIndex(x => x.id === u); return READY[(i + 1) % READY.length].id;
  }
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
      ${L.earned ? `<div class="big-stars">⭐ +${L.earned}</div>` : `<div class="bubble">오늘 별은 다 모았어요! ⭐<small>별은 하루에 ${DAY_STAR_MAX}개까지 받아요</small></div>`}
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
  /* ================= 아빠 화면 공통: 암호(61)·통계(62)·탭(63) — 세 앱 같은 코드 (plan/0_COMMON_spec.md 5-1) ================= */
  const DEFAULT_PIN = '1234';
  const parentPin = () => String(S.settings.parentPin || DEFAULT_PIN);
  const PARENT_SCREENS = ['gate', 'pinreset', 'parent', 'rewardadmin', 'spec'];
  // 앱을 켜 둔 시간(아빠 화면 제외) — 통계용. 하루 시간 제한은 계속 sec(학습 화면)만 써요
  setInterval(() => { if (!document.hidden && screen && !PARENT_SCREENS.includes(screen)) { const l = todayLog(); l.app = (l.app || 0) + 10; save(); } }, 10000);
  const gateFocus = () => setTimeout(() => { const i = document.getElementById('ans'); if (i) { i.focus(); i.addEventListener('keydown', e => { if (e.key === 'Enter') H.ok(); }); } }, 50);
  function gateScreen(next) {
    render('gate', `<div class="screen"><div class="topbar"><button class="icon-btn" data-act="home">🏠</button></div>
      <div class="gate"><div class="card"><b>🔒 아빠 화면 암호</b><p class="muted">암호를 입력하세요</p>
      <input id="ans" class="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" aria-label="암호">
      <button class="btn primary" data-act="ok">확인</button>
      <button class="btn small" data-act="forgot">암호를 잊었어요</button></div></div></div>`, {
      home: homeScreen,
      ok: () => {
        const i = document.getElementById('ans');
        if (i && i.value.trim() && i.value.trim() === parentPin()) { pTab = 'summary'; const t = document.getElementById('toast'); if (t) t.classList.remove('show'); next(); }
        else { toast('암호가 달라요'); if (i) { i.value = ''; i.focus(); } }
      },
      forgot: () => pinResetScreen(next),
    });
    gateFocus();
  }
  function pinResetScreen(next) {
    const a = 12 + Math.floor(Math.random() * 28), b = 12 + Math.floor(Math.random() * 18);
    render('pinreset', `<div class="screen"><div class="topbar"><button class="icon-btn" data-act="home">🏠</button></div>
      <div class="gate"><div class="card"><b>암호 되돌리기 (어른 확인)</b><p class="muted">맞히면 암호가 ${DEFAULT_PIN}로 돌아가요</p>
      <div style="font-size:40px;font-weight:900">${a} × ${b} = ?</div>
      <input id="ans" inputmode="numeric" autocomplete="off"><button class="btn primary" data-act="ok">확인</button>
      <button class="btn small" data-act="back">암호 입력으로</button></div></div></div>`, {
      home: homeScreen,
      back: () => gateScreen(next),
      ok: () => {
        if (+document.getElementById('ans').value === a * b) { S.settings.parentPin = DEFAULT_PIN; save(); pTab = 'settings'; next(); toast(`암호를 ${DEFAULT_PIN}로 되돌렸어요. 새 암호로 바꿔 주세요`); }
        else { toast('다시 계산해 보세요'); pinResetScreen(next); }
      },
    });
    gateFocus();
  }
  const PTABS = [['summary', '📊', '요약'], ['stats', '📈', '통계'], ['reward', '🎁', '보상·별'], ['progress', '📚', '학습·진도'], ['settings', '⚙️', '설정'], ['manage', '🛠️', '백업·업데이트']];
  let pTab = 'summary';
  const ptabBar = () => `<nav class="ptabs" role="tablist" aria-label="아빠 화면 메뉴">${PTABS.map(([k, i, n]) => `<button class="ptab${pTab === k ? ' on' : ''}" role="tab" aria-selected="${pTab === k}" data-act="ptab" data-arg="${k}"><span aria-hidden="true">${i}</span>${n}</button>`).join('')}</nav>`;
  const ptabPanel = (k, html) => `<section class="ppanel" role="tabpanel" data-panel="${k}"${pTab === k ? '' : ' hidden'}>${html}</section>`;
  function ptabSwitch(k) {
    if (!PTABS.some(t => t[0] === k)) return; pTab = k;
    document.querySelectorAll('.ptab').forEach(b => { const on = b.dataset.arg === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    document.querySelectorAll('.ppanel').forEach(p => { p.hidden = p.dataset.panel !== k; });
    window.scrollTo(0, 0); ptabReveal(true);
  }
  // 폰에서 켜진 탭이 탭 바 밖으로 밀리지 않게
  function ptabReveal(smooth) { const on = document.querySelector('.ptab.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: smooth ? 'smooth' : 'auto' }); }
  let statDays = 7;
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  function statRows(n) {
    const out = [];
    for (let i = 0; i < n; i++) { const d = addDays(-i); const l = S.log[d] || {}; out.push({ d, min: Math.round((l.sec || 0) / 60), app: l.app != null ? Math.round(l.app / 60) : null, stars: l.stars || 0 }); }
    return out;
  }
  function statsCard() {
    const rows = statRows(statDays); const act = rows.filter(r => r.min > 0 || r.stars > 0); const td = today();
    const totMin = rows.reduce((s, r) => s + r.min, 0), totStar = rows.reduce((s, r) => s + r.stars, 0), maxStar = Math.max(0, ...rows.map(r => r.stars));
    const avg = act.length ? Math.round(totMin / act.length) : 0;
    const maxMin = Math.max(Number(S.settings.dailyLimit) || 20, ...rows.map(r => r.min), 1);
    const dl = d => { const x = new Date(d + 'T12:00:00'); return `${x.getMonth() + 1}/${x.getDate()} (${WD[x.getDay()]})`; };
    return `<div class="card" id="statsCard"><h3>📈 날짜별 학습 시간·얻은 별</h3>
      <div class="row stat-range">${[7, 14, 30].map(n => `<button class="btn small${statDays === n ? ' primary' : ''}" data-act="statdays" data-arg="${n}">최근 ${n}일</button>`).join('')}</div>
      <div class="kv" style="margin-top:12px"><div>학습한 날<b>${act.length}일</b></div><div>총 학습 시간<b>${totMin}분</b></div><div>하루 평균<b>${avg}분</b></div><div>얻은 별<b>${totStar}개</b></div><div>하루 최고 별<b>${maxStar}개</b></div></div>
      <ul class="stat-list">${rows.map(r => `<li class="stat-row${r.d === td ? ' today' : ''}${r.min || r.stars ? '' : ' empty'}" data-date="${r.d}"><span class="stat-date">${dl(r.d)}${r.d === td ? ' · 오늘' : ''}</span>
        <div class="stat-bars"><div class="stat-bar min"><i style="width:${Math.min(100, Math.round(r.min / maxMin * 100))}%"></i><b>⏱️ ${r.min}분</b>${r.app != null && r.app > r.min ? `<small>앱 켠 시간 ${r.app}분</small>` : ''}</div>
        <div class="stat-bar star"><i style="width:${Math.min(100, Math.round(r.stars / DAY_STAR_MAX * 100))}%"></i><b>⭐ ${r.stars}개</b></div></div></li>`).join('')}</ul>
      <p class="muted">학습 시간은 문제 푸는 화면에 있던 시간이에요 (하루 시간 제한 ${esc(S.settings.dailyLimit)}분과 같은 기준). “앱 켠 시간”은 아빠 화면을 뺀 전체 시간이에요 (이 버전부터 기록). 별은 그날 문제와 하루 끝 보너스로 얻은 별이에요 (하루 최대 ${DAY_STAR_MAX}개, 아빠가 조정한 별은 빼요).</p></div>`;
  }
  function pinCard() {
    const isDef = parentPin() === DEFAULT_PIN;
    return `<div class="card" id="pinCard"><h3>🔒 아빠 화면 암호</h3>
      <p>${isDef ? `⚠️ 지금은 기본 암호(<b>${DEFAULT_PIN}</b>)예요. 윤이가 모르는 암호로 바꿔 주세요.` : '✅ 새 암호가 설정되어 있어요.'}</p>
      <div class="form"><label>새 암호 (숫자 4~8자리)<input id="pinNew" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"></label>
        <label>새 암호 한 번 더<input id="pinNew2" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="new-password"></label></div>
      <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="btn small primary" data-act="setpin">암호 바꾸기</button></div>
      <p class="muted">암호를 잊으면 암호 화면의 “암호를 잊었어요”에서 어른용 곱셈 문제를 풀어 ${DEFAULT_PIN}로 되돌릴 수 있어요. 전체 초기화를 해도 ${DEFAULT_PIN}로 돌아가요.</p></div>`;
  }
  function setPin() {
    const a = ((document.getElementById('pinNew') || {}).value || '').trim(), b = ((document.getElementById('pinNew2') || {}).value || '').trim();
    if (!/^\d{4,8}$/.test(a)) return toast('숫자 4~8자리로 적어주세요');
    if (a !== b) return toast('두 번 적은 암호가 달라요');
    S.settings.parentPin = a; save(); parentScreen(); toast('암호를 바꿨어요');
  }
  const parentCommonHandlers = () => ({ ptab: k => ptabSwitch(k), statdays: n => { statDays = +n || 7; parentScreen(); }, setpin: setPin });
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
    const files = ['./', 'index.html', 'app.js', 'content.js', 'style.css', 'sw.js', 'manifest.webmanifest', '기획서.md', 'audio-ko/index.json'];
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
  /* ================= 아빠: 받은 보상 관리 (사용완료 체크) — 세 앱 공통 60번 ================= */
  function rewardAdminScreen() {
    const g = Math.max(0, S.stars - S.goalBase); const goal = Math.max(1, Number(S.settings.goalStars));
    const rows = S.rewards.map((r, i) => ({ r, i })).reverse(); // 최근 보상이 위로
    const row = ({ r, i }) => `<li class="rw-row${r.used ? ' rw-used' : ''}">
        <div class="rw-info"><b>${r.used ? '✅' : '🎁'} ${esc(r.text)}</b><small>${esc(r.date)} 받음 · 별 ${r.stars}개${r.used ? ` · ${esc(r.used)} 사용` : ''}</small></div>
        <button class="btn small rw-check${r.used ? ' on' : ''}" data-act="usedrw" data-arg="${i}" aria-pressed="${r.used ? 'true' : 'false'}">${r.used ? '✅ 사용완료 (취소하려면 누르기)' : '☐ 사용완료 체크'}</button>
        <button class="btn small" data-act="delrw" data-arg="${i}">삭제</button></li>`;
    render('rewardadmin', `<div class="screen"><div class="parent">
      <div class="topbar"><button class="icon-btn" data-act="back" aria-label="아빠 화면으로">⬅️</button><h2 class="title">🎁 받은 보상 관리</h2></div>
      <div class="card"><h3>지금 목표: ${esc(S.settings.goalText)}</h3>
        <div class="goal-bar"><i style="width:${Math.min(100, Math.round(g / goal * 100))}%"></i></div>
        <p class="muted">모은 별 ${Math.min(g, goal)} / ${goal}${g >= goal ? ' · 목표 달성! 보상을 주고 아래 버튼으로 기록해요' : ''}</p>
        <button class="btn small${g >= goal ? ' primary' : ''}" data-act="gave">🎁 보상 줬어요 (기록하고 목표 새로 시작)</button></div>
      <div class="card"><h3 id="rwHead">${rwHeadText()}</h3>
        ${rows.length ? `<ul class="rw-rows">${rows.map(row).join('')}</ul><p class="muted">보상을 실제로 쓰면 “사용완료 체크”를 눌러 주세요. 윤이의 보상 목록에도 사용완료로 보여요. 다시 누르면 취소돼요.</p>`
          : '<p class="muted">아직 기록된 보상이 없어요. 윤이에게 보상을 주면 위의 “🎁 보상 줬어요”를 눌러 기록하세요. 기록한 보상이 여기에 나오고, 사용완료를 체크할 수 있어요.</p>'}
      </div></div></div>`, {
      back: parentScreen,
      usedrw: i => {
        const r = S.rewards[+i]; if (!r) return;
        r.used = r.used ? null : today(); save();
        const y = window.scrollY; rewardAdminScreen(); window.scrollTo(0, y); // 스크롤 위치 유지
        toast(r.used ? '사용완료로 표시했어요' : '사용 전으로 되돌렸어요');
      },
      delrw: (i, btn) => { if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = '한 번 더 누르면 삭제'; return; } S.rewards.splice(+i, 1); save(); const y = window.scrollY; rewardAdminScreen(); window.scrollTo(0, y); },
      gave: () => { S.rewards.push({ date: today(), text: S.settings.goalText, stars: Number(S.settings.goalStars) }); S.goalBase = S.stars; save(); toast('보상을 기록했어요. 새 목표를 시작해요!'); rewardAdminScreen(); },
    });
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
      <div class="topbar"><button class="icon-btn" data-act="home">🏠</button><h2 class="title">아빠 화면</h2><div class="spacer"></div><button class="btn small" data-act="rewardadmin">🎁 보상</button><button class="btn small" data-act="spec">📋 기획·변경 기록</button><span class="muted">v${APP_VERSION}</span></div>
      ${ptabBar()}
      ${ptabPanel('summary', `
      <div class="card"><h3>이번 주 (최근 7일)</h3><div class="kv">
        <div>학습한 날<b>${days7}일</b></div><div>푼 문제<b>${n7}개</b></div><div>한 번에 맞힘<b>${n7 ? Math.round(ok7 / n7 * 100) : 0}%</b></div><div>오늘 사용<b>${min}분</b></div><div>연속<b>${streak()}일</b></div>
      </div></div>
      <div class="card"><h3>약한 유형 (유형별 정답률)</h3>
        ${types.length ? `<div class="spec-table"><table><tr><th>유형</th><th>한 번에 맞힘</th><th>푼 문제</th><th>다음 복습</th></tr>${types.map(x => `<tr><td>${esc(x.label)}</td><td><div class="rate"><i style="width:${x.rate}%;background:${x.rate < 70 ? 'var(--bad)' : x.rate < 90 ? 'var(--star)' : 'var(--good)'}"></i><span>${x.rate}%</span></div></td><td>${x.n}</td><td>${S.weak[x.t] ? `${esc(S.weak[x.t].due)}` : ''}</td></tr>`).join('')}</table></div>` : '<p class="muted">아직 푼 문제가 없어요</p>'}
        <p class="muted">틀린 유형은 다른 숫자로 1·3·7일 뒤 복습에 나와요. 복습에서 3번 연속 맞히면 목록에서 빠져요.</p></div>
      <div class="card"><h3>전체</h3><div class="kv">
        <div>누적 학습일<b>${S.days.length}일</b></div><div>별<b>${S.stars}개</b></div><div>스티커<b>${Object.keys(S.stickers).length} / ${U.length}</b></div><div>연산 사다리<b>${LD.rung + 1}칸</b></div>
      </div></div>
      <div class="card"><h3>🗣️ 설명하기(가르쳐주기) 기록 (최근 14개)</h3>
        ${S.explains.length ? `<ol class="list">${S.explains.map(x => `<li>${esc(x.date)} ${esc(x.who)}: “${esc(x.q)}” → <b>${esc(x.said || '-')}</b>${x.ok ? ' 👍 한 번에' : ''}</li>`).join('')}</ol>` : '<p class="muted">아직 없어요. 설명하기 단계에서 윤이가 넣은 답이 남아요.</p>'}
        <p class="muted">v0.5.0부터 설명하기는 말하기 대신 숫자 패드·보기로 정답을 넣어요. 기록은 이 태블릿 안에만 저장돼요.</p>
      </div>
      `)}
      ${ptabPanel('stats', `
      ${statsCard()}
      `)}
      ${ptabPanel('reward', `
      <div class="card"><h3>🎁 받은 보상 관리</h3>
        <p>받은 보상 <b>${rwCount().n}개</b> · 아직 안 쓴 보상 <b>${rwCount().left}개</b> · 사용완료 ${rwCount().u}개</p>
        <button class="btn primary" data-act="rewardadmin">🎁 보상 목록 · 사용완료 체크</button>
      </div>
      <div class="card"><h3>별 조정</h3>
        <p>지금 별: <b style="font-size:24px">${S.stars}개</b> <span class="muted">(현재 목표에 모은 별 ${Math.max(0, S.stars - S.goalBase)}개 · 오늘 ${todayLog().stars}개 / 하루 최대 ${DAY_STAR_MAX}개)</span></p>
        <div class="row" style="flex-wrap:wrap"><button class="btn small" data-act="star" data-arg="-10">−10</button><button class="btn small" data-act="star" data-arg="-1">−1</button><button class="btn small" data-act="star" data-arg="1">+1</button><button class="btn small" data-act="star" data-arg="10">+10</button></div>
        <div class="code-row" style="margin-top:10px"><input id="starSet" type="number" min="0" placeholder="개수"><button class="btn small primary" data-act="starset">이 개수로 맞추기</button></div>
      </div>
      `)}
      ${ptabPanel('progress', `
      <div class="card"><h3>🏫 지금 학교 단원</h3>
        <div class="form"><label>학교에서 배우는 단원<select id="school">${READY.map(x => `<option value="${x.id}"${S.pos.u === x.id ? ' selected' : ''}>${esc(unitLabel(x))}</option>`).join('')}</select></label></div>
        <div class="row" style="margin-top:10px"><button class="btn small primary" data-act="school">이 단원 1일차부터 시작</button></div>
        <p class="muted">“오늘 수학”이 이 단원 1일차부터 시작해요. 완료 기록·별·스티커는 그대로예요. 1학년 2학기 6개 단원과 2학년 1·2학기 12개 단원을 할 수 있어요 (1학년 1학기는 준비 중). 단원을 다 끝내면 아직 시작하지 않은 앞 단원부터 차례로 이어져요.</p></div>
      <div class="card"><h3>진도 조정</h3>
        <p>지금 진도: <b>${esc(un.title)} ${S.pos.d}일차 · ${STEPS[S.pos.s].name}</b> <span class="muted">(코드 ${code})</span></p>
        <div class="form">
          <label>단원<select id="adjU">${READY.map(x => `<option value="${x.id}"${S.pos.u === x.id ? ' selected' : ''}>${unitNo(x)}. ${esc(unitLabel(x))} (${doneCount(x.id)}/${x.days.length}일)</option>`).join('')}</select></label>
          <label>일차<select id="adjD">${Array.from({ length: Math.max(...READY.map(x => x.days.length)) }, (_, i) => `<option value="${i + 1}"${S.pos.d === i + 1 ? ' selected' : ''}>${i + 1}일차</option>`).join('')}</select></label>
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
      `)}
      ${ptabPanel('settings', `
      <div class="card"><h3>설정</h3><div class="form">
        <label>아이 이름<input data-set="childName" value="${esc(st.childName)}"></label>
        <label>로봇 친구 이름<input data-set="robotName" value="${esc(st.robotName)}"></label>
        <label>한국어 읽기<select data-set="koVoiceMode"><option value="rec"${st.koVoiceMode !== 'device' ? ' selected' : ''}>녹음 목소리 (추천)</option><option value="device"${st.koVoiceMode === 'device' ? ' selected' : ''}>기기 음성</option></select></label>
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
      ${pinCard()}
      `)}
      ${ptabPanel('manage', `
      <div class="card"><h3>앱 업데이트</h3>
        <p>이 기기의 앱: <b>v${APP_VERSION}</b> <span id="verInfo" class="muted">${latestVer ? (isNewer(latestVer, APP_VERSION) ? `· 새 버전 v${latestVer}이 있어요!` : '· 최신 버전이에요') : ''}</span></p>
        <div class="row" style="flex-wrap:wrap"><button class="btn small" data-act="checkver">🔄 새 버전 확인</button>
          <button class="btn small primary" data-act="doupdate" id="updBtn"${latestVer && isNewer(latestVer, APP_VERSION) ? '' : ' hidden'}>⬇️ 지금 업데이트</button></div>
        <p class="muted">업데이트해도 진도·별·보상·설정은 그대로 남아요. 인터넷이 연결돼 있어야 해요.</p>
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
      <div class="card"><h3>안내</h3><ul class="list">
        <li>단원·문제 구성·이야기 문제 문장은 <b>content.js</b> 파일에서 고쳐요. 고친 뒤 <b>sw.js</b>의 VERSION과 <b>app.js</b>의 APP_VERSION을 올리면 설치된 앱에 반영돼요.</li>
        <li>한국어가 잘 안 들리면: 태블릿 <b>설정 → 일반 → 글자 읽어주기(TTS) → 기본 엔진</b>을 <b>Google 음성 인식 및 합성</b>으로 바꾸고, 엔진 설정에서 <b>한국어 음성 데이터(고품질)</b>를 설치한 뒤 앱을 다시 켜세요.</li>
        <li>윤이 영어 앱과 진도·별·보상·시간 제한이 모두 따로예요 (저장 키 yuni-math-v1).</li>
        <li>정답은 모두 화면의 숫자 패드·보기로 넣어요. 태블릿에 키보드를 연결하면 숫자 키·Enter·Backspace로도 넣을 수 있어요 (설명하기도 숫자 입력, v0.5.0).</li>
      </ul></div>
      `)}
    </div></div>`, {
      ...parentCommonHandlers(),
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
      rewardadmin: rewardAdminScreen,
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
    ptabReveal();
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) hush(); });
  window.YUNI = { get state() { return S; }, get act() { return L && L.acts[L.i]; }, get lesson() { return L; }, get screen() { return screen; }, spoken, speakify, koSentences, sino, native, josa, parseCode, genProblem, makeCalc, rngFrom, KEY, APP_VERSION }; // 테스트용
  fixPos(); save();
  homeScreen();
  setTimeout(() => { if (!/^https?:/.test(location.protocol) || window.__SPEC_INLINE || navigator.onLine === false) return;
    checkUpdate().then(v => { if (v && isNewer(v, APP_VERSION) && screen === 'home') toast(`새 버전 v${v}이 있어요. 아빠 화면에서 업데이트하세요`); }).catch(() => {}); }, 3000);
})();
