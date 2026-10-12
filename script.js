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

const SCREENS = ["screen-start", "screen-quiz", "screen-result"];

const state = {
  mode: "practice",
  round: null,
  index: 0,
  score: 0,
  answered: false,
  hintUsed: false,
  picked: null,
  wrong: [],
  finished: false,
  deadline: 0,
  timerId: null,
};

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
  el.textContent = `${Math.ceil(remainingMs(state.deadline, Date.now()) / 1000)}초`;
}

/** 시간이 다 됐다. 오답으로 처리하되 정답이 무엇이었는지는 보여 준다. */
function timeUp() {
  if (!state.round || state.answered || state.finished) return;
  stopTimer();

  state.picked = null;
  state.answered = true;
  state.score += scoreAnswer(false, state.hintUsed);
  state.wrong.push(currentItem());

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
  state.wrong = [];
  state.finished = false;
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
    beginQuestion(); // 다시 15초부터
  }
  render();
}

function restart() {
  stopTimer();
  state.round = null;
  render();
}

/** 8.5 는 그대로, 8 은 "8" 로. */
function formatScore(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function showScreen(id) {
  for (const s of SCREENS) {
    document.getElementById(s).classList.toggle("hidden", s !== id);
  }
}

function render() {
  if (!document.getElementById("quiz-root")) return;

  if (!state.round) { showScreen("screen-start"); renderStart(); return; }
  if (state.finished) { renderResult(); return; }
  renderQuestion();
}

function renderQuestion() {
  showScreen("screen-quiz");

  const item = currentItem();
  const total = state.round.items.length;

  document.getElementById("progress").textContent = `${state.index + 1} / ${total}`;
  document.getElementById("score").textContent = `${formatScore(state.score)} / ${total}`;

  const timer = document.getElementById("timer");
  timer.classList.toggle("hidden", state.mode !== "speed");
  if (state.mode === "speed") updateTimerDisplay();
  document.getElementById("question").textContent = item.q;

  const list = document.getElementById("choices");
  list.textContent = "";

  item.choices.forEach((text, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.disabled = state.answered;

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

  const box = document.getElementById("explanation");
  box.classList.toggle("hidden", !state.answered);

  if (state.answered) {
    const ok = state.picked === item.answer;
    document.getElementById("verdict").textContent = ok ? "✓ 정답" : "✗ 오답";
    document.getElementById("explanation-text").textContent = item.explanation;
    document.getElementById("source").textContent = `출처: ${item.source}`;
    document.getElementById("next").focus();
  }
}

function renderResult() {
  showScreen("screen-result");

  const total = state.round.items.length;
  document.getElementById("final-score").textContent =
    `${formatScore(state.score)} / ${total}`;

  document.getElementById("result-notice").classList.toggle(
    "hidden", recordsToLeaderboard(state.mode)
  );

  const list = document.getElementById("wrong-list");
  list.textContent = "";
  document.getElementById("wrong-block").classList.toggle("hidden", state.wrong.length === 0);

  for (const item of state.wrong) {
    const li = document.createElement("li");
    li.textContent = `${item.q} — 정답: ${item.choices[item.answer]}`;
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
  { key: "practice", name: "연습",   desc: "시간 제한도 힌트도 없다. 틀린 문제를 다시 풀 수 있다." },
  { key: "speed",    name: "스피드", desc: "문항마다 15초. 넘기면 오답이다." },
  { key: "hint",     name: "힌트",   desc: "문항마다 힌트 한 번. 쓰고 맞히면 0.5점." },
];

// 시작 화면에서 고르는 중인 값. 라운드 상태와는 별개다.
const selection = { mode: null, category: null };

function pickerButtons(boxId, entries, onPick, selectedKey) {
  const box = document.getElementById(boxId);
  box.textContent = "";

  for (const { key, name } of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.classList.toggle("selected", key === selectedKey);
    button.addEventListener("click", () => onPick(key));
    box.append(button);
  }
}

function renderStart() {
  pickerButtons("mode-buttons", MODES, (key) => {
    selection.mode = key;
    renderStart();
  }, selection.mode);

  pickerButtons(
    "category-buttons",
    CATEGORY_KEYS.map((key) => ({ key, name: QUESTIONS[key].name })),
    (key) => { selection.category = key; renderStart(); },
    selection.category
  );

  const mode = MODES.find((m) => m.key === selection.mode);
  document.getElementById("mode-desc").textContent = mode ? mode.desc : "";

  // 순위표에 기록되지 않는 모드를 고른 동안에만 알린다.
  document.getElementById("mode-notice").classList.toggle(
    "hidden",
    selection.mode === null || recordsToLeaderboard(selection.mode)
  );

  document.getElementById("start").disabled =
    selection.mode === null || selection.category === null;
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

  // 1단계는 씨드 문항이라 "카테고리마다 10개" 검사를 끈다.
  const problems = validateQuestions(QUESTIONS, false);
  if (problems.length > 0) {
    showValidationErrors(problems);
    return;
  }

  document.getElementById("start").addEventListener("click", () => {
    startRound(selection.category, selection.mode);
  });
  document.getElementById("next").addEventListener("click", nextQuestion);
  document.getElementById("restart").addEventListener("click", restart);
  document.addEventListener("keydown", onKeyDown);
  render();
}

document.addEventListener("DOMContentLoaded", init);
