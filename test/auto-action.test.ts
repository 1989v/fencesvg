// @vitest-environment jsdom
//
// 환경은 파일 단위로 격리된다 — 여기는 "브랜드색을 링크에 안 칠하는 사이트" 하나만 만든다.
import { describe, it, expect } from 'vitest';
import { detectTheme } from '../src/auto';

describe('브랜드색을 링크에 안 칠하는 사이트', () => {
  // 2026-09-01 blog.1989v.com 실측을 그대로 옮긴 것이다. 문서의 첫 링크는 로고
  // 워드마크라 잉크색 그대로였고, 링크 16개가 전부 무채색이었다. 유채색은
  // 액션 트리거 하나에만 있었다(황토 #b38b6d). "첫 링크의 색" 만 보던 판은
  // 여기서 감지를 통째로 포기하고 EDITORIAL 로 내려갔다.
  document.body.style.backgroundColor = '#0f0f11';
  document.body.style.color = 'rgb(229, 226, 225)';
  document.body.innerHTML = `
    <a href="/" id="wordmark">1989v</a>
    <a href="/wishlist" id="nav1">내 찜</a>
    <a href="/write" id="nav2">글 쓰기</a>
    <span id="trigger">공간</span>
  `;
  // 워드마크는 잉크색 그대로, 내비는 옅은 회색 — 어느 쪽도 유채색이 아니다.
  (document.getElementById('wordmark') as HTMLElement).style.color = 'rgb(229, 226, 225)';
  (document.getElementById('nav1') as HTMLElement).style.color = 'rgb(199, 198, 202)';
  (document.getElementById('nav2') as HTMLElement).style.color = 'rgb(199, 198, 202)';
  // 유채색은 링크가 아닌 곳에만 있다.
  (document.getElementById('trigger') as HTMLElement).style.color = 'rgb(179, 139, 109)';

  const theme = detectTheme(document.body);

  it('링크가 아닌 곳에 칠해진 유채색을 강조색으로 잡는다', () => {
    expect(theme.accent).toBe('var(--fs-accent, rgb(179, 139, 109))');
  });

  it('무채색 내비를 강조색으로 오인하지 않는다', () => {
    expect(theme.accent).not.toContain('199, 198, 202');
  });
});
