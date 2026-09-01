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

describe('장식용 한 점이 사이트 색을 이기지 않는다', () => {
  // 2026-09-01 1989v.com 실측. 인장 점(rgb(162,35,29), 폭 133)이 페이지에서
  // 가장 유채색이지만 5번 쓰이고, 실제로 페이지를 지배하는 색은 황토
  // (rgb(179,139,109), 폭 70)로 72번 쓰인다. 채도로 고르면 3px 짜리 장식이
  // 이긴다 — 그래서 사용 횟수로 고른다.
  const doc = document.implementation.createHTMLDocument('t');
  doc.body.style.backgroundColor = '#0f0f11';
  doc.body.style.color = 'rgb(229, 226, 225)';
  const mk = (color: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const s = doc.createElement('span');
      s.style.color = color;
      doc.body.appendChild(s);
    }
  };
  mk('rgb(179, 139, 109)', 12); // 황토 — 많이 쓰인다
  mk('rgb(162, 35, 29)', 2);    // 인장 — 채도는 더 높지만 드물다

  const theme = detectTheme(doc.body as unknown as Parameters<typeof detectTheme>[0]);

  it('채도가 더 높아도 드물게 쓰인 색은 고르지 않는다', () => {
    expect(theme.accent).toBe('var(--fs-accent, rgb(179, 139, 109))');
  });
});

describe('구문 강조와 이미 그린 다이어그램은 표본에서 뺀다', () => {
  // 코드 블록의 토큰 색은 본문 내용이지 사이트가 고른 색이 아니고, SVG 안의
  // 색은 앞서 이 라이브러리가 그린 것이라 되먹이면 감지가 자기 출력을 따라간다.
  const doc = document.implementation.createHTMLDocument('t2');
  doc.body.style.backgroundColor = '#ffffff';
  doc.body.style.color = '#222222';
  const pre = doc.createElement('pre');
  for (let i = 0; i < 40; i++) {
    const t = doc.createElement('span');
    t.style.color = 'rgb(200, 40, 40)'; // 구문 강조 토큰 — 아주 많다
    pre.appendChild(t);
  }
  doc.body.appendChild(pre);
  const brand = doc.createElement('button');
  brand.style.color = 'rgb(26, 71, 42)'; // 실제 브랜드색 — 한 번뿐이다
  doc.body.appendChild(brand);

  const theme = detectTheme(doc.body as unknown as Parameters<typeof detectTheme>[0]);

  it('pre 안의 색이 아무리 많아도 이기지 않는다', () => {
    expect(theme.accent).toBe('var(--fs-accent, rgb(26, 71, 42))');
  });
});
