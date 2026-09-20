/*
 * 윤이 수학 — 학습 콘텐츠
 * ------------------------------------------------------------
 * 아빠가 직접 고치는 파일이에요.
 *  - units: 1학년 11개 단원. ready:true 인 단원만 앱에서 공부할 수 있어요.
 *    단원 순서를 바꾸려면 이 배열의 순서만 바꾸면 돼요. (id는 바꾸지 마세요 — 진도 기록이 id로 저장돼요)
 *  - days: 하루치 구성. concept = 개념 카드, items = 문제 {g: 문제 종류, n: 개수, p: 옵션}
 *    challenge:true 인 날은 "단원 마무리 도전" (10문제, 8개 이상 맞히면 스티커)
 *  - 문제 종류(g): countTens(몇십) count(몇십몇 세기) seq(수의 순서) nextPrev(1 큰 수·1 작은 수)
 *    compare(더 큰 수) evenOdd(짝수·홀수) join(모으기) split(가르기, 10칸 상자에 넣기)
 *    calc(계산, 숫자 패드) story(이야기 문제)
 *  - calc/story의 kind: small(작은 수) make10(10 만들기) from10(10에서 빼기) three(세 수) three10(10 만들어 세 수)
 *    tenPlus(10과 몇) tens(몇십±몇십) tensOnes(몇십+몇) twoOne(몇십몇±몇) two(몇십몇±몇십몇)
 *    carry(받아올림 덧셈) borrow(받아내림 뺄셈) mixAll(섞기)
 *  - 글 속 숫자는 앱이 읽기 쉬운 말로 바꿔 읽어요 (8+5 → 팔 더하기 오, 7마리 → 일곱 마리)
 *  - 고친 뒤 sw.js 의 VERSION 과 app.js 의 APP_VERSION 을 올려야 설치된 앱에 반영돼요.
 */
window.CONTENT = {
  units: [
    { id: '1-1', sem: '1-1', title: '9까지의 수', icon: '🐞', sticker: '🐞', ready: false, plan: 'v0.3' },
    { id: '1-2', sem: '1-1', title: '여러 가지 모양', icon: '📦', sticker: '🤖', ready: false, plan: 'v0.3' },
    { id: '1-3', sem: '1-1', title: '덧셈과 뺄셈', icon: '🐟', sticker: '🐟', ready: false, plan: 'v0.3' },
    { id: '1-4', sem: '1-1', title: '비교하기', icon: '🐳', sticker: '🐳', ready: false, plan: 'v0.3' },
    { id: '1-5', sem: '1-1', title: '50까지의 수', icon: '🐜', sticker: '🐜', ready: false, plan: 'v0.3' },
    {
      id: '2-1', sem: '1-2', title: '100까지의 수', icon: '💯', sticker: '🚀', ready: true,
      mission: '집에 있는 콩이나 블록을 10개씩 묶어서 모두 몇 개인지 세어 봐요. 현이한테도 알려줘요!',
      days: [
        { title: '몇십 알아보기',
          concept: [
            { pic: '🐜', title: '10개씩 묶음', text: '개미가 10마리씩 줄을 섰어요. 10개씩 묶음 6개는 60이에요. 육십, 또는 예순이라고 읽어요.', vis: { tens: 60 } },
            { pic: '💯', title: '몇십 읽기', text: '70은 칠십, 일흔. 80은 팔십, 여든. 90은 구십, 아흔. 10개씩 묶음 10개는 100, 백이에요!' },
          ],
          items: [{ g: 'countTens', n: 3 }, { g: 'seq', n: 2, p: { step: 10 } }, { g: 'compare', n: 1, p: { tens: true } }] },
        { title: '99까지 세기',
          concept: [{ pic: '🐟', title: '묶음과 낱개', text: '10개씩 묶음 7개와 낱개 3개는 73이에요. 칠십삼, 또는 일흔셋이라고 읽어요.', vis: { tens: 73 } }],
          items: [{ g: 'count', n: 4 }, { g: 'seq', n: 2 }] },
        { title: '수의 순서',
          concept: [{ pic: '🚂', title: '1 큰 수, 1 작은 수', text: '1 큰 수는 바로 뒤의 수, 1 작은 수는 바로 앞의 수예요. 99보다 1 큰 수는 100이에요!', vis: { line: [97, 100] } }],
          items: [{ g: 'seq', n: 2 }, { g: 'nextPrev', n: 3 }, { g: 'seq', n: 1, p: { top: true } }] },
        { title: '수의 크기 비교',
          concept: [{ pic: '⚖️', title: '어느 수가 더 클까?', text: '10개씩 묶음이 많은 쪽이 더 커요. 묶음 수가 같으면, 낱개가 많은 쪽이 더 커요.' }],
          items: [{ g: 'compare', n: 5 }, { g: 'nextPrev', n: 1 }] },
        { title: '짝수와 홀수',
          concept: [{ pic: '🦋', title: '짝꿍 찾기', text: '둘씩 짝을 지을 때 남는 것이 없으면 짝수, 하나가 남으면 홀수예요. 2, 4, 6, 8, 10은 짝수!', vis: { pairs: 7 } }],
          items: [{ g: 'evenOdd', n: 5 }, { g: 'count', n: 1 }] },
        { title: '단원 마무리 도전', challenge: true,
          items: [{ g: 'countTens', n: 1 }, { g: 'count', n: 2 }, { g: 'seq', n: 2 }, { g: 'nextPrev', n: 1 }, { g: 'compare', n: 2 }, { g: 'evenOdd', n: 2 }] },
      ],
      explain: [
        { q: '57하고 75 중에 어느 게 더 커?', model: '10개씩 묶음이 7개인 75가 더 커요!', keywords: ['75', '칠십오', '일흔다섯', '묶음', '7개', '일곱'] },
        { q: '10개씩 묶음 6개와 낱개 4개는 몇이야?', model: '60과 4를 합해서 64예요!', keywords: ['64', '육십사', '예순넷'] },
        { q: '9는 짝수야, 홀수야?', model: '둘씩 짝을 지으면 하나가 남으니까 홀수예요!', keywords: ['홀수', '하나가 남', '남아'] },
      ],
    },
    {
      id: '2-2', sem: '1-2', title: '덧셈과 뺄셈(1)', icon: '🎒', sticker: '🎒', ready: true,
      mission: '여행 가방 놀이! 블록 23개와 14개를 모아서 모두 몇 개인지 세어 보고, 식으로 써 봐요.',
      days: [
        { title: '(몇십몇)+(몇)',
          concept: [{ pic: '🎒', title: '낱개끼리 더해요', text: '23+4는 낱개끼리 더해요. 3+4=7, 그래서 27이에요.', vis: { tens: 23, plus: 4 } }],
          items: [{ g: 'calc', n: 4, p: { kind: 'twoOne', op: '+' } }, { g: 'story', n: 2, p: { kind: 'twoOne', op: '+' } }] },
        { title: '(몇십)+(몇십)',
          concept: [{ pic: '📦', title: '묶음끼리 더해요', text: '30+20은 10개씩 묶음 3개와 2개. 묶음이 5개니까 50이에요.', vis: { tens: 30, plus: 20 } }],
          items: [{ g: 'calc', n: 3, p: { kind: 'tens', op: '+' } }, { g: 'calc', n: 2, p: { kind: 'tensOnes' } }, { g: 'story', n: 1, p: { kind: 'tens', op: '+' } }] },
        { title: '(몇십몇)+(몇십몇)',
          concept: [{ pic: '🧳', title: '자리끼리 더해요', text: '23+14는 십의 자리끼리, 일의 자리끼리 더해요. 20+10=30, 3+4=7, 그래서 37이에요.', vis: { tens: 23, plus: 14 } }],
          items: [{ g: 'calc', n: 4, p: { kind: 'two', op: '+' } }, { g: 'story', n: 2, p: { kind: 'two', op: '+' } }] },
        { title: '(몇십몇)−(몇)',
          concept: [{ pic: '🎈', title: '낱개끼리 빼요', text: '28−5는 낱개끼리 빼요. 8−5=3, 그래서 23이에요.', vis: { tens: 28 } }],
          items: [{ g: 'calc', n: 4, p: { kind: 'twoOne', op: '-' } }, { g: 'story', n: 2, p: { kind: 'twoOne', op: '-' } }] },
        { title: '(몇십)−(몇십)',
          concept: [{ pic: '📦', title: '묶음끼리 빼요', text: '50−20은 10개씩 묶음 5개에서 2개를 빼요. 묶음 3개가 남으니까 30이에요.', vis: { tens: 50 } }],
          items: [{ g: 'calc', n: 4, p: { kind: 'tens', op: '-' } }, { g: 'story', n: 2, p: { kind: 'tens', op: '-' } }] },
        { title: '(몇십몇)−(몇십몇)',
          concept: [{ pic: '🚂', title: '자리끼리 빼요', text: '38−15는 십의 자리끼리, 일의 자리끼리 빼요. 30−10=20, 8−5=3, 그래서 23이에요.', vis: { tens: 38 } }],
          items: [{ g: 'calc', n: 4, p: { kind: 'two', op: '-' } }, { g: 'story', n: 2, p: { kind: 'two', op: '-' } }] },
        { title: '덧셈과 뺄셈 이야기',
          concept: [{ pic: '🗺️', title: '더할까, 뺄까?', text: '모두 몇 개? 하면 더하기. 남은 것은? 하면 빼기예요.' }],
          items: [{ g: 'story', n: 4, p: { kind: 'two', op: 'mix' } }, { g: 'calc', n: 2, p: { kind: 'twoOne', op: 'mix' } }] },
        { title: '단원 마무리 도전', challenge: true,
          items: [{ g: 'calc', n: 2, p: { kind: 'twoOne', op: 'mix' } }, { g: 'calc', n: 2, p: { kind: 'tens', op: 'mix' } }, { g: 'calc', n: 1, p: { kind: 'tensOnes' } }, { g: 'calc', n: 3, p: { kind: 'two', op: 'mix' } }, { g: 'story', n: 2, p: { kind: 'two', op: 'mix' } }] },
      ],
      explain: [
        { q: '23+14는 어떻게 해?', model: '십의 자리끼리 20+10=30, 일의 자리끼리 3+4=7. 그래서 37이에요!', keywords: ['자리', '37', '삼십칠', '서른일곱', '30', '삼십'] },
        { q: '50−20은 어떻게 해?', model: '10개씩 묶음 5개에서 2개를 빼면 3개. 그래서 30이에요!', keywords: ['묶음', '30', '삼십', '서른', '5', '오'] },
        { q: '38−15는 어떻게 해?', model: '30−10=20, 8−5=3. 그래서 23이에요!', keywords: ['자리', '23', '이십삼', '스물셋', '20', '이십'] },
      ],
    },
    { id: '2-3', sem: '1-2', title: '여러 가지 모양', icon: '🔷', sticker: '🔷', ready: false, plan: 'v0.2' },
    {
      id: '2-4', sem: '1-2', title: '덧셈과 뺄셈(2)', icon: '🚗', sticker: '🚗', ready: true,
      mission: '주사위 3개를 굴려서 세 수를 더해 봐요. 더해서 10이 되는 두 수가 있으면 먼저 더하기!',
      days: [
        { title: '세 수의 덧셈',
          concept: [{ pic: '🚗', title: '앞에서부터 차례로', text: '2+3+4는 앞의 두 수를 먼저 더해요. 2+3=5, 5+4=9예요.' }],
          items: [{ g: 'calc', n: 5, p: { kind: 'three', op: '+' } }, { g: 'join', n: 1 }] },
        { title: '세 수의 뺄셈',
          concept: [{ pic: '🚙', title: '앞에서부터 차례로', text: '9−2−3은 앞에서부터 빼요. 9−2=7, 7−3=4예요.' }],
          items: [{ g: 'calc', n: 5, p: { kind: 'three', op: '-' } }, { g: 'story', n: 1, p: { kind: 'small', op: '-' } }] },
        { title: '10이 되는 더하기',
          concept: [{ pic: '🅿️', title: '10칸 주차장 채우기', text: '10칸 주차장에 자동차 7대가 있어요. 3대가 더 오면 가득 차요. 7과 3을 모으면 10이에요.', vis: { frame: [7, 3] } }],
          items: [{ g: 'split', n: 3, p: { total: 10 } }, { g: 'calc', n: 3, p: { kind: 'make10' } }] },
        { title: '10에서 빼기',
          concept: [{ pic: '🚕', title: '10에서 빼면', text: '10칸 주차장에서 자동차 3대가 나가면 7대가 남아요. 10−3=7이에요.', vis: { frame: [7] } }],
          items: [{ g: 'calc', n: 3, p: { kind: 'from10' } }, { g: 'split', n: 1, p: { total: 10 } }, { g: 'story', n: 2, p: { kind: 'from10' } }] },
        { title: '10을 만들어 더하기',
          concept: [{ pic: '🔟', title: '10 먼저!', text: '4+6+3은 4와 6으로 10을 먼저 만들어요. 10+3=13이에요.', vis: { frame: [4, 6] } }],
          items: [{ g: 'calc', n: 5, p: { kind: 'three10' } }, { g: 'calc', n: 1, p: { kind: 'tenPlus' } }] },
        { title: '10으로 모으기·가르기',
          concept: [{ pic: '🚌', title: '10과 몇', text: '10과 3을 모으면 13이에요. 13은 10과 3으로 가를 수 있어요.', vis: { frame: [10, 3] } }],
          items: [{ g: 'split', n: 3, p: { teen: true } }, { g: 'join', n: 3, p: { ten: true } }] },
        { title: '주차장 이야기',
          concept: [{ pic: '🗺️', title: '더할까, 뺄까?', text: '모두 몇 대? 하면 더하기. 남은 것은? 하면 빼기예요.' }],
          items: [{ g: 'story', n: 2, p: { kind: 'small', op: 'mix' } }, { g: 'story', n: 2, p: { kind: 'from10' } }, { g: 'calc', n: 2, p: { kind: 'three', op: 'mix' } }] },
        { title: '단원 마무리 도전', challenge: true,
          items: [{ g: 'calc', n: 2, p: { kind: 'three', op: 'mix' } }, { g: 'calc', n: 2, p: { kind: 'make10' } }, { g: 'calc', n: 2, p: { kind: 'from10' } }, { g: 'calc', n: 2, p: { kind: 'three10' } }, { g: 'split', n: 1, p: { teen: true } }, { g: 'story', n: 1, p: { kind: 'small', op: 'mix' } }] },
      ],
      explain: [
        { q: '3+7+5는 어떻게 해?', model: '3과 7을 먼저 더해서 10을 만들어요. 10+5=15예요!', keywords: ['10', '십', '열', '15', '십오', '열다섯', '먼저'] },
        { q: '10−4는 어떻게 해?', model: '10칸 상자에서 4개를 빼면 6개가 남아요!', keywords: ['6', '육', '여섯', '남아', '상자'] },
        { q: '7에 몇을 더하면 10이 돼?', model: '7과 3을 모으면 10이에요. 그래서 3!', keywords: ['3', '삼', '셋'] },
      ],
    },
    { id: '2-5', sem: '1-2', title: '시계 보기와 규칙 찾기', icon: '⏰', sticker: '⏰', ready: false, plan: 'v0.2' },
    {
      id: '2-6', sem: '1-2', title: '덧셈과 뺄셈(3)', icon: '🧪', sticker: '🧪', ready: true,
      mission: '과자 13개로 실험! 5개를 먹으면 몇 개 남을까? 먼저 식으로 맞혀 보고, 진짜로 세어 봐요 🍪',
      days: [
        { title: '10을 만들어 더하기',
          concept: [{ pic: '🧪', title: '가르고 10 만들기', text: '8+5는 5를 2와 3으로 갈라요. 8+2=10, 10+3=13이에요.', vis: { frame: [8, 5] } }],
          items: [{ g: 'calc', n: 4, p: { kind: 'carry' } }, { g: 'split', n: 2, p: { total: 10, big: true } }] },
        { title: '여러 가지 방법으로 더하기',
          concept: [{ pic: '🔬', title: '앞 수를 갈라도 돼요', text: '4+9는 4를 3과 1로 갈라요. 1+9=10, 10+3=13이에요.', vis: { frame: [9, 4] } }],
          items: [{ g: 'calc', n: 4, p: { kind: 'carry' } }, { g: 'story', n: 2, p: { kind: 'carry' } }] },
        { title: '덧셈 연습',
          concept: [{ pic: '🧫', title: '규칙이 보여요', text: '9+2=11, 9+3=12, 9+4=13. 더하는 수가 1 커지면, 답도 1 커져요.' }],
          items: [{ g: 'calc', n: 4, p: { kind: 'carry' } }, { g: 'story', n: 2, p: { kind: 'carry' } }] },
        { title: '10에서 빼고 더하기',
          concept: [{ pic: '🧲', title: '10에서 빼요', text: '13−5는 13을 10과 3으로 갈라요. 10−5=5, 5+3=8이에요.', vis: { frame: [10, 3] } }],
          items: [{ g: 'calc', n: 4, p: { kind: 'borrow' } }, { g: 'calc', n: 2, p: { kind: 'from10' } }] },
        { title: '빼는 수 가르기',
          concept: [{ pic: '⚗️', title: '두 번에 나눠 빼기', text: '13−5는 5를 3과 2로 갈라요. 13−3=10, 10−2=8이에요.', vis: { frame: [10, 3] } }],
          items: [{ g: 'calc', n: 4, p: { kind: 'borrow' } }, { g: 'story', n: 2, p: { kind: 'borrow' } }] },
        { title: '뺄셈 연습',
          concept: [{ pic: '🌋', title: '규칙이 보여요', text: '15−6=9, 15−7=8, 15−8=7. 빼는 수가 1 커지면, 답은 1 작아져요.' }],
          items: [{ g: 'calc', n: 4, p: { kind: 'borrow' } }, { g: 'story', n: 2, p: { kind: 'borrow' } }] },
        { title: '과학실험 이야기',
          concept: [{ pic: '🗺️', title: '더할까, 뺄까?', text: '모두 몇 개? 하면 더하기. 남은 것은? 하면 빼기예요.' }],
          items: [{ g: 'story', n: 2, p: { kind: 'carry' } }, { g: 'story', n: 2, p: { kind: 'borrow' } }, { g: 'calc', n: 2, p: { kind: 'carry' } }] },
        { title: '단원 마무리 도전', challenge: true,
          items: [{ g: 'calc', n: 4, p: { kind: 'carry' } }, { g: 'calc', n: 4, p: { kind: 'borrow' } }, { g: 'story', n: 1, p: { kind: 'carry' } }, { g: 'story', n: 1, p: { kind: 'borrow' } }] },
      ],
      explain: [
        { q: '8+5는 어떻게 해?', model: '5를 2와 3으로 갈라요. 8+2=10, 10+3=13이에요!', keywords: ['10', '십', '열', '가르', '갈라', '13', '십삼', '열셋'] },
        { q: '13−5는 어떻게 해?', model: '13을 10과 3으로 갈라요. 10−5=5, 5+3=8이에요!', keywords: ['10', '십', '열', '가르', '갈라', '8', '팔', '여덟'] },
        { q: '9+6은 어떻게 해?', model: '6을 1과 5로 갈라요. 9+1=10, 10+5=15예요!', keywords: ['10', '십', '열', '가르', '갈라', '15', '십오', '열다섯'] },
      ],
    },
  ],

  // 연산 사다리 12칸 (단원과 따로 올라가요). 1~7칸은 10칸 상자 그림을 함께, 8칸부터는 식 위주
  ladder: [
    { name: '5까지 모으기·가르기', ex: '2+3, 5−1', p: { kind: 'small', max: 5, op: 'mix' } },
    { name: '10까지 덧셈', ex: '4+5', p: { kind: 'small', max: 10, op: '+' } },
    { name: '10까지 뺄셈', ex: '9−6', p: { kind: 'small', max: 10, op: '-' } },
    { name: '10 만들기', ex: '7+□=10', p: { kind: 'make10' } },
    { name: '10에서 빼기', ex: '10−3', p: { kind: 'from10' } },
    { name: '세 수의 계산', ex: '3+4+2', p: { kind: 'three', op: 'mix' } },
    { name: '10과 몇', ex: '10+6, 16−6', p: { kind: 'tenPlus' } },
    { name: '몇십+몇, 몇십±몇십', ex: '30+5, 40+20', p: { kind: 'tensMix' } },
    { name: '받아올림 없는 두 자리', ex: '23+14, 38−15', p: { kind: 'two', op: 'mix' } },
    { name: '받아올림 있는 덧셈', ex: '8+5, 9+7', p: { kind: 'carry' } },
    { name: '받아내림 있는 뺄셈', ex: '13−5, 15−8', p: { kind: 'borrow' } },
    { name: '혼합 도전', ex: '위 유형 섞기', p: { kind: 'mixAll' } },
  ],

  // 이야기 문제 틀. {F} = 친구 이름(현이가·초록이가·은후가), {a}{b} = 숫자. 숫자 바로 뒤에 단위를 붙여 써요.
  // pic = 그림 이모지. 문장은 짧게 (15자 안팎)
  stories: {
    add: [
      { pic: '🐜', text: '{F} 돋보기로 개미 {a}마리를 찾았어요. {b}마리가 더 왔어요. 모두 몇 마리일까요?', unit: '마리' },
      { pic: '🐞', text: '{F} 무당벌레 {a}마리를 찾았어요. 윤이는 {b}마리를 찾았어요. 모두 몇 마리일까요?', unit: '마리' },
      { pic: '🐟', text: '바다에 물고기 {a}마리가 있어요. {b}마리가 더 헤엄쳐 왔어요. 모두 몇 마리일까요?', unit: '마리' },
      { pic: '🔮', text: '시험관에 구슬 {a}개를 넣었어요. {b}개를 더 넣었어요. 모두 몇 개일까요?', unit: '개' },
      { pic: '⚙️', text: '로봇 공장에 바퀴가 {a}개 있어요. {b}개를 더 만들었어요. 모두 몇 개일까요?', unit: '개' },
      { pic: '📷', text: '{F} 여행 사진을 {a}장 찍었어요. 윤이는 {b}장 찍었어요. 모두 몇 장일까요?', unit: '장' },
      { pic: '🐌', text: '화분에 달팽이 {a}마리가 있어요. {b}마리가 더 기어 왔어요. 모두 몇 마리일까요?', unit: '마리' },
    ],
    sub: [
      { pic: '🐟', text: '어항에 물고기가 {a}마리 있어요. {b}마리를 다른 어항으로 옮겼어요. 남은 물고기는 몇 마리일까요?', unit: '마리' },
      { pic: '🚂', text: '기차에 {a}명이 타고 있어요. 다음 역에서 {b}명이 내렸어요. 남은 사람은 몇 명일까요?', unit: '명' },
      { pic: '🦋', text: '꽃밭에 나비 {a}마리가 앉아 있어요. {b}마리가 날아갔어요. 남은 나비는 몇 마리일까요?', unit: '마리' },
      { pic: '🎈', text: '풍선이 {a}개 있어요. {b}개가 날아갔어요. 남은 풍선은 몇 개일까요?', unit: '개' },
      { pic: '⚙️', text: '{F} 로봇 부품 {a}개를 가지고 있어요. 로봇을 만드느라 {b}개를 썼어요. 남은 부품은 몇 개일까요?', unit: '개' },
      { pic: '🍪', text: '과자가 {a}개 있어요. {F} {b}개를 먹었어요. 남은 과자는 몇 개일까요?', unit: '개' },
    ],
  },

  // 문제 그림에 쓰는 이모지 (셀 때)
  things: ['🐞', '🐜', '🐟', '🦋', '🐝', '🐌', '🦀', '⭐', '🔩', '🚗'],

  // 로봇 친구가 하는 말 (한국어, 짧게)
  lines: {
    praise: ['잘했어!', '멋져!', '맞았어!', '최고야!', '와, 대단해!', '정답이야!', '훌륭해!', '딱 맞았어!'],
    retry: ['다시 해볼까?', '한 번 더 생각해 볼까?'],
    showAnswer: '괜찮아! 같이 풀어 보자.',
  },

  // 함께하는 친구들 (앱 속 캐릭터). subj = 이야기 문제에서 "~가" 붙인 이름
  friends: {
    eunhoo: { name: '은후', subj: '은후가', color: '#ffb74d', role: '같이 문제 푸는 친구' },
    chorok: { name: '초록', subj: '초록이가', call: '초록이', color: '#66bb6a', role: '윤이가 가르쳐주는 동생 (친척동생)' },
    hyun: { name: '현', subj: '현이가', call: '현이', color: '#64b5f6', role: '윤이가 가르쳐주는 동생 (친동생)' },
  },
};
