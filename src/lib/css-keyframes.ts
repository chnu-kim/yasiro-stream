// CSS Module이 참조만 하고 정의하지 않은 keyframe 이름을 찾는다.
// CSS Modules는 animation 이름을 모듈마다 해시하므로(`page-module__…__fadeUp`), globals.css의 keyframe 이름을 모듈에서 쓰면
// 없는 키프레임을 가리켜 애니메이션이 조용히 재생되지 않는다(2026-11 홈·어워즈·/games 알림·대화상자). css-keyframes.test.ts가 모든 모듈을 검사한다.

// animation 단축 속성에 올 수 있는 이름이 아닌 단어
const KEYWORDS = new Set([
  'none', 'infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse',
  'forwards', 'backwards', 'both', 'running', 'paused',
  'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end',
  'initial', 'inherit', 'unset', 'revert', 'revert-layer',
]);

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// 함수 호출(var(), cubic-bezier() 등)을 괄호 짝까지 지운다
function stripFunctions(value: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') {
      depth++;
      // 바로 앞의 함수 이름도 지운다
      out = out.replace(/[\w-]+$/, '');
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      out += c;
    }
  }
  return out;
}

export function definedKeyframes(css: string): Set<string> {
  const names = new Set<string>();
  for (const m of stripComments(css).matchAll(/@keyframes\s+([\w-]+)/g)) names.add(m[1]);
  return names;
}

// animation / animation-name 선언이 가리키는 keyframe 이름(쉼표로 여러 개면 모두)
export function referencedKeyframes(css: string): Set<string> {
  const names = new Set<string>();
  for (const m of stripComments(css).matchAll(/(?:^|[;{\s])animation(-name)?\s*:\s*([^;}]+)/g)) {
    const isName = m[1] === '-name';
    for (const part of stripFunctions(m[2]).split(',')) {
      const words = part.trim().split(/\s+/).filter(Boolean);
      const idents = words.filter((w) => /^-?[a-zA-Z_][\w-]*$/.test(w) && !KEYWORDS.has(w));
      if (isName) idents.forEach((w) => names.add(w));
      else if (idents.length > 0) names.add(idents[idents.length - 1]);
    }
  }
  return names;
}

export function missingKeyframes(css: string): string[] {
  const defined = definedKeyframes(css);
  return [...referencedKeyframes(css)].filter((n) => !defined.has(n)).sort();
}
