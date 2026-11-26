# yasiro-stream

치지직 스트리머 야시로의 비공식 팬사이트. 팬사이트 대회 출품으로 시작했고, 대회가 끝난 2026-11부터 사용자가 운영하는 팬사이트다. 페이지들이 디자인 토큰과 Nav를 공유한다.

- 프로덕션: https://yasiro.stream · 레포: `chnu-kim/yasiro-stream`(2026-11 `yasiro-contest`에서 개명, 옛 주소는 GitHub가 넘겨 준다)
- 스택: Next.js 16.2.9 (App Router) · React 19 · TypeScript · pnpm · vitest
- 배포: Cloudflare Workers (`@opennextjs/cloudflare`) + D1

## Next.js 16 주의

훈련 데이터와 다른 breaking change가 있다. Next.js API를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 문서를 먼저 읽는다.

## 명령

```bash
pnpm dev            # UI 개발. D1 바인딩 없음 → 세션 null, API 실패 (D1이 필요하면 pnpm preview)
pnpm test           # vitest run
pnpm lint
pnpm typecheck      # next typegen && tsc --noEmit
pnpm test:coverage  # 100% threshold 대상: src/lib/games/**, awards/**, chzzk-category, session, auth-routes, chzzk-auth, hero-morph, page-transition, css-keyframes, json, json-body, api-client (정본은 vitest.config.ts thresholds). 미달하면 exit 1
pnpm games:seed <input.json>   # 게임 JSON → migrations/0008 형태 시드 SQL (기존 파일은 --force 없이는 거부. 원격 적용 후엔 다시 만들지 않는다)
pnpm -s games:export [--local|--remote] [--hidden] [--out file]  # D1 → games.json 형식 백업. stdout으로 받을 땐 `-s`(pnpm 배너 제거) 또는 --out. --remote는 사람이 실행. 기본은 보이는 게임만, --hidden은 숨긴 게임만(전체 백업은 두 번). 변경 기록은 담지 않는다
pnpm -s games:edit --find <키워드> | --search <검색어> | <ops.json> [--apply]  # 운영 D1 게임 기록 고치기. 절차는 games-edit 스킬
pnpm preview        # Workers 런타임으로 로컬 미리보기
pnpm shots [url] [경로...]  # 페이지 × 라이트/다크 × 1280/390 전체 스크린샷 → screenshots/index.html
pnpm run deploy     # 수동 배포. `pnpm deploy`는 pnpm 예약어라 동작 안 함
pnpm wrangler tail  # 운영 Worker 실시간 로그. 일반 터미널에서 실행한다(TTY가 아닌 셸·Claude Code `!`에서는 출력이 잡히지 않는다)
```

PR마다 GitHub Actions `ci.yml`이 `pnpm lint --max-warnings 0` → `pnpm typecheck`(`next typegen && tsc --noEmit`) → `pnpm test:coverage` → `pnpm build:worker`를 돌린다. main에 push하면 `deploy.yml`이 같은 `ci.yml`을 먼저 부르고, 통과하면 `pnpm run deploy`를 실행한다(배포는 `deploy-production` 그룹으로 하나씩). 검사 하나라도 깨지면 배포되지 않으니 main에 바로 푸시할 때도 이 넷을 로컬에서 먼저 돌린다. 로컬 tsc가 지운 라우트(`.next/dev/types`)를 찾으면 `.next/dev/types`를 지우고 다시 돌린다.

## 구조

```
src/app/
  layout.tsx            세션 조회(D1) + Nav + 테마 초기화 스크립트 + 기본 메타데이터(siteDefaults). force-dynamic
  sitemap.ts, robots.ts 검색엔진용. 페이지 목록은 src/lib/seo.ts SITE_PAGES
  page.tsx              홈(/) — 히어로(상반신 크롭), 최근 탐험 띠(D1 games, lib/games/home.ts), 더 둘러보기 카드·채널 링크
  about/                소개 — 고정 그림판 + 챕터 도감(Dossier: 소개·프로필·취향·팬네임·찾아가기(채널), 목록은 chapters.ts), 탐험 기록 숫자
  games/                플레이한 게임. page=서버(D1 읽기·관리자 판별), GamesBoard·GameCard·DiaryList·GameDetailDialog·Poster·useChapterSpy(공개) +
                        관리자 UI: AdminBar·GameEditForm·CategoryPicker·AddGameFlow·DialogFrame·Toast, adminApi(fetch 래퍼)·drafts(localStorage)
  awards/               2026 야시로 게임 어워즈(이상형 월드컵, 관리자 전용: 비관리자 404·noindex, sitemap·SITE_PAGES·홈 카드 미등록. Nav "어워즈" 링크는 관리자에게만 보인다: layout이 `awardsNavVisible`로 정해 `Nav showAwards`로 넘긴다. 화면은 골든글로브 시상식 패러디 이벤트 페이지: 페이지가 `data-stage="gala"`를 그리면 globals.css `:root:has([data-stage="gala"])`가 사이트 토큰을 `--gala-*`(밤 무대 + 금박)로 덮어 Nav·푸터까지 테마와 무관하게 어둡고 테마 버튼은 숨는다. 설정 화면은 시상식 입장 화면(`SetupScreen`, Nav 아래 화면 전체): 3D 무대에 조명이 하나씩 켜지고 → 제목 → 자막 세 줄(`labels.ts ceremonyLines`, 올해 후보 수) → 「심사 시작하기」 버튼 하나. 부문·대진·3·4위전은 기본값이고 「심사 방식 바꾸기」로 여는 심사위원 위촉장 모달(`<dialog>`)에서 바꾼다. 두 번째 방문부터는 짧은 연출(`localStorage['yasiro-awards-intro-seen']`), 동작 줄이기면 완성 장면, 연출 중 아무 곳이나 누르거나 키를 누르면 건너뛴다. 시작하면 대진 요청과 출발 연출(`AwardsApp LAUNCH_MS` 1.5초, 카메라가 고리 안으로 → 암전)을 함께 기다리고 대결 화면은 암전에서 밝아진다. 무대는 Three.js 시상식장(`AwardsStage` → 동적 import `stage/createStage.ts`). 근거·콘티는 `work/research/awards-grandeur-report.md`(2026-11-26 조사, git 밖). 은유는 "심사위원석으로 들어서는 밤"(객석 원형 테이블 → oxblood 카펫·계단 → 단상 → 트로피), 팔레트는 검정·oxblood·금. 트로피는 지구본만(필름 띠 없음, 사용자 결정) + 꼭대기 꿀붕이 금속 메달(KkulMark 경로 압출, 최종본은 Blender 수작업 예정). 큐는 `STAGE_TIMELINES`(full 약 17초: 객석 조명이 켜진 볼룸 위를 나는 디즈니식 비행(`FLIGHT`, 0~4.2초) → 카펫 입구에 눈높이로 착지해 1인칭으로 레드카펫을 걷기(~9.2초, 걸음 흔들림) → ★7.0 객석 조명 암전 → 서치라이트 → ★10.6 임팩트(충격파·헤일로·짧은 꽃가루·돌리 줌) → 제목 12.9 → ★15.6 호명)와 `SetupScreen CUES`(제목 12.9, 자막 13.9/15.4, 버튼 16.8)가 맞물린다. 자막은 두 줄(셋째 줄은 사용자 요청으로 삭제). 무대 시계 출발 전 준비 박자에는 영문 라벨과 금빛 진행선을 보인다. 제목은 연출 중 레터박스 아래, 끝나면 함께 올라간다(낮은 화면에서 가려지지 않게). 객석 하객은 사람 비율 실루엣(InstancedMesh, 옷 색은 instanceColor), 인스턴스는 `computeBoundingSphere`를 불러야 잘리지 않는다. 시간값은 근거 없는 판단 시작값. 밝기는 `BRIGHTNESS` 한곳(노출·bloom 상한을 올리지 않는다, 사용자 눈부심 지적). 시계는 포스터를 다 읽고 `compileAsync`·예열한 뒤 출발, 데스크톱 MSAA 4. 처음부터 보이는 조작 버튼(연출 중 건너뛰기, 끝나면 움직임 멈춤·재생, WCAG 2.2.2)과 진행 중 동작 줄이기 전환을 받는다. 벽 포스터 올리기·시차는 마우스만. 대결 첫 판 앞에 부문 카드(`labels.ts CATEGORY_CARD`, 1.6초). 3D 배경은 불투명 검정(--gala-bg를 넣으면 OutputPass에서 갈색으로 뜬다). 3D 모델은 CC0 무료 에셋을 `gltf-transform`(개발 의존성)으로 압축해 `public/stage/v1/`에 둔다(1년 immutable 캐시, 고치면 v2): 샹들리에·의자는 Poly Haven(Chandelier_01, painted_wooden_chair_02), 하객은 Quaternius Universal Base Characters(남녀 Superhero, 머리카락 2종) + Universal Animation Library의 앉기 동작 2개(`sit-anims.glb`). 원본 zip·가공 스크립트는 git 밖 `work/assets/`·`work/build-guests.mjs`. 하객은 무대에서 앉기 동작의 한 순간으로 굳혀(뼈대 변형을 정점에 반영, 옷/피부는 주된 뼈 이름으로 가름, 머리카락은 머리 뼈 이동만큼 옮김) 자세 갈래마다 InstancedMesh로 그린다. 테이블보는 코드(LatheGeometry 주름). 부문 선택과 무관, 그림 고르기·텍스처 주소·자르기는 `orbit.ts`. 밝기는 낮게 유지한다(사용자가 눈부심을 지적). WebGL을 못 쓰면 CSS 궤도 `NomineeOrbit`로 대신). 치지직 포스터는 CORS가 없어 `GET /api/awards/poster?u=`(`handlePoster`: 어워즈 권한·치지직 포스터 주소·image/*·5MB 이하만, 리다이렉트 안 따라감)로 같은 출처 중계하고, Steam·유튜브 썸네일은 CORS가 열려 있어 그대로 쓴다, 대결은 마우스·포커스·꾹 누르기를 따라 기우는 스포트라이트(CSS `:has`), 결과는 금박 봉투를 눌러 여는 발표 + 금가루(`GoldConfetti`, canvas 2D), 순위는 1~3위 시상대. 영문 부문 상 이름은 `labels.ts DIVISION_AWARD`). 대진은 서버가 뽑아 서명 토큰(24시간)으로 건네고, 끝까지 마친 판만 제출받아 부문별로 집계한다. 진행 중인 대진(token + picks)은 `localStorage['yasiro-awards-run']`에 저장해 새로고침해도 이어 하고(token payload와 대조, `resume.ts restoreRun`), 대결 카드는 0.6초 꾹 눌러야 고른다(새 판 뒤 0.4초 잠금, `hold.ts`)(순위는 별도 페이지 `/awards/rankings?division=`, 같은 관리자 게이트·noindex). 대진·진행·결과·검증은 src/lib/awards(순수, rng 주입). 공개로 바꾸면(`AWARDS_PUBLIC`) Nav 링크는 누구에게나 보이고, SITE_PAGES·더 둘러보기는 따로 넣는다
  auth/{login,callback,logout}/route.ts   치지직 OAuth (login?next=<경로>는 oauth_next 쿠키로 복귀). 로직은 src/lib/auth-routes.ts
  api/games/            관리자 API (route·[id]·[id]/hidden·[id]/changes·categories·youtube). 핸들러는 얇게, 로직은 src/lib/games/api.ts
  api/awards/           어워즈 API (draw·submit·rankings·poster(3D 무대용 치지직 포스터 중계), 관리자 전용: AWARDS_PUBLIC). 핸들러는 얇게, 로직은 src/lib/awards/api.ts(repo·token·keys·limit·rankings)
src/components/         Nav, SkipLink, ClearStamp, HeroFigure·NavigatedFlag(페이지 전환) (공유)
scripts/games-{seed,export,edit}.ts   pnpm games:seed / games:export / games:edit 진입점 (얇게. 로직은 src/lib/games/seed.ts, ops.ts)
src/lib/                순수 로직 + *.test.ts (session, auth-routes, http, json(isRecord 객체 판별), json-body(요청 본문 읽기·크기 상한, games·awards 공용), api-client(클라이언트 fetch 래퍼 callApi, fetch 주입), chzzk-auth, page-transition·hero-morph(페이지 전환), css-keyframes(모듈 keyframe 검사), chzzk-category(검색·slugify만), games/{schema,query,labels,rows,repo,admin,diff,patch,client,api,seed,youtube-meta,home,media,timecode,played}, awards/{entries,options,orbit,draw,tournament,flow,labels,verify,media,rng,keys,token,limit,repo,rankings,client,api,resume,hold})
migrations/             D1 마이그레이션 (wrangler 관리)
_design/                원본 디자인 핸드오프 (gitignored)
```

## 검색·공유 (SEO)

- 정본은 `src/lib/seo.ts`: 홈 제목·설명(야시로·치지직·버튜버·버츄얼, '비공식' 명시), `pageMetadata`, `SITE_PAGES`(sitemap), 홈 JSON-LD(`siteJsonLd`: WebSite + 야시로 Person, 공식 채널 sameAs).
- 공개 페이지는 `export const metadata = pageMetadata({ path, title, description })`로 쓴다. 하위 metadata는 openGraph·twitter를 통째로 덮어써서(얕은 병합) 제목만 두면 공유 미리보기가 레이아웃 값으로 남는다. 제목 뒤 " | 야시로 팬사이트"는 레이아웃 template이 붙인다.
- 새 페이지는 `SITE_PAGES`에도 넣는다. 공유 이미지는 `public/og.png`(1200×630, 미리보기 호환을 위해 PNG 유지). 캐릭터 그림은 `ArtImage`(`<picture>` AVIF → WebP, `public/art/v1/{이름}-{폭}.{avif,webp}`, 표시 폭에 맞춰 미리 변환)로 넣는다. `next/image`는 `unoptimized`라 원본 PNG를 그대로 보내므로 쓰지 않는다. `/art/*`는 `public/_headers`로 1년 immutable 캐시라 그림을 고치면 `v2` 폴더로 올린다.
- 검색엔진 소유 확인: 네이버 서치어드바이저는 `siteDefaults`의 `other['naver-site-verification']`, 구글 서치 콘솔은 메타 태그 없이 등록돼 있다. sitemap은 두 곳에 `https://yasiro.stream/sitemap.xml`로 제출한다.

## 페이지 규칙

- 새 페이지는 `src/app/<name>/page.tsx` + `page.module.css`로 만든다.
- 홈(`/`)은 히어로(상자 없이 크게 세운 일러스트, 아래는 바탕에 스며드는 mask) → FIELD LOG 최근 탐험(큰 썸네일 1장 + 기록 줄 3개) → ARCHIVE 더 둘러보기(꿀붕이 카드 2장, 게임 카드에 기록 수 기입란) → 푸터(채널 링크) 순서다. 최근 탐험은 `buildHomeData`(마지막 플레이 최신순 = /games 최근 플레이순, 2026-11 첫 플레이순에서 바꿈. 날짜는 마지막 플레이, 다시보기 있는 게임만, 같은 최근 영상은 하나만, 번호는 /games와 같음)가 고른다. 큰 썸네일(`featured`)은 그중 제목이 그 게임 하나만 가리키는 다시보기(`namedYoutubeVod(…, { latest: true })`, 아래 /games 현장 사진 규칙)가 있는 가장 최근 게임이고, 그런 영상 중 가장 최근 것을 썸네일·링크로 쓴다. 그래서 더 최근 게임이 기록 줄(`rows`, 가장 최근 영상 `lastYoutubeVod` 링크)로 먼저 올 수 있다. 대표 칸이 없거나 D1을 못 읽으면(`pnpm dev`) 섹션을 숨긴다. 썸네일은 유튜브 `hqdefault`를 `<img>`로 16:9에 잘라 쓰고, 위에 칩을 얹지 않는다.
- /about은 왼쪽 고정 그림판(전신 + 키 눈금자 + 장비 콜아웃, 스크롤하면 얼굴 1.9배에서 전신으로 물러남)과 오른쪽 챕터다. 2단은 폭 1024px 이상·높이 641px 이상일 때만이고(CSS 미디어쿼리와 `Dossier.tsx` `DESKTOP`이 같은 조건), 그 밖에서는 소개 → 그림판 → 챕터 한 줄 흐름이다. 도장은 이름 글자 끝에 붙인다. 챕터는 '현장 기록지' 한 가지 문법(위 굵은 선 1개 + 행 사이 가는 선 + 작은 라벨 위 큰 값)으로 맞추고 상자·칩·타일을 쓰지 않는다. 콜아웃 순차 연출은 페이지에서 한 번만 돈다(되감은 뒤에는 즉시 표시). 취향은 오려 붙인 스티커 그림(`TasteSticker`, 흰 칼선 + 기울기)을, 팬네임은 꿀붕이 그림 스티커를 쓴다.
- 홈에는 야시로 얼굴을 히어로 그림과 대표 썸네일 1장으로만 둔다(반복하면 소재를 돌려 쓴 페이지로 읽힌다). 키는 /about 키 측정판이 맡는다.
- 공유 레이어는 `globals.css`의 토큰·keyframe과 `src/components/`뿐. `globals.css`에 유틸리티 클래스를 넣지 않는다.
- 새 페이지를 추가하면 `Nav.tsx`의 `LINKS`(데스크톱·모바일 공용), '더 둘러보기' 카드(푸터는 채널 링크뿐이라 `SiteFooter`·`src/lib/channels.ts`가 맡고 페이지 목록은 없다), `src/lib/seo.ts`의 `SITE_PAGES`에 넣는다.
- 없앤 페이지는 `next.config.ts` `redirects`로 홈에 308을 건다(`/to-yasiro` 방명록, 2026-11 제거).
- 디자인 변경은 `pnpm shots`로 찍은 스크린샷을 직접 보고 확인한 뒤 사용자에게 보여 준다. 축소된 브라우저 화면만 보고 판단하지 않는다.
- 검증·계산 로직은 `src/lib/`에 순수 함수로 빼고 테스트를 붙인다. 컴포넌트와 Route Handler는 얇게 유지한다.

## 스타일

- hover·transition·animation·blend-mode 같은 효과는 CSS Module에, layout·spacing·color 같은 정적 스타일은 inline style로 쓴다.
- 토큰은 `globals.css`가 정본이다(색·type `--fs-*`·간격 `--space-*`·shadow·z-index·motion). 다크 값은 `[data-theme="dark"]`에서 덮어쓴다. `prefers-reduced-motion`은 globals에서 일괄 처리한다.
- keyframe: globals에는 페이지 전환용 `vt*` keyframe만 있다. 모듈 애니메이션은 모듈 안에 `@keyframes`를 둔다. **CSS Module 안에서 globals의 keyframe 이름을 쓰지 않는다**: Modules가 `animation` 이름을 해시해(`page-module__…__fadeUp`) 없는 키프레임을 가리키고, 애니메이션이 조용히 재생되지 않는다. 모듈 안에 `@keyframes`를 두거나(홈 `heroIn`, /games `countUp`·`stampIn`) globals에 클래스 없이 둘 수 있는 곳(전환 pseudo)에서만 쓴다. 같은 이유로 `view-transition-name`도 모듈에 쓰지 않는다(아래 '페이지 전환'). `src/lib/css-keyframes.test.ts`가 모든 `*.module.css`에서 참조했지만 정의하지 않은 keyframe을 잡는다
- 폰트는 `layout.tsx`의 Google Fonts `<link>` 한 줄로 로드한다. 현재 로드되는 폰트는 Gaegu, Fredoka(500–700), Noto Sans KR, Jua, Cinzel(600·700), Nanum Myeongjo(800). 한국어 subset 문제 때문에 `next/font`는 쓰지 않는다. 새 폰트는 같은 URL에 추가하고, URL에 없는 폰트를 코드에 쓰지 않는다(조용히 폴백된다).
  - Jua(`var(--font-display)`): 제목·로고·큰 값 / Noto Sans KR: 본문·UI / Fredoka(`var(--font-num)`): 영문 라벨과 숫자(한글 글리프 없음)
  - Jua는 굵기가 400 하나뿐이다. `--font-display`를 쓰는 곳은 `font-weight: 400`으로 두고 600·700을 주지 않는다(가짜 볼드가 합성된다). 2026-11 Noto Serif KR에서 바꿨다
  - /awards 전용: 시상식 제목·자막은 Nanum Myeongjo 800(2026-11 사용자 결정, 큰 제목에는 획 대비가 있는 명조가 의전에 맞다), 위쪽 영문 줄은 Cinzel. 명조의 가는 획이 금박 그라디언트·그림자에 묻히지 않게 금박 끝단을 밝게, 그림자는 옅게 둔다
  - Gaegu: /about 장비 콜아웃만. `letter-spacing: 0`, 18px 이상
  - Cinzel: /awards 영문 의전 라벨(`CEREMONY_EYEBROW`, `JUDGE_SEAT_LABEL`, `CATEGORY_CARD`, `NOMINEES`, `AND THE WINNER IS…`, `RANKING`, `DIVISION_AWARD`, VS·순위 번호)만. 대문자 세리프, 한글 글리프 없음
- 컨셉은 "호기심 많은 탐험가". 탐험가 느낌은 캐릭터 장비(고글·쌍안경·지도 두루마리·파우치·부츠)와 현장 기록(기록 카드, 콜아웃, 눈금자, 스탬프, 테이프)으로 낸다. 지도 모티프(점선 경로·웨이포인트)는 지금 쓰지 않는다(2026-11 홈 개편 때 "다음 목적지" 경로를 뺐다). 다시 쓰면 사이트 전체에서 한 곳만. 장식은 화면당 스탬프 1개, 테이프 4개 이하.
- 색: 작은 앰버 텍스트는 `--accent-text`, 주 버튼은 `--btn-primary-*`, `--accent`·`--brass`·`--eye`는 텍스트에 쓰지 않는다(AA 미달).
- 공유 컴포넌트(`src/components/`): Button, SectionLabel, StitchRule, TapeStrip, RoundStamp, HeightRuler, ChannelGlyph, KkulMark(Nav 로고·파비콘과 같은 꿀붕이 그림, 컬러), PawMark(꿀붕이 발자국 장식), icons. 장식 SVG는 `aria-hidden`.
- 고정 버튼은 페이지당 1개. Nav의 "치지직" pill은 채널 링크다. 방송 상태를 조회하지 않으므로 LIVE로 표기하지 않는다.
- 캐릭터·꿀붕이 PNG는 투명 배경이라 블렌드 없이 올린다. 캐릭터 패널은 `--tile`(라이트 `#EAE0D0`, 다크 `--surface`).
- 강조 배지·구분선의 작은 사각 도트는 `borderRadius: 1`이 의도된 값이다.
- 원형 도장은 사이트 전체 1개(`RoundStamp`, /about)가 원칙이다. 예외: 게임 정복 도장(`ClearStamp`, /games 카드·상세의 `clear` 게임). 정복한 게임마다 찍히는 데이터 표시라 개수 제한을 두지 않는다. 모양은 RoundStamp와 같은 계열의 원형 탐험 도장(이중 링, 위 호 `EXPEDITION CLEAR`, 가운데 `정복`, 아래 호 `★ NO.{번호} ★`)이고, 바탕 원판 없이 잉크만 굵게 찍고, SVG 필터로 잉크 번짐·빠짐을 낸다(필터 id는 도장마다 `useId`). 크기는 어디서나 포스터 폭의 36%(표본 카드 위쪽 자리는 32%). 색은 `--stamp`(라이트·다크 같은 인주색 #D2452E, 포스터 그림 위라 테마와 무관). 빨간 포스터에서 덜 읽히더라도 종이색 테두리·바탕은 스티커처럼 지저분해 보여 넣지 않는다.

## 페이지 전환

사이트 안 링크(`PAGE_TRANSITION` = `['page']` 타입, Nav·Button·홈 카드)로 옮길 때만 움직인다. 뒤로·앞으로 가기·필터·첫 로드는 바로 바뀐다. 정본은 `template.tsx`(본문 `page-out`/`page-in`), `globals.css` '페이지 전환' 절, `src/lib/{page-transition,hero-morph}.ts`(100% 커버리지 강제).

- **캐릭터 이동(홈 히어로 ↔ /about 그림판)**: `HeroFigure side="home|about"`가 상자(`data-hero-figure`, 안에 `<img>`)에 같은 이름 `yasiro-figure`를 붙인다. 짝이 지어지면 `onShare` → `runHeroMorph`가 UA 모핑을 걷어 내고, 두 원화(yasiro1·yasiro4)가 얼굴 위치·크기까지 같은 구도인 점을 이용해 이미지 상자끼리 맞춰 두 그림을 함께 날린다(0.72초). 새 그림을 다 덮은 뒤 옛 그림을 지운다(동시에 반투명하면 바탕이 비친다). 교차 시점은 도착 쪽별 `HERO_MORPH.opacity`(홈으로 갈 때는 일찍: 홈 히어로는 아래가 바탕에 스며드는 그림이라 늦게 바꾸면 끝에 한꺼번에 흐려진다). 짝이 지어지면 새 페이지의 모든 등장(`::view-transition-new`)을 `enterShift`(60ms)만큼 늦춘다. 원화를 바꾸면 이 전제(같은 구도)를 다시 확인한다. 두 그림은 `decoding="sync"`(모션 줄이기에서 전환이 곧바로 끝나면 비동기 디코딩 동안 1~3프레임 비었다).
- **전환 레이어**: 본문 덩어리에서 떼어 따로 움직일 요소에 `{...vtTarget(name, layer, step)}`를 붙인다. `globals.css`의 `html:active-view-transition-type(page) [data-vt]`가 이동 중에만 `view-transition-name: var(--vt)`·`view-transition-class: var(--vt-class)`를 붙인다(CSS Modules가 이름을 해시하지 않게 변수로 넘긴다). 레이어: `rise`(제목·문구가 step 0~3 순서로 60ms 간격 등장), `band`(/about 띠: 들어올 때 쓸며 그려지고 떠날 때는 본문과 함께 흐려짐. 접히며 사라지게 했더니 다음 페이지 위에 띠만 남아 거슬렸다), `label`(눈금자·장비 라벨), `stamp`(도장: 도착 즈음 찍힘). **떼어 낸 층의 퇴장은 `page-out`(`--dur-fast`)보다 길게 두지 않는다.** 떼어 낸 요소가 다른 요소 밖으로 삐져나오면(띠는 무대 위로 10%) 스냅샷에는 조상의 자르기가 빠지므로 자르는 틀로 감싼다(`.bandClip`).
- **층(z-index)**: 바탕(root) < 띠 < 본문·`rise` < 캐릭터 < 라벨·도장 < Nav(`site-nav`) < Nav 표시(`nav-mark`, 현재 메뉴 아래 마름모가 새 메뉴로 미끄러짐). 본문 스냅샷이 투명해야 띠가 비치므로 **페이지 최상위 요소에 바탕색을 칠하지 않는다**(바탕은 body).
- 홈 히어로의 첫 로드 진입(`heroIn`)은 `html:not([data-navigated])`에서만 돈다(`NavigatedFlag`가 사이트 안 첫 이동 때 붙임). 이동해 들어올 때는 전환 레이어가 등장을 맡는다.
- `layout.tsx` `<html data-scroll-behavior="smooth">`: globals의 smooth 스크롤은 앵커용이고, 페이지를 옮길 때는 Next가 끄고 바로 맨 위로 간다(없으면 전환 중 화면이 미끄러지고 캐릭터 착지 자리가 어긋난다).
- 모션 줄이기: 전환 애니메이션을 모두 끄고 `::view-transition-old(*)`를 숨긴다(전환이 몇 프레임 유지되는 동안 옛·새 화면이 겹쳐 보였다).
- 확인: 깜빡임은 1프레임짜리라 축소 스크린샷·25fps 녹화로는 놓친다. CDP `Page.startScreencast`로 렌더된 프레임을 모두 받아 마지막 프레임과의 차이가 0으로 단조 수렴하는지 본다(되돌아가면 번쩍임). 부하가 높으면(load 10↑) 프레임이 빠져 끝에서 튄 것처럼 보이니 다시 찍는다.

## 테마

`localStorage['yasiro-theme']` → `<html data-theme>`. `layout.tsx`의 inline script가 hydration 전에 설정한다. 테마별 아이콘은 두 개를 모두 렌더링하고 `:global([data-theme="dark"])` CSS로 전환한다. React state로 바꾸면 hydration 불일치가 난다.

## 모바일 드롭다운

외부 클릭 닫기는 `document.addEventListener('click')`로 구현하지 않는다. 모바일 tap에서 React onClick보다 먼저 실행돼 열리자마자 닫히는 버그가 있었다(#26). 메뉴가 열렸을 때만 투명 backdrop(`position: fixed; inset: 0`, 메뉴보다 z-index 한 단계 아래)을 렌더링하고 `onClick`으로 닫는다.

## Cloudflare / D1

- Worker `yasiro-contest`(레포 개명과 무관하게 그대로 둔다. 바꾸면 새 Worker가 생겨 secret·도메인을 옮겨야 한다) · Account `fc7323801136ae087db0b88ab4d07b53` · 도메인 `yasiro.stream`, `www.yasiro.stream`
- D1 `yasiro-db` (`69020930-766c-423b-8cbd-85d62eee3e02`) → `env.DB`. 타입은 `src/types/cloudflare.d.ts`
- 접근: `const { env } = await getCloudflareContext({ async: true })` (`@opennextjs/cloudflare`)
- 테이블: `auth_sessions`(0009, 아래 '세션'), `games`, `game_vods`, `game_changes`(0007, 시드 0008), `award_runs`·`award_tally`·`award_limits`(0013, 아래 '어워즈 집계'), `game_vods.highlight_start`(0012, 다시보기별 하이라이트 시작 초, NULL = 없음), `games.last_played`(0014, 마지막 플레이의 정본, NULL = 첫 플레이로 대신). 레거시 `guestbook`(0002, 방명록 제거 #38)·`sessions`(0001)는 0011로 DROP했다(2026-11-20 원격 적용, 방명록 1건은 로컬 백업 `~/Documents/project/yasiro-ops/guestbook-backup-20261120.sql`). 스키마 변경은 `d1-migration` 스킬로 한다.
- Worker secret: `CHZZK_CLIENT_ID`, `CHZZK_CLIENT_SECRET`, `CHZZK_REDIRECT_URI`, `ADMIN_CHANNEL_IDS`(쉼표 구분 관리자 채널 ID, 아래 '관리자'), `AWARDS_SECRET`(어워즈 대진 서명·제출 제한 IP 해시. `openssl rand -hex 32`. 바꾸면 발급된 대진 토큰이 모두 무효가 된다) (`printf 'v' | pnpm wrangler secret put KEY`). Route Handler에서 `process.env`로 읽는다.
- GitHub secret: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. 자격증명 원본은 1Password "Cloudflare R2 - yasiro-contest".
- wrangler 4.x는 Node 22 이상이 필요하다.

### Route Handler

- `NextResponse`와 `export const runtime = "edge"`를 쓰지 않는다. opennextjs 번들링에서 `Cannot read properties of undefined (reading 'default')` 에러가 난다. 네이티브 `Request`/`Response`를 쓴다.
- 인증이 필요한 API는 `src/lib/session.ts`의 `readSessionId(cookie)` → `findSession(db, id, now)`(해시로 `auth_sessions` 조회, `expires_at > now`)를 쓴다. games는 `channel_name`을 읽지 않는 `findSessionChannel`. 쓰기는 `checkSameOrigin`(`src/lib/http.ts`)을 먼저 본다. `src/lib/games/api.ts`의 쓰기 핸들러가 기준 패턴이다.
- 네이티브 `fetch`·`ctx.waitUntil`을 deps로 넘길 때는 `(i, init) => fetch(i, init)`처럼 감싼다. `deps.fetch()`로 부르면 Workers에서 Illegal invocation이 난다.
- `cookies()`를 쓰기 때문에 `layout.tsx`의 `export const dynamic = 'force-dynamic'`을 지우지 않는다.

### 세션

- 정본은 `src/lib/session.ts`: 세션 ID(32바이트 hex 64자), 쿠키 `__Host-session`(`Path=/; Secure; HttpOnly; SameSite=Lax`), 절대 수명 `SESSION_TTL_SECONDS`(7일. 쿠키 Max-Age와 DB `expires_at`이 같은 값, 치지직 토큰 TTL과 무관). DB에는 `SHA-256(세션 ID)`(`auth_sessions.id_hash`)만 저장하고 원본 ID는 DB·로그에 남기지 않는다.
- 로그인·로그아웃 로직은 `src/lib/auth-routes.ts`(Route Handler는 env·ctx 주입만). callback은 토큰 교환 → 사용자 조회 → 치지직 access·refresh 토큰을 `ctx.waitUntil`로 바로 폐기(best-effort, 실패해도 로그인 진행) → 기존 세션 행 삭제·만료 행 정리 → 새 세션. 치지직 토큰은 어디에도 저장하지 않는다. 로그에는 상태 코드·에러 이름만 남긴다.
- callback은 성공·실패 모두 `oauth_state`·`oauth_next`를 지운다. `CHZZK_*`가 없으면 login·callback은 500이다.
- 레거시 `session_id` 쿠키는 읽지 않는다. 로그인·로그아웃 때 `session_id` 쿠키만 지운다. 레거시 `sessions` 테이블은 0011로 DROP했다.
- **배포 순서(#37, 0009·0010 적용 완료. 기록용)**: `migrations list yasiro-db --remote`로 대기 목록이 0009(`auth_sessions` 추가)·0010(레거시 `sessions` 행 삭제) 둘뿐인지 확인 → `migrations apply --remote` → 머지한다. 0010 적용 시점에 기존 로그인은 모두 한 번 로그아웃된다.
  - 배포 확인 뒤 `SELECT count(*) FROM sessions`가 0인지 본다. 적용부터 배포 완료까지는 옛 코드가 돌고 있어 그 사이 로그인하면 토큰이 든 레거시 행이 다시 생긴다. 0이 아니면 `DELETE FROM sessions`를 한 번 더 실행한다(사람이 실행).
  - 0010은 DB에서 행만 지운다. 치지직 쪽 토큰 폐기가 아니라서 이미 복사된 토큰(옛 D1 export·백업 포함)은 만료될 때까지 유효하다. 기존 행의 토큰을 폐기할지, 만료를 기다릴지는 사람이 정한다(폐기하려면 0010 적용 전에 원격 D1에서 읽어야 한다). 옛 백업 파일은 지운다.
  - 순서가 바뀌어 0009 적용 전에 배포되면 `/auth/callback`이 500("로그인을 마치지 못했습니다", 로그 `session store error: Error`)을 낸다. 로그아웃은 쿠키만 지우고 302, 다른 페이지는 비로그인으로 정상 동작해서 장애가 로그인에서만 드러난다.
  - 롤백: 0009·0010은 테이블을 추가하고 행만 지우므로 그것만으로는 롤백을 막지 않는다. 그러나 0011(`sessions`·`guestbook` DROP) 적용 뒤에 #37 이전 코드로 롤백하면 옛 callback이 `sessions`에 INSERT하다 500이 나고, #38 이전 코드로 롤백하면 방명록이 `guestbook`을 읽다 실패한다. 그때는 해당 테이블을 다시 만드는 새 마이그레이션(0001·0002와 같은 스키마)을 먼저 적용한다. 기존 0001·0002 파일은 고치지 않는다.
- 로컬에서 로그인 상태 만들기(OAuth 불필요)는 `verify` 스킬의 '로그인 세션' 절차를 따른다. 확인 브라우저는 Chrome(localhost는 secure context라 `Secure`·`__Host-` 쿠키가 동작한다. Safari는 localhost의 Secure 쿠키를 다르게 다룰 수 있다).

## 치지직

- 야시로 채널 ID `d6e680f5b17eba0b078f978dd722c0f3`. 라이브 주소는 `https://chzzk.naver.com/live/<id>`
- 치지직 Open API 레퍼런스는 `chzzk` MCP 서버(user 범위, `~/bin/chzzk-mcp-server`)로 조회한다.

## 하네스 (`.claude/`)

- 스킬: `new-entry`(새 페이지), `verify`(PR 전 검증), `d1-migration`(스키마 변경), `games-edit`(운영 /games 기록 추가·수정. update patch에 `lastPlayed`, 원격 0014 적용 전에는 쓰지 않는다), `highlight-pick`(/awards 하이라이트 시작 시각 고르기: 치지직 클립·받아쓰기로 후보 → 결과 페이지 → 확정 값을 `games-edit`용 ops로. 도구는 스킬의 `scripts/`, 데이터·오디오·모델은 git이 무시하는 `work/`)
- hook: 기존 `migrations/*.sql` 수정 차단, Route Handler의 `NextResponse`·`runtime` 선언 감지
- 권한: 테스트·lint·로컬 D1은 허용. 배포, 원격 D1, secret, `git push`는 매번 확인

## 워크플로우

- 기능 추가·로직 변경: 브랜치 → worktree → TDD → PR → 머지. worktree의 `node_modules`를 메인 체크아웃으로 심볼릭 링크하면 `pnpm build:worker`(Turbopack)가 "points out of the filesystem root"로 실패한다. worktree에서는 `pnpm install --offline --frozen-lockfile`로 따로 설치한다.
- 문구·URL처럼 한 파일 안에서 끝나는 단순 수정: main에 바로 커밋·푸시.
- PR 생성과 push 전에 `gh auth switch --user chnu-kim`을 실행한다.

## 게임 목록 (/games)

- 정본은 D1이다: `games`(게임 한 줄, `hidden`·`version`), `game_vods`(다시보기), `game_changes`(변경 기록). 기존 `src/data/games.json`과 `games:add` CLI는 없어졌다. 338개 시드는 `migrations/0008_games_seed.sql`(결정적 출력, 직접 고치지 않는다). 시드는 `INSERT OR IGNORE`라 다시 실행해도 기존 행을 덮어쓰지 않고, 다시보기는 그 게임의 `import-<id>` 기록이 없을 때만 들어간다. OR IGNORE는 CHECK 위반도 건너뛰므로 `seed-data.test.ts`가 개수(338·306)와 export의 sha256(이전 games.json)을 고정한다. 백업은 `pnpm -s games:export`(숨긴 게임은 `--hidden`으로 따로, 변경 기록은 백업되지 않음).
- 쓰기는 입력 원문이 아니라 검증기가 본 값을 저장한다(`repo.ts normalizedCandidate`: 이름·원제·categoryId·다시보기 제목 trim, 다시보기 URL은 `https://www.youtube.com/watch?v=<id>`로). 비교(`diffGames`)도 그 값으로 하므로 공백만 다른 수정은 "변화 없음"이다.
- **배포 순서**: `deploy.yml`은 마이그레이션을 적용하지 않는다. games 테이블을 읽는 코드를 main에 올리기 전에 사람이 `pnpm wrangler d1 migrations list yasiro-db --remote`로 대기 목록을 보고(0006 `DROP TABLE whack_scores, clicks`가 함께 실행되는지 확인, 필요하면 `wrangler d1 export`로 먼저 백업) `migrations apply --remote` → `SELECT count(*) FROM games`가 338인지 확인 → `ADMIN_CHANNEL_IDS` secret 확인 → 머지한다. 순서가 바뀌면 배포부터 적용 전까지 /games가 "기록을 불러오지 못했어요"를 보인다.
- `page.tsx`가 `loadGamesPageData`로 D1을 읽는다. D1이 없거나(`pnpm dev`) 조회가 실패하면 "기록을 불러오지 못했어요"를 보인다. 확인은 `pnpm build:worker` → `pnpm preview`(로컬 D1: `pnpm wrangler d1 migrations apply yasiro-db --local`)로 한다.
- 검증 규칙의 정본은 `src/lib/games/schema.ts`(`validateGames`, `validateCandidate`)다. 서버(`repo.ts`)와 클라이언트 폼(`patch.ts validateForm`)이 같은 함수를 쓴다. 다시보기는 유튜브 링크만(치지직 다시보기는 한 달 뒤 삭제). `firstPlayed`는 `YYYY-MM-DD` 또는 `null`. 정복 여부는 `clear | fail | endless | unknown`(endless는 정복 개념이 없는 온라인 게임, unknown은 카드에 표시 없음·상세 "기록 없음"). 게임이 아닌 항목(저챗, 룰렛 자체, 갈틱폰 등)은 넣지 않는다(`seed-data.test.ts`가 시드를 검사). 종겜룰렛(데이)에서 플레이한 게임은 그 게임으로 기록한다. 다시보기 `highlightStart`(하이라이트 시작, 초)는 0~86399 정수이고 없으면 키를 생략한다(export·시드 해시 유지). 사람용 시각("1:23:45"·"83:20"·"45"·"1h23m45s")은 `timecode.ts parseTimecode`가 초로 바꾼다(폼·`games:edit highlight` op). 하이라이트는 `vods` 필드에 속해 요약은 '하이라이트 바뀜'이다.
- 삭제는 숨김(soft delete, `hidden=1`)이다. 숨긴 게임은 방문자 목록·개수·상세·API에서 빠지고, 탐험 번호(NO.)는 숨기지 않은 게임만으로 매긴다(`indexWithHidden`, 숨긴 게임은 "—").
- 정렬: 첫 플레이 최신순(`recent`, 기본) · 최근 플레이순(`played`: `lastPlayedOf` 최신순, 같으면 첫 플레이 최신순) · 첫 플레이 오래된순 · 이름순. 기준 날짜는 `query.ts sortDate`(played면 마지막 플레이, 그 밖에는 첫 플레이) 하나로 정하고 연도 챕터·일지 월 묶음·카드와 일지 줄의 날짜·연도 목차 이름(`chapterAxisLabel`)이 모두 따른다(정렬과 묶음 축이 다르면 같은 연도 챕터가 여러 번 생긴다). 탐험 번호(NO.)는 정렬과 무관하게 첫 플레이 순서다. 연도 필터(`year`)와 기록판 숫자는 첫 플레이 기준 그대로.
- 목록 상태(q, status, year, sort, view)의 정본은 URL이다. 페이지는 없다(옛 링크의 `page`는 읽지 않고 다시 쓸 때 사라진다). `year`는 선택 상자 없이 옛 링크·초기화용으로만 남아 있다. `GamesBoard`가 `useSearchParams`로 읽고 `history.pushState/replaceState`로 쓴다. 보드를 `<Suspense>`로 감싸지 않는다(이 페이지는 `headers()`를 읽는 동적 페이지라 경계가 필요 없고, 경계가 있으면 사이트 안 이동 때 빈 fallback이 먼저 붙어 페이지 전환이 빈 화면을 찍고 보드는 전환 뒤에 툭 나타났다). 로직은 `src/lib/games`(query·labels)에만 두고 컴포넌트에 복제하지 않는다.
- 골격(2026-11 개편): /about 도감과 같은 2단(폭 1024px·높이 641px 이상). 왼쪽 320px 기록판은 Nav 아래에 고정(제목·숫자·검색·정복 여부 알약(개수는 `statusCounts`: 검색·연도 반영, 고른 상태 무시)·연도 목차), 오른쪽은 본문 맨 위 줄(표지·일지 탭 + 정렬. 결과 요약은 기록판·챕터 머리와 겹쳐 화면 낭독기용 `role="status"`로만 남김) 아래 연도 챕터. 그 밖의 화면은 기록판 → 연도 목차 가로 띠(Nav 아래에 붙음) → 챕터 한 줄 흐름. 위쪽 가로선은 Nav 점선·검색 밑줄·챕터 굵은 선만 둔다(선이 겹겹이 보이면 지저분하다는 피드백). 낮은 2단 화면(높이 860px 이하)은 소개 문장을 숨겨 기록판이 한 화면에 들어가게 한다.
- 연도 챕터: 날짜순(recent·played·old)이면 필터 결과 전체를 기준 날짜(`sortDate`) 연도별 `<section data-chapter>`("01 2026" h2 + 개수 + 아래 굵은 선, 카드 제목은 h3)으로 묶는다. 날짜 없는 게임은 "날짜 기록 없음" 한 챕터, 이름순은 나누지 않는다(목차도 없음). 챕터 끝줄이 비는 것은 그대로 둔다(챕터가 끝났다는 표시). 상태 필터가 걸리면 "· 정복 N"을 뺀다. 관리자 숨김 보기에서는 숨긴 게임도 센다. 연도 목차는 화면 가운데를 지난 챕터를 따라가고(`useChapterSpy`), 누르면 스크롤만 한다(history 없음). 로직은 `years.ts yearChapters`·`query.ts selectGames`.
- 보기: 표지(카드 격자, 칸 최소 136px)와 일지(`DiaryList`: 월 배지 NOV/2026가 스크롤을 따라오고, 한 줄에 날짜·번호·작은 표지·이름/원제·결과·다시보기 바로가기. 같은 날이 이어지면 날짜는 첫 줄에만, `years.ts diaryMonths`). 371장을 한 번에 그리므로 카드·일지 줄에 `content-visibility: auto`를 건다(모바일 CPU 4배 감속에서 첫 렌더 긴 작업이 페이지 나누기 시절과 비슷한 수준). 카드는 paint containment가 포커스 링·호버 그림자를 자르지 않도록 둘레에 8px padding + 같은 음수 margin을 둔다.
- 포스터는 `<img>`(loading lazy, 없거나 실패하면 "표본 라벨" 카드: 다시보기 썸네일을 사진처럼 붙인 "현장 사진"(`media.ts fieldPhoto`, 꼬리말 "그날 방송 장면 · MM.DD"), 쓸 영상이 없으면 꿀붕이 발자국 워터마크 + SPECIMEN NO.·이름·"포스터 미확보" 라벨. 목록 카드는 표본 카드의 정복 도장을 오른쪽 위로 옮긴다(`stampTopWhenEmpty`). 모바일은 번호만, 상세 모바일은 발자국만). `next/image`는 쓰지 않는다. `posterUrl`은 `isPosterUrl`(https, 자격 증명 없음, 호스트는 `pstatic.net`·그 하위 도메인 또는 Steam 스토어 이미지 `shared.akamai.steamstatic.com`·`cdn.cloudflare.steamstatic.com` 두 곳만. steamstatic.com의 다른 하위 도메인은 거부)만 통과한다. 포스터는 치지직 카테고리 포스터를 먼저 쓰고, 없으면 Steam 라이브러리 캡슐(2:3, 표지 3:4에 `object-fit: cover`로 잘림)을 쓴다. 표시 순서는 포스터 → 현장 사진 → 표본 라벨. `<img>`는 `referrerPolicy="no-referrer"`를 유지한다.
  - 현장 사진·홈 썸네일은 제목이 그 게임을 가리키는 가장 이른 유튜브 다시보기에서만 가져온다(`namedYoutubeVod`/`titleNamesGame`). 이름이 없는 방송("9월 4주차 … 리그 오브 레전드 했어요", "종겜룰렛데이 했어요")의 썸네일은 다른 게임 장면이라 쓰지 않는다(휴먼 벤치마크 사례). 대조는 `normalizeForMatch`(NFKC·소문자·글자와 숫자만)한 제목이 이름 또는 원제를 포함하는지(`titleNamesGame`). 정규화해서 2자 이하인 짧은 이름("오목", "삼복")은 제목 맨 앞에 있고 바로 뒤가 글자·숫자가 아닐 때만 맞는다("(1) 오목", "… 보고 광화 (狂花)", "사생이랑 …"은 안 맞는다. 알려진 한계).
  - 그림에는 제목이 그 게임 **하나만** 가리키는 영상만 쓴다(`titleNamesOnlyGame`): 이름·원제 자리를 지운 나머지에 " 하고 ", " 후열로 ", " + ", " & ", "(이)랑 "이 있으면 여러 게임 방송이라 거른다. 썸네일이 어느 게임 장면인지 제목으로는 알 수 없어서다(공중전화: "… 식음료 보고 공중전화 하고 Spelunky 2" 썸네일은 음식 사진). 대가로 썸네일이 실제로 맞던 츠바사 헤븐·너의 가짜를 사랑한다·스토커에게 납치당했습니다도 표본 라벨이 되고, "토링이랑 X"처럼 함께한 사람 이름도 걸린다. "N월 N주차 금주 신상 식음료 보고 X 했어요"는 게임이 하나라 통과한다(썸네일은 대개 X). 쉼표는 구분자가 아니다(이름 안에 있다). 앞 영상이 여러 게임 방송이면 뒤의 단독 방송을 쓴다. 사진이 안 붙는 게임은 원제(`originalTitle`)를 영상 제목 표기대로 넣으면 붙는다.
  - 포스터만 바꾸려면 `GamePatch.posterUrl`(PATCH 본문·`games:edit` update patch)을 쓴다. `null`은 포스터만 지우고 categoryId는 남긴다. `category`와 함께 오면 category를 먼저 적용하고 posterUrl이 덮어쓴다. 변경 기록 요약은 "포스터 바뀜". 관리자 폼은 치지직 카테고리 포스터(`isChzzkPosterUrl`, pstatic.net)가 아닌 포스터를 카테고리 유무와 상관없이 `GameForm.posterUrl`로 들고 있어, 다른 필드를 고치거나 카테고리를 바꾸거나 해제해도 지우지 않는다(실제 포스터 = `formPosterUrl`: 카테고리 포스터 우선, 없으면 Steam. 포스터 있는 카테고리를 고르면 카테고리 포스터가 이긴다). 해제 버튼·연결 없음 문구는 포스터가 남으면 '표본 라벨'을 붙이지 않는다. 폼 UI에는 Steam 포스터를 바꾸는 입력이 없다.
  - 코드는 치지직 카테고리가 있는 게임에 `posterUrl`만 보내는 것을 막지 않는다(카테고리 포스터를 덮어쓴다). `games:edit` 미리보기는 그런 작업에 `주의: <id>는 치지직 카테고리(…)가 있어요` 줄을 붙인다. Steam 포스터를 운영에 일괄로 넣기 전에 사람이 읽기 전용으로 대상 id의 `category_id`를 확인하고(`pnpm -s games:edit <ops.json>` 미리보기의 주의 줄, 또는 `SELECT id, category_id FROM games WHERE id IN (…)`), 카테고리가 있는 id는 ops에서 뺀 뒤 `--apply`한다.
  - **배포 순서(Steam 포스터)**: 읽기 경로(`listGames`·`getGame`·`rowToRecord`)는 포스터를 검증하지 않아 옛 코드도 Steam 포스터를 그린다. 하지만 옛 코드의 `updateGame`·`createGame`(`validateCandidate`)은 그 게임을 422로 거부하고, `serializeGames`(→`parseGames`)를 쓰는 `games:export`는 목록 전체에서 던진다. 그래서 코드를 머지·배포한 뒤에 데이터(`games:edit`)를 적용하고, `games:edit`는 머지된 코드에서 실행한다(SQL을 로컬 체크아웃 코드가 만든다).
- 마지막 플레이: `games.last_played`(0014)가 마지막 플레이의 정본이다(#60. 다시보기 날짜는 보지 않는다. 채널·다시보기 목록에 의존하면 장기 유지보수가 나빠서다). `played.ts`: `lastPlayedOf` = 저장값 ?? 첫 플레이 ?? null, `earliestPlayedOf` = 첫 플레이 ?? 저장값 ?? null, `playedInYear`는 이 두 값의 구간 겹침. SQL에서 max(date)를 계산하지 않는다. 0014 마이그레이션 주석의 계산식(max(첫 플레이, 다시보기, 보정값))은 #60에서 바뀌었다(기존 마이그레이션 파일은 고치지 않는다). `Game.lastPlayed`는 값이 있을 때만 키를 두고(export·시드 해시 유지), `YYYY-MM-DD`이며 첫 플레이보다 이르면 거부한다(`schema.ts`). 다시보기 날짜와의 관계는 검증하지 않는다. 새 게임(`createGame`·`games:edit` add·관리자 추가 폼 `formToInput`)은 비워 두면 첫 플레이 날짜로 저장한다(첫 플레이도 없으면 NULL). /games 방문자에게는 보낸다(최근 플레이순 정렬, 2026-11 공개로 바꿈): 비관리자 응답·props도 `toGame`(관리 메타만 뺀 도메인 사본. lastPlayed를 버리게 바꾸면 상태만 고치는 PATCH에서도 저장값이 지워진다). 홈은 최근 탐험 순서와 날짜(`Expedition.date`)에 쓴다. /awards는 `AwardEntry`에 넣지 않는다(`entries.test.ts`가 고정). 상세 모달은 첫 플레이와 다를 때만 '마지막 플레이' 칸을 그린다(`labels.ts lastPlayedFact`). 관리자 폼은 "첫 플레이" 아래 "마지막 플레이" 날짜 칸이고, 힌트는 `patch.ts lastPlayedHint`("비워 두면 첫 플레이 날짜(…)를 써요." 등). 폼에서 다시보기를 넣거나 날짜를 바꿔 그 날이 지금 마지막 플레이(`effectiveLastPlayed`: 입력값, 없으면 첫 플레이)보다 늦어지면 `raiseLastPlayed`가 lastPlayed를 그 날로 올린다(방금 넣거나 바꾼 다시보기의 날짜만 비교하고 다른 다시보기는 보지 않아, 되돌린 값을 무관한 다시보기로 다시 올리지 않는다. 바뀐 항목에 '마지막 플레이'로 보이고 되돌릴 수 있다. 삭제·정렬·첫 플레이 변경에는 쓰지 않고, 내리지 않는다). 요약은 '마지막 플레이 바뀜'. `games:edit` update patch에 `lastPlayed`(null = 지우기)이고, 다시보기를 쓴 작업(add·update `vods`·move-vods 대상) 뒤 가장 늦은 다시보기가 마지막 플레이보다 늦으면 미리보기에 `주의: <id> 다시보기 날짜(…)가 마지막 플레이(…)보다 늦어요. lastPlayed도 바꿀지 확인해 주세요.`를 붙인다(자동으로 바꾸지 않는다). `games:export`에는 백업용으로 담는다.
  - **배포 순서(마지막 플레이 정본, #60)**: 사람이 운영에 `games:edit`로 날짜가 있는 게임 전부에 `last_played` = 그때 계산값(max(첫 플레이, 다시보기 날짜))을 채운 뒤 머지한다(날짜가 하나도 없는 게임은 NULL). 이 값은 #60 코드로는 다시 계산할 수 없으니 머지 전 main(#59)의 `played.ts lastPlayedOf` 또는 SQL(`first_played`와 그 게임 `game_vods.date`의 최댓값)로 만들고, `games:edit`도 main 체크아웃에서 실행한다(main도 `patch.lastPlayed`를 받는다). 채우기 전에 머지하면 마지막 플레이가 첫 플레이로 떨어져 첫 플레이가 2025 이전인 게임이 2026 부문에서 빠진다(/awards는 관리자 전용이라 영향이 작고, 채우면 재배포 없이 복구된다).
  - **배포 순서(마지막 플레이, 0014)**: `GAME_COLUMNS`가 `last_played`를 SELECT하는 코드가 main에 가기 전에 사람이 이 PR 브랜치 worktree에서 `pnpm wrangler d1 migrations list yasiro-db --remote`(대기 목록이 `0014_games_last_played.sql` 하나인지) → `pnpm wrangler d1 migrations apply yasiro-db --remote` → `pnpm wrangler d1 execute yasiro-db --remote --command "SELECT count(*) FROM games WHERE last_played IS NOT NULL"`(0) 확인 → 머지한다. 머지 전 main 체크아웃에서는 대기 목록이 비어 아무것도 적용되지 않는다. 순서가 바뀌면 배포부터 적용까지 /games("기록을 불러오지 못했어요")·홈 최근 탐험·/about 숫자·/awards·/awards/rankings(404)·쓰기 API·`games:export`가 실패한다. 0014 적용 전에는 새 코드의 `games:edit`도 쓰지 않는다(원격 UPDATE가 실패한다). 0014 적용 뒤 이 PR 이전 코드로 롤백해도 데이터는 안전하다(옛 INSERT·UPDATE가 열을 명시해 `last_played`를 건드리지 않아 보정값이 남는다. 0012와 다르다). 다만 옛 화면에는 보정값이 안 보이고, 2026 부문이 옛 규칙(첫 플레이 2026)으로 돌아가며, 옛 `games:export`는 lastPlayed 없이 백업하고, 이전 체크아웃의 `games:edit`는 운영 사본을 올리다 실패한다(`wrangler d1 export`가 열 이름을 적은 INSERT를 내는데 옛 로컬 스키마에는 `last_played`가 없다. 0014 적용부터 머지 전까지의 main 체크아웃도 같다).
- /awards 대결 카드는 시작 시각이 적힌 날짜순 첫 다시보기(`highlightVod`, 제목 대조 없이 관리자 값을 믿음)가 있으면 재생 버튼을 얹고, 누르면 카드 위 한 칸에서 `youtube-nocookie.com/embed/<id>?start=N`을 연다(한 번에 하나, 판이 넘어가면 언마운트). 정지 그림은 그 영상 썸네일이 아니라 포스터 → 현장 사진 → 표본 라벨이다(여러 게임 방송 썸네일 문제). 시각이 없는 다시보기는 틀지 않는다. iframe은 `referrerPolicy="strict-origin-when-cross-origin"`(리퍼러가 없으면 유튜브 오류 153). 사이트에는 Referrer-Policy·CSP 헤더가 없다. CSP를 넣게 되면 `frame-src https://www.youtube-nocookie.com`을 허용한다. /games 상세에는 하이라이트를 보이지 않는다.
  - **배포 순서(하이라이트, 0012)**: `game_vods`에서 `highlight_start`를 SELECT하는 코드가 main에 가기 전에 사람이 `pnpm wrangler d1 migrations list yasiro-db --remote`(대기 목록이 0012 하나인지) → `migrations apply --remote` → `SELECT count(*) FROM game_vods WHERE highlight_start IS NOT NULL`(0) 확인 → 머지한다. 이 명령은 0012 파일이 있는 PR 브랜치 체크아웃에서 실행한다(머지 전 main 체크아웃에서는 대기 목록이 비어 아무것도 적용되지 않는다). 순서가 바뀌면 배포부터 적용까지 /games·/awards·홈 최근 탐험이 실패한다("기록을 불러오지 못했어요"). 0012 적용 뒤 이 PR 이전 코드로 롤백하면 읽기는 되지만, 옛 코드로 다시보기를 고치면(사이트 저장·`games:edit`) 그 게임의 하이라이트가 지워진다(DELETE 후 열 없이 다시 넣음). 이전 체크아웃의 `games:edit`는 운영 사본을 올리다 실패한다.
- scripts/*.ts는 `node --experimental-strip-types`로 `src/lib`의 `.ts`를 직접 import한다(그래서 lib 런타임 import는 `./x.ts` 상대경로, erasable 구문만: enum·namespace·생성자 parameter property 금지). `MODULE_TYPELESS_PACKAGE_JSON` 경고는 스크립트에서 `--disable-warning`으로 끈다. `"type": "module"`을 넣으면 Next·ESLint 설정 해석이 바뀌므로 넣지 않는다.
- 로컬 치지직 검색(관리자 게임 추가)은 `.dev.vars`의 `CHZZK_CLIENT_ID`·`CHZZK_CLIENT_SECRET`을 쓴다. 1Password 환경 `chzzk-local-dev`를 마운트한 파일이라 내용을 출력·커밋하지 않는다.

### 관리자 (익명 규칙 포함)

- 관리자 = `auth_sessions`(`expires_at > now`)의 `channel_id`가 허용 목록에 있는 사람. 허용 목록 = 야시로 채널 ID(`admin.ts`의 `YASIRO_CHANNEL_ID`, 공개 정보) ∪ Worker secret `ADMIN_CHANNEL_IDS`. 다른 관리자의 채널 ID는 `chzzk.naver.com/<id>`로 채널 이름이 드러나므로 **코드·migrations·테스트·주석·커밋에 쓰지 않는다**(테스트는 `test-d1.ts`의 `FAKE_ADMIN_ID`). 로컬 확인은 `pnpm exec opennextjs-cloudflare preview -- --port <p> --var ADMIN_CHANNEL_IDS:<가짜 ID>`(빌드는 `pnpm build:worker`)로 주입하고 로컬 D1 `auth_sessions`에 그 채널 ID로 `sha256(세션 ID)` 행을 넣은 뒤 Chrome에서 `__Host-session` 쿠키를 세션 ID로 설정한다(OAuth 불필요, 명령은 `verify` 스킬 '로그인 세션').
- 방문자용 로그인 버튼은 없다(방명록 제거와 함께 뺐다). 관리자는 /games 맨 아래 "관리자 로그인" 글자 링크(`/auth/login?next=/games`, 관리자가 아닐 때만 보임)로 로그인하고, 로그인 중에는 Nav에 자기 채널 이름과 로그아웃이 보인다.
- **익명 표시(사용자 지시)**: 관리자의 치지직 채널 이름은 `games`·`game_changes`·API 응답·export·로그 어디에도 저장·표시·반환하지 않는다. 수정자 표시는 `actorNameFor(channelId)`로만 정한다(야시로 → "야시로", 그 밖의 허용 ID → "관리자", 시드 → "시스템"). 세션의 `channel_name`은 games 코드에서 SELECT하지 않는다. `channel_id`는 감사 컬럼(`games.updated_by_channel_id`, `game_changes.channel_id`)에만 저장하고 응답·props·로그로 내보내지 않는다. 테스트(`api.e2e.test.ts` 등)가 이를 고정한다. Nav의 로그인 표시는 기존대로 본인 브라우저에서 자기 채널 이름을 보인다(이 값은 layout의 `initialUser`로 직렬화되어 그 사용자의 HTML에만 들어간다).
- 쓰기 API는 `checkSameOrigin`(CSRF) → 인증 → 본문 크기 → 모양 → 검증 순서이고, 동시 수정은 `version` 낙관적 잠금(충돌 시 409 + "관리자가 방금(HH:MM) 이 게임을 먼저 고쳤어요…")이다. 응답은 `Cache-Control: no-store`.
- UI는 /games 안에서만: 관리자 띠(숨긴 게임 보기·게임 추가), 카드 호버/포커스 시 "수정" 칩(`@media (hover: none)`에서는 숨김), 상세 모달 하단 관리자 영역(숨기기·수정·변경 기록), 같은 모달의 수정 모드, 게임 추가 2단계. 수정 중 Esc·배경 클릭·닫기는 확인을 거치고(`DialogFrame intercept`), 로그인이 만료되면 입력을 `localStorage['yasiro-games-draft:<id|new>']`에 보존한다. 알림(`Toast`)은 열린 `<dialog>`(top layer) 위에 보이도록 dialog 안에도 렌더링하고, 한 번에 하나만 내용을 가진다.
- 응답 해석·문구·폼 로직은 `src/lib/games/{client,patch,diff}.ts`(순수 함수, 100% 커버리지)에 둔다. 컴포넌트는 상태와 fetch만 한다.

### 어워즈 집계 (/awards, 0013)

- 흐름: `POST /api/awards/draw` → 서버가 D1 후보(`inDivision`)로 `newRun`(crypto rng), `v1.<payload>.<HMAC>` 토큰(drawId·부문·대진·3·4위전·iat·exp, 24시간)을 준다. D1에 쓰지 않는다. `POST /api/awards/submit?division=` → 서명·만료 → `verifyRun` → batch 한 번(`award_runs` INSERT, draw_id UNIQUE는 409, `award_limits` +1, `award_tally` UPSERT). 클라이언트는 결과 화면에 들어가면 자동으로 제출한다(`AwardsApp`, 응답 해석·문구는 `src/lib/awards/client.ts`).
- 검사 순서: 출처 → 관리자 → secret(503) → 쿼리 부문 → 제출 한도(429) → 본문 512KB → 모양 → 토큰(400/410) → verifyRun(422) → batch(409/429). 한도를 넘긴 뒤의 재제출은 409가 아니라 429다.
- 제한: IP(`CF-Connecting-IP`, IPv6는 /64) × 부문 × KST 하루 10회(`SUBMIT_LIMIT_PER_DAY`). 성공한 제출만 센다. IP는 `HMAC(파생 키, "<KST day>|<버킷>")`로만 저장하고 오늘·전날 행만 남긴다(다음 제출 때 지운다). 로그에 IP·해시·토큰을 남기지 않는다.
- 순위: 우승 횟수 상위 10, 승률 상위 10(대결 10판 이상). 읽을 때 숨기지 않은 게임만 남긴다. 누계는 지우지 않는다. 2026 부문은 "2026년에 한 게임"이다: 첫 플레이 ~ 마지막 플레이(저장값, 없으면 첫 플레이) 구간이 2026-01-01..2026-12-31과 겹치면 든다(`played.ts playedInYear`, `entries.ts gameInDivision`). 다시보기 날짜는 보지 않는다(#60). 첫 플레이가 없어도 마지막 플레이가 2026이면 든다. 첫 플레이 2026 규칙의 상위 집합이라 이미 쌓인 집계가 빠지지 않는다. 서버(draw 후보·순위 API는 다시보기 없이 날짜만 읽는 `awards/repo.ts loadPlayedDates`, 페이지는 `listGames`)가 같은 함수로 계산하고, 클라이언트는 서버가 계산한 `AwardEntry.divisions`로만 거른다(entry에는 lastPlayed가 없어 다시 계산하면 틀린다. `api.e2e.test.ts`가 서버 후보 == 클라이언트 후보를 고정). 순위 화면은 `/awards/rankings?division=alltime|2026`(서버 렌더 `loadAwardsRankingsPage`, 잘못된 값은 2026, `entries.ts parseDivisionQuery`·`rankingsHref`)이고, 설정 화면 "순위 보기"와 결과 화면(제출이 끝난 뒤)에서 링크한다. 순위를 못 읽으면(0013 미적용 등) 페이지는 열리고 "순위를 불러오지 못했어요."를 보인다. `GET /api/awards/rankings?division=`는 남아 있지만(curl 확인용) 화면은 쓰지 않는다.
- 공개 전환: `src/lib/awards/api.ts`의 `AWARDS_PUBLIC`(페이지·API 셋·Nav 링크 공통). SITE_PAGES·robots는 따로 손본다. 공개 전에 draw 호출 제한과 봇 방어(Turnstile 등)를 검토한다.
- 로컬: `pnpm wrangler d1 migrations apply yasiro-db --local` → `pnpm build:worker` → `pnpm exec opennextjs-cloudflare preview -- --port <p> --var ADMIN_CHANNEL_IDS:<가짜 ID> --var AWARDS_SECRET:$(openssl rand -hex 32)`. 로그인 세션은 `verify` 스킬 '로그인 세션'. 로컬에는 CF-Connecting-IP가 없을 수 있고, 그때는 모든 요청이 `unknown` 버킷 하나를 쓴다(한도 확인은 curl `-H "cf-connecting-ip: …"`). `.dev.vars`(1Password FIFO)에 AWARDS_SECRET을 넣지 않고 `--var`로만 주입한다. preview를 다시 띄우면 secret이 바뀌어 그 전 토큰은 `bad_token`이 된다.
- **배포 순서(0013, AWARDS_SECRET)**: (1) 사람이 원격에 0013을 적용한다. 이 PR 브랜치 worktree에서 `pnpm wrangler d1 migrations list yasiro-db --remote`(대기 목록이 `0013_awards_tally.sql` 하나인지) → `pnpm wrangler d1 migrations apply yasiro-db --remote` → `pnpm wrangler d1 execute yasiro-db --remote --command "SELECT count(*) FROM award_runs"`(0). (2) 사람이 secret을 넣는다: `openssl rand -hex 32`로 값을 만들고 `printf '<그 값>' | pnpm wrangler secret put AWARDS_SECRET`(값은 1Password에만 보관, 출력·커밋 금지). (3) 머지한다.
  - secret 없이 배포되면 /awards 페이지는 열리지만 시작하기가 503("어워즈 설정이 끝나지 않아 시작할 수 없어요.")이라 토너먼트를 시작할 수 없다. 제출도 503이고 로그에 요청마다 `awards-api secret missing`이 찍힌다. 순위 보기는 secret 없이 동작한다. secret을 넣으면 재배포 없이 복구된다.
  - 0013 적용 전에 배포되면 페이지·draw는 동작하지만 submit은 500(`awards-api unavailable Error`)이고 순위 보기는 "순위를 불러오지 못했어요."다. 그 사이 끝낸 판은 집계되지 않는다. 0013을 적용하면 복구된다.
  - 롤백: 0013은 테이블만 추가하므로 이전 코드로 롤백해도 안전하다. 쌓인 집계는 남는다.
