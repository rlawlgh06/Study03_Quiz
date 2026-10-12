// 문항 데이터. 전역 상수 하나만 선언한다.
//
// 문항 규칙 (PRD 8절)
//   1. 정답은 하나만
//   2. 해설에는 확인한 출처를 명시 (source 필드)
//   3. "가장 ~한" 같은 최상급 표현은 기준과 시점을 문제에 명시
//   4. 해설에 보기 번호를 쓰지 않는다 — 보기 순서를 매 판 섞는다

const QUESTIONS = {
  korean_history:  { name: "한국사",      items: [] },
  world_geography: { name: "세계지리",    items: [] },
  science:         { name: "과학",        items: [] },
  arts_culture:    { name: "예술과 문화", items: [] },
};
