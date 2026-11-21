import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import ArtImage from '@/components/ArtImage';
import Button from '@/components/Button';
import { CHANNELS, type ChannelId } from '@/lib/channels';
import ChannelGlyph, { type ChannelKind } from '@/components/ChannelGlyph';
import HeightRuler from '@/components/HeightRuler';
import RoundStamp from '@/components/RoundStamp';
import StitchRule from '@/components/StitchRule';
import { ArrowIcon } from '@/components/icons';
import { countStats } from '@/lib/games/query';
import { listGames } from '@/lib/games/repo';
import BirthdayDday from './BirthdayDday';
import { CHAPTERS, chapterNo } from './chapters';
import CopyButton from './CopyButton';
import KkulCrop from '@/app/_components/KkulCrop';
import Dossier from './Dossier';
import TasteSticker, { type StickerKind } from './TasteSticker';
import styles from './page.module.css';

export const metadata: Metadata = pageMetadata({
  path: '/about',
  title: '야시로 소개',
  description: '치지직 버츄얼 스트리머 야시로의 프로필과 채널. 테라포레 소속, 호기심 많은 탐험가 벌꿀오소리.',
});

// 숫자는 Fredoka, 붙는 단위는 Noto Sans로 따로 쓴다(Fredoka에 한글 글리프가 없다). 텍스트는 '3월 21일' 그대로 읽힌다
function Num({ n, unit }: { n: string; unit?: string }) {
  return (
    <>
      <span className={styles.num}>{n}</span>
      {unit && <span className={styles.unit}>{unit}</span>}
    </>
  );
}

// 프로필. 값은 공식 프로필 그대로. 한 줄(row) = 기록지의 한 행, 칸은 3열 공유 격자에 맞춘다.
// 한 챕터 안에서 숫자 묶음(생일·키·나이, L)과 신분 묶음(종족·소속·MBTI·직업·주요 콘텐츠, M)을 간격을 크게 벌려 나눈다
type Rec = { label: string; value: ReactNode; size: 'L' | 'M'; sub?: string; span?: 2 };
const BASICS_ROWS: Rec[][] = [
  [
    {
      label: '생일',
      size: 'L',
      value: (
        <>
          <Num n="3" unit="월" /> <Num n="21" unit="일" />{' '}
          <BirthdayDday />
        </>
      ),
    },
    { label: '키', size: 'L', value: <Num n="149.8" unit="cm" /> },
    {
      label: '나이',
      size: 'L',
      value: (
        <>
          <Num n="20" unit="살" />{' '}
          <span className={styles.note}>지구 기준</span>
        </>
      ),
    },
  ],
];
const IDENTITY_ROWS: Rec[][] = [
  [
    { label: '종족', size: 'M', value: '벌꿀오소리' },
    // 공식 값 '테라포레 (TERRAFORET)'를 한글 값 + 영문 보조 줄로 나눠 보인다
    { label: '소속', size: 'M', value: '테라포레', sub: 'TERRAFORET' },
    { label: 'MBTI', size: 'M', value: <span className={styles.num}>ISFJ</span> },
  ],
  [
    { label: '직업', size: 'M', value: '호기심 많은 탐험가', span: 2 },
    { label: '주요 콘텐츠', size: 'M', value: '종합게임' },
  ],
];

function RecordRows({ rows, minor, className }: { rows: Rec[][]; minor?: boolean; className?: string }) {
  return (
    <div className={className ? `${styles.record} ${className}` : styles.record}>
      {rows.map((row, r) => (
        <dl key={r} className={minor ? `${styles.recordRow} ${styles.minorRow}` : styles.recordRow}>
          {row.map((f) => (
            <div key={f.label} className={styles.item} data-span={f.span}>
              <dt className={styles.label}>{f.label}</dt>
              <dd className={f.size === 'L' ? styles.valL : styles.valM}>
                {f.value}
                {f.sub && (
                  <>
                    {' '}
                    <span className={styles.sub} lang="en">
                      {f.sub}
                    </span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ))}
    </div>
  );
}

// 스티커 그림은 TasteSticker의 kind. 단어는 공식 프로필 그대로
const LIKES: { word: string; sticker: StickerKind }[] = [
  { word: '고기', sticker: 'meat' },
  { word: '소통', sticker: 'chat' },
];
const DISLIKES: { word: string; sticker: StickerKind }[] = [{ word: '가만히 있기', sticker: 'idle' }];

// 팬네임·팬 마크·팬아트 태그는 야시로 공식 프로필 문구 그대로("⁺˳✧Fan Name/Mark :: 꿀붕이 /🍯🔍", "⁺˳✧Fan Art :: #yasiro_Art")
const FAN_NAME = '꿀붕이';
const FAN_MARK = '🍯🔍';
const FAN_ART_TAG = '#yasiro_Art';
const FAN_ART_URL = 'https://x.com/hashtag/yasiro_Art';

// 탐험 기록 숫자(/games와 같은 기준: 숨긴 게임 제외). DB를 못 읽으면 숫자 없이 문장만 둔다
async function getExpeditionCounts(): Promise<{ total: number; clear: number } | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { env } = await getCloudflareContext({ async: true });
    const { total, clear } = countStats(await listGames(env.DB, { includeHidden: false }));
    return { total, clear };
  } catch {
    return null;
  }
}

// 주소·문구는 src/lib/channels.ts가 정본. 여기서는 아이콘 종류만 정한다
const KIND: Record<ChannelId, ChannelKind> = {
  chzzk: 'broadcast',
  journal: 'journal',
  youtube: 'play',
  x: 'post',
  cafe: 'community',
};

// 위치는 yasiro4.png(1600×2277)에서 직접 잰 값. x·y는 그림 상자 대비 %.
// 원화를 잘라 확인해서 장비가 분명히 보이는 4가지만 단다(지도 두루마리는 왼쪽 허리 가죽 홀더에 꽂힌 종이 말이).
type Gear = 'goggles' | 'scroll' | 'binoculars' | 'pouch';
const CALLOUTS: { gear: Gear; label: string; x: number; y: number; side: 'left' | 'right' }[] = [
  { gear: 'goggles', label: '고글', x: 54.5, y: 13, side: 'right' },
  { gear: 'scroll', label: '지도\n두루마리', x: 41.6, y: 41.7, side: 'left' },
  { gear: 'binoculars', label: '쌍안경', x: 58, y: 47.8, side: 'right' },
  { gear: 'pouch', label: '파우치', x: 59.3, y: 62.3, side: 'right' },
];
const EDGE = 22; // 지시선이 끝나는 좌우 위치(%). 왼쪽 라벨을 한 줄로 늘리면 키 눈금자 기둥을 가로지르므로 두 줄로 둔다

function ChapterTitle({ index, id }: { index: number; id: string }) {
  return (
    <h2 id={id} className={styles.chapterTitle} tabIndex={-1}>
      <span className={styles.chapterNo} aria-hidden="true">
        {chapterNo(index)}
      </span>
      {CHAPTERS[index].label}
    </h2>
  );
}

export default async function About() {
  const counts = await getExpeditionCounts();
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      {/* ══ 탐험가 도감: 고정 그림판 + 챕터 ══ */}
      <Dossier plate={<Plate />}>
        <section data-chapter-id="intro" className={`${styles.chapter} ${styles.intro}`} aria-labelledby="about-title">
          {/* 도장은 이름 묶음에 붙여 신분 표시로 읽히게 한다. 위치가 화면 폭에 따라 바뀌어 CSS 클래스로 둔다 */}
          <div className={styles.idBlock}>
            <h1 id="about-title" className={styles.idName} tabIndex={-1}>
              {/* 도장은 이름 글자 끝에 붙인다(묶음 폭은 태그라인이 정해서, 묶음에 붙이면 이름에서 떨어져 떠 보인다) */}
              <span className={styles.nameMark}>
                야시로
                <span className={styles.introStamp}>
                  <RoundStamp size={104} rotate={-12} />
                </span>
              </span>
            </h1>
            {/* 소개는 번호를 달지 않는다(번호는 목차에만). 이름 아래 영문 표기만 */}
            <p className={styles.roman} lang="en">
              YASIRO
            </p>
            <p className={styles.tagline}>호기심 많은 탐험가, 벌꿀오소리 야시로</p>
          </div>
        </section>

        <section data-chapter-id="profile" className={styles.chapter} aria-labelledby="profile-title">
          <ChapterTitle index={1} id="profile-title" />
          <RecordRows rows={BASICS_ROWS} />
          <RecordRows rows={IDENTITY_ROWS} minor className={styles.recordNext} />
        </section>

        <section data-chapter-id="taste" className={styles.chapter} aria-labelledby="taste-title">
          <ChapterTitle index={2} id="taste-title" />
          {/* 프로필 3열과 박자를 다르게 2열: 좋아하는 것(두 단어를 한 칸에 쌓아 한 묶음) | 싫어하는 것. 모든 폭에서 같은 구조.
              극성은 색 선 + ○/× 기호 + 라벨 글자로 함께 전한다 */}
          <dl className={styles.tasteRecord}>
            <div className={styles.tasteGroup} data-kind="like">
              <dt className={styles.label}>
                <TasteMark kind="like" />
                좋아하는 것
              </dt>
              {LIKES.map((t) => (
                <dd key={t.word} className={styles.tasteItem}>
                  <TasteSticker kind={t.sticker} />
                  <span className={styles.tasteWord}>{t.word}</span>
                </dd>
              ))}
            </div>
            <div className={styles.tasteGroup} data-kind="dislike">
              <dt className={styles.label}>
                <TasteMark kind="dislike" />
                싫어하는 것
              </dt>
              {DISLIKES.map((t) => (
                <dd key={t.word} className={styles.tasteItem}>
                  <TasteSticker kind={t.sticker} />
                  <span className={styles.tasteWord}>{t.word}</span>
                </dd>
              ))}
            </div>
          </dl>
        </section>

        <section data-chapter-id="fan" className={styles.chapter} aria-labelledby="fan-title">
          <ChapterTitle index={3} id="fan-title" />
          <div className={styles.record}>
            <dl className={`${styles.recordRow} ${styles.fanRow}`}>
              <div className={styles.item} data-span={2}>
                {/* 챕터 제목이 '팬네임'이라 같은 라벨은 숨긴 글자로만 둔다(dt/dd 짝은 유지) */}
                <dt className={styles.srOnly}>팬네임</dt>
                <dd className={styles.fanName}>
                  {/* 공식 꿀붕이 그림(홈 카드와 같은 시트에서 정면만 잘라 씀)을 취향 스티커처럼 오려 붙인다 */}
                  <span className={styles.kkulSticker}>
                    <KkulCrop kind="front" size={72} style={{ position: 'relative' }} />
                  </span>
                  <span className={styles.valWord}>{FAN_NAME}</span>
                </dd>
              </div>
              <div className={styles.item}>
                <dt className={styles.label}>팬 마크</dt>
                <dd className={styles.valEmoji}>{FAN_MARK}</dd>
                <dd className={styles.actions}>
                  <CopyButton text={FAN_MARK} label="팬 마크" idleText="마크 복사" />
                </dd>
              </div>
            </dl>
            <dl className={styles.recordRow}>
              <div className={styles.item} style={{ gridColumn: '1 / -1' }}>
                <dt className={styles.label}>팬아트 태그</dt>
                <dd className={`${styles.valL} ${styles.num}`} lang="en">
                  {FAN_ART_TAG}
                </dd>
                <dd className={styles.actions}>
                  <CopyButton text={FAN_ART_TAG} label="팬아트 해시태그" idleText="태그 복사" />
                  {/* 접근 이름이 보이는 글자 'X에서 보기'로 시작하게(음성 입력으로 부를 수 있게) 보조 설명은 숨긴 글자로 덧붙인다 */}
                  <a href={FAN_ART_URL} target="_blank" rel="noreferrer" className={styles.textLink}>
                    X에서 보기
                    <span className={styles.srOnly}> {FAN_ART_TAG} (새 탭에서 열림)</span>
                    <ArrowIcon direction="up-right" size={14} />
                  </a>
                </dd>
              </div>
            </dl>
          </div>
        </section>
        <section data-chapter-id="channels" className={`${styles.chapter} ${styles.lastChapter}`} aria-labelledby="channel-title">
          <ChapterTitle index={4} id="channel-title" />
          <ul className={styles.channelList}>
            {CHANNELS.map((ch) => (
              <li key={ch.id}>
                <a
                  href={ch.href}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.row}
                  aria-label={`${ch.label} ${ch.desc} (새 탭에서 열림)`}
                >
                  <span style={{ color: 'var(--accent-text)', display: 'inline-flex' }}>
                    <ChannelGlyph kind={KIND[ch.id]} size={24} />
                  </span>
                  <span className={styles.text}>
                    <span className={styles.name}>{ch.label}</span>
                    <span className={styles.desc}>{ch.desc}</span>
                  </span>
                  <span className={styles.arrow} aria-hidden="true">
                    <ArrowIcon direction="up-right" size={16} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </Dossier>

      {/* ══ 다음 페이지 ══ */}
      <section className={styles.outro} aria-labelledby="outro-title">
        <StitchRule style={{ marginBottom: 'var(--space-6)' }} />
        <div className={styles.outroRow}>
          <div>
            <h2
              id="outro-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-xl)',
                fontWeight: 400,
                lineHeight: 'var(--lh-tight)',
                wordBreak: 'keep-all',
                textWrap: 'balance',
              }}
            >
              야시로가 탐험한 게임도 둘러보세요
            </h2>
            {counts && (
              <dl className={styles.outroStats}>
                <div>
                  <dt className={styles.label}>게임</dt>
                  <dd className={styles.outroNum}>
                    <Num n={String(counts.total)} unit="개" />
                  </dd>
                </div>
                <div>
                  <dt className={styles.label}>정복</dt>
                  <dd className={styles.outroNum}>
                    <Num n={String(counts.clear)} unit="개" />
                  </dd>
                </div>
              </dl>
            )}
          </div>
          <Button href="/games" size="lg" iconEnd={<ArrowIcon direction="right" size={16} />}>
            탐험 기록 보기
          </Button>
        </div>
      </section>
    </div>
  );
}

// 고정 그림판: 사선 띠 위 캐릭터 + 키 눈금자 + 장비 라벨(전신으로 물러난 뒤 CSS가 켠다)
function Plate() {
  return (
    <div className={styles.stage}>
      <div className={styles.figure}>
        <ArtImage
          name="yasiro4"
          widths={[480, 960]}
          alt="스팀펑크 고글을 머리에 얹고 정면을 보는 야시로 전신 일러스트"
          width={1600}
          height={2277}
          // 데스크톱은 처음에 얼굴을 1.9배로 보여 주므로 DPR 1에서도 960w를 받게 크게 잡는다
          sizes="(max-width: 1023px), (max-height: 640px) 340px, 940px"
          priority
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        />
        <div className={styles.rulerWrap}>
          <HeightRuler headTop={10} feetBottom={4.5} side="left" style={{ right: '100%', marginRight: 'max(6px, calc(88px - 22%))' }} />
        </div>
        <ul className={styles.callouts} aria-label="그림에 표시한 장비">
          {CALLOUTS.map((c, i) => (
            <li key={c.gear} data-side={c.side} style={{ '--i': i } as CSSProperties}>
              <Callout {...c} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Callout({ label, x, y, side }: { gear: Gear; label: string; x: number; y: number; side: 'left' | 'right' }) {
  const isRight = side === 'right';
  const line: CSSProperties = isRight
    ? { left: `${x}%`, width: `${100 - EDGE - x}%` }
    : { right: `${100 - x}%`, width: `${x - EDGE}%` };
  const text: CSSProperties = isRight ? { left: `calc(${100 - EDGE}% + 6px)` } : { right: `calc(${100 - EDGE}% + 6px)` };
  return (
    <>
      <span aria-hidden="true" className={styles.calloutLine} style={{ top: `${y}%`, ...line }} />
      <span aria-hidden="true" className={styles.calloutDot} style={{ top: `${y}%`, left: `${x}%` }} />
      <span className={styles.calloutText} style={{ top: `${y}%`, textAlign: isRight ? 'left' : 'right', ...text }}>
        {label}
      </span>
    </>
  );
}

// 좋아함 ○ / 싫어함 × 표시. 글자(좋아하는 것·싫어하는 것)가 뜻을 전하므로 장식
function TasteMark({ kind }: { kind: 'like' | 'dislike' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={styles.tasteMark}>
      {kind === 'like' ? (
        <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
      ) : (
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}
