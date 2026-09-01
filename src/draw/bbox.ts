import { measureText } from '../text';
import type { Point } from '../layout/edge';

export type Box = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * 실제로 그려질 모든 조각(상자 + 간선 경로 + 라벨 + 다이어그램별 부속 기호)을
 * 모아 콘텐츠의 진짜 bbox 를 구한다. layoutGraph/layoutSequence 가 재는
 * width/height 는 상자만 본 값이라, 역방향 간선의 우회 경로나 상자 폭보다
 * 넓은 라벨이 그 밖으로 나가면 그대로 잘린다 — 다섯 다이어그램 타입이 전부
 * 이 문제를 겪어 각자 같은 누적 로직을 복사해 갖고 있었다.
 *
 * 그리는 순서(상자 → 간선 → 라벨 …)와 무관하게 먼저 다 모아 bbox 를 구해야
 * 하므로, 값을 한 번에 계산하는 함수가 아니라 누적기로 둔다 — 각 드로어는
 * 갖고 있는 걸(상자 좌표, 라우팅된 경로 점, 라벨 앵커) 그때그때 밀어 넣고,
 * 마지막에 `width`/`height`/`shift` 로 원점 정렬된 값을 꺼내 쓴다.
 */
export class ContentBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;

  constructor(initial: Box) {
    this.minX = initial.minX;
    this.minY = initial.minY;
    this.maxX = initial.maxX;
    this.maxY = initial.maxY;
  }

  /** 점 하나(간선 경로 점, crow's-foot 점 등)를 bbox 에 반영한다. */
  point(p: Point): void {
    this.minX = Math.min(this.minX, p.x);
    this.minY = Math.min(this.minY, p.y);
    this.maxX = Math.max(this.maxX, p.x);
    this.maxY = Math.max(this.maxY, p.y);
  }

  /** 박스 하나(라벨 bbox 등)를 bbox 에 반영한다. */
  box(b: Box): void {
    this.minX = Math.min(this.minX, b.minX);
    this.minY = Math.min(this.minY, b.minY);
    this.maxX = Math.max(this.maxX, b.maxX);
    this.maxY = Math.max(this.maxY, b.maxY);
  }

  get width(): number {
    return this.maxX - this.minX;
  }

  get height(): number {
    return this.maxY - this.minY;
  }

  /** 콘텐츠 최소점을 원점(0,0)으로 옮기는 이동량. */
  get dx(): number {
    return -this.minX;
  }

  get dy(): number {
    return -this.minY;
  }

  /** 점 좌표를 원점 정렬 이동량만큼 옮긴다 — `.map(bbox.shift)` 로 쓴다. */
  shift = (p: Point): Point => ({ x: p.x + this.dx, y: p.y + this.dy });
}

/**
 * 가운데 정렬(text-anchor=middle) 라벨 하나의 바운딩 박스. 폰트 메트릭을
 * 정확히 재지 않으므로(measureText 는 근사치) 캡 하이트·디센더 쪽을
 * 넉넉하게 잡아 과소평가하지 않는 쪽으로 치우친다.
 */
export function textBBox(cx: number, baselineY: number, str: string, fontSize: number): Box {
  const halfW = measureText(str, fontSize) / 2;
  return { minX: cx - halfW, maxX: cx + halfW, minY: baselineY - fontSize * 0.8, maxY: baselineY + fontSize * 0.25 };
}

/** 왼쪽 정렬 라벨 하나의 바운딩 박스 — x 가 라벨의 시작점일 때(class 의 관계 라벨). */
export function leftTextBBox(x: number, baselineY: number, str: string, fontSize: number): Box {
  return { minX: x, maxX: x + measureText(str, fontSize), minY: baselineY - fontSize * 0.8, maxY: baselineY + fontSize * 0.25 };
}
