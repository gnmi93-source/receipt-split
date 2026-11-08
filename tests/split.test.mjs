/**
 * src/index.html 에 실제로 실려 있는 계산 함수를 그대로 꺼내 검증한다.
 * 테스트가 사본을 들고 있으면 앱과 어긋나므로, 소스에서 직접 추출한다.
 *
 *   node tests/split.test.mjs
 */
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");

/** 중괄호를 세어 함수 선언 한 덩어리를 그대로 떼어 온다. */
function extractFunction(name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("함수를 찾지 못했습니다: " + name);
  let depth = 0, i = src.indexOf("{", start);
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}" && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error("함수가 닫히지 않았습니다: " + name);
}

function extractConst(name) {
  const re = new RegExp("^\\s*const " + name + " = .*?;\\s*$", "m");
  const hit = src.match(re);
  if (!hit) throw new Error("상수를 찾지 못했습니다: " + name);
  return hit[0];
}

const harness = [
  extractConst("num"),
  extractFunction("sorted"),
  extractFunction("largestRemainder"),
  extractFunction("compute"),
  "return { compute, largestRemainder, num };",
].join("\n");

// compute() 는 전역 state 만 읽는다. 테스트가 그 state 를 쥐고 주입한다.
const state = { meta: { title: "", receiptTotal: null }, items: new Map(), people: new Map(), adjs: new Map() };
const { compute, largestRemainder } = new Function("state", harness)(state);

function load({ items = [], people = [], adjs = [], receiptTotal = null }) {
  state.meta = { title: "테스트", receiptTotal };
  state.items = new Map(items.map((it, i) => [it.id, { order: i + 1, qty: 1, ...it }]));
  state.people = new Map(people.map((p, i) => [p.id, { order: i + 1, picks: {}, ...p }]));
  state.adjs = new Map(adjs.map((a, i) => [a.id, { order: i + 1, mode: "amount", kind: "discount", ...a }]));
  return compute();
}

let failed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? "  PASS  " : "  FAIL  ") + label + (ok ? "" : `\n          기대 ${JSON.stringify(want)} / 실제 ${JSON.stringify(got)}`));
}
const amounts = c => c.people.map(p => c.finals.get(p.id));
const closes = c => amounts(c).reduce((a, b) => a + b, 0) + c.orphanFinal === c.grand;

console.log("\n정산 계산 검증\n");

/* 1. 공동 메뉴는 고른 사람 수로 나눈다 */
{
  const c = load({
    items: [{ id: "i1", name: "삼겹살", unitPrice: 16000, qty: 2 }, { id: "i2", name: "냉면", unitPrice: 9000 }],
    people: [
      { id: "a", name: "민수", picks: { i1: 1, i2: 1 } },
      { id: "b", name: "지은", picks: { i1: 1 } },
      { id: "c", name: "현우", picks: { i1: 1 } },
    ],
  });
  // 삼겹살 32,000 ÷ 3 = 10,666.67, 냉면 9,000 은 민수 단독 → 나머지 2원은 앞 두 사람에게
  check("공동 메뉴 3분할 + 단독 메뉴", amounts(c), [19667, 10667, 10666]);
  check("합계가 결제 총액과 같다", amounts(c).reduce((a, b) => a + b, 0), c.grand);
  check("결제 총액 = 41,000원", c.grand, 41000);
  check("민수만 냉면값을 부담한다", amounts(c)[0] - amounts(c)[1], 9000);
}

/* 2. 1원 단위 나머지까지 배분한다 */
{
  const c = load({
    items: [{ id: "i1", name: "피자", unitPrice: 10000 }],
    people: [
      { id: "a", name: "A", picks: { i1: 1 } },
      { id: "b", name: "B", picks: { i1: 1 } },
      { id: "c", name: "C", picks: { i1: 1 } },
    ],
  });
  check("10,000원 3분할", amounts(c), [3334, 3333, 3333]);
  check("나머지 없이 10,000원", amounts(c).reduce((a, b) => a + b, 0), 10000);
}

/* 3. 금액 할인은 담은 금액 비율대로 */
{
  const c = load({
    items: [{ id: "i1", unitPrice: 30000, name: "코스" }, { id: "i2", unitPrice: 10000, name: "음료" }],
    people: [{ id: "a", name: "A", picks: { i1: 1 } }, { id: "b", name: "B", picks: { i2: 1 } }],
    adjs: [{ id: "d1", label: "쿠폰", kind: "discount", mode: "amount", value: 4000 }],
  });
  check("할인 4,000원이 3:1로 나뉜다", amounts(c), [27000, 9000]);
  check("결제 총액 36,000원", c.grand, 36000);
}

/* 4. ％ 할인과 추가금을 함께 */
{
  const c = load({
    items: [{ id: "i1", unitPrice: 33333, name: "세트" }],
    people: [{ id: "a", name: "A", picks: { i1: 1 } }, { id: "b", name: "B", picks: { i1: 1 } }],
    adjs: [
      { id: "d1", label: "10% 할인", kind: "discount", mode: "percent", value: 10 },
      { id: "e1", label: "봉사료", kind: "extra", mode: "amount", value: 1500 },
    ],
  });
  check("％ 할인 + 추가금 합계 일치", closes(c), true);
  check("결제 총액 = 33333 - 3333.3 + 1500 (반올림)", c.grand, Math.round(33333 - 3333.3 + 1500));
}

/* 5. 아무도 고르지 않은 메뉴는 미배분으로 남는다 */
{
  const c = load({
    items: [{ id: "i1", unitPrice: 20000, name: "고른 메뉴" }, { id: "i2", unitPrice: 5000, name: "아무도 안 고른 메뉴" }],
    people: [{ id: "a", name: "A", picks: { i1: 1 } }],
    adjs: [{ id: "d1", label: "할인", kind: "discount", mode: "amount", value: 2500 }],
  });
  check("미배분 금액이 분리된다", c.orphanSub, 5000);
  check("미배분도 할인을 나눠 받는다", c.orphanFinal, 4500);
  check("사람 + 미배분 = 결제 총액", closes(c), true);
}

/* 6. 영수증 인쇄 금액과의 차이를 잡아낸다 */
{
  const c = load({
    items: [{ id: "i1", unitPrice: 12000, name: "밥" }],
    people: [{ id: "a", name: "A", picks: { i1: 1 } }],
    receiptTotal: 13000,
  });
  check("1,000원 모자람을 보고한다", c.diff, -1000);
}

/* 7. 빈 상태 */
{
  const c = load({ items: [], people: [{ id: "a", name: "A" }] });
  check("항목이 없으면 0원", amounts(c), [0]);
  check("빈 정산도 합계가 맞는다", closes(c), true);
}

/* 8. largestRemainder 자체 */
{
  check("나머지 분배", largestRemainder([3.4, 3.3, 3.3], 10), [4, 3, 3]);
  check("목표가 내림합보다 작을 때", largestRemainder([3.4, 3.3, 3.3], 9), [3, 3, 3]);
  check("빈 입력", largestRemainder([], 0), []);
}

console.log(failed ? `\n실패 ${failed}건\n` : "\n전부 통과\n");
process.exit(failed ? 1 : 0);
