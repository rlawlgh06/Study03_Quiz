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
