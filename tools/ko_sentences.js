#!/usr/bin/env node
/* 윤이 수학 — 한국어 녹음 문장 목록 만들기 (공통 65번, plan/0_COMMON_spec.md 5-2)
 * 사용: 앱 폴더에서 python3 -m http.server 8783  →  node tools/ko_sentences.js [http://localhost:8783/] [--max 2500]
 * 결과: tools/ko_sentences.json = [{key, say}]  → python3 tools/make_ko_audio.py tools/ko_sentences.json <모델 폴더> audio-ko
 *  - key: 앱이 ko()에 넘기는 글을 문장(. ! ?) 단위로 나눈 것 (숫자·기호 그대로). say: 실제로 읽을 말(앱의 speakify로 숫자를 한글로, + − = □를 말로)
 *  - ① 고정 문장(content.js·app.js)은 모두 넣어요
 *    ② 숫자가 들어가는 문제 문장은 앱의 genProblem으로 단원·날·문제·사다리 칸마다 씨앗 여러 개를 돌려서 모으고,
 *       자주 나오는 순서로 --max 개까지만 넣어요 (드문 문장은 기기 음성)
 *  - 앱의 말하기 규칙(app.js actProb·actGreet 등)을 바꾸면 이 파일도 같이 고쳐요
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const args = process.argv.slice(2);
const URL = args.find(a => /^https?:/.test(a)) || 'http://localhost:8783/';
const MAX = args.includes('--max') ? Number(args[args.indexOf('--max') + 1]) : 2500;
const SEEDS = 400;

(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.goto(URL); await pg.waitForFunction(() => window.YUNI && window.CONTENT);
  const out = await pg.evaluate(({ SEEDS }) => {
    const Y = window.YUNI, C = window.CONTENT; const { josa, genProblem, koSentences, speakify } = Y;
    const koKey = t => String(t).replace(/\s+/g, ' ').trim();
    const fixed = new Set(); const freq = new Map();
    const addFixed = t => { if (t) koSentences(koKey(t)).forEach(s => fixed.add(s)); };
    const addF = (t, w) => { if (t) koSentences(koKey(t)).forEach(s => freq.set(s, (freq.get(s) || 0) + w)); };
    const child = '윤이', callName = '윤이야', robot = '셈봇';
    const L = C.lines;
    // ---- ① 고정 문장 ----
    ['오늘 수학은 여기까지! 정말 잘했어요.', `안녕, ${callName}! 나는 ${robot}야.`, '목표 달성! 아빠에게 보여줘요!', '반짝 연산! 천천히 해도 돼요.',
      '복습할 문제가 아직 없어요! 바로 오늘의 단원으로 가요', '스티커도 받았어!', '연산 사다리도 한 칸 올라갔어!', '내일 또 만나!', `오늘 수학 끝! 정말 잘했어, ${callName}.`,
      '괜찮아, 천천히 해 보자.', '정답을 넣으면 별을 받아요!', '같이 풀어 보자.', '고마워!', '이렇게도 말할 수 있어.', `${child}${josa(child, '은', '는')}?`,
      L.showAnswer, ...L.praise, ...L.retry].forEach(addFixed);
    ['오늘의 수', '복습', '오늘의 단원', '반짝 연산', '설명하기'].forEach(n => addFixed(`다음은 ${n}!`));
    C.ladder.forEach((l, i) => addFixed(`지금 연산 사다리 ${i + 1}칸이에요.`));
    C.units.forEach(un => {
      addFixed(`${un.title} 단원은 아직 준비 중이에요.`); addFixed(`${un.title} 스티커! 정말 잘했어!`); addFixed(`${un.title} 마무리 도전에서 8개 넘게 맞히면 받을 수 있어요.`);
      if (!un.ready) return;
      addFixed(`${un.title} 마무리 도전! 10문제 중 8개를 맞히면 스티커를 받아요`);
      un.days.forEach(d => (d.concept || []).forEach(cc => { addFixed(`${robot}${josa(robot, '과', '와')} 함께 배워요.`); addFixed(`${cc.title}!`); addFixed(cc.text); }));
      (un.explain || []).forEach(ex => { addFixed(`${callName}, ${ex.q}`); addFixed(ex.model); });
    });
    Object.values(C.friends).forEach(f => { addFixed(`${f.name}${josa(f.name, '이', '가')} 물어봐요.`); const c = f.call || f.name; addFixed(`우와! ${c}${josa(c, '이', '가')} 이제 알겠대.`); });
    for (let n = 0; n <= 100; n++) addFixed(String(n)); // 구슬 세기(숫자만)·오늘의 수 정답
    // 오늘의 수 (날짜마다)
    const mdays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    mdays.forEach((k, mi) => { for (let n = 1; n <= k; n++) addFixed(`오늘은 ${mi + 1}월 ${n}일!`); });
    for (let n = 1; n <= 31; n++) {
      addFixed(`오늘의 수는 ${n}`); addFixed(`10칸 상자에 구슬 ${n}개를 넣어 봐요.`);
      if (n % 10 === 0) addFixed(`10칸 상자 ${n / 10}개를 가득 채워요.`); else if (n > 10) { addFixed(`10칸 상자 ${Math.floor(n / 10)}개를 가득 채우고`); addFixed(`구슬 ${n % 10}개를 더 넣어요.`); } else addFixed(`구슬 ${n}개를 넣어요.`);
      addFixed(`정답은 ${n}.`);
    }
    addFixed('10칸 상자 하나에 10개씩 들어가요.');
    // ---- ② 문제 문장 (앱의 actProb가 읽는 순서 그대로) ----
    const sayGuess = pr => { const w = `${pr.eunhoo}${pr.unit || ''}`; return w + josa(w, '이라고', '라고'); };
    const probTexts = (pr, w) => {
      addF(pr.q, w); if (pr.expr) addF(pr.expr.replace('=□', '=?'), w); addF(pr.sub, w);
      const ansSay = pr.expr ? pr.expr.replace('□', pr.answer) : pr.storyExpr ? pr.storyExpr.replace('□', pr.answer) : `${pr.answer}${pr.unit || ''}`;
      addF(ansSay, w);
      if (pr.eunhoo != null) {
        addF(`은후는 ${sayGuess(pr)} 생각한대.`, w);
        if (pr.eunhoo === pr.answer) addF('은후도 맞았네!', w); else addF(`은후는 ${sayGuess(pr)} 했지만, ${child}${josa(child, '이', '가')} 맞았어!`, w * 0.8);
      }
      // 틀렸을 때 (덜 자주)
      addF(pr.hint1, w * 0.4); pr.steps.forEach(s => addF(s, w * 0.25));
      addF(`정답은 ${pr.answer}${pr.unit ? pr.unit : ''}.`, w * 0.15);
    };
    const run = (g, p, tag, ctx, times) => { for (let i = 0; i < SEEDS; i++) probTexts(genProblem(g, p, `${tag}|${i}`, ctx), times / SEEDS); };
    C.units.filter(u => u.ready).forEach(un => un.days.forEach((d, di) => d.items.forEach((it, ii) => {
      const n = it.n || 1;
      run(it.g, it.p, `${un.id}|${di}|${ii}`, d.challenge ? { eunhoo: false } : {}, n * 1.5); // 오늘의 단원 + 복습
    })));
    C.ladder.forEach((l, rung) => run('calc', l.p, `ladder|${rung}`, { concrete: rung < 7, eunhoo: false }, 5 * (rung < 4 ? 2 : 1)));
    return { fixed: [...fixed], freq: [...freq.entries()] };
  }, { SEEDS });
  // 자주 나오는 순서로 채우기
  const keys = [...out.fixed]; const seen = new Set(keys);
  const probs = out.freq.filter(([k]) => !seen.has(k)).sort((a, b) => b[1] - a[1]);
  const totalW = probs.reduce((s, [, w]) => s + w, 0); let usedW = 0;
  for (const [k, w] of probs) { if (keys.length >= MAX) break; keys.push(k); seen.add(k); usedW += w; }
  // 읽을 말 (앱의 speakify + 녹음용 다듬기)
  const says = await pg.evaluate(ks => ks.map(k => {
    let t = window.YUNI.speakify(k);
    t = t.replace(/\s*→\s*/g, ', ').replace(/\s*:\s*/g, ', ').replace(/…/g, '.').replace(/[^\p{L}\p{N}\s!?.,]/gu, ' ');
    return t.replace(/\s+([?!.,])/g, '$1').replace(/,+/g, ',').replace(/\s+/g, ' ').trim();
  }), keys);
  await b.close();
  const list = keys.map((k, i) => ({ key: k, say: says[i] }));
  const bad = list.filter(x => /[0-9+=−□<>:→]/.test(x.say));
  fs.writeFileSync(path.join(__dirname, 'ko_sentences.json'), JSON.stringify(list, null, 0).replace(/},{/g, '},\n{'));
  console.log(`고정 문장 ${out.fixed.length}개 + 문제 문장 ${keys.length - out.fixed.length}개 / 후보 ${probs.length}개 (문제 문장 빈도 기준 ${Math.round(usedW / totalW * 100)}%) = ${list.length}개`);
  if (bad.length) console.log('⚠️ say에 숫자·기호가 남은 문장', bad.slice(0, 10));
})();
