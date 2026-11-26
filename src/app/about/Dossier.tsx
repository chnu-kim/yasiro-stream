'use client';
// /about 탐험가 도감: 왼쪽 그림판은 고정(sticky), 오른쪽 챕터가 스크롤된다.
// 처음 모습(얼굴 1.9배 확대, 눈금자·장비 라벨 숨김)은 CSS가 정한다. JS가 붙을 때 그림이 순간 이동하지 않게 하려는 것이다.
// JS는 스크롤 한 루프(rAF)에서 두 가지를 적는다.
//  - 소개 챕터를 지나는 비율 --z(0→1)를 .stage에: 캐릭터(.figure)가 얼굴 가까이에서 전신으로 물러나고, 확대 중 무대 아래 끝의 페이드가 줄어든다
//  - 지금 챕터(화면 세로 가운데를 지난 마지막 챕터): 목차 표시
// 전신이 되면 루트에 data-zoomed를 붙여 CSS가 눈금자·장비 라벨을 켠다. 끄는 기준(z<0.9)을 켜는 기준(z=1)보다 낮춰 경계에서 깜빡이지 않게 하고,
// 한 번 꺼진 뒤에는 data-seen을 붙여 다시 켤 때 순차 등장 없이 바로 보인다(정교한 등장은 페이지당 한 번).
// 데스크톱(1024px 이상, 높이 641px 이상)에서만 움직인다. 그 밖이나 JS가 없으면 그림판은 모든 표시가 켜진 상태로 보인다.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CHAPTERS, chapterNo } from './chapters';
import { vtTarget } from '@/lib/page-transition';
import styles from './page.module.css';

const DESKTOP = '(min-width: 1024px) and (min-height: 641px)';
const REDUCE = '(prefers-reduced-motion: reduce)';

export default function Dossier({ plate, children }: { plate: ReactNode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  // 동작 줄이기 설정은 페이지를 연 채로 바뀔 수 있다. CSS 미디어쿼리는 바로 따라가므로 JS도 같이 따라가야
  // 확대된 채 장비 라벨이 숨겨진 상태로 멈추지 않는다
  const [motion, setMotion] = useState(false);
  const [current, setCurrent] = useState(0);
  // 목차로 이동하는 동안은 스크롤 위치로 지금 챕터를 바꾸지 않는다(지나치는 챕터마다 표시가 깜빡인다)
  const jumping = useRef(false);
  const releaseJump = useRef<() => void>(() => {});

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const rm = window.matchMedia(REDUCE);
    const sync = () => {
      setActive(mq.matches);
      setMotion(!rm.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    rm.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      rm.removeEventListener('change', sync);
    };
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!active || !el) return;
    const sections = CHAPTERS.map((c) => el.querySelector<HTMLElement>(`[data-chapter-id="${c.id}"]`));
    const intro = sections[0];
    const stage = el.querySelector<HTMLElement>(`.${styles.stage}`);
    let navH = 0;
    let zoomed = false;
    let lastZ = '';
    let raf = 0;

    const measure = () => {
      navH = parseFloat(getComputedStyle(el).getPropertyValue('--nav-h')) || 0;
    };

    const update = () => {
      raf = 0;
      const vh = window.innerHeight;
      if (motion && intro && stage) {
        const r = intro.getBoundingClientRect();
        // Nav 바로 아래에서 출발해, 소개 아래 끝이 화면 가운데에 닿을 때(= 프로필이 지금 챕터가 될 즈음) 전신이 된다
        const span = Math.max(1, navH + r.height - vh * 0.5);
        const t = Math.min(1, Math.max(0, (navH - r.top) / span));
        const z = 1 - (1 - t) ** 2; // 끝에서 감속해 전신 도착과 눈금자 등장이 한 박자로 이어진다
        const s = z.toFixed(3);
        if (s !== lastZ) {
          stage.style.setProperty('--z', s);
          lastZ = s;
        }
        if (!zoomed && z >= 1) {
          zoomed = true;
          el.setAttribute('data-zoomed', '');
        } else if (zoomed && z < 0.9) {
          zoomed = false;
          el.removeAttribute('data-zoomed');
          el.setAttribute('data-seen', '');
        }
      }
      if (!jumping.current) {
        let i = 0;
        sections.forEach((s, k) => {
          if (s && s.getBoundingClientRect().top <= vh * 0.5) i = k;
        });
        // 맨 아래까지 내렸으면 마지막 챕터가 가운데에 못 닿아도 마지막으로 본다
        if (window.scrollY + vh >= document.documentElement.scrollHeight - 2) i = sections.length - 1;
        setCurrent(i);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      onScroll();
    };

    measure();
    raf = requestAnimationFrame(update);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(raf);
      stage?.style.removeProperty('--z');
      el.removeAttribute('data-zoomed');
    };
  }, [active, motion]);

  useEffect(() => () => releaseJump.current(), []);

  function jump(i: number) {
    const section = root.current?.querySelector<HTMLElement>(`[data-chapter-id="${CHAPTERS[i].id}"]`);
    const heading = section?.querySelector<HTMLElement>(i === 0 ? 'h1' : 'h2');
    if (!heading) return;
    const behavior: ScrollBehavior = window.matchMedia(REDUCE).matches ? 'auto' : 'smooth';

    releaseJump.current();
    jumping.current = true;
    setCurrent(i);
    const release = () => {
      jumping.current = false;
      window.removeEventListener('scrollend', release);
      clearTimeout(timer);
      releaseJump.current = () => {};
    };
    window.addEventListener('scrollend', release);
    const timer = setTimeout(release, 1500); // 이미 그 자리라 스크롤이 일어나지 않으면 scrollend가 오지 않는다
    releaseJump.current = release;

    // 소개는 맨 위(얼굴 확대 상태)로, 나머지는 제목이 Nav 아래 조금 내려온 자리로(scroll-margin-top)
    if (i === 0) window.scrollTo({ top: 0, behavior });
    else heading.scrollIntoView({ block: 'start', behavior });
    heading.focus({ preventScroll: true });
  }

  return (
    <div ref={root} className={styles.dossier}>
      <aside className={styles.plateCol} aria-label="야시로 전신 그림과 장비">
        <div className={styles.plateSticky}>
          {plate}
          {/* 늘 렌더링하고 좁은 화면·낮은 화면에서는 CSS로 숨긴다(JS가 붙을 때 그림판 높이가 바뀌지 않게) */}
          <nav className={styles.rail} aria-label="소개 챕터" {...vtTarget('about-rail', 'rise', 3)}>
            {CHAPTERS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className={styles.railItem}
                aria-current={i === current ? 'location' : undefined}
                onClick={() => jump(i)}
              >
                <span className={styles.railNo} aria-hidden="true">
                  {chapterNo(i)}
                </span>
                {c.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>
      <div className={styles.chapterCol}>{children}</div>
    </div>
  );
}
