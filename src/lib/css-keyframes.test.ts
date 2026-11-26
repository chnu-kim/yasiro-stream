import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { definedKeyframes, missingKeyframes, referencedKeyframes } from './css-keyframes';

describe('referencedKeyframes', () => {
  it('animation 단축 속성에서 시간·타이밍·채움 모드를 빼고 이름만 읽는다', () => {
    const css = `.a { animation: fadeUp var(--dur-base) var(--ease-out) 60ms both; }
      .b { animation: spin 1s cubic-bezier(0.2, 0.8, 0.2, 1) infinite alternate; }
      .c { animation-name: one, two; }
      .d { animation: none; }
      .e { animation: ease-in 1s pop; }
      .f { animation: x 1s, y 2s ease; }`;
    expect([...referencedKeyframes(css)].sort()).toEqual(['fadeUp', 'one', 'pop', 'spin', 'two', 'x', 'y']);
  });

  it('주석 안의 선언, animation-duration 같은 다른 속성은 보지 않는다', () => {
    const css = `/* animation: ghost 1s; */ .a { animation-duration: 1s; animation-delay: 2s; transition: opacity 1s; }`;
    expect([...referencedKeyframes(css)]).toEqual([]);
  });
});

describe('definedKeyframes·missingKeyframes', () => {
  it('정의된 이름을 읽고, 참조했지만 정의하지 않은 이름만 돌려준다', () => {
    const css = `@keyframes heroIn { from { opacity: 0; } } /* @keyframes commented {} */
      .a { animation: heroIn 1s both; } .b { animation: fadeUp 1s; }`;
    expect([...definedKeyframes(css)]).toEqual(['heroIn']);
    expect(missingKeyframes(css)).toEqual(['fadeUp']);
  });
});

// 실제 모듈 전부: globals의 keyframe 이름을 모듈에서 쓰면 해시돼 재생되지 않는다. 모듈 안에 @keyframes를 둔다
function moduleFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return moduleFiles(p);
    return e.name.endsWith('.module.css') ? [p] : [];
  });
}

describe('src의 모든 CSS Module', () => {
  const files = moduleFiles(join(process.cwd(), 'src'));

  it('검사할 모듈이 있다', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [f.slice(process.cwd().length + 1), f]))('%s는 쓰는 keyframe을 스스로 정의한다', (_, file) => {
    expect(missingKeyframes(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
