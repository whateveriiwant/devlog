---
target: 로고
total_score: 9
max_score: 16
na_heuristics: 1,5,6,7,9,10
p0_count: 0
p1_count: 2
target_identity: "file:/Users/seungjun/Documents/devlog/src/layouts/BaseLayout.astro#logo"
timestamp: 2026-11-07T13-26-18Z
slug: src-layouts-baselayout-astro-logo
---
# 로고 critique

Method: dual-agent (A: 디자인 리뷰 · B: detector/브라우저 측정). A는 소스만 읽었고, B가 브라우저로 측정했다. 로고 렌더링을 내가 직접 눈으로 보지는 않았다.

## 판정
범용 모노스페이스 `sj` 타일. "조용한 서재"라는 DESIGN.md 정체성과 연결되지 않는다.

## 우선순위
- P1 네이밍 불일치: aria-label과 SheetTitle, RSS title이 seungjun.dev, 실제는 seungjun.sh. BaseLayout.astro:140, SiteControls.tsx:351, rss.xml.ts:7
- P1 로고가 범용이다: 모노 `sj` 타일. global.css:149-151, favicon.svg
- P2 다크에서 마크가 반전되어 페이지에서 가장 밝은 요소(rgb(228,228,231) 대 배경 rgb(9,9,11))
- P2 파비콘: generic monospace 고정, 다크 분기 없음, 잉크가 중앙에서 약 3.4% 왼쪽, apple-touch-icon/PNG 폴백 없음
- P3 사이트 기본 og:image 없음

## 점수
scored 2,3,4,8 → 9/16. n/a: 1,5,6,7,9,10.

## 측정 근거
detector 0건(BaseLayout.astro만). 마크 32px, radius 10px(31%), 파비콘 rx 12/64(19%). 대비 .sh 라이트 4.83:1.
