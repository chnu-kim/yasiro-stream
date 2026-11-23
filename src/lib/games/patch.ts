// 수정 모드 폼 로직(클라이언트). 서버(repo.ts)와 같은 validateCandidate·diffGames를 쓴다. 순수 함수.
import { diffGames, FIELD_LABEL, FIELD_ORDER } from "./diff.ts";
import { formatDate } from "./query.ts";
import { CHZZK_VOD_MESSAGE, GAME_STATUSES, isChzzkPosterUrl, isChzzkUrl, isValidIsoDate, validateCandidate } from "./schema.ts";
import { formatTimecode, parseTimecode } from "./timecode.ts";
import type {
  CategoryLink,
  Game,
  GameDraftStore,
  GameField,
  GameForm,
  GameInput,
  GamePatch,
  FormFieldKey,
  FormFix,
  FormIssue,
  FormVod,
  ValidationIssue,
} from "./types.ts";

/** 새 게임을 검증할 때 쓰는 자리표시 id. 서버가 실제 id를 할당하므로 id 이슈는 버린다 */
const NEW_ID = "new-game";

export function gameToForm(game: Game | null): GameForm {
  if (game === null) {
    return { name: "", originalTitle: "", category: null, firstPlayed: "", undated: false, lastPlayed: "", status: "unknown", vods: [] };
  }
  // 포스터가 치지직 카테고리 포스터(pstatic.net)면 카테고리 쪽에, 아니면(Steam 캡슐) 카테고리 밖 포스터로 연다.
  // 카테고리 C + Steam 포스터를 C의 포스터로 열면, 포스터 없는 카테고리로 바꿀 때 Steam 포스터가 지워진다
  const categoryPoster = game.categoryId !== undefined && isChzzkPosterUrl(game.posterUrl) ? game.posterUrl : null;
  const form: GameForm = {
    name: game.name,
    originalTitle: game.originalTitle ?? "",
    category: game.categoryId === undefined ? null : { categoryId: game.categoryId, posterUrl: categoryPoster },
    firstPlayed: game.firstPlayed ?? "",
    undated: game.firstPlayed === null,
    lastPlayed: game.lastPlayed ?? "",
    status: game.status,
    vods: game.vods.map((v) => ({
      title: v.title,
      url: v.url,
      date: v.date,
      highlight: v.highlightStart === undefined ? "" : formatTimecode(v.highlightStart),
    })),
  };
  // 카테고리 밖 포스터(Steam)는 따로 들고 있어야 저장·카테고리 변경 때 지워지지 않는다
  if (game.posterUrl !== undefined && categoryPoster === null) form.posterUrl = game.posterUrl;
  return form;
}

/** 폼이 저장할 포스터. 치지직 카테고리 포스터가 우선, 없으면 카테고리 밖 포스터(Steam), 둘 다 없으면 null */
export function formPosterUrl(form: GameForm): string | null {
  return form.category?.posterUrl ?? form.posterUrl ?? null;
}

/** 카테고리 연결을 해제해도 포스터(카테고리 밖 Steam 포스터)가 남는가. 해제 버튼 문구('표본 라벨로' 여부)에 쓴다 */
export function unlinkKeepsPoster(form: GameForm): boolean {
  return formPosterUrl({ ...form, category: null }) !== null;
}

export function formToRaw(id: string, form: GameForm): Record<string, unknown> {
  const raw: Record<string, unknown> = { id, name: form.name.trim() };
  const originalTitle = form.originalTitle.trim();
  if (originalTitle !== "") raw.originalTitle = originalTitle;
  if (form.category !== null) raw.categoryId = form.category.categoryId;
  const posterUrl = formPosterUrl(form);
  if (posterUrl !== null) raw.posterUrl = posterUrl;
  raw.firstPlayed = form.undated ? null : form.firstPlayed;
  // 원문 그대로 넣어 형식이 틀리면 schema가 lastPlayed 이슈를 내게 한다. "" = 저장값 없음(키 생략, 첫 플레이로 대신한다)
  if (form.lastPlayed !== "") raw.lastPlayed = form.lastPlayed;
  raw.status = form.status;
  raw.vods = form.vods.map((v) => {
    const out: Record<string, unknown> = { title: v.title.trim(), url: v.url.trim(), date: v.date };
    // 못 읽은 원문은 문자열 그대로 넣어 schema가 vods[i].highlightStart 이슈를 내게 한다
    const h = v.highlight.trim();
    if (h !== "") out.highlightStart = parseTimecode(h) ?? h;
    return out;
  });
  return raw;
}

/** 하이라이트 입력 표시 정규화(onBlur): 읽을 수 있으면 "H:MM:SS"/"M:SS", 빈 값이면 "", 못 읽으면 원문 그대로 */
export function normalizeHighlight(raw: string): string {
  if (raw.trim() === "") return "";
  const sec = parseTimecode(raw);
  return sec === null ? raw : formatTimecode(sec);
}

/** 검증을 통과한 폼 → 게임 추가 입력. 마지막 플레이를 비워 두면 첫 플레이 날짜로 채운다(정본이 비지 않게, 서버 createGame과 같은 규칙).
 *  formToRaw에는 넣지 않는다: formToPatch도 쓰므로 저장값 없는 게임을 고칠 때마다 '마지막 플레이'가 바뀐 것으로 보인다 */
export function formToInput(form: GameForm): GameInput {
  const raw = formToRaw(NEW_ID, form);
  const { id: _id, ...input } = raw;
  void _id;
  if (input.lastPlayed === undefined && typeof input.firstPlayed === "string") input.lastPlayed = input.firstPlayed;
  return input as unknown as GameInput;
}

/** base와 달라진 필드만 담은 PATCH 본문 */
export function formToPatch(base: Game, form: GameForm): GamePatch {
  const raw = formToRaw(base.id, form) as unknown as Game;
  const patch: GamePatch = {};
  for (const field of diffGames(base, raw)) {
    switch (field) {
      case "name":
        patch.name = raw.name;
        break;
      case "originalTitle":
        patch.originalTitle = raw.originalTitle ?? null;
        break;
      case "category": {
        patch.category = form.category === null ? null : { categoryId: form.category.categoryId, posterUrl: form.category.posterUrl };
        // category만으로 정해지는 포스터와 폼의 포스터가 다르면(카테고리 포스터 없음 + Steam 포스터) posterUrl로 덮는다
        const fromCategory = patch.category?.posterUrl ?? undefined;
        // (다르면 raw 쪽은 늘 문자열이다: 카테고리 포스터가 있으면 formPosterUrl이 그 값을 쓴다)
        if (raw.posterUrl !== fromCategory) patch.posterUrl = raw.posterUrl as string;
        break;
      }
      case "firstPlayed":
        patch.firstPlayed = raw.firstPlayed;
        break;
      case "lastPlayed":
        patch.lastPlayed = raw.lastPlayed ?? null;
        break;
      case "status":
        patch.status = raw.status;
        break;
      case "vods":
        patch.vods = raw.vods;
        break;
    }
  }
  return patch;
}

/** 바뀐 필드. base가 null(추가)이면 비어 있지 않은 필드 */
export function changedFields(base: Game | null, form: GameForm): GameField[] {
  if (base !== null) return diffGames(base, formToRaw(base.id, form) as unknown as Game);
  const filled: Record<GameField, boolean> = {
    name: form.name.trim() !== "",
    originalTitle: form.originalTitle.trim() !== "",
    category: form.category !== null,
    firstPlayed: form.undated || form.firstPlayed !== "",
    lastPlayed: form.lastPlayed !== "",
    status: form.status !== "unknown",
    vods: form.vods.length > 0,
  };
  return FIELD_ORDER.filter((f) => filled[f]);
}

export function changedLabels(fields: readonly GameField[]): string[] {
  return fields.map((f) => FIELD_LABEL[f]);
}

/** 첫 플레이보다 이른 다시보기가 있으면 그중 가장 이른 날짜(원클릭 수정 제안) */
export function suggestFirstPlayed(form: GameForm): string | null {
  if (form.undated || !isValidIsoDate(form.firstPlayed)) return null;
  let earliest: string | null = null;
  for (const v of form.vods) {
    if (isValidIsoDate(v.date) && v.date < form.firstPlayed && (earliest === null || v.date < earliest)) earliest = v.date;
  }
  return earliest;
}

/** 폼의 지금 마지막 플레이: 유효한 입력값, 비었거나 틀리면 첫 플레이(날짜 기록 없음이 아니고 유효할 때), 둘 다 없으면 null */
export function effectiveLastPlayed(form: GameForm): string | null {
  if (isValidIsoDate(form.lastPlayed)) return form.lastPlayed;
  return !form.undated && isValidIsoDate(form.firstPlayed) ? form.firstPlayed : null;
}

/** 다시보기를 vods로 바꾼 폼. 방금 추가하거나 날짜를 바꾼 다시보기의 날짜(changedDate)가 유효하고 지금 마지막 플레이
 *  (effectiveLastPlayed)보다 늦으면(마지막 플레이가 없으면 언제나) lastPlayed를 그 날로 올린다. 다른 다시보기의 날짜는 보지 않아
 *  사용자가 되돌린 값을 무관한 다시보기로 다시 올리지 않는다. 다시보기 추가·날짜 변경에만 쓴다(삭제·정렬·첫 플레이 변경에는 쓰지 않는다).
 *  내리지는 않는다 */
export function raiseLastPlayed(form: GameForm, vods: FormVod[], changedDate: string): GameForm {
  const next: GameForm = { ...form, vods };
  if (!isValidIsoDate(changedDate)) return next;
  const current = effectiveLastPlayed(form);
  if (current === null || changedDate > current) next.lastPlayed = changedDate;
  return next;
}

/** 마지막 플레이 칸 아래 힌트(aria-describedby). input[type=date]는 placeholder를 무시하므로 빈 칸의 뜻은 이 문구로만 보인다 */
export function lastPlayedHint(form: GameForm): string {
  if (form.lastPlayed !== "") return "더 늦은 다시보기를 넣으면 함께 올라가요.";
  if (form.undated) return "비워 두면 날짜 기록 없음으로 둬요.";
  if (isValidIsoDate(form.firstPlayed)) return `비워 두면 첫 플레이 날짜(${formatDate(form.firstPlayed)})를 써요.`;
  return "비워 두면 첫 플레이 날짜를 써요.";
}

export function applyFix(form: GameForm, fix: FormFix): GameForm {
  return { ...form, firstPlayed: fix.date, undated: false };
}

export function fieldDomId(key: FormFieldKey): string {
  return `game-edit-${key.replaceAll(".", "-")}`;
}

export function issuesHeadline(issues: readonly FormIssue[]): string {
  return `고칠 곳이 ${issues.length}개 있어요`;
}

const VOD_PATH = /^vods\[(\d+)\]\.(title|url|date|highlightStart)$/;
const VOD_PART_RANK = { title: 0, url: 1, date: 2, highlight: 3 } as const;

function fieldRank(field: FormFieldKey): number {
  const m = /^vods\.(\d+)\.(title|url|date|highlight)$/.exec(field);
  if (m !== null) return FIELD_ORDER.indexOf("vods") * 1000 + 1 + Number(m[1]) * 4 + VOD_PART_RANK[m[2] as keyof typeof VOD_PART_RANK];
  return FIELD_ORDER.indexOf(field as GameField) * 1000;
}

function toFormIssue(issue: ValidationIssue, form: GameForm): FormIssue {
  const { path, message } = issue;
  switch (path) {
    case "name":
      return { field: "name", label: "이름", message: "이름을 1~100자로 넣어 주세요." };
    case "originalTitle":
      return {
        field: "originalTitle",
        label: "원제",
        message: message.includes("name과 같으면") ? "원제가 이름과 같으면 비워 두세요." : "원제는 200자까지 넣을 수 있어요.",
      };
    case "categoryId":
      return {
        field: "category",
        label: "치지직 카테고리",
        message: message.includes("중복") ? "이미 목록에 있는 카테고리예요." : "카테고리를 다시 골라 주세요.",
      };
    case "posterUrl":
      return { field: "category", label: "치지직 카테고리", message: "포스터 주소가 올바르지 않아요. 카테고리를 다시 골라 주세요." };
    case "firstPlayed":
      return { field: "firstPlayed", label: "첫 플레이", message: "날짜를 넣거나 '날짜 기록 없음'을 골라 주세요." };
    case "lastPlayed":
      return {
        field: "lastPlayed",
        label: "마지막 플레이",
        message: message.includes("보다 이릅니다") ? `첫 플레이(${formatDate(form.firstPlayed)})보다 빨라요.` : "날짜를 2026.10.25 형식으로 넣거나 비워 두세요.",
      };
    case "status":
      return { field: "status", label: "정복 여부", message: "정복 여부를 골라 주세요." };
    case "vods":
      return { field: "vods", label: "다시보기", message: "다시보기 목록이 올바르지 않아요." };
  }
  const m = VOD_PATH.exec(path);
  if (m === null) return { field: "name", label: "기록", message };
  const i = Number(m[1]);
  if (m[2] === "highlightStart") {
    return { field: `vods.${i}.highlight`, label: "하이라이트 시작", message: "1:23:45처럼 24시간 안의 시각을 넣어 주세요." };
  }
  const part = m[2] as "title" | "url" | "date";
  const field = `vods.${i}.${part}` as FormFieldKey;
  if (part === "title") return { field, label: "다시보기 제목", message: "제목을 1~200자로 넣어 주세요." };
  if (part === "url") {
    const text = isChzzkUrl(form.vods[i]?.url)
      ? CHZZK_VOD_MESSAGE
      : message.includes("중복")
        ? "같은 영상이 이미 있어요."
        : "유튜브 영상 링크(youtube.com/watch?v=… 또는 youtu.be/…)를 넣어 주세요.";
    return { field, label: "다시보기 링크", message: text };
  }
  if (message.includes("보다 이릅니다")) {
    const date = suggestFirstPlayed(form);
    const base = { field, label: "다시보기 날짜", message: `첫 플레이(${formatDate(form.firstPlayed)})보다 빨라요.` };
    return date === null ? base : { ...base, fix: { kind: "setFirstPlayed", date } };
  }
  return { field, label: "다시보기 날짜", message: "날짜를 2026.10.25 형식으로 넣어 주세요." };
}

/** 검증 이슈(서버·클라이언트 공통) → 폼 이슈. FIELD_ORDER 순, 다시보기는 index 순 */
export function issuesToFormIssues(issues: readonly ValidationIssue[], form: GameForm): FormIssue[] {
  return issues
    .map((i) => toFormIssue(i, form))
    .map((issue, order) => ({ issue, order }))
    .sort((a, b) => fieldRank(a.issue.field) - fieldRank(b.issue.field) || a.order - b.order)
    .map(({ issue }) => issue);
}

/** others = 목록 전체(숨김 포함). selfId 게임은 비교에서 뺀다 */
export function validateForm(form: GameForm, others: readonly Game[], selfId: string | null): FormIssue[] {
  const rest = selfId === null ? others : others.filter((g) => g.id !== selfId);
  const issues = validateCandidate(rest, formToRaw(selfId ?? NEW_ID, form)).filter((i) => i.path !== "id");
  return issuesToFormIssues(issues, form);
}

// ---------- 임시 저장(localStorage) ----------

export const DRAFT_KEY_PREFIX = "yasiro-games-draft:";

export function draftKey(gameId: string | null): string {
  return `${DRAFT_KEY_PREFIX}${gameId ?? "new"}`;
}

export function serializeDraft(d: GameDraftStore): string {
  return JSON.stringify(d);
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseCategory(v: unknown): CategoryLink | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isStr(v.categoryId) || !(v.posterUrl === null || isStr(v.posterUrl))) return undefined;
  return { categoryId: v.categoryId, posterUrl: v.posterUrl };
}

function parseVods(v: unknown): FormVod[] | null {
  if (!Array.isArray(v)) return null;
  const out: FormVod[] = [];
  for (const x of v) {
    if (!isObj(x) || !isStr(x.title) || !isStr(x.url) || !isStr(x.date)) return null;
    // highlight가 없는 옛 초안(PR2 이전)은 ""로 채운다
    if (!(x.highlight === undefined || isStr(x.highlight))) return null;
    out.push({ title: x.title, url: x.url, date: x.date, highlight: x.highlight ?? "" });
  }
  return out;
}

export function parseDraft(raw: string | null): GameDraftStore | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || !isObj(v.form)) return null;
  const f = v.form;
  const category = parseCategory(f.category);
  const vods = parseVods(f.vods);
  const status = GAME_STATUSES.find((s) => s === f.status);
  const baseVersion = v.baseVersion;
  if (
    !isStr(f.name) ||
    !isStr(f.originalTitle) ||
    !isStr(f.firstPlayed) ||
    typeof f.undated !== "boolean" ||
    !(f.lastPlayed === undefined || isStr(f.lastPlayed)) ||
    category === undefined ||
    !(f.posterUrl === undefined || isStr(f.posterUrl)) ||
    vods === null ||
    status === undefined ||
    !(baseVersion === null || (typeof baseVersion === "number" && Number.isInteger(baseVersion))) ||
    typeof v.savedAt !== "number"
  ) {
    return null;
  }
  return {
    form: {
      name: f.name,
      originalTitle: f.originalTitle,
      category,
      ...(isStr(f.posterUrl) ? { posterUrl: f.posterUrl } : {}),
      firstPlayed: f.firstPlayed,
      undated: f.undated,
      // lastPlayed가 없는 옛 초안(0014 이전)은 ""(저장값 없음)로 채운다
      lastPlayed: isStr(f.lastPlayed) ? f.lastPlayed : "",
      status,
      vods,
    },
    baseVersion,
    savedAt: v.savedAt,
  };
}
