# -*- coding: utf-8 -*-
"""
윤이 수학 — 자동 테스트 (Playwright)
- 탭 A8 가로(1280x800)·폰 세로(390x844)에서 하루 흐름 전체를 풀어 봐요.
- 한국어 음성(TTS)과 음성인식은 가짜(목업)로 바꿔서 빠르게 돌려요.
- 마지막에 '요구사항 점검'(MREQ)을 출력해요. 모두 OK여야 배포해요.
사용법:  앱 폴더(index.html 있는 곳)에서 python3 -m http.server 8765  →  다른 창에서 python3 test/flow.py
        다른 포트: APP_URL=http://localhost:8773/ python3 test/flow.py  (스크린샷 폴더: SHOT_DIR)
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
  // 한국어 녹음(공통 65번): ko()가 받은 글 기록 + 녹음 재생은 파일을 실제로 요청하고 바로 끝난 것으로 (빠르게)
  window.__KO_LOG = []; window.__audio = [];
  window.Audio = function (src) { const a = { src, playbackRate: 1, onended: null, onerror: null, pause(){},
    play(){ window.__audio.push(src); return fetch(src).then(r => { if (!r.ok) throw new Error('404'); setTimeout(() => a.onended && a.onended(), 3); })
      .catch(() => { setTimeout(() => a.onerror && a.onerror(), 1); }); } }; return a; };
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

REVEAL_SKIP = []   # 3번 틀린 뒤 "다음 ▶"으로 넘어간 문제 (MREQ-64 점검이 실제로 돌았는지 확인)
async def play_day(pg, tag, wrong_every=0, reveal_once=False, prev_test=False, expect=None):
    """하루치를 끝까지 풀어요. wrong_every=N이면 N번째 문제마다 한 번 틀리고 다시 맞히기(별 +1 확인),
    reveal_once면 두 문제를 3번 틀려서 정답 보기: 첫 문제는 정답을 직접 넣고(별 +1), 둘째 문제는 "다음 ▶"으로 넘어가요(별 0) — 공통 64번"""
    seen_prob = 0; revealed = 0; prev_done = False; shots = set(); frame_drag_done = False
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
        if reveal_once and revealed == 0 and inp in ('pad', 'frame') and not info['flash']:
            wrongs = 3; revealed = 1
        elif reveal_once and revealed == 1 and (inp in ('pad', 'frame') or len(info['choices'] or []) >= 4):
            wrongs = 3; revealed = 2
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
            hint = await pg.locator('#hint').inner_text()
            check('MREQ-07', hint != '', '세 번째: 답과 풀이 보여주기')
            check('MREQ-64', f'정답은 {ans}' in hint and '정답을 넣으면 별을 받아요' in hint, f'정답·풀이·안내 표시 ({inp})')
            filled = await pg.evaluate("""() => ({ q: [...document.querySelectorAll('.qbox')].map(q => q.textContent), d: [...document.querySelectorAll('.abox span')].map(x => x.textContent).join(''),
                b: document.querySelectorAll('#fz .cell.b').length })""")
            await pg.wait_for_timeout(750)
            filled['d'] = await pg.evaluate("[...document.querySelectorAll('.abox span')].map(x => x.textContent).join('')")
            check('MREQ-64', all(q == '□' for q in filled['q']) and filled['d'] == '' and filled['b'] == 0, f'정답 자동으로 안 채움 ({inp} {filled})')
            if inp == 'choice':
                check('MREQ-64', await pg.locator(f'.choice.glow[data-arg="{ans}"]').count() == 1 and await pg.locator('.choice.right').count() == 0, '보기: 정답은 반짝임만, 골라진 상태 아님')
            await pg.screenshot(path=f"{SHOT}/{tag}-reveal{revealed}.png")
            s0 = await state(pg, 'YUNI.state.stars')
            if revealed == 1:
                # 정답을 본 뒤 한 번 더 틀려도 벌점 없이 그대로, 정답을 넣으면 별 +1
                if inp == 'pad': await type_pad(pg, wrong_value(ans))
                else: await answer_frame(pg, int(ans) - 1 if int(ans) > 1 else int(ans) + 1, info['given'])
                await pg.wait_for_timeout(150)
                check('MREQ-64', await state(pg, 'YUNI.screen') == 'lesson' and (await pg.evaluate(INFO))['i'] == key[1]
                      and await state(pg, 'YUNI.state.stars') == s0, '정답 본 뒤 또 틀려도 그 문제에 그대로 (벌점 없음)')
                if inp == 'pad': await type_pad(pg, ans)
                else: await answer_frame(pg, int(ans), info['given'])
                await wait_change(pg, key)
                check('MREQ-64', await state(pg, 'YUNI.state.stars') == s0 + 1, f'3번 틀린 뒤 정답 넣으면 별 +1 ({inp})')
                check('MREQ-18', await state(pg, 'YUNI.state.stars') == s0 + 1, '정답 보고 넣어도 별 1개')
                continue
            await pg.click('#nextRow [data-act=next]'); await wait_change(pg, key)
            check('MREQ-64', await state(pg, 'YUNI.state.stars') == s0, f'정답 안 넣고 다음 ▶ → 별 0 ({inp})')
            REVEAL_SKIP.append(inp)
            # 넘어간 문제를 ◀ 이전으로 돌아와 맞혀도 별 없음 (문제당 한 번)
            if await wait_ready(pg) != 'lesson': continue
            cur = await pg.evaluate(INFO)
            await pg.click('.topbar [data-act=prev]'); await pg.wait_for_timeout(250)
            back = await pg.evaluate(INFO)
            check('MREQ-64', back['sig'] == info['sig'], '◀ 이전으로 넘어간 문제에 돌아옴')
            if back['input'] == 'pad': await type_pad(pg, back['answer'])
            elif back['input'] == 'choice': await pg.click(f'[data-act=pick][data-arg="{back["answer"]}"]')
            else: await answer_frame(pg, int(back['answer']), back['given'])
            await wait_change(pg, (back['s'], back['i'])); await wait_ready(pg)
            check('MREQ-64', await state(pg, 'YUNI.state.stars') == s0 and (await pg.evaluate(INFO))['sig'] == cur['sig'], '넘어간 문제는 돌아와 맞혀도 별 없음')
            check('MREQ-18', await state(pg, 'YUNI.state.stars') == s0, '같은 문제 두 번 별 없음')
            continue
        s0 = await state(pg, 'YUNI.state.stars'); day_stars0 = await state(pg, f"(YUNI.state.log[{DAY_JS}(0)] || {{}}).stars || 0")
        if inp == 'choice': await pg.click(f'[data-act=pick][data-arg="{ans}"]')
        elif inp == 'pad': await type_pad(pg, ans)
        elif inp == 'frame':
            await answer_frame(pg, int(ans), info['given'], drag=not frame_drag_done); frame_drag_done = True
        await wait_change(pg, key)
        # 하루 50개(문제 별 47개)가 찬 뒤에는 별이 안 늘어나니 그 전에만 확인해요
        if len(tried) == 1 and wrongs == 1 and day_stars0 < 47:
            s1 = await state(pg, 'YUNI.state.stars')
            check('MREQ-64', s1 == s0 + 1, f'두 번째 시도에 맞혀도 별 +1 ({inp})')
            check('MREQ-18', s1 == s0 + 1, '몇 번 만에 맞혀도 별 1개')
    raise Exception('하루가 끝나지 않았어요')

async def gate(pg, pin='1234'):
    """아빠 화면 암호 입력 (공통 61번, 기본 1234)"""
    await pg.click('[data-act=parent]')
    await pg.wait_for_selector('.gate #ans')
    await pg.fill('#ans', pin); await pg.click('[data-act=ok]')
    await pg.wait_for_selector('.parent')

async def ptab(pg, k):
    await pg.click(f'.ptabs [data-act=ptab][data-arg="{k}"]'); await pg.wait_for_timeout(50)

PTAB_KEYS = ['summary', 'stats', 'reward', 'progress', 'settings', 'manage']
VISIBLE_PANELS = "[...document.querySelectorAll('.ppanel')].filter(p => !p.hidden && getComputedStyle(p).display !== 'none').map(p => p.dataset.panel)"
DAY_JS = "(i => { const d = new Date(); d.setDate(d.getDate() - i); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })"

async def pin_try(pg, pin):
    """암호 화면에서 pin을 넣고 아빠 화면이 열렸는지 돌려줘요 (안 열리면 암호 화면에 그대로 있어요)"""
    await pg.fill('#ans', pin); await pg.click('[data-act=ok]'); await pg.wait_for_timeout(120)
    return await state(pg, 'YUNI.screen') == 'parent'

async def tab_checks(pg, name):
    """탭 메뉴 (공통 63번): 탭 6개, 보이는 패널은 1개, 누르면 그 패널로. 탭마다 스크린샷"""
    keys = await pg.evaluate("[...document.querySelectorAll('.ptabs .ptab')].map(b => b.dataset.arg)")
    check('MREQ-63', keys == PTAB_KEYS, f'{name} 탭 {len(keys)}개')
    check('MREQ-63', await pg.locator('.ppanel').count() == 6, f'{name} 패널 6개')
    wide = []
    for k in PTAB_KEYS:
        await ptab(pg, k)
        vis = await pg.evaluate(VISIBLE_PANELS)
        on = await pg.evaluate("[...document.querySelectorAll('.ptab.on')].map(b => b.dataset.arg)")
        check('MREQ-63', vis == [k] and on == [k], f'{name} {k} 탭 → 패널 {vis}')
        sw = await pg.evaluate("document.scrollingElement.scrollWidth - innerWidth")
        if sw > 1: wide.append(f'{k} {sw}px')
        await pg.screenshot(path=f'{SHOT}/{name}-parent-tab-{k}.png', full_page=True)
    check('MREQ-63', not wide, f'{name} 탭 가로 넘침 {wide}' if wide else f'{name} 탭 6개 모두 가로 스크롤 없음')

async def parent_common_checks(pg, name):
    """아빠 화면 공통 61(암호)·62(통계)·63(탭) 점검. 처음 화면에서 시작해서 처음 화면으로 돌아와요"""
    # 62 준비: 지난 날짜 기록 넣기 (sec=학습 초, stars=얻은 별, app=앱 켠 초, 수학은 n/ok도 있음)
    seed = {'1': [600, 12, None], '3': [900, 20, 1500], '10': [300, 5, None], '20': [1200, 30, 1800]}
    await pg.evaluate("""([seed, dayjs]) => { const day = eval(dayjs); for (const [i, v] of Object.entries(seed)) {
        const e = { sec: v[0], stars: v[1], n: 7, ok: 5 }; if (v[2] != null) e.app = v[2]; YUNI.state.log[day(+i)] = e; } }""", [seed, DAY_JS])
    # 61: 기본 1234로 열림, 틀린 암호는 안 열림
    await pg.click('[data-act=parent]'); await pg.wait_for_selector('.gate #ans')
    check('MREQ-61', await pg.locator('.gate input#ans[type=password]').count() == 1 and await pg.locator('[data-act=forgot]').count() == 1, f'{name} 암호 화면(가려진 입력, 암호를 잊었어요)')
    await pg.screenshot(path=f'{SHOT}/{name}-parent-gate.png')
    check('MREQ-61', not await pin_try(pg, '0000') and await state(pg, 'YUNI.screen') == 'gate', '틀린 암호 0000 → 안 열림')
    check('MREQ-61', await pin_try(pg, '1234'), '기본 암호 1234 → 열림')
    check('MREQ-63', await pg.evaluate(VISIBLE_PANELS) == ['summary'], '처음엔 요약 탭')
    await tab_checks(pg, name)
    # 62: 통계 탭
    await ptab(pg, 'stats')
    days = await pg.evaluate(f"[0,1,3,10,20].map({DAY_JS})")
    async def row(i):
        return await pg.locator(f'#statsCard .stat-row[data-date="{days[i]}"]').inner_text()
    n7 = await pg.locator('#statsCard .stat-row').count()
    r1, r3 = await row(1), await row(2)
    check('MREQ-62', n7 == 7, f'최근 7일 {n7}줄')
    check('MREQ-62', '10분' in r1 and '12개' in r1, f'어제 10분·별 12개 ({r1.replace(chr(10), " ")})')
    check('MREQ-62', '15분' in r3 and '20개' in r3 and '앱 켠 시간 25분' in r3, f'3일 전 15분·별 20개·앱 25분')
    check('MREQ-62', await pg.locator(f'#statsCard .stat-row[data-date="{days[3]}"]').count() == 0, '7일 보기엔 10일 전 없음')
    kv = await pg.locator('#statsCard .kv').inner_text()
    exp = await pg.evaluate(f"""(() => {{ const day = {DAY_JS}; let m = 0, s = 0; for (let i = 0; i < 7; i++) {{ const l = YUNI.state.log[day(i)] || {{}}; m += Math.round((l.sec||0)/60); s += l.stars||0; }} return [m, s]; }})()""")
    check('MREQ-62', f'{exp[0]}분' in kv and f'{exp[1]}개' in kv, f'7일 합계 {exp[0]}분·별 {exp[1]}개')
    await pg.click('#statsCard [data-act=statdays][data-arg="14"]'); await pg.wait_for_timeout(80)
    n14 = await pg.locator('#statsCard .stat-row').count(); r10 = await row(3)
    check('MREQ-62', n14 == 14 and '5분' in r10 and '5개' in r10, f'최근 14일 {n14}줄, 10일 전 5분·별 5개')
    check('MREQ-63', await pg.evaluate(VISIBLE_PANELS) == ['stats'], '기간 버튼(다시 그리기) 뒤에도 통계 탭 유지')
    await pg.click('#statsCard [data-act=statdays][data-arg="30"]'); await pg.wait_for_timeout(80)
    n30 = await pg.locator('#statsCard .stat-row').count(); r20 = await row(4)
    check('MREQ-62', n30 == 30 and '20분' in r20 and '30개' in r20, f'최근 30일 {n30}줄, 20일 전 20분·별 30개')
    await pg.screenshot(path=f'{SHOT}/{name}-parent-stats30.png', full_page=True)
    await pg.click('#statsCard [data-act=statdays][data-arg="7"]'); await pg.wait_for_timeout(50)
    # 63: 버튼을 눌러 화면을 다시 그려도 보던 탭 유지 (보상·별 탭에서 별 +1)
    await ptab(pg, 'reward')
    s0 = await state(pg, 'YUNI.state.stars')
    await pg.click('[data-panel=reward] [data-act=star][data-arg="1"]'); await pg.wait_for_timeout(80)
    check('MREQ-63', await state(pg, 'YUNI.state.stars') == s0 + 1 and await pg.evaluate(VISIBLE_PANELS) == ['reward'], '별 +1 뒤에도 보상·별 탭 유지')
    await pg.click('[data-panel=reward] [data-act=star][data-arg="-1"]'); await pg.wait_for_timeout(50)
    # 61: 설정 탭에서 암호 바꾸기 (두 번 다르게 적으면 안 바뀜)
    await ptab(pg, 'settings')
    await pg.fill('#pinNew', '5678'); await pg.fill('#pinNew2', '5679'); await pg.click('[data-act=setpin]'); await pg.wait_for_timeout(80)
    check('MREQ-61', await state(pg, 'YUNI.state.settings.parentPin') == '1234', '두 번 다르게 적으면 안 바뀜')
    await pg.fill('#pinNew', '12'); await pg.fill('#pinNew2', '12'); await pg.click('[data-act=setpin]'); await pg.wait_for_timeout(80)
    check('MREQ-61', await state(pg, 'YUNI.state.settings.parentPin') == '1234', '4자리 미만은 안 바뀜')
    await pg.fill('#pinNew', '5678'); await pg.fill('#pinNew2', '5678'); await pg.click('[data-act=setpin]'); await pg.wait_for_timeout(80)
    check('MREQ-61', await state(pg, 'YUNI.state.settings.parentPin') == '5678', '설정 탭에서 5678로 바꿈')
    check('MREQ-63', await pg.evaluate(VISIBLE_PANELS) == ['settings'], '암호 바꾼 뒤에도 설정 탭 유지')
    await pg.click('.topbar [data-act=home]')
    await pg.click('[data-act=parent]'); await pg.wait_for_selector('.gate #ans')
    check('MREQ-61', not await pin_try(pg, '1234'), '바꾼 뒤 1234 → 안 열림')
    check('MREQ-61', await pin_try(pg, '5678'), '바꾼 암호 5678 → 열림')
    check('MREQ-63', await pg.evaluate(VISIBLE_PANELS) == ['summary'], '다시 들어오면 요약 탭')
    await pg.click('.topbar [data-act=home]')
    # 61: 암호를 잊었어요 → 두 자리 × 두 자리 곱셈 → 1234로 되돌림
    await pg.click('[data-act=parent]'); await pg.wait_for_selector('.gate #ans')
    await pg.click('[data-act=forgot]'); await pg.wait_for_timeout(80)
    q = await pg.locator('.gate .card').inner_text()
    m = re.search(r'(\d+)\s*×\s*(\d+)', q)
    check('MREQ-61', await state(pg, 'YUNI.screen') == 'pinreset' and m and 10 <= int(m.group(1)) <= 99 and 10 <= int(m.group(2)) <= 99, f'암호 되돌리기 문제 {m.group(0) if m else q}')
    await pg.screenshot(path=f'{SHOT}/{name}-parent-pinreset.png')
    await pg.fill('#ans', str(int(m.group(1)) * int(m.group(2)) + 1)); await pg.click('[data-act=ok]'); await pg.wait_for_timeout(80)
    check('MREQ-61', await state(pg, 'YUNI.screen') == 'pinreset' and await state(pg, 'YUNI.state.settings.parentPin') == '5678', '틀린 곱 → 그대로')
    q = await pg.locator('.gate .card').inner_text(); m = re.search(r'(\d+)\s*×\s*(\d+)', q)
    await pg.fill('#ans', str(int(m.group(1)) * int(m.group(2)))); await pg.click('[data-act=ok]'); await pg.wait_for_timeout(100)
    check('MREQ-61', await state(pg, 'YUNI.screen') == 'parent' and await state(pg, 'YUNI.state.settings.parentPin') == '1234'
          and await pg.evaluate(VISIBLE_PANELS) == ['settings'], '맞히면 1234로 되돌리고 설정 탭으로')
    await pg.click('.topbar [data-act=home]')
    await pg.click('[data-act=parent]'); await pg.wait_for_selector('.gate #ans')
    check('MREQ-61', await pin_try(pg, '1234'), '되돌린 뒤 1234 → 열림')
    await pg.click('.topbar [data-act=home]')

KO_COVER_JS = """async () => { const idx = await (await fetch('audio-ko/index.json')).json(); const key = t => String(t).replace(/\\s+/g, ' ').trim();
  let n = 0, hit = 0; const miss = [];
  for (const t of window.__KO_LOG) { const w = !!idx[key(t)]; for (const s of YUNI.koSentences(key(t))) { n++; if (w || idx[s]) hit++; else miss.push(s); } }
  return { n, hit, miss: [...new Set(miss)], files: Object.keys(idx).length }; }"""

async def ko_rec_checks(pg, name):
    """공통 65번 한국어 녹음: 하루 흐름에서 읽은 문장의 녹음 비율, 녹음 파일 요청, 기기 음성 설정"""
    cov = await pg.evaluate(KO_COVER_JS)
    pct = round(cov['hit'] / max(1, cov['n']) * 100, 1)
    if cov['miss']: print(f'  [{name}] 녹음 없는 문장 {len(cov["miss"])}개:', ' | '.join(cov['miss'][:40]))
    check('MREQ-65', pct >= 90, f'{name} 하루 흐름 문장 {cov["n"]}개 중 녹음 {pct}% (녹음 목록 {cov["files"]}개)')
    reqs = await state(pg, 'window.__audio')
    check('MREQ-65', any(re.search(r'audio-ko/[0-9a-f]{12}\.mp3$', u) for u in reqs), f'{name} 녹음 파일 요청 {len(reqs)}번')
    # 설정: 기기 음성으로 바꾸면 녹음을 안 써요
    await gate(pg); await ptab(pg, 'settings')
    opts = await pg.evaluate("[...document.querySelectorAll('[data-set=koVoiceMode] option')].map(o => o.value + ':' + o.textContent)")
    check('MREQ-65', opts == ['rec:녹음 목소리 (추천)', 'device:기기 음성'], f'{name} 한국어 읽기 설정 {opts}')
    await pg.select_option('[data-set=koVoiceMode]', 'device'); await pg.wait_for_timeout(50)
    await pg.click('.topbar [data-act=home]')
    await pg.evaluate("window.__audio = []; window.__said = []")
    await pg.click('[data-act=hello]', force=True); await pg.wait_for_timeout(400)
    a1, s1 = await state(pg, 'window.__audio'), await state(pg, 'window.__said')
    check('MREQ-65', await state(pg, 'YUNI.state.settings.koVoiceMode') == 'device' and not a1 and s1, f'{name} 기기 음성 설정 → 녹음 요청 {len(a1)}번, 기기 음성 {len(s1)}번')
    await gate(pg); await ptab(pg, 'settings'); await pg.select_option('[data-set=koVoiceMode]', 'rec'); await pg.click('.topbar [data-act=home]')
    await pg.evaluate("window.__audio = []; window.__said = []")
    await pg.click('[data-act=hello]', force=True); await pg.wait_for_timeout(400)
    a2, s2 = await state(pg, 'window.__audio'), await state(pg, 'window.__said')
    check('MREQ-65', a2 and not s2, f'{name} 녹음 목소리로 되돌리면 → 녹음 {len(a2)}번, 기기 음성 {len(s2)}번')

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
    n_skip = len(REVEAL_SKIP)
    await play_day(pg, f'{name}-d1', wrong_every=3, reveal_once=True, prev_test=True)
    check('MREQ-64', len(REVEAL_SKIP) > n_skip, f'{name} 3번 틀린 뒤 다음 ▶ 점검 {REVEAL_SKIP[n_skip:]}')
    st = await state(pg, 'YUNI.state')
    today = await state(pg, "(() => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); })()")
    check('MREQ-04', st['done'].get('2-1-1') == today and st['pos'] == {'u': '2-1', 'd': 2, 's': 0}, f'{name} 1일차 완료 → 2일차')
    check('MREQ-18', st['log'][today]['stars'] <= 50, f"{name} 오늘 별 {st['log'][today]['stars']}")
    await pg.screenshot(path=f'{SHOT}/{name}-reward.png')
    said = await state(pg, 'window.__said')
    bad = [s for s in said if re.search(r'[0-9+=−□]', s)]
    check('MREQ-12', not bad, f'숫자·기호가 그대로 읽힌 문장 {len(bad)}개 {bad[:2]}')
    check('MREQ-07', not any('땡' in s for s in said), '음성에 "땡" 없음')
    check('MREQ-35', len(st['explains']) >= 1 and st['explains'][0]['said'], '설명하기 글자 기록')
    check('MREQ-08', len(st['weak']) >= 1, f"틀린 유형 기록 {list(st['weak'].keys())}")
    check('MREQ-36', len(st['stats']) >= 3, f"유형 {len(st['stats'])}개")
    await pg.click('[data-act=home]')
    await ko_rec_checks(pg, name)

    if full:
        # 같은 날 여러 번 해도 하루 별 50개 이하 (MREQ-18)
        for d in range(2):
            await pg.click('[data-act=go]'); await play_day(pg, f'{name}-extra{d}'); await pg.click('[data-act=home]')
        st = await state(pg, 'YUNI.state')
        check('MREQ-18', st['log'][today]['stars'] <= 50, f"하루 3번 해도 별 {st['log'][today]['stars']}개")
        # 하루 50개에 거의 찼을 때: 문제 별은 47개에서 멈추고 보너스로 딱 50개
        await pg.evaluate("(() => { const d = new Date(); const k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); YUNI.state.log[k].stars = 45; })()")
        await pg.click('[data-act=go]'); await play_day(pg, f'{name}-cap'); 
        st = await state(pg, 'YUNI.state')
        check('MREQ-18', st['log'][today]['stars'] == 50, f"하루 최대 50개에서 멈춤 ({st['log'][today]['stars']}개)")
        await pg.click('[data-act=home]')

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
        await parent_common_checks(pg, name)
        await gate(pg)
        await pg.screenshot(path=f'{SHOT}/{name}-parent.png', full_page=True)
        txt = await pg.locator('.parent').text_content()
        for rid, words in {'MREQ-10': ['이번 주', '약한 유형', '아빠 화면 암호'], 'MREQ-14': ['진도 조정', '별 조정', '진도 초기화'], 'MREQ-15': ['받은 보상'],
                           'MREQ-16': ['백업 파일 저장', '백업 파일 불러오기'], 'MREQ-23': ['새 버전 확인'], 'MREQ-21': ['기획·변경 기록'],
                           'MREQ-30': ['지금 학교 단원'], 'MREQ-32': ['연산 사다리 조정'], 'MREQ-36': ['약한 유형'], 'MREQ-35': ['설명하기 기록']}.items():
            check(rid, all(w in txt for w in words), '아빠 화면: ' + ', '.join(words))
        # 보상 기록 → 진도 초기화해도 별·보상·설정 유지
        await ptab(pg, 'settings')
        await pg.fill('[data-set=goalText]', '레고 로봇'); await pg.dispatch_event('[data-set=goalText]', 'change')
        await pg.click('[data-act=gave]'); await pg.wait_for_timeout(100)
        before = await state(pg, 'YUNI.state')
        await ptab(pg, 'progress')
        await pg.click('[data-act=resetprog]'); await pg.click('[data-act=resetprog]'); await pg.wait_for_timeout(100)
        after = await state(pg, 'YUNI.state')
        check('MREQ-14', after['stars'] == before['stars'] and after['rewards'] == before['rewards'] and after['settings']['goalText'] == '레고 로봇'
              and after['pos'] == {'u': '2-1', 'd': 1, 's': 0} and not after['stickers'] and after['ladder']['rung'] == 0, '진도 초기화: 별·보상·설정 유지')
        check('MREQ-15', len(after['rewards']) == 1 and after['rewards'][0]['text'] == '레고 로봇', '보상 기록')
        # 별 조정
        await ptab(pg, 'reward')
        await pg.click('[data-act=star][data-arg="10"]'); await pg.wait_for_timeout(50)
        check('MREQ-14', await state(pg, 'YUNI.state.stars') == after['stars'] + 10, '별 +10')
        # 지금 학교 단원
        await ptab(pg, 'progress')
        await pg.select_option('#school', '2-6'); await pg.click('[data-act=school]'); await pg.wait_for_timeout(50)
        check('MREQ-30', (await state(pg, 'YUNI.state.pos')) == {'u': '2-6', 'd': 1, 's': 0}, '학교 단원 → 1일차')
        # 사다리 조정
        await pg.select_option('#rung', '9'); await pg.click('[data-act=setrung]'); await pg.wait_for_timeout(50)
        check('MREQ-32', (await state(pg, 'YUNI.state.ladder.rung')) == 9, '사다리 칸 조정')
        await pg.select_option('[data-set=ladderPct]', '80'); await pg.wait_for_timeout(50)
        check('MREQ-32', (await state(pg, 'YUNI.state.settings.ladderPct')) == 80, '사다리 기준 조정')
        # 백업 코드 내보내기 → 가져오기
        await ptab(pg, 'manage')
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

    if not full:
        await pg.click('[data-act=parent]'); await pg.wait_for_selector('.gate #ans')
        await pg.screenshot(path=f'{SHOT}/{name}-parent-gate.png')
        check('MREQ-61', not await pin_try(pg, '9999') and await pin_try(pg, '1234'), f'{name} 틀린 암호 안 열림, 1234 열림')
        await tab_checks(pg, name)
        # 폰: 설정 탭에서 다시 그린 뒤(암호 바꾸기)에도 켜진 탭 버튼이 화면 안에 보여요 (탭 바 가로 스크롤)
        await ptab(pg, 'settings')
        await pg.fill('#pinNew', '5678'); await pg.fill('#pinNew2', '5678'); await pg.click('[data-act=setpin]'); await pg.wait_for_timeout(400)
        r = await pg.evaluate("(() => { const b = document.querySelector('.ptab.on'); const r = b.getBoundingClientRect(); return {k: b.dataset.arg, l: r.left, r: r.right, t: r.top, b: r.bottom, w: innerWidth, h: innerHeight}; })()")
        check('MREQ-63', r['k'] == 'settings' and r['l'] >= 0 and r['r'] <= r['w'] + 1 and r['t'] >= 0 and r['b'] <= r['h'],
              f"{name} 다시 그린 뒤 켜진 탭({r['k']}) 화면 안 {r['l']:.0f}~{r['r']:.0f}/{r['w']}")
        await pg.fill('#pinNew', '1234'); await pg.fill('#pinNew2', '1234'); await pg.click('[data-act=setpin]'); await pg.wait_for_timeout(100)
        await pg.click('.topbar [data-act=home]')

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
    check('MREQ-18', 'DAY_STAR_MAX = 50, DAY_BONUS = 3' in app, '별 규칙 상수 (하루 50개)')
    check('MREQ-64', 'function award(solved)' in app and 'award(false)' in app and 'award(0)' not in app and 'award(3)' not in app, 'award(solved) 코드')
    check('MREQ-61', "parentPin: '1234'" in app and "const DEFAULT_PIN = '1234'" in app, '기본 암호 1234 (settings.parentPin)')
    check('MREQ-21', f'v{ver}' in spec and '현재 버전: **v' + ver in spec, f'기획서.md에 v{ver}')
    check('MREQ-34', not re.search(r'남은 시간|초시계|countdown|타이머 표시', app), '타이머·초시계 없음')
    check('MREQ-38', man['theme_color'].lower() == '#22a06b' and '--primary: #22a06b' in open(os.path.join(APP_DIR, 'style.css'), encoding='utf-8').read(), '초록색 테마')
    kl = json.load(open(os.path.join(APP_DIR, 'tools', 'ko_sentences.json'), encoding='utf-8'))
    bad = [x for x in kl if re.search(r'[0-9+=−□:→]', x['say'])]
    check('MREQ-65', not bad and len(kl) <= 2500, f'녹음 문장 {len(kl)}개, 읽는 말에 숫자·기호 남은 것 {len(bad)}개 {bad[:2]}')
    check('MREQ-65', "'audio-ko/index.json'" in sw and 'cacheAudio' in sw and "koVoiceMode: 'rec'" in app and 'koStop(); try { speechSynthesis.cancel()' in app, 'sw 캐시·기본 설정·hush 멈춤')
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
