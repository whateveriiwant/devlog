---
title: C - 문자열에서 각 단어 가져오기
description: (C언어) 문자열에서 각 단어를 가져오는 방법 - 토큰 사용
slug: C-문자열에서-각-단어-가져오기
publishedAt: 2022-06-06T07:55:19.974Z
updatedAt: 2026-08-19T05:16:12.545Z
series:
  id: 27564660-a6c6-451a-9b7a-937c45e6029f
  order: 11
tags:
  - C
draft: false
originalUrl: https://velog.io/@jsj9620/C-%EB%AC%B8%EC%9E%90%EC%97%B4%EC%97%90%EC%84%9C-%EA%B0%81-%EB%8B%A8%EC%96%B4-%EA%B0%80%EC%A0%B8%EC%98%A4%EA%B8%B0
---
# 토큰이란
- 문법적으로 더 이상 나눌 수 없는 기본적인 언어 요소
- 예) 문장에서 공백 문자로 분리된 단어들을 토큰이라고 함
- strtok()에서는 토큰을 분리하는 분리자를 사용자가 지정 가능

# 예시 코드

```
#include <stdio.h>
#include <string.h>

int main() {
    char s[] = "A brown fox jumps over the lazy dog"; // 예시 문자열
    char sep[] = " "; // 분리자는 공백
    char *token; // 단어 임시로 저장하는 토큰 선언

    token = strtok(s, sep);

    while (token != NULL) { // 문자열 s에 토큰이 있는 동안 반복
        printf("token: %s\n", token);
        token = strtok(NULL, sep); // 계속해서 토큰 읽으려면 s대신 NULL
    }
}
```