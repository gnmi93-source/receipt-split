/**
 * src/index.html(Artifact 조각) → dist/index.html(온전한 HTML 문서)
 *
 * Artifact 로 배포할 때는 플랫폼이 <!doctype>·<head>·<body> 껍데기를 씌워 준다.
 * 그래서 src/index.html 에는 그 태그가 없다. GitHub Pages 같은 정적 호스팅에
 * 그대로 올리면 doctype 이 없어 quirks mode 로 떨어지고 레이아웃이 깨진다.
 *
 * 이 스크립트가 씌우는 껍데기는 Artifact 플랫폼이 씌우는 것과 **같아야 한다.**
 * 두 배포본이 다르게 보이면 한쪽에서만 재현되는 버그가 생긴다.
 * 아래 HEAD/RESET 을 고칠 때는 플랫폼 쪽과 어긋나지 않는지 확인한다.
 *
 *   node tools/build.mjs            dist/ 에 생성
 *   node tools/build.mjs --check    생성하지 않고 조각이 올바른지만 검사 (CI 용)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "src", "index.html");
const OUT = join(root, "dist", "index.html");

/** Artifact 플랫폼이 <head> 에 넣는 리셋. 글자 하나까지 같게 유지한다. */
const RESET = `:root{color-scheme:light}
body{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif;background:#fafaf9}
img{max-width:100%}
[hidden]{display:none!important}`;

/** 🧾 — Artifact 의 favicon 과 같은 이모지를 SVG 로 넣는다. */
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<text y="78" font-size="80">\u{1F9FE}</text></svg>'
  );

const DESCRIPTION =
  "영수증 사진에서 메뉴와 가격을 읽고, 같이 먹은 사람들이 각자 먹은 메뉴를 고르면 " +
  "공동 메뉴와 할인까지 반영해 1인당 낼 금액을 계산합니다.";

function readFragment() {
  const src = readFileSync(SRC, "utf8");

  // 조각에 껍데기 태그가 들어가면 Artifact 배포가 깨진다. 여기서 먼저 잡는다.
  const banned = /<\s*(!doctype|html|head|body)\b/i.exec(src);
  if (banned) {
    throw new Error(
      `src/index.html 에 <${banned[1]}> 이 있습니다. ` +
        "Artifact 가 껍데기를 씌워 주므로 조각에는 들어가면 안 됩니다. " +
        "껍데기는 tools/build.mjs 가 공개 배포본에만 씌웁니다."
    );
  }

  const title = /<title>([^<]*)<\/title>/i.exec(src);
  if (!title) throw new Error("src/index.html 에 <title> 이 없습니다.");

  // 앱 전체가 한 파일이라 문법 오류 하나가 화면 전체를 날린다.
  // 브라우저를 열지 않고도 걸러지도록 여기서 파싱만 해 본다 (실행하지 않는다).
  const script = /<script>([\s\S]*?)<\/script>/i.exec(src);
  if (!script) throw new Error("src/index.html 에 <script> 블록이 없습니다.");
  try {
    new Function(script[1]);
  } catch (e) {
    throw new Error("<script> 안에 문법 오류가 있습니다 — " + e.message);
  }

  // 테마 색이 미디어 쿼리나 [data-theme] 블록 안에서만 정의되면, 아무 표시가 없는
  // 기본 상태에서 한쪽 테마의 글자색이 다른 쪽 바닥 위에 올라간다.
  // 토큰 정의(:root 세 블록) 밖에서 테마를 분기하는 규칙이 생기면 막는다.
  // 허용되는 것은 토큰 블록을 여는 선택자뿐이다 — :root 뒤에 아무것도 붙지 않는 형태.
  //   :root:not([data-theme="light"]) {   ← 통과
  //   :root[data-theme="dark"] {          ← 통과
  //   :root[data-theme="dark"] .who {     ← 막는다 (컴포넌트 색을 블록 안에서 정의)
  const TOKEN_OPENER = /^:root(?::not\(\[data-theme="[a-z]+"\]\))?(?:\[data-theme="[a-z]+"\])?\s*\{$/;
  const styleBlock = /<style>([\s\S]*?)<\/style>/i.exec(src);
  if (styleBlock) {
    const css = styleBlock[1].replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
    const stray = css
      .split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => line.includes("data-theme") && !TOKEN_OPENER.test(line));
    if (stray.length) {
      throw new Error(
        "테마 분기가 토큰 블록 밖에 있습니다 — <style> " +
          stray.map(s => `${s.no}번째 줄 (${s.line})`).join(", ") +
          "\n  색은 :root 의 토큰으로 정의하고, 규칙에서는 var() 로만 쓰십시오." +
          "\n  미디어 쿼리 밖의 :root:not([data-theme=\"light\"]) 는 라이트 기본 상태에서도 매치됩니다."
      );
    }
  }

  return { src, title: title[1].trim() };
}

function wrap({ src, title }) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${esc(DESCRIPTION)}">
<meta name="theme-color" content="#F1F2EC" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#161A17" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(DESCRIPTION)}">
<meta property="og:type" content="website">
<link rel="icon" href="${FAVICON}">
<style>
${RESET}
</style>
</head>
<body>
${src}
</body>
</html>
`;
}

const check = process.argv.includes("--check");
try {
  const fragment = readFragment();
  if (check) {
    console.log(`조각 검사 통과 — <title> "${fragment.title}", ${fragment.src.length}바이트`);
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    const out = wrap(fragment);
    writeFileSync(OUT, out, "utf8");
    // Pages 는 없는 경로에 404.html 을 준다. 같은 앱을 넣어 두면 경로 오타나
    // 잘린 링크로 들어온 사람도 빈 페이지가 아니라 앱을 본다. 방 코드는 해시에 있어
    // 404 로 넘어가도 살아남는다.
    writeFileSync(join(dirname(OUT), "404.html"), out, "utf8");
    console.log(`dist/index.html + dist/404.html 생성 — 각 ${out.length}바이트`);
  }
} catch (e) {
  console.error("빌드 실패: " + e.message);
  process.exit(1);
}
