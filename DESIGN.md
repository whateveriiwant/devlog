---
name: seungjun.sh
description: 글이 주인공인 무채색 개인 개발 블로그. 조용한 서재처럼 UI는 물러나고 본문이 앞선다.
colors:
  paper: "oklch(1 0 0)"
  ink: "oklch(0.141 0.005 285.823)"
  graphite: "oklch(0.21 0.006 285.885)"
  mist: "oklch(0.967 0.001 286.375)"
  slate-text: "oklch(0.552 0.016 285.938)"
  hairline: "oklch(0.92 0.004 286.32)"
  focus-ring: "oklch(0.705 0.015 286.067)"
  alarm-red: "oklch(0.577 0.245 27.325)"
  night-paper: "oklch(0.141 0.005 285.823)"
  night-card: "oklch(0.21 0.006 285.885)"
  night-ink: "oklch(0.985 0 0)"
  night-mist: "oklch(0.274 0.006 286.033)"
  night-slate-text: "oklch(0.705 0.015 286.067)"
  night-alarm-red: "oklch(0.704 0.191 22.216)"
typography:
  display:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, Segoe UI, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, Segoe UI, sans-serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.55
    letterSpacing: "-0.4px"
  title:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, Segoe UI, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.55
    letterSpacing: "-0.4px"
  body:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.85
  label:
    fontFamily: "Pretendard, -apple-system, BlinkMacSystemFont, Apple SD Gothic Neo, Noto Sans KR, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.5
  code:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.8
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "32px"
components:
  button-primary:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  badge:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.graphite}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  topic-pill:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  code-block:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.lg}"
    padding: "21px"
---

# Design System: seungjun.sh

## Overview

**Creative North Star: "조용한 서재"**

글이 주인공이고 인터페이스는 한 걸음 물러난다. 흰 종이와 짙은 잉크, 그 사이의 옅은 회색만으로 화면을 구성한다. 색은 정보를 전달하는 데만 쓰고, 분위기를 만들려고 쓰지 않는다. 읽는 사람은 검색으로 들어와 한 편을 읽거나, 시리즈를 따라가거나, 예전 글을 다시 찾는다. 화면은 이 세 동작을 방해하지 않아야 한다.

밀도는 조밀한 목록과 넉넉한 본문의 대비로 만든다. 글 목록과 목차는 얇은 구분선 위에 작은 글씨로 촘촘하게 놓이고, 본문은 790px 열에 16px/1.85로 느슨하게 흐른다. 라이트와 다크 두 테마는 같은 구조의 명암 반전이며, 어느 쪽도 부가 기능이 아니다. 한글 본문을 기준으로 줄 간격과 자간을 잡는다.

이 시스템은 shadcn/ui Zinc 기본 테마 위에 서 있다. 정체성은 색이나 장식이 아니라 절제, 읽기 리듬, 정확한 정보 구조에서 나온다.

**Key Characteristics:**
- 무채색 단일 팔레트, 강조색 없음. 유일한 채도는 오류 표시용 붉은색이다.
- 그림자 없이 1px 선과 옅은 회색 면으로 계층을 만든다.
- 본문 열 790px, 한글에 맞춘 높은 행간(1.85)
- 작은 글씨(12~14px)의 조밀한 탐색 UI와 큰 본문의 대비
- 라이트·다크 대칭, `prefers-reduced-motion` 존중

## Colors

팔레트는 푸른 기가 아주 약한 중성 회색(Zinc) 하나로 닫혀 있다. 모든 값은 CSS 변수(`--background` 등)로 정의되고 다크 테마는 `.dark` 클래스에서 재정의한다.

### Primary
- **Graphite** (`oklch(0.21 0.006 285.885)`): 기본 버튼, 로고 마크, 선택된 텍스트 배경, 본문 링크. 라이트에서는 거의 검정에 가까운 짙은 회색이다. 다크에서는 밝은 회색(`oklch(0.92 0.004 286.32)`)으로 뒤집힌다.

### Neutral
- **Paper** (`oklch(1 0 0)`): 라이트 페이지와 카드 배경.
- **Ink** (`oklch(0.141 0.005 285.823)`): 라이트 본문 텍스트. 다크에서는 배경이 된다(**Night Paper**).
- **Mist** (`oklch(0.967 0.001 286.375)`): 보조 면, hover 배경, 인라인 코드 배경, 인용 블록 배경, 태그 칩.
- **Slate Text** (`oklch(0.552 0.016 285.938)`): 날짜·건수·설명 같은 부가 텍스트. 다크에서는 `oklch(0.705 0.015 286.067)`.
- **Hairline** (`oklch(0.92 0.004 286.32)`): 목록 행 구분선, 카드 테두리. 다크에서는 흰색 10% 투명도.
- **Focus Ring** (`oklch(0.705 0.015 286.067)`): 포커스 링과 아웃라인(50% 투명도).
- **Night Card** (`oklch(0.21 0.006 285.885)`) · **Night Ink** (`oklch(0.985 0 0)`) · **Night Mist** (`oklch(0.274 0.006 286.033)`): 다크 테마의 카드, 텍스트, 보조 면.

### Semantic
- **Alarm Red** (`oklch(0.577 0.245 27.325)`): 오류와 파괴적 동작에만 쓴다. 다크에서는 `oklch(0.704 0.191 22.216)`.

### Named Rules
**The No Accent Rule.** 강조색은 없다. 강조는 굵기, 크기, 반전(어두운 면에 밝은 글자)으로 만든다.

**The Hairline Rule.** 구분은 1px `border`와 `mist` 면이 맡는다. 새 구분이 필요하면 색을 추가하지 말고 선이나 면의 명도 차이를 쓴다.

## Typography

**Display / Body Font:** Pretendard (-apple-system, Apple SD Gothic Neo, Noto Sans KR 대체)
**Mono Font:** SFMono-Regular (Consolas, Liberation Mono 대체)

**Character:** 한글과 영문 숫자가 균일하게 섞이는 중립적인 산세리프 한 가족으로 전부 해결한다. 위계는 서체 대비가 아니라 굵기(400/500/600)와 크기로 만든다.

### Hierarchy
- **Display** (600, 30px → 36px(`sm`), line-height 1.375, tracking -0.025em): 글 제목과 페이지 제목(h1).
- **Headline** (600, 25px, 1.55, -0.4px): 본문의 h2. 위에 1px 구분선과 여백으로 장을 나눈다.
- **Title** (600, 21px, 1.55, -0.4px): 본문의 h3. h4는 18px, h5·h6은 17px.
- **Body** (400, 16px, 1.85): 글 본문. 한 줄은 790px 열 안에서 끝난다. 단락 간격은 1.25em.
- **Label** (500, 12px, tracking-widest는 eyebrow에만): 날짜, 건수, 메타, 칩, 목차 항목.
- **Code** (400, 13px, 1.8): 코드 블록. 인라인 코드는 0.85em에 `mist` 배경과 `hairline` 테두리.

### Named Rules
**The Tabular Rule.** 날짜, 건수, 통계 숫자에는 `tabular-nums`를 쓴다. 목록 안에서 숫자 폭이 흔들리지 않아야 한다.

**The Korean Measure Rule.** 본문 행간은 1.85 아래로 내리지 않는다. 한글은 영문보다 밀도가 높아서 넉넉한 행간이 가독성의 전제다.

## Layout

최대 폭 1540px의 중앙 컨테이너에 좌우 여백은 모바일 21px, `md` 이상 32px이다. 홈은 한 열이고, 그 밖의 페이지는 화면 폭에 따라 구조가 늘어난다.
- `md`부터 **탐색 열(210px) + 콘텐츠**
- `xl`부터 **탐색 열(220px) + 콘텐츠 + 목차(216px)**, 간격 48px
- `2xl`에서 열 폭 232px / 220px, 간격 56px

콘텐츠 열은 최대 790px이다. 헤더는 높이 56px로 상단에 고정되고(`sticky`), 앵커 이동은 `scroll-padding-top: 6rem`을 쓴다. 목차는 `xl` 이상에서만 sticky로 나타난다. 목록은 카드 그리드가 아니라 **행(row)** 이다. 각 행은 `px-2 py-3`에 아래쪽 구분선, hover 시 `mist` 배경이다. 태그 인덱스만 `sm`부터 2열이다. 간격 리듬은 4px 배수(8/12/16/32)를 쓴다.

## Elevation & Depth

그림자를 쓰지 않는 평평한 시스템이다. 깊이는 세 가지로 표현한다: (1) 1px `hairline` 테두리, (2) `mist` 면으로 올린 영역, (3) 포커스 링. `outline` 버튼에만 `shadow-xs`가 있고 사실상 보이지 않는 수준이다. 다이얼로그와 시트는 오버레이로 분리한다.

### Named Rules
**The Flat Rule.** 새 컴포넌트에 `box-shadow`를 추가하지 않는다. 필요하면 테두리나 배경 명도로 해결한다.

## Shapes

기본 반경은 `--radius: 0.625rem`(10px)이고 여기서 파생한다: sm 6px, md 8px, lg 10px, xl 14px. 버튼과 입력은 md(8px), 코드 블록과 카드형 면은 lg(10px), 배지는 완전한 알약(pill)이다. 로고 마크는 32px 정사각형에 lg 반경이다. 본문 이미지는 md 반경이고 가운데 정렬한다. 테두리는 항상 1px이며 장식용 이중선이나 두꺼운 선은 없다. 본문 인용구만 왼쪽 3px `primary` 선을 쓴다.

## Components

### Buttons
- **Shape:** 8px 반경, 높이 36px(기본)/32px(sm)/24px(xs)/40px(lg), 아이콘 버튼은 정사각형.
- **Primary:** `graphite` 면에 `paper` 글자, 패딩 8px 16px. Hover는 90% 불투명도.
- **Secondary / Outline / Ghost:** Secondary는 `mist` 면. Outline은 1px 테두리에 hover 시 `accent` 면. Ghost는 hover 때만 면이 나타난다. Link는 밑줄만 쓴다.
- **Focus:** 3px, 50% 투명도 `ring`과 `ring` 테두리. 비활성은 50% 불투명도.

### Chips and Badges
- **Style:** Badge는 pill, `px-2 py-0.5`, 12px/500. 변형은 default(graphite)·secondary(mist)·outline(테두리만)·ghost.
- **Topic pill:** 8px 반경 + 테두리 + `mist` 면, 12px/500, hover 시 `accent`. 태그 목록과 주제 필터에 쓴다.

### Rows and Lists
글 목록, 시리즈 인덱스, 태그 인덱스, 연도 링크는 모두 같은 문법이다. 전체 폭 링크 행, 좌우 `px-2~3`, 상하 `py-3~5`, 아래쪽 1px 구분선, 오른쪽 끝에 건수나 날짜(`tabular-nums`, 12px, `slate-text`). Hover는 `accent` 면으로 바뀐다.

### Code Blocks
`pre`는 21px 패딩, 1px 테두리, lg 반경, 13px/1.8, 가로 스크롤. Shiki 라이트·다크 이중 테마를 쓰고, 다크 테마는 `--shiki-dark` 변수로 전환한다.

### Navigation
- **Header:** 높이 56px 고정 바. 왼쪽에 로고 마크(32px 정사각형 `graphite` 면, 모노 글자)와 사이트명(14px/600).
- **Side panel:** 5개 카테고리와 글별 시리즈를 접는 목록으로 보여준다(`collapsible`). 현재 위치는 굵은 글씨와 `accent` 면.
- **Mobile:** `sheet`(슬라이드 패널)로 같은 탐색을 연다. 검색은 `command`(⌘K 팔레트)로 연다.

### Table of Contents (시그니처)
실제 heading에서 만든 목차. 왼쪽에 1px 세로선을 두고 항목은 12px/`slate-text`다. 깊이마다 들여쓰기 10px이 더해진다. 현재 읽는 위치(`aria-current="location"`)는 `primary` 색 선과 굵은 `foreground` 글자로 표시한다. `xl` 이상의 우측 열에서 sticky이다.

### Article Header / Pagination
제목 아래에 메타(날짜, 태그, 시리즈)를 12px로 붙이고, 아래에 구분선을 둔다. 하단에는 시리즈 이전/다음을 2열로 놓고, 그 아래에 관련 글 행 목록이 온다.

## Do's and Don'ts

### Do:
- **Do** 모든 색을 CSS 변수(`--background`, `--muted-foreground` 등)로 쓰고 라이트·다크를 함께 정의한다.
- **Do** 새 목록은 행 문법(구분선 + hover `accent` 면 + 오른쪽 `tabular-nums` 메타)으로 만든다.
- **Do** 본문은 790px 열, 16px, 행간 1.85를 지킨다.
- **Do** 상호작용 요소에 3px 포커스 링을 유지하고 키보드로 모두 도달할 수 있게 한다(WCAG AA).
- **Do** 한국어 UI 문구를 기본으로 쓰고 한글 줄바꿈(`overflow-wrap: anywhere`)이 깨지지 않게 한다.

### Don't:
- **Don't** 강조색, 그라데이션, 장식용 그림자를 추가하지 않는다.
- **Don't** 글 목록을 카드 그리드나 큰 썸네일 격자로 바꾸지 않는다. 목록은 행이다.
- **Don't** 본문 행간을 1.85 아래로 낮추거나 본문 열을 790px 넘게 넓히지 않는다.
- **Don't** `prefers-reduced-motion`에서 애니메이션을 남기지 않는다. 테마 전환은 100ms 이내로 짧게 한다.
- **Don't** 오류 이외의 용도로 `alarm-red`를 쓰지 않는다.
