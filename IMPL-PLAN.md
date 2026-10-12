# 상식 퀴즈 웹 앱 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버 없이 `file://` 로 열리는 4지선다 상식 퀴즈를, 연습 모드 → 스피드·힌트 모드 → 순위표 순서로 3단계에 걸쳐 만든다.

**Architecture:** 파일 4개(`index.html`, `style.css`, `questions.js`, `script.js`)에 빌드 단계도 외부 의존성도 없다. `script.js` 안에서 **순수 함수층**(채점·섞기·힌트·순위표·문항 검사)과 **DOM 층**(렌더·타이머·이벤트)을 나누고, 순수 함수만 `tests.html` 이 직접 호출해 검사한다. 화면은 한 문서에 전부 두고 표시 전환으로 넘긴다.

**Tech Stack:** 바닐라 HTML/CSS/JS (ES2020), `localStorage`, 자체 제작 테스트 러너

**Spec:** [PRD.md](PRD.md)

## Global Constraints

PRD 에서 그대로 옮긴 값이다. 모든 과제에 적용된다.

- 배포물은 `index.html`, `style.css`, `questions.js`, `script.js` 4개. `tests.html` 은 저장소에만 둔다
- ES module 금지. `<script src="questions.js">` → `<script src="script.js">` 순서의 평범한 태그
- 외부 의존성 없음, 빌드 단계 없음, CDN 없음
- `questions.js` 는 전역 상수 `QUESTIONS` 하나만 선언한다
- `script.js` 는 로드 즉시 초기화하지 않는다. `#quiz-root` 가 있을 때만 초기화한다
- `localStorage` 접근은 **모두** `try/catch` 로 감싼다. 실패해도 퀴즈는 끝까지 돌아야 한다
- 카테고리 키: `korean_history`, `world_geography`, `science`, `arts_culture`
- 모드 키: `practice`, `speed`, `hint`
- 점수: 정답 1점 / 힌트 쓰고 정답 0.5점 / 오답·시간 초과 0점
- 점수 표시: `` `${score} / ${round.items.length}` `` — 씨드 문항이 10개가 안 되는 1단계에서도 맞는다
- 스피드 제한 시간 15초. 남은 시간은 `deadline - Date.now()`, 표시는 `Math.ceil(남은 ms / 1000)`
- 힌트는 문항당 1회, 오답 2개 제거. 지운 보기는 **자리를 유지**한 채 흐리게 + 클릭 차단
- 순위표 `localStorage` 키: `quiz.leaderboard.v1`. 보드 8개(카테고리 4 × 스피드·힌트), 보드마다 상위 5개
- 정답·오답을 색만으로 구분하지 않는다. ✓ ✗ 기호를 함께 쓴다
- 보기는 숫자키 `1`~`4`, [다음] 은 `Enter` 로도 조작된다
- UI 문구·주석·커밋 메시지는 한국어
- 커밋·push 는 사용자가 요청할 때만 한다 (`~/.claude/CLAUDE.md`)

## Review Focus

PRD 가 함축하지만 어느 과제도 자연히 건드리지 않는, 사람을 물 가능성이 높은 다섯 가지. 각 줄의 테스트를 해당 과제에 넣어 두었다.

1. **`localStorage` 가 예외를 던지는 환경**(시크릿 창, `file://` 차단) — 순위표만 막히고 퀴즈는 끝까지 돌아야 한다 → Task 3.1
2. **저장된 순위표 JSON 이 깨져 있을 때** — 빈 보드로 시작하고 앱이 죽지 않아야 한다 → Task 3.1
3. **스피드 모드에서 탭을 비활성화했다 돌아왔을 때** — 틱을 세지 않으므로 즉시 시간 초과로 처리되고 음수 초가 표시되지 않아야 한다 → Task 2.2
4. **해설이 뜬 뒤 보기를 다시 클릭했을 때** — 점수가 두 번 더해지면 안 된다 → Task 1.4
5. **문항이 10개가 아닌 라운드**(1단계 씨드, 틀린 문제 다시 풀기) — 진행도와 만점이 실제 문항 수를 따라야 한다 → Task 1.4

## 파일 구조

| 파일 | 책임 |
| --- | --- |
| `index.html` | 화면 다섯 개의 골격과 `#quiz-root`. 로직 없음 |
| `style.css` | 모든 스타일. 화면 전환은 `.hidden` 클래스 하나로 |
| `questions.js` | `const QUESTIONS` 만 선언 |
| `script.js` | 순수 함수층 + DOM 층 |
| `tests.html` | 자체 러너와 테스트. `questions.js`·`script.js` 를 로드하되 `#quiz-root` 는 두지 않는다 |

### `script.js` 내부 구조

PRD 가 계획서로 미뤄 둔 부분이다. 위가 순수 함수층(테스트 대상), 아래가 DOM 층이다.

```js
// ── 순수 함수층 ───────────────────────────────
validateQuestions(questions, requireTen = true) -> string[]   // 빈 배열이면 통과
shuffle(array, rng = Math.random)               -> Array      // 새 배열
buildRound(categoryKey, questions, rng)         -> Round
scoreAnswer(isCorrect, hintUsed)                -> 1 | 0.5 | 0
pickHintRemovals(choicesLength, answerIndex, rng) -> number[] // 길이 2
remainingMs(deadline, now)                      -> number     // 음수 없이 0으로 바닥
boardKey(categoryKey, mode)                     -> string     // "science|hint"
insertRecord(board, record)                     -> Record[]   // 정렬 + 상위 5
loadLeaderboard(storage)                        -> object     // 실패 시 {}
saveLeaderboard(storage, data)                  -> boolean    // 실패 시 false

// ── DOM 층 ───────────────────────────────────
init(), startRound(categoryKey, mode), selectChoice(i), useHint(),
nextQuestion(), startRetry(), canRetry() -> boolean,
startTimer(), stopTimer(),
renderStart/Question/Explanation/Result/Leaderboard()
```

```js
Round  = { category: "korean_history", name: "한국사", items: Item[] }
Item   = { q, choices: string[4], answer: 0..3, explanation, source }
Record = { score: number, correct: number, date: "YYYY-MM-DD" }

state = {
  mode:       "practice" | "speed" | "hint",
  round:      Round,
  index:      number,      // 현재 문항
  score:      number,      // 0.5 단위
  answered:   boolean,     // 해설이 떠 있는가 — 이중 채점을 막는다
  hintUsed:   boolean,     // 이번 문항에서 힌트를 썼는가
  removed:    number[],    // 힌트로 지운 보기 인덱스 (길이 0 또는 2)
  wrong:      Item[],      // 틀린 문항 — 재도전 라운드의 재료
  finished:   boolean,     // 마지막 문항까지 끝났는가
  isRetry:    boolean,     // 재도전 라운드인가 — 저장하지 않는다
  baseScore:  number|null, // 재도전 전 원래 판의 점수 (바뀌지 않는다)
  deadline:   number,      // 스피드 전용, Date.now() 기준 ms
  timerId:    number|null,
}
```

---

# 1단계 — 연습 모드와 점수

모드 선택 화면과 틀린 문제 다시 풀기는 **아직 없다.** 카테고리만 고르고 모드는 연습 고정.

### Task 1.1: 테스트 러너와 문항 검사

**Files:**
- Create: `tests.html`, `script.js`, `questions.js`

**Interfaces:**
- Produces: `test(name, fn)`, `assertEqual(actual, expected, msg)`, `assertDeepEqual(actual, expected, msg)`, `validateQuestions(questions, requireTen = true) -> string[]`

- [ ] **Step 1: `tests.html` 에 러너를 만든다**

`test()` 는 `fn` 을 호출해 예외가 없으면 통과로 센다. 결과를 `<ul>` 에 한 줄씩 쌓고 맨 위에 `통과 N / 실패 M` 을 띄운다. 실패 줄은 ✗ 와 예외 메시지를 함께 보여 준다. `questions.js`·`script.js` 를 `<script>` 로 로드하되 `#quiz-root` 는 두지 않는다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

```js
test("정상 데이터는 문제가 없다", () => {
  assertDeepEqual(validateQuestions(QUESTIONS, false), []);
});
test("카테고리 키가 다르면 잡아낸다", () => {
  assertEqual(validateQuestions({ wrong_key: { name: "x", items: [] } }, false).length > 0, true);
});
test("보기가 4개가 아니면 잡아낸다", () => { /* choices 3개짜리 항목 */ });
test("보기에 중복이 있으면 잡아낸다", () => { /* 같은 보기 2개 */ });
test("answer 가 범위를 벗어나면 잡아낸다", () => { /* answer: 4 */ });
test("해설이 비어 있으면 잡아낸다", () => { /* explanation: "" */ });
test("출처가 비어 있으면 잡아낸다", () => { /* source: "" */ });
test("해설에 보기 번호가 있으면 잡아낸다", () => { /* "1번이 정답" */ });
test("requireTen 이 true 면 10개가 아닌 카테고리를 잡아낸다", () => {
  assertEqual(validateQuestions(QUESTIONS, true).length > 0, true);
});
```

- [ ] **Step 3: 브라우저에서 `tests.html` 을 열어 실패를 확인한다**

기대: `validateQuestions is not defined` 로 전부 실패

- [ ] **Step 4: `questions.js` 에 카테고리 4개의 껍데기를 만든다**

`QUESTIONS` 에 네 키와 `name`(한국사·세계지리·과학·예술과 문화), 빈 `items: []`.

- [ ] **Step 5: `script.js` 에 `validateQuestions(questions, requireTen = true)` 를 구현한다**

PRD 8절 "문항 검사" 의 여섯 항목을 순서대로 검사해 사람이 읽을 수 있는 한국어 문자열 배열로 돌려준다. 보기 번호 표현은 `/\d\s*번|[①②③④]/` 로 찾는다.

- [ ] **Step 6: `tests.html` 을 새로고침해 통과를 확인한다**

기대: 실패 0

- [ ] **Step 7: Commit** — `test: 테스트 러너와 문항 검사 추가`

---

### Task 1.2: 섞기와 라운드 만들기

**Files:** Modify `script.js`, `tests.html`, `questions.js`

**Interfaces:**
- Consumes: Task 1.1 의 러너
- Produces: `shuffle(array, rng = Math.random) -> Array`, `buildRound(categoryKey, questions, rng) -> Round`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`rng` 를 고정값 함수로 넣어 결정적으로 검사한다.

```js
test("shuffle 은 원본을 바꾸지 않는다", () => {
  const src = [1, 2, 3, 4];
  shuffle(src, () => 0.5);
  assertDeepEqual(src, [1, 2, 3, 4]);
});
test("shuffle 은 원소를 잃지 않는다", () => {
  assertDeepEqual(shuffle([1,2,3,4], () => 0.5).sort(), [1,2,3,4]);
});
test("보기를 섞어도 answer 가 같은 보기를 가리킨다", () => {
  const round = buildRound("korean_history", QUESTIONS, () => 0.5);
  round.items.forEach((item, i) => {
    const 원본 = QUESTIONS.korean_history.items.find(o => o.q === item.q);
    assertEqual(item.choices[item.answer], 원본.choices[원본.answer]);
  });
});
test("buildRound 는 문항을 잃지 않는다", () => {
  assertEqual(buildRound("science", QUESTIONS, Math.random).items.length,
              QUESTIONS.science.items.length);
});
```

- [ ] **Step 2: `tests.html` 새로고침 — 실패 확인**

- [ ] **Step 3: `questions.js` 에 씨드 문항을 넣는다**

카테고리당 2~3개. PRD 문항 규칙 1~4 를 지킨다(정답 하나, 출처 명시, 최상급 표현에 기준·시점 명시, 해설에 보기 번호 금지).

- [ ] **Step 4: `shuffle` 과 `buildRound` 를 구현한다**

`shuffle` 은 Fisher-Yates 를 복사본에 적용하고 `rng` 를 주입받는다. `buildRound` 는 문항을 섞고, 각 문항의 보기도 섞되 **정답 보기의 새 인덱스를 찾아 `answer` 를 다시 매긴다.**

- [ ] **Step 5: `tests.html` 새로고침 — 통과 확인**

- [ ] **Step 6: Commit** — `feat: 문항·보기 섞기와 라운드 생성 추가`

---

### Task 1.3: 채점

**Files:** Modify `script.js`, `tests.html`

**Interfaces:** Produces `scoreAnswer(isCorrect, hintUsed) -> 1 | 0.5 | 0`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
test("힌트 없이 맞히면 1점",      () => assertEqual(scoreAnswer(true,  false), 1));
test("힌트 쓰고 맞히면 0.5점",    () => assertEqual(scoreAnswer(true,  true),  0.5));
test("힌트 없이 틀리면 0점",      () => assertEqual(scoreAnswer(false, false), 0));
test("힌트 쓰고 틀려도 0점",      () => assertEqual(scoreAnswer(false, true),  0));
```

시간 초과는 `isCorrect === false` 로 들어오므로 별도 인자가 없다.

- [ ] **Step 2: `tests.html` 새로고침 — 실패 확인**
- [ ] **Step 3: `scoreAnswer` 를 구현한다**
- [ ] **Step 4: `tests.html` 새로고침 — 통과 확인**
- [ ] **Step 5: Commit** — `feat: 채점 함수 추가`

---

### Task 1.4: 연습 모드 한 판

**Files:** Create `index.html`, `style.css`. Modify `script.js`, `tests.html`

**Interfaces:**
- Consumes: `buildRound`, `scoreAnswer`, `validateQuestions`
- Produces: `state`, `init()`, `startRound(categoryKey, mode)`, `selectChoice(i)`, `nextQuestion()`

- [ ] **Step 1: Review Focus 4·5번 테스트를 먼저 쓴다**

```js
test("해설이 뜬 뒤 다시 고르면 점수가 두 번 더해지지 않는다", () => {
  startRound("korean_history", "practice");
  const 정답 = state.round.items[0].answer;
  selectChoice(정답);
  selectChoice(정답);
  assertEqual(state.score, 1);
});
test("문항이 10개가 아니어도 만점이 문항 수를 따른다", () => {
  startRound("korean_history", "practice");
  assertEqual(state.round.items.length, QUESTIONS.korean_history.items.length);
});
```

- [ ] **Step 2: `tests.html` 새로고침 — 실패 확인**

- [ ] **Step 3: `index.html` 과 `style.css` 를 만든다**

화면 다섯 개(`#screen-start`, `#screen-quiz`, `#screen-result`, 2·3단계용 자리)를 `#quiz-root` 안에 두고 `.hidden` 으로 전환한다. 1단계 시작 화면에는 카테고리 버튼 4개와 "순위표에 기록되지 않음" 문구만.

- [ ] **Step 4: `script.js` 의 DOM 층을 구현한다**

`init()` 은 `#quiz-root` 가 있을 때만 돈다. 시작 시 `validateQuestions(QUESTIONS, false)` 를 호출해 결과가 비어 있지 않으면 **시작 화면에 그대로 띄우고 퀴즈를 시작하지 않는다.** `selectChoice` 는 `state.answered` 가 참이면 아무것도 하지 않는다. 보기에 ✓ ✗ 를 붙이고 해설과 출처를 함께 보여 준다. 숫자키 1~4 와 Enter 를 연결한다.

- [ ] **Step 5: `tests.html` 새로고침 — 통과 확인**

- [ ] **Step 6: `index.html` 을 브라우저에서 열어 한 판을 끝까지 돌린다**

- [ ] **Step 7: Commit** — `feat: 연습 모드 한 판과 결과 화면 추가`

---

## 1단계 완료 기준

- `tests.html` 실패 0
- 네 카테고리 모두 한 판이 처음부터 결과 화면까지 끊김 없이 돈다
- 점수가 정답 수와 일치한다
- 문항 데이터를 일부러 망가뜨리면 시작 화면에 검사 실패가 뜨고 퀴즈가 시작되지 않는다

## 1단계 — 브라우저에서 직접 확인할 항목

`index.html` 을 더블클릭해 엽니다(주소창이 `file:///` 로 시작하면 맞습니다).

- [ ] 카테고리 4개가 보이고 이름이 한국사·세계지리·과학·예술과 문화다
- [ ] 시작 화면에 "순위표에 기록되지 않음" 이 보인다
- [ ] 보기를 고르면 **화면이 바뀌지 않고 그 자리에서** 정답 여부와 해설, 출처가 나온다
- [ ] 맞힌 보기에 ✓, 틀린 보기에 ✗ 가 붙는다 (색만으로 구분되지 않는다)
- [ ] 해설이 뜬 뒤 다른 보기를 눌러도 점수가 오르지 않는다
- [ ] 숫자키 1~4 로 보기를 고를 수 있고, Enter 로 [다음] 이 눌린다
- [ ] 같은 카테고리를 두 번 풀면 문항 순서와 보기 순서가 다르다
- [ ] 마지막 문항 뒤 결과 화면에 점수가 `n / m` 형식으로 나온다
- [ ] 창을 좁게 줄여도 레이아웃이 깨지지 않는다

---

# 2단계 — 스피드 모드, 힌트 모드, 틀린 문제 다시 풀기

### Task 2.1: 모드 선택 화면

**Files:** Modify `index.html`, `style.css`, `script.js`

**Interfaces:** Consumes `startRound(categoryKey, mode)` (Task 1.4)

- [ ] **Step 1: 시작 화면에 모드 버튼 3개를 추가한다**

연습·스피드·힌트. 카테고리를 먼저 고르고 모드 선택 화면으로 넘어간다. 모드를 고르면 바로 시작한다. (PRD 3절이 두 단계 흐름으로 바뀌었다.)

- [ ] **Step 2: 연습을 고른 동안에만 "순위표에 기록되지 않음" 을 보이게 한다**

- [ ] **Step 3: 브라우저에서 세 모드가 각각 시작되는지 확인한다**

- [ ] **Step 4: Commit** — `feat: 모드 선택 화면 추가`

---

### Task 2.2: 스피드 모드 타이머

**Files:** Modify `script.js`, `tests.html`, `index.html`, `style.css`

**Interfaces:** Produces `remainingMs(deadline, now)`, `startTimer()`, `stopTimer()`

- [ ] **Step 1: Review Focus 3번을 포함한 실패 테스트를 쓴다**

타이머의 시간 계산만 순수 함수로 떼어 검사한다.

```js
test("남은 시간은 deadline 과 now 의 차다", () => {
  assertEqual(remainingMs(10_000, 2_500), 7_500);
});
test("탭이 멈춰 있다 돌아와도 음수가 아니라 0이다", () => {
  assertEqual(remainingMs(10_000, 99_000), 0);
});
test("표시 초는 올림이라 답할 수 있는 동안 0이 되지 않는다", () => {
  assertEqual(Math.ceil(remainingMs(10_000, 9_600) / 1000), 1);
});
```

- [ ] **Step 2: `tests.html` 새로고침 — 실패 확인**

- [ ] **Step 3: `remainingMs` 와 타이머를 구현한다**

`startTimer()` 는 `state.deadline = Date.now() + 15000` 을 잡고 100ms `setInterval` 로 표시를 갱신한다. 0이 되면 `stopTimer()` 후 오답으로 처리하고 **정답이 무엇이었는지 보여 준다.** `selectChoice` 와 해설 표시는 항상 `stopTimer()` 를 먼저 부른다. [다음] 에서 다시 15초.

- [ ] **Step 4: `tests.html` 새로고침 — 통과 확인**

- [ ] **Step 5: 브라우저에서 시간 초과와 정지를 확인한다**

- [ ] **Step 6: Commit** — `feat: 스피드 모드 15초 타이머 추가`

---

### Task 2.3: 힌트 모드

**Files:** Modify `script.js`, `tests.html`, `index.html`, `style.css`

**Interfaces:** Produces `pickHintRemovals(choicesLength, answerIndex, rng) -> number[]`, `useHint()`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
test("제거 대상은 2개다", () => {
  assertEqual(pickHintRemovals(4, 0, () => 0.5).length, 2);
});
test("정답은 제거 대상에 들어가지 않는다", () => {
  for (let answer = 0; answer < 4; answer++)
    assertEqual(pickHintRemovals(4, answer, Math.random).includes(answer), false);
});
test("제거 대상이 서로 다르다", () => {
  const [a, b] = pickHintRemovals(4, 2, Math.random);
  assertEqual(a === b, false);
});
test("힌트를 쓰면 그 문항의 점수가 0.5가 된다", () => {
  startRound("science", "hint");
  useHint();
  selectChoice(state.round.items[0].answer);
  assertEqual(state.score, 0.5);
});
test("힌트는 한 문항에 한 번만 먹는다", () => {
  startRound("science", "hint");
  useHint(); useHint();
  assertEqual(state.removed.length, 2);
});
```

- [ ] **Step 2: `tests.html` 새로고침 — 실패 확인**

- [ ] **Step 3: `pickHintRemovals` 와 `useHint()` 를 구현한다**

지운 보기는 **자리를 유지**한 채 흐리게 처리하고 클릭을 막는다. 해설 단계에서는 지워진 보기도 **다시 정상으로 되살려** 네 보기 모두에 ✓ ✗ 를 붙인다.

- [ ] **Step 4: `tests.html` 새로고침 — 통과 확인**
- [ ] **Step 5: 브라우저에서 힌트 동작과 0.5점을 확인한다**
- [ ] **Step 6: Commit** — `feat: 힌트 모드와 0.5점 채점 추가`

---

### Task 2.4: 틀린 문제 다시 풀기

**Files:** Modify `script.js`, `tests.html`, `index.html`

**Interfaces:**
- Consumes: `state.wrong`, `state.finished` (Task 1.4)
- Produces: `startRetry()`, `canRetry() -> boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
test("재도전 라운드는 틀린 문항만 담는다", () => {
  startRound("korean_history", "practice");
  const 오답 = (state.round.items[0].answer + 1) % 4;
  selectChoice(오답); nextQuestion();
  while (!state.finished) { selectChoice(state.round.items[state.index].answer); nextQuestion(); }
  const 틀린수 = state.wrong.length;
  startRetry();
  assertEqual(state.round.items.length, 틀린수);
});
test("재도전은 원래 점수를 바꾸지 않는다", () => {
  /* 위와 같이 한 판을 끝낸 뒤 */
  const 원래점수 = state.score;
  startRetry();
  selectChoice(state.round.items[0].answer);
  assertEqual(state.baseScore, 원래점수);
});
test("재도전 버튼은 연습 모드에서만 나온다", () => {
  startRound("science", "speed");
  assertEqual(canRetry(), false);
});
```

- [ ] **Step 2: `tests.html` 새로고침 — 실패 확인**

- [ ] **Step 3: `startRetry()` 를 구현한다**

`state.wrong` 의 문항만으로 새 라운드를 만든다. 원래 판의 점수는 별도로 보관해 결과 화면이 `3문제 중 2개 정답` 처럼 따로 보여 준다. 재도전에서 또 틀리면 다시 재도전할 수 있다. 연습 모드에서 틀린 문항이 있을 때만 버튼이 나온다.

- [ ] **Step 4: `tests.html` 새로고침 — 통과 확인**
- [ ] **Step 5: 브라우저에서 재도전을 두 번 연속 돌려 본다**
- [ ] **Step 6: Commit** — `feat: 틀린 문제 다시 풀기 추가`

---

## 2단계 완료 기준

- `tests.html` 실패 0
- 세 모드가 각자 규칙대로 채점한다
- 스피드에서 시간 초과가 오답이 되고, 해설 중에는 타이머가 멈춘다
- 힌트를 쓰고 맞히면 0.5점이 된다
- 연습 모드에서만 재도전 버튼이 나오고, 재도전이 원래 점수를 바꾸지 않는다

## 2단계 — 브라우저에서 직접 확인할 항목

- [ ] 카테고리를 고르면 `과학 · 모드를 고르세요` 화면이 나오고, [뒤로] 로 돌아간다
- [ ] 모드 3개에 규칙이 한 줄씩 붙고, "순위표에 기록되지 않음" 은 연습에만 있다
- [ ] 스피드에서 **아무것도 안 누르고 15초를 넘기면** 오답 처리되고 정답이 무엇이었는지 보인다
- [ ] 해설이 떠 있는 동안 타이머 숫자가 멈춰 있다
- [ ] [다음] 을 누르면 15초부터 다시 센다
- [ ] 스피드 중 **다른 탭으로 갔다가 20초 뒤 돌아오면** 음수가 아니라 시간 초과 상태다
- [ ] 힌트를 누르면 보기 2개가 흐려지고 **자리는 그대로**다. 흐린 보기는 눌리지 않는다
- [ ] 힌트를 쓰고 맞히면 점수가 0.5만 오른다
- [ ] 해설이 뜨면 흐렸던 보기도 다시 보이고 ✓ ✗ 가 붙는다
- [ ] 힌트 버튼은 한 문항에 한 번만 먹는다
- [ ] 연습에서 틀린 뒤 결과 화면에 [틀린 문제 다시 풀기] 가 있고, 스피드·힌트에는 없다
- [ ] 재도전을 해도 원래 판의 점수는 그대로다

---

# 3단계 — 점수 저장과 순위표

### Task 3.1: 순위표 순수 함수

**Files:** Modify `script.js`, `tests.html`

**Interfaces:** Produces `boardKey(categoryKey, mode)`, `insertRecord(board, record)`, `loadLeaderboard(storage)`, `saveLeaderboard(storage, data)`

- [ ] **Step 1: Review Focus 1·2번을 포함한 실패 테스트를 쓴다**

가짜 저장소 객체를 넣어 검사한다. 진짜 `localStorage` 는 건드리지 않는다.

```js
const 던지는저장소 = { getItem() { throw new Error("blocked"); },
                      setItem() { throw new Error("blocked"); } };

test("boardKey 는 카테고리와 모드를 잇는다", () => {
  assertEqual(boardKey("science", "hint"), "science|hint");
});
test("상위 5개만 남는다", () => {
  let board = [];
  for (let s = 1; s <= 7; s++) board = insertRecord(board, { score: s, correct: s, date: "2026-10-12" });
  assertEqual(board.length, 5);
  assertEqual(board[0].score, 7);
});
test("동점이면 먼저 기록한 쪽이 위다", () => {
  const board = insertRecord(insertRecord([], { score: 5, correct: 5, date: "앞" }),
                                              { score: 5, correct: 5, date: "뒤" });
  assertEqual(board[0].date, "앞");
});
test("저장소가 예외를 던져도 빈 보드를 돌려준다", () => {
  assertDeepEqual(loadLeaderboard(던지는저장소), {});
});
test("저장소가 예외를 던져도 saveLeaderboard 는 false 를 돌려줄 뿐 던지지 않는다", () => {
  assertEqual(saveLeaderboard(던지는저장소, {}), false);
});
test("깨진 JSON 이 들어 있으면 빈 보드로 시작한다", () => {
  assertDeepEqual(loadLeaderboard({ getItem: () => "{깨짐" }), {});
});
```

- [ ] **Step 2: `tests.html` 새로고침 — 실패 확인**

- [ ] **Step 3: 네 함수를 구현한다**

`loadLeaderboard` 는 `getItem` 예외, `null`, `JSON.parse` 실패를 모두 `{}` 로 흡수한다. `insertRecord` 는 새 배열을 돌려주고 점수 내림차순 **안정 정렬** 후 앞 5개를 남긴다.

- [ ] **Step 4: `tests.html` 새로고침 — 통과 확인**
- [ ] **Step 5: Commit** — `feat: 순위표 저장·정렬 함수 추가`

---

### Task 3.2: 순위표 화면과 자동 저장

**Files:** Modify `index.html`, `style.css`, `script.js`

**Interfaces:** Consumes Task 3.1 의 네 함수

- [ ] **Step 1: 결과 화면에서 자동 저장을 붙인다**

스피드·힌트 모드일 때만. 재도전 라운드는 저장하지 않는다. 신기록이면 "최고 점수" 를 표시한다. `date` 는 `YYYY-MM-DD`.

- [ ] **Step 2: 순위표 화면을 만든다**

카테고리 탭 4개 × 모드 탭 2개 = 보드 8개. 보드마다 상위 5개를 점수·정답 수·날짜로 보여 준다. 기록이 없으면 빈 상태 문구.

- [ ] **Step 3: 저장소를 못 쓰는 환경의 대체 문구를 넣는다**

`loadLeaderboard` 가 `{}` 를 주고 `saveLeaderboard` 가 `false` 를 주면 순위표 자리에 "이 브라우저에서는 기록을 저장할 수 없습니다" 를 띄운다. **퀴즈는 그대로 동작해야 한다.**

- [ ] **Step 4: 브라우저에서 판을 거듭해 기록이 쌓이는지 확인한다**

- [ ] **Step 5: Commit** — `feat: 순위표 화면과 결과 자동 저장 추가`

---

## 3단계 완료 기준

- `tests.html` 실패 0
- 판을 거듭하면 기록이 쌓이고 점수 내림차순으로 정렬된다
- 연습 모드와 재도전은 기록되지 않는다
- 보드가 카테고리 × 모드로 나뉘고 보드마다 5개를 넘지 않는다
- 저장소를 막아도 퀴즈가 끝까지 돈다

## 3단계 — 브라우저에서 직접 확인할 항목

- [ ] 스피드로 한 판 끝내면 결과 화면에서 자동 저장되고, 순위표에 보인다
- [ ] 연습으로 한 판 끝내면 순위표에 **안** 올라간다
- [ ] 한국사-스피드와 한국사-힌트가 **다른 보드**다
- [ ] 같은 보드에 6판 이상 쌓아도 5개까지만 보인다
- [ ] 같은 점수가 둘이면 먼저 친 기록이 위에 있다
- [ ] 이전 최고점을 넘기면 "최고 점수" 가 뜬다
- [ ] 브라우저를 껐다 켜도 기록이 남아 있다
- [ ] **시크릿 창에서 열어** 순위표에 "저장할 수 없습니다" 가 뜨고, 그래도 퀴즈는 끝까지 돈다

---

## 이 계획의 범위 밖

- **PRD 11절 4단계 "문항 40개 완성"** — 이 계획은 1~3단계만 다룬다. 씨드 문항(카테고리당 2~3개)으로 끝까지 돌아가는 앱을 만드는 것이 목표다. 40문제 작성은 별도 작업이다
- PRD 12절에 적힌 것들(서버·로그인, 문항 편집 화면, 모드 조합, 학습 통계, 다국어, 모바일 전용 레이아웃)
