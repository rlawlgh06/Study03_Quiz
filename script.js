"use strict";

// ─────────────────────────────────────────────────────────
// 순수 함수층 — DOM 을 만지지 않는다. tests.html 이 직접 부른다.
// ─────────────────────────────────────────────────────────

const CATEGORY_KEYS = ["korean_history", "world_geography", "science", "arts_culture"];

// "1번", "2 번", "②" 같은 보기 번호 표현
const CHOICE_NUMBER_RE = /\d\s*번|[①②③④]/;

/**
 * 문항 데이터를 검사해 사람이 읽을 수 있는 문제 목록을 돌려준다.
 * 빈 배열이면 통과. requireTen 이 false 면 "카테고리마다 10개" 검사를 건너뛴다.
 */
function validateQuestions(questions, requireTen = true) {
  const problems = [];
  const keys = Object.keys(questions || {});

  if (keys.length !== CATEGORY_KEYS.length || !CATEGORY_KEYS.every((k) => keys.includes(k))) {
    problems.push(
      `카테고리는 ${CATEGORY_KEYS.join(", ")} 네 개여야 한다. 지금: ${keys.join(", ") || "없음"}`
    );
    return problems; // 키가 어긋나면 아래 검사는 의미가 없다
  }

  for (const key of CATEGORY_KEYS) {
    const items = (questions[key] && questions[key].items) || [];

    if (requireTen && items.length !== 10) {
      problems.push(`${key}: 문항이 10개여야 한다. 지금 ${items.length}개`);
    }

    items.forEach((item, i) => {
      const where = `${key} ${i + 1}번째 문항`;

      if (!item.q || !String(item.q).trim())                     problems.push(`${where}: 질문이 비어 있다`);
      if (!item.explanation || !String(item.explanation).trim()) problems.push(`${where}: 해설이 비어 있다`);
      if (!item.source || !String(item.source).trim())           problems.push(`${where}: 출처가 비어 있다`);

      const choices = item.choices;
      if (!Array.isArray(choices) || choices.length !== 4) {
        problems.push(`${where}: 보기가 4개여야 한다`);
      } else {
        if (choices.some((c) => !c || !String(c).trim())) problems.push(`${where}: 빈 보기가 있다`);
        if (new Set(choices).size !== choices.length)     problems.push(`${where}: 보기가 중복된다`);
      }

      if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer > 3) {
        problems.push(`${where}: answer 는 0 이상 3 이하의 정수여야 한다`);
      }

      if (item.explanation && CHOICE_NUMBER_RE.test(item.explanation)) {
        problems.push(`${where}: 해설에 보기 번호를 쓰지 않는다`);
      }
    });
  }

  return problems;
}

/**
 * 한 문항의 점수. 시간 초과는 isCorrect 가 false 로 들어오므로 따로 받지 않는다.
 * 모드는 점수를 바꾸지 않는다 — 힌트를 썼는지만 바꾼다.
 */
function scoreAnswer(isCorrect, hintUsed) {
  if (!isCorrect) return 0;
  return hintUsed ? 0.5 : 1;
}

const SPEED_LIMIT_MS = 15000;

/**
 * 남은 시간. 틱을 세지 않고 deadline 과 현재 시각의 차로 구하므로, 탭이
 * 멈춰 있다 돌아와도 어긋나지 않는다. 음수는 0으로 바닥을 친다.
 */
function remainingMs(deadline, now) {
  return Math.max(0, deadline - now);
}

/**
 * 힌트로 지울 오답 보기 2개를 고른다. 정답은 후보에서 빠지므로 정답 1개와
 * 오답 1개가 남는다.
 */
function pickHintRemovals(choicesLength, answerIndex, rng = Math.random) {
  const candidates = [];
  for (let i = 0; i < choicesLength; i++) {
    if (i !== answerIndex) candidates.push(i);
  }
  return shuffle(candidates, rng).slice(0, 2);
}

const LOW_TIME_SEC = 5;

/** 힌트 버튼에 띄울 문구. 쓰고 나면 왜 안 눌리는지 글자로 알린다. */
function hintButtonText(hintUsed) {
  return hintUsed ? "힌트 사용함" : "힌트 (오답 2개 지우기)";
}

/** 화면에 띄울 남은 시간 문구. 올림이라 답할 수 있는 동안 0초로 보이지 않는다. */
function timerText(ms) {
  return `남은 시간 ${Math.ceil(ms / 1000)}초`;
}

/** 표시가 5초가 되는 순간부터 촉박하다고 본다. */
function isTimeLow(ms) {
  return Math.ceil(ms / 1000) <= LOW_TIME_SEC;
}

/** 연습 모드는 순위표에 남기지 않는다. */
function recordsToLeaderboard(mode) {
  return mode === "speed" || mode === "hint";
}

/** Fisher-Yates. 원본을 건드리지 않고 섞은 복사본을 돌려준다. */
function shuffle(array, rng = Math.random) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 한 판에 쓸 라운드를 만든다. 문항 순서와 보기 순서를 모두 섞고,
 * 보기를 섞은 뒤 정답이 놓인 새 자리로 answer 를 다시 매긴다.
 */
function buildRound(categoryKey, questions, rng = Math.random) {
  const category = questions[categoryKey];
  const items = shuffle(category.items, rng).map((item) => {
    const correct = item.choices[item.answer];
    const choices = shuffle(item.choices, rng);
    return {
      q: item.q,
      choices,
      answer: choices.indexOf(correct),
      explanation: item.explanation,
      source: item.source,
    };
  });

  return { category: categoryKey, name: category.name, items };
}

// ─────────────────────────────────────────────────────────
// DOM 층 — 상태를 바꾸고 그린다.
// render() 는 #quiz-root 가 없으면 그냥 돌아 나간다. 그래서 tests.html 이
// 화면 없이 startRound/selectChoice 로 상태만 검사할 수 있다.
// ─────────────────────────────────────────────────────────

const SCREENS = ["screen-start", "screen-mode", "screen-quiz", "screen-result"];

const state = {
  mode: "practice",
  round: null,
  index: 0,
  score: 0,
  answered: false,
  hintUsed: false,
  picked: null,
  removed: [],
  wrong: [],
  finished: false,
  timedOut: false, // 이번 문항을 시간 초과로 넘겼는가
  hintedCorrect: [], // 힌트를 쓰고 맞힌 문항. 결과에서 되짚을 거리다.
  isRetry: false,
  baseScore: null, // 재도전 전 원래 판의 점수. 재도전이 이 값을 바꾸지 않는다.
  baseTotal: null, // 원래 판의 문항 수. 결과 화면이 "원래 판 점수 n / m" 을 쓴다.
  deadline: 0,
  timerId: null,
};

/**
 * 재도전은 연습 모드 전용이다. 스피드·힌트에서 허용하면 순위표에 올라간
 * 점수를 사후에 고칠 수 있게 되어 기록이 의미를 잃는다.
 */
function canRetry() {
  return state.finished && state.mode === "practice" && state.wrong.length > 0;
}

/** 틀린 문항만 모아 다시 한 판. 원래 판의 점수는 baseScore 에 남긴다. */
function startRetry() {
  if (!canRetry()) return;

  // 거듭 재도전해도 baseScore 는 맨 처음 판의 점수를 가리킨다.
  if (!state.isRetry) {
    state.baseScore = state.score;
    state.baseTotal = state.round.items.length;
  }

  state.round = {
    category: state.round.category,
    name: state.round.name,
    // 시간 초과 표시는 그 판의 사실이다. 다시 푸는 판으로 끌고 오지 않는다.
    items: state.wrong.map((item) => ({ ...item, timedOut: false })),
  };
  state.index = 0;
  state.score = 0;
  state.answered = false;
  state.hintUsed = false;
  state.picked = null;
  state.removed = [];
  state.timedOut = false;
  state.wrong = [];
  state.hintedCorrect = [];
  state.finished = false;
  state.isRetry = true;

  render();
}

/**
 * 힌트로 지워진 보기인가. 해설이 뜨면 전부 되살린다 — 지운 채로 두면
 * 그 보기가 왜 틀렸는지 확인할 수 없다.
 */
function isChoiceRemoved(i) {
  return !state.answered && state.removed.includes(i);
}

function useHint() {
  if (!state.round || state.mode !== "hint") return;
  if (state.answered || state.finished || state.hintUsed) return;

  const item = currentItem();
  state.removed = pickHintRemovals(item.choices.length, item.answer);
  state.hintUsed = true;
  render();
}

function currentItem() {
  return state.round.items[state.index];
}

/** 스피드 모드에서만 시계를 건다. 문항이 바뀔 때마다 부른다. */
function beginQuestion() {
  if (state.mode === "speed" && !state.finished) startTimer();
}

function startTimer() {
  stopTimer();
  state.deadline = Date.now() + SPEED_LIMIT_MS;
  updateTimerDisplay();

  state.timerId = setInterval(() => {
    updateTimerDisplay();
    if (remainingMs(state.deadline, Date.now()) === 0) timeUp();
  }, 100);
}

function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function updateTimerDisplay() {
  const el = document.getElementById("timer");
  if (!el) return; // tests.html
  const left = remainingMs(state.deadline, Date.now());
  el.textContent = timerText(left);
  el.classList.toggle("low", isTimeLow(left));
}

/** 시간이 다 됐다. 오답으로 처리하되 정답이 무엇이었는지는 보여 준다. */
function timeUp() {
  if (!state.round || state.answered || state.finished) return;
  stopTimer();

  const item = currentItem();
  item.timedOut = true; // 결과 목록에서 "골라서 틀림" 과 구분한다

  state.picked = null;
  state.answered = true;
  state.timedOut = true;
  state.score += scoreAnswer(false, state.hintUsed);
  state.wrong.push(item);

  render();
}

function startRound(categoryKey, mode, rng = Math.random) {
  stopTimer();
  state.mode = mode;
  state.round = buildRound(categoryKey, QUESTIONS, rng);
  state.index = 0;
  state.score = 0;
  state.answered = false;
  state.hintUsed = false;
  state.picked = null;
  state.removed = [];
  state.timedOut = false;
  state.wrong = [];
  state.hintedCorrect = [];
  state.finished = false;
  state.isRetry = false;
  state.baseScore = null;
  state.baseTotal = null;
  beginQuestion();
  render();
}

function selectChoice(i) {
  if (!state.round || state.answered || state.finished) return; // 이중 채점 방지
  stopTimer(); // 해설이 뜨는 동안 시계는 멈춘다
  const item = currentItem();
  const isCorrect = i === item.answer;

  state.picked = i;
  state.answered = true;
  state.score += scoreAnswer(isCorrect, state.hintUsed);

  if (!isCorrect) state.wrong.push(item);
  else if (state.hintUsed) state.hintedCorrect.push(item);

  render();
}

function nextQuestion() {
  if (!state.round || !state.answered || state.finished) return;

  if (state.index + 1 >= state.round.items.length) {
    state.finished = true;
    stopTimer();
  } else {
    state.index++;
    state.answered = false;
    state.hintUsed = false;
    state.picked = null;
    state.removed = [];
    state.timedOut = false;
    beginQuestion(); // 다시 15초부터
  }
  render();
}

function restart() {
  stopTimer();
  state.round = null;
  selection.category = null;
  render();
}

/** 같은 카테고리·모드로 한 판 더. 재도전 상태는 남기지 않는다. */
function playAgain() {
  if (!state.round) return;
  startRound(state.round.category, state.mode);
}

/** 카테고리를 고르면 모드 선택 화면으로 넘어간다. */
function chooseCategory(key) {
  selection.category = key;
  render();
}

/** 모드 선택 화면에서 카테고리 선택 화면으로 돌아간다. */
function goBack() {
  selection.category = null;
  render();
}

/** 지금 보여야 할 화면. DOM 없이도 흐름을 검사할 수 있게 상태에서만 정한다. */
function currentScreen() {
  if (state.round) return state.finished ? "result" : "quiz";
  return selection.category ? "mode" : "start";
}

/** 8.5 는 그대로, 8 은 "8" 로. */
function formatScore(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * 상단에 띄울 글. 재도전은 점수를 매기지 않으므로 맞힌 개수로 보여 준다 —
 * 원래 판의 점수는 재도전으로 바뀌지 않는다.
 */
function headerScoreText(isRetry, score, correct, total) {
  return isRetry ? `${correct} / ${total} 맞힘` : `${formatScore(score)} / ${total}`;
}

/** 지금까지 푼 문항 수. 해설이 떠 있으면 그 문항도 센다. */
function answeredCount() {
  return state.index + (state.answered ? 1 : 0);
}

/** 지금까지 맞힌 문항 수. */
function correctCount() {
  return answeredCount() - state.wrong.length;
}

function showScreen(id) {
  for (const s of SCREENS) {
    document.getElementById(s).classList.toggle("hidden", s !== id);
  }
}

function render() {
  if (!document.getElementById("quiz-root")) return;

  switch (currentScreen()) {
    case "start":  showScreen("screen-start"); renderStartScreen(); return;
    case "mode":   showScreen("screen-mode");  renderModeScreen();  return;
    case "result": renderResult(); return;
    default:       renderQuestion();
  }
}

function renderQuestion() {
  showScreen("screen-quiz");

  const item = currentItem();
  const total = state.round.items.length;

  document.getElementById("progress").textContent = `${state.index + 1} / ${total}`;
  document.getElementById("score").textContent =
    headerScoreText(state.isRetry, state.score, correctCount(), total);

  const timer = document.getElementById("timer");
  timer.classList.toggle("hidden", state.mode !== "speed");
  if (state.mode === "speed") updateTimerDisplay();
  document.getElementById("question").textContent = item.q;

  const list = document.getElementById("choices");
  list.textContent = "";

  item.choices.forEach((text, i) => {
    const removed = isChoiceRemoved(i);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.classList.toggle("removed", removed);
    button.disabled = state.answered || removed;

    const num = document.createElement("span");
    num.className = "num";
    num.textContent = `${i + 1}.`;

    const label = document.createElement("span");
    label.textContent = text;

    button.append(num, label);

    if (state.answered) {
      const mark = document.createElement("span");
      mark.className = "mark";
      if (i === item.answer) {
        button.classList.add("correct");
        mark.textContent = "✓";
      } else if (i === state.picked) {
        button.classList.add("wrong");
        mark.textContent = "✗";
      }
      button.append(mark);
    }

    button.addEventListener("click", () => selectChoice(i));

    const li = document.createElement("li");
    li.append(button);
    list.append(li);
  });

  document.getElementById("hint-row").classList.toggle("hidden", state.mode !== "hint");
  const hintButton = document.getElementById("hint");
  hintButton.textContent = hintButtonText(state.hintUsed);
  hintButton.disabled = state.hintUsed || state.answered;

  const box = document.getElementById("explanation");
  box.classList.toggle("hidden", !state.answered);

  if (state.answered) {
    const ok = state.picked === item.answer;
    document.getElementById("verdict").textContent =
      state.timedOut ? "⏱ 시간 초과" : ok ? "✓ 정답" : "✗ 오답";
    document.getElementById("explanation-text").textContent = item.explanation;
    document.getElementById("source").textContent = `출처: ${item.source}`;
    document.getElementById("next").focus();
  }
}

function renderResult() {
  showScreen("screen-result");

  const total = state.round.items.length;
  const correct = total - state.wrong.length;

  // 재도전은 "몇 개 중 몇 개" 로 보여 준다. 원래 판의 점수는 건드리지 않는다.
  document.getElementById("final-score").textContent = state.isRetry
    ? `${total}문제 중 ${correct}개 정답`
    : `${formatScore(state.score)} / ${total}`;

  const base = document.getElementById("base-score");
  base.classList.toggle("hidden", !state.isRetry);
  if (state.isRetry) {
    base.textContent = `원래 판 점수 ${formatScore(state.baseScore)} / ${state.baseTotal} (바뀌지 않습니다)`;
  }

  document.getElementById("retry").classList.toggle("hidden", !canRetry());

  document.getElementById("result-notice").classList.toggle(
    "hidden", recordsToLeaderboard(state.mode)
  );

  // 되짚을 거리: 틀린 문항과, 힌트를 써서 반만 받은 문항.
  const review = [
    ...state.wrong.map((item) => ({
      item, badge: item.timedOut ? "시간 초과" : null, kind: "wrong",
    })),
    ...state.hintedCorrect.map((item) => ({
      item, badge: "정답 (힌트 0.5점)", kind: "hinted",
    })),
  ];

  const list = document.getElementById("wrong-list");
  list.textContent = "";
  document.getElementById("wrong-block").classList.toggle("hidden", review.length === 0);

  for (const { item, badge, kind } of review) {
    const li = document.createElement("li");
    li.textContent = `${item.q} — 정답: ${item.choices[item.answer]}`;

    if (badge) {
      const mark = document.createElement("span");
      mark.className = kind === "hinted" ? "badge hinted" : "badge";
      mark.textContent = badge;
      li.append(" ", mark);
    }
    list.append(li);
  }
}

function showValidationErrors(problems) {
  document.getElementById("start-body").classList.add("hidden");
  document.getElementById("validation-errors").classList.remove("hidden");

  const list = document.getElementById("validation-list");
  list.textContent = "";
  for (const p of problems) {
    const li = document.createElement("li");
    li.textContent = p;
    list.append(li);
  }
}

const MODES = [
  {
    key: "practice", name: "연습",
    desc: "시간 제한도 힌트도 없습니다. 틀린 문제를 다시 풀 수 있습니다.",
    notice: "순위표에 기록되지 않음",
  },
  { key: "speed", name: "스피드", desc: "문항마다 15초. 넘기면 오답입니다." },
  { key: "hint",  name: "힌트",   desc: "문항마다 힌트 한 번. 쓰고 맞히면 0.5점입니다." },
];

// 고르는 중인 카테고리. 라운드 상태와는 별개다.
const selection = { category: null };

function renderStartScreen() {
  const box = document.getElementById("category-buttons");
  box.textContent = "";

  for (const key of CATEGORY_KEYS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = QUESTIONS[key].name;
    button.addEventListener("click", () => chooseCategory(key));
    box.append(button);
  }
}

function renderModeScreen() {
  document.getElementById("mode-title").textContent =
    `${QUESTIONS[selection.category].name} · 모드를 고르세요`;

  const box = document.getElementById("mode-buttons");
  box.textContent = "";

  // 모드마다 규칙을 한 줄씩 붙인다. 순위표 안내는 연습에만 있다.
  for (const mode of MODES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mode-card";

    const name = document.createElement("span");
    name.className = "mode-name";
    name.textContent = mode.name;

    const desc = document.createElement("span");
    desc.className = "mode-desc";
    desc.textContent = mode.desc;

    button.append(name, desc);

    if (mode.notice) {
      const notice = document.createElement("span");
      notice.className = "notice";
      notice.textContent = mode.notice;
      button.append(notice);
    }

    button.addEventListener("click", () => startRound(selection.category, mode.key));
    box.append(button);
  }
}

function onKeyDown(e) {
  if (!state.round || state.finished) return;

  if (e.key >= "1" && e.key <= "4") {
    const i = Number(e.key) - 1;
    if (i < currentItem().choices.length) selectChoice(i);
  } else if (e.key === "Enter" && state.answered) {
    nextQuestion();
  }
}

function init() {
  if (!document.getElementById("quiz-root")) return; // tests.html

  const problems = validateQuestions(QUESTIONS, true);
  if (problems.length > 0) {
    showValidationErrors(problems);
    return;
  }

  document.getElementById("back").addEventListener("click", goBack);
  document.getElementById("hint").addEventListener("click", useHint);
  document.getElementById("next").addEventListener("click", nextQuestion);
  document.getElementById("again").addEventListener("click", playAgain);
  document.getElementById("retry").addEventListener("click", startRetry);
  document.getElementById("restart").addEventListener("click", restart);
  document.addEventListener("keydown", onKeyDown);
  render();
}

document.addEventListener("DOMContentLoaded", init);
