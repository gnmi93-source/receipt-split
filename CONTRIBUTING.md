# 함께 고치기

여러 명이 각자의 아이디어로 이 앱을 고칩니다. 앱이 **단일 HTML 파일**이라,
평범한 프로젝트보다 충돌 규칙이 중요합니다. 이 문서는 그 규칙만 담았습니다.

설치할 것은 없습니다. **Node 18 이상과 git 뿐입니다** (npm 패키지 0개).

## 처음 한 번

```powershell
git clone https://github.com/gnmi93-source/receipt-split.git
cd receipt-split

# 줄바꿈. 이걸 안 하면 1400줄 파일 전체가 변경으로 잡혀 남의 PR 을 전멸시킵니다.
git config core.autocrlf false
# 한국어 파일명이 git 출력에서 8진수로 깨지지 않게
git config core.quotepath false
# 충돌을 손으로 풀기 쉽게 (공통 조상이 함께 보입니다)
git config merge.conflictstyle zdiff3
git config rerere.enabled true
git config pull.rebase true
```

macOS 라면 한 줄 더 — macOS 는 파일명을 자모 분리(NFD)로 저장해서
`docs/정산-규칙.md` 가 다른 경로로 커밋되어 같은 파일이 두 개로 보입니다.

```bash
git config --global core.precomposeunicode true
```

PowerShell 콘솔이 cp949 면 한국어가 깨져 보이고, 더 나쁘게는 `Set-Content`/`Add-Content`
기본 인코딩이 ANSI 라 한국어가 섞인 파일을 저장하면 git 쪽에서 깨집니다.
파일을 쓸 때는 반드시 `-Encoding utf8` 을 쓰고, 세션 시작에:

```powershell
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
```

## 작업 흐름

```powershell
# 1. 아이디어는 먼저 Issue 로. area 라벨을 붙이고 자신에게 assign 합니다.
#    같은 area 에 이미 assign 된 Issue 가 있으면 코드를 쓰기 전에 그 사람과 이야기합니다.
#    단일 파일 프로젝트에서 이게 1차 충돌 방어선입니다.

# 2. 브랜치. 이름에 자기 아이디를 넣습니다.
git switch -c feat/내아이디-주제

# 3. 고치고 검사
node tools/build.mjs --check
node tests/split.test.mjs
node tools/build.mjs
Start-Process dist\index.html      # 눈으로 확인

# 4. 미완성이어도 일찍 Draft PR 을 올립니다 — "지금 이 자리를 건드리고 있다" 가 보이게.
git push -u origin feat/내아이디-주제
gh pr create --draft --fill

# 5. 매일 main 을 따라갑니다. 브랜치 수명은 길어도 3일.
git fetch origin && git rebase origin/main
```

`main` 에는 직접 push 하지 않습니다. PR + 리뷰 1명 + CI 통과가 필요합니다.
머지는 squash 로 고정되어 있어 PR 하나가 커밋 하나로 남습니다 —
문제가 생기면 `git revert <sha>` 한 번으로 되돌아갑니다.

## 충돌을 줄이는 네 가지

단일 파일이라 쪼개기 전까지는 이 네 개가 효과의 대부분입니다.

1. **줄바꿈 LF.** 위의 `core.autocrlf false`. 가장 큰 단일 위험입니다.
2. **새 코드는 자기 섹션의 끝에 붙입니다.** 파일 중간 삽입은 다른 PR 과 같은 hunk 를 다툽니다.
   git 의 3-way 머지는 hunk 가 3줄 이상 떨어져 있으면 알아서 합쳐 주므로,
   서로 다른 섹션을 건드린 두 PR 은 충돌 없이 합쳐집니다.
3. **PR 하나 = 아이디어 하나.** `src/index.html` 변경 300줄 이하를 목표로.
4. **들여쓰기·정렬 일괄 변경 금지.** 포매터를 도입하면 열려 있는 모든 PR 이 죽습니다.

### 하지 말 것

- **`.gitattributes` 에 `merge=union` 을 걸지 마십시오.** 양쪽 변경을 충돌 표시 없이
  둘 다 남겨서, 중복 함수 선언이나 반쯤 섞인 CSS 블록이 **조용히** 들어갑니다.
  돈을 계산하는 앱에서 가장 나쁜 실패 방식입니다.
- **`git checkout --ours/--theirs src/index.html`** — 파일을 통째로 한쪽으로 고르면
  다른 사람의 변경이 소리 없이 사라집니다. 충돌은 hunk 단위로 손으로 풉니다.

## 깨뜨리면 안 되는 것

### 금액 계산

[docs/정산-규칙.md](docs/정산-규칙.md) 가 기준 문서입니다. **금액 로직을 건드리기 전에 읽으십시오.**
규칙을 바꾸려면 문서를 **먼저** 고치고, 그 문장을 PR 본문에 인용하고, 테스트를 추가합니다.
CI 의 `rules-doc` 검사가 이 순서를 기계적으로 확인합니다.

사람별 금액의 합은 결제 총액과 **1원까지** 같아야 합니다. 이건 선택이 아니라 불변식입니다.

### 선택은 문서 하나다

메뉴 선택은 `picks/{personId}~{itemId}` 로 **선택 하나당 문서 하나**입니다.
사람 문서 안의 맵(`picks: { itemId: 1 }`)으로 되돌리지 마십시오 —
동기화 어댑터의 `write` 는 **문서 전체를 덮어쓰고** 부분 수정 수단이 없습니다.
선택을 맵으로 두면 누가 이름을 고치는 동안 다른 사람이 메뉴를 고를 때 늦게 도착한 쓰기가
먼저 것을 지웁니다. 자세한 이유는 [README 의 공유 데이터 구조](README.md#공유-데이터-구조)에 있습니다.

필드 일부만 고칠 때는 `patch(coll, id, fields)` 를 씁니다. `put()` 은 새 문서를 만들 때만.

### 테마 색은 `:root` 토큰으로만

색을 `@media (prefers-color-scheme)` 나 `[data-theme]` 블록 **안에서** 정의하면,
아무 표시가 없는 기본 상태에서 한쪽 테마의 글자색이 다른 쪽 바닥 위에 올라갑니다.
특히 미디어 쿼리 **밖**의 `:root:not([data-theme="light"])` 는 라이트 기본 상태에서도 매치됩니다 —
실제로 이 버그가 다섯 군데 있었습니다. `node tools/build.mjs --check` 가 이제 막습니다.

### 조각 규약

`src/index.html` 에는 `<!doctype>` / `<html>` / `<head>` / `<body>` 가 없습니다 (Artifact 가 씌워 줍니다).
`type="module"` 로 바꾸지 마십시오 — `tools/build.mjs` 가 `<script>` 블록을 못 찾아 빌드가 깨집니다.
외부 라이브러리가 필요하면 벤더링하지 말고 CDN 에서 버전을 못 박아 **동적 `import()`** 로 받습니다.

### 테스트가 함수 선언 형태에 묶여 있다

`tests/split.test.mjs` 는 `src/index.html` 에서 `function compute(` 를 문자열로 찾아
중괄호를 세어 떼어 옵니다. `compute` / `largestRemainder` / `sorted` / `num` 을 화살표 함수나
메서드로 바꾸면 "함수를 찾지 못했습니다" 로 깨집니다. 의도된 장치이지만 리팩터링을 막기도 하므로,
기여자가 3명을 넘으면 `src/js/compute.mjs` 로 떼어 내 `import` 로 바꿀 계획입니다.

## 두 배포본

| | GitHub Pages (공개) | Claude Artifact (작업용) |
|---|---|---|
| 올라가는 것 | `dist/index.html` | `src/index.html` |
| 갱신 | main 머지 시 자동 (1~2분) | 소유자가 손으로 |
| 쓸 수 있는 사람 | 링크 받은 **누구나** | 소유자·초대된 편집자 |

**Pages 가 Artifact 보다 앞서 있는 것이 정상 상태입니다.**

Artifact 를 직접 편집하지 마십시오. git 으로 돌아오는 경로가 없어서 다음 재배포가 그 편집을
덮어씁니다. 소유자도 예외가 아닙니다 — 모든 변경은 PR 로만. 자세한 건 [docs/배포.md](docs/배포.md).

## 파일을 쪼갤 때 (기여자 3명 이상)

`compute.mjs` **하나만** 떼는 PR 부터 시작합니다. 이득이 가장 크고 위험이 가장 작습니다.

- **열려 있는 PR 이 0개일 때** 합니다. 분할 자체가 전면 충돌을 만듭니다.
- 분할 PR 은 **코드를 옮기기만** 합니다. 동작 변경을 섞지 마십시오.
- 확인 방법: 분할 전후의 `dist/index.html` 을 `git diff --no-index` 로 비교해
  공백 차이만 나오는지 보고, 그 결과를 PR 본문에 붙입니다.
- 빌드 도구와 의존성은 들이지 않습니다. 이미 있는 `tools/build.mjs` 가 조립까지 맡습니다.
