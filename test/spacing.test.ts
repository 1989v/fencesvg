// 간격은 상수가 아니라 **그려진 좌표**로 판정한다.
//
// 2026-09-02: metrics 의 gap 을 fs*2 에서 fs*2.5 로 올렸는데 흐름도와 상태도는
// layoutGraph 에 gap 을 안 넘기고 있어서 기본값(24)을 계속 썼다. 상수는 바뀌고
// 화면은 안 바뀌었다. 상수를 읽는 검사였다면 초록불이었을 것이다.
import { describe, it, expect } from 'vitest';
import { parseFlowchart } from '../src/parse/flowchart';
import { parseEr } from '../src/parse/er';
import { parseClass } from '../src/parse/class';
import { drawFlowchart } from '../src/draw/flowchart';
import { drawState } from '../src/draw/state';
import { drawEr } from '../src/draw/er';
import { drawClass } from '../src/draw/class';
import { defaultTheme, metrics, type Theme } from '../src/draw/theme';

const themeAt = (fs: number): Theme => ({
  ...defaultTheme(), fontSize: fs, labelSize: fs - 3, pad: Math.round((fs * 7) / 6),
});

type Rect = { x: number; y: number; w: number; h: number };

/** 그려진 노드 사각형·마름모를 좌표로 읽는다. 라벨 칩(rx="3")과 화살촉 정의는 뺀다. */
function shapes(svg: string): Rect[] {
  const out: Rect[] = [];
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  for (const m of body.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"(?![^>]*rx="3")/g)) {
    out.push({ x: +m[1]!, y: +m[2]!, w: +m[3]!, h: +m[4]! });
  }
  for (const m of body.matchAll(/<polygon points="([^"]+)"/g)) {
    const pts = m[1]!.trim().split(/\s+/).map((p) => p.split(',').map(Number) as [number, number]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    out.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  }
  return out;
}

/** 같은 줄에 놓인(한 축이 겹치는) 도형 사이의 가장 좁은 여백. */
function tightestGap(rects: Rect[], axis: 'x' | 'y'): number {
  let min = Infinity;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const A = rects[i]!, B = rects[j]!;
      const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
      const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
      if (axis === 'x' && oy > 0 && ox <= 0) min = Math.min(min, -ox);
      if (axis === 'y' && ox > 0 && oy <= 0) min = Math.min(min, -oy);
    }
  }
  return min;
}

const FLOW = `flowchart TD
  주문접수 --> 검증{입력 검증}
  검증 -->|통과| 결제요청
  검증 -.->|실패| 반려[반려 안내]
  결제요청 --> 승인{승인 여부}
  승인 -->|승인| 재고예약
  재고예약 --> 부족{재고 충분}
  부족 -->|충분| 출고지시
  부족 -.->|부족| 입고대기[입고 대기]
  출고지시 --> 완료[주문 완료]`;
const STATE = `flowchart LR
  DRAFT --> PENDING
  PENDING --> PAID
  PENDING --> CANCELLED
  PAID --> SHIPPED`;
const ER = `erDiagram
  MEMBER ||--o{ ORDER : places
  ORDER ||--o{ ORDER_ITEM : contains
  ORDER ||--|| PAYMENT : settles`;
const CLS = `classDiagram
  class Payment {
    +approve()
  }
  class CardPayment {
    +approve()
  }
  class PointPayment {
    +approve()
  }
  Payment <|-- CardPayment
  Payment <|-- PointPayment`;

const cases: Array<[string, (t: Theme) => string, 'x' | 'y']> = [
  ['흐름도', (t) => { const m = parseFlowchart(FLOW); if ('error' in m) throw new Error(m.error); return drawFlowchart(m, t, 'd', 'x'); }, 'x'],
  ['상태도', (t) => { const m = parseFlowchart(STATE); if ('error' in m) throw new Error(m.error); return drawState(m, t, 'd', 'x'); }, 'y'],
  ['ER',     (t) => { const m = parseEr(ER); if ('error' in m) throw new Error(m.error); return drawEr(m, t, 'd', 'x'); }, 'y'],
  ['클래스도', (t) => { const m = parseClass(CLS); if ('error' in m) throw new Error(m.error); return drawClass(m, t, 'd', 'x'); }, 'x'],
];

describe('노드 간격이 실제 좌표에 반영된다', () => {
  for (const [name, draw, axis] of cases) {
    for (const fs of [12, 16]) {
      it(`${name} · 글자 ${fs}px — 같은 줄 도형 사이가 gap.node 이상`, () => {
        const theme = themeAt(fs);
        const want = metrics(theme).gap.node;
        const gap = tightestGap(shapes(draw(theme)), axis);
        // 그리기 직전 4px 격자 스냅이 최대 4px 까지 좁힐 수 있다.
        expect(gap, `${name} 실측 ${gap}px · 기대 ${want}px 이상`).toBeGreaterThanOrEqual(want - 4);
      });
    }
  }
});
