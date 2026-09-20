# -*- coding: utf-8 -*-
"""
윤이 수학 — 자동 테스트 (Playwright)
- 탭 A8 가로(1280x800)·폰 세로(390x844)에서 하루 흐름 전체를 풀어 봐요.
- 한국어 음성(TTS)과 음성인식은 가짜(목업)로 바꿔서 빠르게 돌려요.
- 마지막에 '요구사항 점검'(MREQ)을 출력해요. 모두 OK여야 배포해요.
사용법:  앱 폴더(index.html 있는 곳)에서 python3 -m http.server 8765  →  다른 창에서 python3 test/flow.py
필요: pip install playwright && playwright install chromium
"""
import asyncio, json, os, re, sys, datetime
from playwright.async_api import async_playwright

URL = os.environ.get('APP_URL', 'http://localhost:8765/')
_HERE = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(_HERE, '..', 'app') if os.path.exists(os.path.join(_HERE, '..', 'app', 'app.js')) else os.path.join(_HERE, '..')
SHOT = os.environ.get('SHOT_DIR', '/tmp/yuni-math-shots')
os.makedirs(SHOT, exist_ok=True)

MOCK = """
(() => {
  window.__said = [];
  const synth = { speaking:false, pending:false, paused:false, onvoiceschanged:null,
    speak(u){ window.__said.push(u.text); setTimeout(()=>{ u.onend && u.onend(); }, 3); },
    cancel(){}, pause(){}, resume(){}, getVoices(){ return []; } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  class FakeSR { start(){ setTimeout(()=>{ const t = window.__srText || '십을 먼저 만들고 삼을 더해요'; this.onresult && this.onresult({results:[[{transcript:t}]]}); this.onend && this.onend(); }, 30); } stop(){} abort(){} }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  // 영어 앱 저장 데이터가 있어도 건드리지 않는지 확인용
  if (!localStorage.getItem('yuni-english-v1')) localStorage.setItem('yuni-english-v1', JSON.stringify({stars: 77, marker: 'english'}));
})();
"""

RESULTS = {}   # id -> [ok(bool), note]
def check(rid, ok, note=''):
    prev = RESULTS.get(rid)
    if prev is None: RESULTS[rid] = [bool(ok), note]
    else: RESULTS[rid] = [prev[0] and bool(ok), (prev[1] + ' / ' + note).strip(' /') if note else prev[1]]

INFO = """() => { const a = YUNI.act; const L = YUNI.lesson; if (!a || !L) return null; const p = a.prob;
  return { type: a.type, s: L.s, i: L.i, input: p ? p.input : (a.type === 'greet' ? 'frame' : null),
    answer: p ? String(p.answer) : (a.type === 'greet' ? String(new Date().getDate()) : null),
    choices: p && p.choices ? p.choices.map(String) : null, given: p && p.frame ? p.frame.given : 0,
    sig: p ? JSON.stringify([p.q, p.expr, p.answer, p.choices, p.type]) : a.type + L.s + ':' + L.i, flash: !!a.flash, chal: !!a.chal, review: !!a.review }; }"""

async def state(pg, expr):
    return await pg.evaluate(f"() => {expr}")

async def wait_ready(pg, timeout=10000):
    """문제 화면(◀ 버튼이 있는 화면)이나 보상/잠금 화면이 될 때까지 기다려요"""
    t = 0
    while t < timeout:
        scr = await state(pg, 'YUNI.screen')
        if scr in ('reward', 'locked', 'home'): return scr
        if scr == 'lesson' and await pg.locator('.topbar [data-act=prev]').count():
            return scr
        await pg.wait_for_timeout(40); t += 40
    return 'timeout'

async def wait_change(pg, key, timeout=12000):
    t = 0
    while t < timeout:
        scr = await state(pg, 'YUNI.screen')
        info = await pg.evaluate(INFO)
        k = (info['s'], info['i']) if info else None
        if scr != 'lesson' or k != key: return
        await pg.wait_for_timeout(40); t += 40
    raise Exception(f'진행이 멈췄어요: {key}')

def wrong_value(ans, choices=None, tried=()):
    if choices:
        for c in choices:
            if c != ans and c not in tried: return c
        return None
    a = int(ans); L = len(ans)
    for w in (a + 1, a - 1, a + 2):
        if w >= 0 and len(str(w)) == L: return str(w)
    return None

async def type_pad(pg, val):
    for ch in val:
        await pg.click(f'.pad [data-act=key][data-arg="{ch}"]')
    await pg.click('.pad [data-act=ok]')

async def answer_frame(pg, n, given, drag=False):
    await pg.click('[data-act=clear]')
    k = 0
    if drag and n > 0:
        m = await pg.locator('.marble').bounding_box(); f = await pg.locator('#fz').bounding_box()
        await pg.mouse.move(m['x'] + m['width'] / 2, m['y'] + m['height'] / 2); await pg.mouse.down()
        await pg.mouse.move(f['x'] + f['width'] / 2, f['y'] + f['height'] / 2, steps=6); await pg.mouse.up()
        await pg.wait_for_timeout(60); k = 1
    while k < n:
        await pg.click('.marble'); k += 1
    await pg.click('.framewrap [data-act=ok]')

async def play_day(pg, tag, wrong_every=0, reveal_once=False, prev_test=False, expect=None):
    """하루치를 끝까지 풀어요. wrong_every=N이면 N번째 문제마다 한 번 틀리고, reveal_once면 한 문제는 3번 틀려서 풀이 보기"""
    seen_prob = 0; revealed = False; prev_done = False; shots = set(); frame_drag_done = False
    for _ in range(400):
        scr = await wait_ready(pg)
        if scr == 'reward': return True
        if scr in ('locked', 'home', 'timeout'): raise Exception(f'하루 흐름 중단: {scr}')
        info = await pg.evaluate(INFO)
        key = (info['s'], info['i'])
        # 모든 문제 화면에 ◀ 이전 버튼 (MREQ-17)
        if info['type'] in ('prob', 'greet', 'concept', 'explain'):
            check('MREQ-17', await pg.locator('.topbar [data-act=prev]').count() == 1, '')
        shotkey = f"{info['type']}-{info['input']}-{info['flash']}"
        if shotkey not in shots and len(shots) < 12:
            shots.add(shotkey); await pg.screenshot(path=f"{SHOT}/{tag}-{len(shots):02d}-{shotkey}.png")
        t = info['type']
        if t == 'msg':
            await wait_change(pg, key); continue
        if t == 'concept':
            await pg.click('[data-act=next]'); await wait_change(pg, key); continue
        if t == 'explain':
            if await pg.locator('[data-mic]').count():
                b = await pg.locator('[data-mic]').bounding_box()
                await pg.mouse.move(b['x'] + 20, b['y'] + 20); await pg.mouse.down(); await pg.wait_for_timeout(150); await pg.mouse.up()
            else:
                await pg.click('[data-act=selfok]')
            await pg.wait_for_selector('#nextRow:not([hidden]) [data-act=next]', timeout=8000)
            await pg.click('#nextRow [data-act=next]'); await wait_change(pg, key); continue
        # 문제
        seen_prob += 1
        ans = info['answer']; inp = info['input']
        # 이전 버튼 테스트: 두 번째 문제에서 ◀ → 같은 문제가 나오는지
        if prev_test and not prev_done and seen_prob == 3 and info['i'] > 0:
            sig = info['sig']; stars_before = await state(pg, 'YUNI.state.stars')
            await pg.click('.topbar [data-act=prev]'); await pg.wait_for_timeout(250)
            back = await pg.evaluate(INFO)
            await pg.click('.topbar [data-act=prev]') if False else None
            # 앞 문제를 다시 풀고 돌아오기
            if back['input'] == 'choice': await pg.click(f'[data-act=pick][data-arg="{back["answer"]}"]')
            elif back['input'] == 'pad': await type_pad(pg, back['answer'])
            elif back['input'] == 'frame': await answer_frame(pg, int(back['answer']), back['given'])
            else: await pg.click('[data-act=next]')
            await wait_change(pg, (back['s'], back['i']))
            await wait_ready(pg)
            again = await pg.evaluate(INFO)
            stars_after = await state(pg, 'YUNI.state.stars')
            check('MREQ-17', again['sig'] == sig, '◀ 뒤 같은 문제')
            check('MREQ-18', stars_after == stars_before, '다시 푼 문제는 별 없음')
            prev_done = True
            info = again; key = (info['s'], info['i']); ans = info['answer']; inp = info['input']
        wrongs = 0
        if reveal_once and not revealed and inp in ('pad', 'frame') and not info['flash']:
            wrongs = 3; revealed = True
        elif wrong_every and seen_prob % wrong_every == 0:
            wrongs = 1
        tried = []
        for w in range(wrongs):
            wv = wrong_value(ans, info['choices'], tried) if inp != 'frame' else str(int(ans) - 1 - w if int(ans) > 3 else int(ans) + 1 + w)
            if wv is None: break
            tried.append(wv)
            if inp == 'choice': await pg.click(f'[data-act=pick][data-arg="{wv}"]')
            elif inp == 'pad': await type_pad(pg, wv)
            elif inp == 'frame': await answer_frame(pg, int(wv), info['given'])
            await pg.wait_for_timeout(120)
            hint = await pg.locator('#hint').inner_text()
            check('MREQ-07', '땡' not in hint and '❌' not in hint, f'힌트 {w + 1}단계')
            if w == 1:
                check('MREQ-07', len(hint) > 3, '풀이 과정 표시')
        if len(tried) == 3:
            await pg.wait_for_selector('#nextRow:not([hidden]) [data-act=next]', timeout=8000)
            check('MREQ-07', await pg.locator('#hint').inner_text() != '', '세 번째: 답과 풀이 보여주기')
            await pg.screenshot(path=f"{SHOT}/{tag}-reveal.png")
            await pg.click('#nextRow [data-act=next]'); await wait_change(pg, key); continue
        if inp == 'choice': await pg.click(f'[data-act=pick][data-arg="{ans}"]')
        elif inp == 'pad': await type_pad(pg, ans)
        elif inp == 'frame':
            await answer_frame(pg, int(ans), info['given'], drag=not frame_drag_done); frame_drag_done = True
        await wait_change(pg, key)
    raise Exception('하루가 끝나지 않았어요')

async def gate(pg):
    await pg.click('[data-act=parent]')
    q = await pg.locator('.gate .card div').first.inner_text()
    a, b = [int(x) for x in re.findall(r'\d+', q)[:2]]
    await pg.fill('#ans', str(a * b)); await pg.click('[data-act=ok]')
    await pg.wait_for_selector('.parent')

async def run_device(p, name, vw, vh, full):
    b = await p.chromium.launch()
    ctx = await b.new_context(viewport={'width': vw, 'height': vh}, has_touch=(vw < 500))
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'favicon' not in m.text and errs.append(m.text))
    await pg.add_init_script(MOCK)
    await pg.goto(URL); await pg.wait_for_timeout(400)
    await pg.screenshot(path=f'{SHOT}/{name}-00-home.png')

    # 반응형 (MREQ-01): 가로 스크롤 없음, 탭은 2단·폰은 1단
    await pg.click('[data-act=go]'); await wait_ready(pg)
    cols = await pg.evaluate("getComputedStyle(document.querySelector('.stage')).gridTemplateColumns.split(' ').length")
    overflow = await pg.evaluate("document.scrollingElement.scrollWidth <= innerWidth + 1")
    check('MREQ-01', overflow, f'{name} 가로 스크롤 없음')
    check('MREQ-01', cols == (2 if vw > 820 else 1), f'{name} {cols}단')
    # 숫자 패드 크기 (MREQ-33) — 반짝 연산 화면에서 확인할 수 있게 코드로 이동
    await pg.click('[data-act=quit]')

    # 하루 흐름 (MREQ-04)
    await pg.click('[data-act=go]')
    await play_day(pg, f'{name}-d1', wrong_every=3, reveal_once=True, prev_test=True)
    st = await state(pg, 'YUNI.state')
    today = await state(pg, "(() => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })()")
    check('MREQ-04', st['done'].get('2-1-1') == today and st['pos'] == {'u': '2-1', 'd': 2, 's': 0}, f'{name} 1일차 완료 → 2일차')
    check('MREQ-18', st['log'][today]['stars'] <= 20, f"{name} 오늘 별 {st['log'][today]['stars']}")
    await pg.screenshot(path=f'{SHOT}/{name}-reward.png')
    said = await state(pg, 'window.__said')
    bad = [s for s in said if re.search(r'[0-9+=−□]', s)]
    check('MREQ-12', not bad, f'숫자·기호가 그대로 읽힌 문장 {len(bad)}개 {bad[:2]}')
    check('MREQ-07', not any('땡' in s for s in said), '음성에 "땡" 없음')
    check('MREQ-35', len(st['explains']) >= 1 and st['explains'][0]['said'], '설명하기 글자 기록')
    check('MREQ-08', len(st['weak']) >= 1, f"틀린 유형 기록 {list(st['weak'].keys())}")
    check('MREQ-36', len(st['stats']) >= 3, f"유형 {len(st['stats'])}개")
    await pg.click('[data-act=home]')

    if full:
        # 같은 날 여러 번 해도 하루 별 20개 이하 (MREQ-18)
        for d in range(2):
            await pg.click('[data-act=go]'); await play_day(pg, f'{name}-extra{d}'); await pg.click('[data-act=home]')
        st = await state(pg, 'YUNI.state')
        check('MREQ-18', st['log'][today]['stars'] <= 20, f"하루 3번 해도 별 {st['log'][today]['stars']}개")

        # 복습 (MREQ-08): 틀린 유형의 복습일을 오늘로 바꾸면 복습 단계에 같은 유형이 다른 숫자로 나와요
        types = await pg.evaluate("(() => { const t = Object.keys(YUNI.state.weak); t.forEach(k => YUNI.state.weak[k].due = '2000-01-01'); YUNI.state.reviewPick = null; return t; })()")
        await pg.click('[data-act=picker]'); await pg.click('[data-act=unit][data-arg="2-1"]'); await pg.click('[data-act=day][data-arg="3"]'); await pg.click('[data-act=step][data-arg="1"]')
        await wait_ready(pg)
        rv = await pg.evaluate("YUNI.lesson.acts.filter(a => a.review).map(a => a.prob.type)")
        check('MREQ-08', rv and all(t in types for t in rv[:len(types)]), f'복습 유형 {rv}')
        await pg.click('[data-act=quit]')

        # 연산 사다리 (MREQ-32): 반짝 연산을 모두 맞힌 날이 3일 연속이면 다음 칸
        await pg.evaluate("(() => { const L = YUNI.state.ladder; L.rung = 0; L.streak = 0; L.lastDate = ''; })()")
        for k in range(3):
            await pg.evaluate("YUNI.state.ladder.lastDate = ''")
            await pg.click('[data-act=picker]'); await pg.click('[data-act=unit][data-arg="2-4"]'); await pg.click('[data-act=day][data-arg="1"]'); await pg.click('[data-act=step][data-arg="3"]')
            await play_day(pg, f'{name}-ladder{k}')
            if k == 2: await pg.screenshot(path=f'{SHOT}/{name}-ladder-up.png')
            await pg.click('[data-act=home]')
        L = await state(pg, 'YUNI.state.ladder')
        check('MREQ-32', L['rung'] == 1 and L['badges'].get('1'), f"사다리 {L['rung'] + 1}칸, 배지 {list(L['badges'].keys())}")
        await pg.click('[data-act=ladder]'); await pg.wait_for_timeout(200); await pg.screenshot(path=f'{SHOT}/{name}-ladder.png'); await pg.click('[data-act=home]')

        # 단원 마무리 도전 → 스티커 (MREQ-30)
        await pg.click('[data-act=picker]'); await pg.click('[data-act=unit][data-arg="2-1"]'); await pg.click('[data-act=day][data-arg="6"]'); await pg.click('[data-act=step][data-arg="2"]')
        await wait_ready(pg)
        nprob = await pg.evaluate("YUNI.lesson.acts.filter(a => a.chal).length")
        await play_day(pg, f'{name}-chal')
        st = await state(pg, 'YUNI.state')
        check('MREQ-30', nprob == 10 and st['stickers'].get('2-1'), f'마무리 도전 {nprob}문제, 스티커 {st["stickers"]}')
        check('MREQ-30', st['pos']['u'] == '2-2', '단원 끝 → 다음 단원')
        await pg.click('[data-act=home]')

        # 다른 단원도 하루씩 (MREQ-30, 모드 1~6)
        for u, d in (('2-2', 3), ('2-4', 3), ('2-6', 1), ('2-6', 4)):
            await pg.click('[data-act=picker]'); await pg.click(f'[data-act=unit][data-arg="{u}"]'); await pg.click(f'[data-act=day][data-arg="{d}"]'); await pg.click('[data-act=step][data-arg="2"]')
            await play_day(pg, f'{name}-{u}-{d}', wrong_every=4); await pg.click('[data-act=home]')
        modes = await pg.evaluate("Object.keys(YUNI.state.stats)")
        check('MREQ-31', len(modes) >= 12, f'유형 {len(modes)}개 풀어봄')

        # 준비 중 단원은 막혀 있어요
        await pg.click('[data-act=picker]'); await pg.click('[data-act=unit][data-arg="2-5"]'); await pg.wait_for_timeout(100)
        check('MREQ-30', await state(pg, 'YUNI.screen') == 'picker' and await pg.locator('.days').count() == 0, '준비 중 단원 선택 안 됨')
        await pg.screenshot(path=f'{SHOT}/{name}-picker.png')
        await pg.click('[data-act=home]')

        # 진도 코드 (MREQ-09)
        await pg.click('[data-act=picker]'); await pg.fill('#code', '9-5-3'); await pg.click('[data-act=code]'); await wait_ready(pg)
        info = await pg.evaluate("({u: YUNI.lesson.u, d: YUNI.lesson.d, s: YUNI.lesson.s})")
        check('MREQ-09', info == {'u': '2-4', 'd': 5, 's': 2}, f'진도 코드 9-5-3 → {info}')
        await pg.click('[data-act=quit]')

        # 아빠 화면 (MREQ-10·14·15·16·21·23·36 등)
        await gate(pg)
        await pg.screenshot(path=f'{SHOT}/{name}-parent.png', full_page=True)
        txt = await pg.locator('.parent').inner_text()
        for rid, words in {'MREQ-10': ['이번 주', '약한 유형'], 'MREQ-14': ['진도 조정', '별 조정', '진도 초기화'], 'MREQ-15': ['받은 보상'],
                           'MREQ-16': ['백업 파일 저장', '백업 파일 불러오기'], 'MREQ-23': ['새 버전 확인'], 'MREQ-21': ['기획·변경 기록'],
                           'MREQ-30': ['지금 학교 단원'], 'MREQ-32': ['연산 사다리 조정'], 'MREQ-36': ['약한 유형'], 'MREQ-35': ['설명하기 기록']}.items():
            check(rid, all(w in txt for w in words), '아빠 화면: ' + ', '.join(words))
        # 보상 기록 → 진도 초기화해도 별·보상·설정 유지
        await pg.fill('[data-set=goalText]', '레고 로봇'); await pg.dispatch_event('[data-set=goalText]', 'change')
        await pg.click('[data-act=gave]'); await pg.wait_for_timeout(100)
        before = await state(pg, 'YUNI.state')
        await pg.click('[data-act=resetprog]'); await pg.click('[data-act=resetprog]'); await pg.wait_for_timeout(100)
        after = await state(pg, 'YUNI.state')
        check('MREQ-14', after['stars'] == before['stars'] and after['rewards'] == before['rewards'] and after['settings']['goalText'] == '레고 로봇'
              and after['pos'] == {'u': '2-1', 'd': 1, 's': 0} and not after['stickers'] and after['ladder']['rung'] == 0, '진도 초기화: 별·보상·설정 유지')
        check('MREQ-15', len(after['rewards']) == 1 and after['rewards'][0]['text'] == '레고 로봇', '보상 기록')
        # 별 조정
        await pg.click('[data-act=star][data-arg="10"]'); await pg.wait_for_timeout(50)
        check('MREQ-14', await state(pg, 'YUNI.state.stars') == after['stars'] + 10, '별 +10')
        # 지금 학교 단원
        await pg.select_option('#school', '2-6'); await pg.click('[data-act=school]'); await pg.wait_for_timeout(50)
        check('MREQ-30', (await state(pg, 'YUNI.state.pos')) == {'u': '2-6', 'd': 1, 's': 0}, '학교 단원 → 1일차')
        # 사다리 조정
        await pg.select_option('#rung', '9'); await pg.click('[data-act=setrung]'); await pg.wait_for_timeout(50)
        check('MREQ-32', (await state(pg, 'YUNI.state.ladder.rung')) == 9, '사다리 칸 조정')
        await pg.select_option('[data-set=ladderPct]', '80'); await pg.wait_for_timeout(50)
        check('MREQ-32', (await state(pg, 'YUNI.state.settings.ladderPct')) == 80, '사다리 기준 조정')
        # 백업 코드 내보내기 → 가져오기
        await pg.click('[data-act=export]'); code = await pg.input_value('#backup')
        await pg.evaluate("YUNI.state.stars = 1")
        await pg.fill('#backup', code); await pg.click('[data-act=import]'); await pg.wait_for_timeout(100)
        check('MREQ-16', (await state(pg, 'YUNI.state.stars')) == after['stars'] + 10, '백업 가져오기')
        # 백업 파일 저장
        async with pg.expect_download() as dl:
            await pg.click('[data-act=savefile]')
        d = await dl.value
        check('MREQ-16', d.suggested_filename.startswith('yuni-math-backup'), d.suggested_filename)
        # 새 버전 확인
        await pg.click('[data-act=checkver]'); await pg.wait_for_timeout(500)
        vi = await pg.locator('#verInfo').inner_text()
        check('MREQ-23', '최신 버전' in vi, vi)
        # 기획·변경 기록
        await pg.click('[data-act=spec]'); await pg.wait_for_timeout(400)
        spec = await pg.locator('#spec').inner_text()
        ver = await state(pg, 'YUNI.APP_VERSION')
        check('MREQ-21', f'v{ver}' in spec and 'MREQ-01' in spec, '기획서.md 보기')
        await pg.screenshot(path=f'{SHOT}/{name}-spec.png')
        await pg.click('[data-act=back]'); await pg.click('[data-act=home]')

        # 하루 시간 제한 (MREQ-11)
        await pg.evaluate("(() => { const d = new Date(); const k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); YUNI.state.log[k].sec = 99999; YUNI.state.override=''; })()")
        await pg.click('[data-act=go]'); await pg.wait_for_timeout(200)
        check('MREQ-11', await state(pg, 'YUNI.screen') == 'locked', '시간 다 쓰면 잠금')
        await pg.screenshot(path=f'{SHOT}/{name}-locked.png')
        await pg.click('[data-act=home]')
        await pg.evaluate("(() => { const d = new Date(); const k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); YUNI.state.log[k].sec = 0; })()")

        # 업데이트(다시 열기)해도 진도 유지, 영어 앱 저장 데이터는 그대로 (MREQ-16)
        before = await state(pg, 'YUNI.state')
        await pg.reload(); await pg.wait_for_timeout(400)
        after = await state(pg, 'YUNI.state')
        eng = await state(pg, "localStorage.getItem('yuni-english-v1')")
        check('MREQ-16', after['stars'] == before['stars'] and after['pos'] == before['pos'], '다시 열어도 진도·별 유지')
        check('MREQ-16', json.loads(eng).get('marker') == 'english' and (await state(pg, 'YUNI.KEY')) == 'yuni-math-v1', '저장 키 yuni-math-v1, 영어 앱 데이터 그대로')

    # 숫자 패드 버튼 크기 (MREQ-33)
    await pg.evaluate("YUNI.state.ladder.rung = 9")
    await pg.click('[data-act=picker]'); await pg.click('[data-act=unit][data-arg="2-6"]'); await pg.click('[data-act=day][data-arg="1"]'); await pg.click('[data-act=step][data-arg="3"]')
    await wait_ready(pg)
    kb = await pg.locator('.pad .key').first.bounding_box()
    check('MREQ-33', kb['width'] >= 72 and kb['height'] >= 72, f"{name} 패드 {kb['width']:.0f}x{kb['height']:.0f}")
    await pg.screenshot(path=f'{SHOT}/{name}-pad.png')
    await pg.click('[data-act=quit]')

    check('오류', not errs, f'{name} 자바스크립트 오류 {errs[:3]}')
    await b.close()

async def unit_checks(p):
    b = await p.chromium.launch(); pg = await b.new_page()
    await pg.add_init_script(MOCK); await pg.goto(URL); await pg.wait_for_timeout(300)
    r = await pg.evaluate("""() => ({
      a: YUNI.speakify('8+5=?'), b: YUNI.speakify('7마리'), c: YUNI.speakify('20마리'), d: YUNI.speakify('7+□=10'),
      e: YUNI.speakify('23+14=37'), f: YUNI.speakify('13−5=8'), g: YUNI.speakify('10개씩 묶음 6개'), h: YUNI.speakify('99보다 1 큰 수는 100')
    })""")
    check('MREQ-12', r['a'] == '팔 더하기 오는?', r['a']); check('MREQ-12', r['b'] == '일곱 마리', r['b']); check('MREQ-12', r['c'] == '스무 마리', r['c'])
    check('MREQ-12', r['d'] == '칠 더하기 몇은 십', r['d']); check('MREQ-12', r['e'] == '이십삼 더하기 십사는 삼십칠', r['e'])
    check('MREQ-12', r['f'] == '십삼 빼기 오는 팔', r['f']); check('MREQ-12', r['g'] == '열 개씩 묶음 여섯 개', r['g']); check('MREQ-12', r['h'] == '구십구보다 일 큰 수는 백', r['h'])
    # 문제 생성기 (MREQ-31): 답이 맞는지, 보기에 정답이 있는지, 받아올림 조건
    bad = await pg.evaluate("""() => {
      const bad = []; const kinds = ['small','make10','from10','three','three10','tenPlus','tens','tensOnes','twoOne','two','carry','borrow','mixAll','tensMix'];
      for (let i = 0; i < 400; i++) for (const k of kinds) for (const op of ['+','-','mix']) {
        const q = YUNI.makeCalc(YUNI.rngFrom('t'+i+k+op), {kind:k, op, max: i % 2 ? 5 : 10});
        const nums = [q.a, q.b, q.c].filter(x => x !== undefined);
        if (nums.some(x => !(x >= 0 && x <= 99)) || !(q.ans >= 0 && q.ans <= 100)) bad.push(['range', k, q]);
        let v; if (q.blank) v = q.a + q.ans === 10; else if (q.c !== undefined) { const m = q.op === '+' ? q.a + q.b : q.a - q.b; v = (q.op2 === '+' ? m + q.c : m - q.c) === q.ans && m >= 0; } else v = (q.op === '+' ? q.a + q.b : q.a - q.b) === q.ans;
        if (!v) bad.push(['calc', k, q]);
        if (q.kind === 'carry' && !(q.a % 10 + q.b % 10 >= 10 && q.a < 10 && q.b < 10)) bad.push(['carry', q]);
        if (q.kind === 'borrow' && !(q.a % 10 < q.b)) bad.push(['borrow', q]);
        if (q.kind === 'two' || q.kind === 'twoOne') { if (q.op === '+' && q.a % 10 + q.b % 10 >= 10) bad.push(['nocarry', q]); if (q.op === '-' && q.a % 10 < q.b % 10) bad.push(['noborrow', q]); }
      }
      for (let i = 0; i < 300; i++) for (const g of ['countTens','count','seq','nextPrev','compare','evenOdd','join']) {
        const pr = YUNI.genProblem(g, {}, 'c'+i+g);
        if (!pr.choices.map(String).includes(String(pr.answer))) bad.push(['nochoice', g, pr.answer, pr.choices]);
        if (new Set(pr.choices.map(String)).size !== pr.choices.length) bad.push(['dup', g, pr.choices]);
        if (pr.choices.some(c => typeof c === 'number' && (c < 0 || c > 100))) bad.push(['crange', g, pr.choices]);
      }
      const s1 = JSON.stringify(YUNI.genProblem('calc', {kind:'carry'}, 'same')), s2 = JSON.stringify(YUNI.genProblem('calc', {kind:'carry'}, 'same'));
      if (s1 !== s2) bad.push(['seed']);
      return bad.slice(0, 5);
    }""")
    check('MREQ-31', not bad, f'문제 생성기 오류 {bad}')
    st = await pg.evaluate("""() => { let f = 0, e = 0, th = new Set(); for (let i = 0; i < 200; i++) { const pr = YUNI.genProblem('story', {kind: 'two', op: 'mix'}, 's' + i);
      if (/현이가|초록이가|은후가|윤이/.test(pr.q)) f++; if (pr.eunhoo != null) e++; th.add(pr.pic); } return {f, e, th: th.size}; }""")
    check('MREQ-06', st['f'] >= 60 and st['e'] >= 20 and st['th'] >= 9, f"친구가 나오는 이야기 {st['f']}/200, 은후 답 {st['e']}, 주제 그림 {st['th']}종")
    check('MREQ-17', not any(x[0] == 'seed' for x in bad), '같은 씨앗 → 같은 문제')
    await b.close()

def static_checks():
    app = open(os.path.join(APP_DIR, 'app.js'), encoding='utf-8').read()
    sw = open(os.path.join(APP_DIR, 'sw.js'), encoding='utf-8').read()
    spec = open(os.path.join(APP_DIR, '기획서.md'), encoding='utf-8').read()
    man = json.load(open(os.path.join(APP_DIR, 'manifest.webmanifest'), encoding='utf-8'))
    ver = re.search(r"APP_VERSION = '([\d.]+)'", app).group(1)
    check('MREQ-02', re.search(r"VERSION = 'yuni-math-\d+'", sw) and man['name'] == '윤이 수학' and man['start_url'] == './', 'manifest·sw')
    check('MREQ-11', 'getHours' not in app and 'night' not in app.lower(), '밤 시간 잠금 없음')
    check('MREQ-16', "const KEY = 'yuni-math-v1'" in app and 'yuni-english-v1' not in app, '저장 키')
    check('MREQ-18', 'DAY_STAR_MAX = 20, DAY_BONUS = 3' in app, '별 규칙 상수')
    check('MREQ-21', f'v{ver}' in spec and '현재 버전: **v' + ver in spec, f'기획서.md에 v{ver}')
    check('MREQ-34', not re.search(r'남은 시간|초시계|countdown|타이머 표시', app), '타이머·초시계 없음')
    check('MREQ-38', man['theme_color'].lower() == '#22a06b' and '--primary: #22a06b' in open(os.path.join(APP_DIR, 'style.css'), encoding='utf-8').read(), '초록색 테마')
    ids = set(re.findall(r'MREQ-\d+', spec))
    return ids, ver

async def main():
    full = '--quick' not in sys.argv
    ids, ver = static_checks()
    async with async_playwright() as p:
        await unit_checks(p)
        await run_device(p, 'tablet', 1280, 800, full)
        await run_device(p, 'phone', 390, 844, full=False)
    print(f'\n=== 요구사항 점검 (v{ver}) ===')
    allok = True
    for rid in sorted(RESULTS, key=lambda x: (x[:4] != 'MREQ', x)):
        ok, note = RESULTS[rid]; allok &= ok
        print(f"{'OK  ' if ok else 'FAIL'} {rid}: {note[:160]}")
    missing = [i for i in ids if i not in RESULTS and i not in ('MREQ-19', 'MREQ-37')]
    if missing: print('자동 점검 없음(수동 확인):', ', '.join(sorted(missing)))
    print('\nALL OK' if allok else '\n실패가 있어요')
    sys.exit(0 if allok else 1)

if __name__ == "__main__":
    asyncio.run(main())
