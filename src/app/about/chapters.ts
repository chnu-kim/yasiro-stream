// /about 챕터 목록. 목차(Dossier, 클라이언트)와 챕터 제목(page.tsx, 서버)이 같은 라벨·번호를 쓰도록 한곳에 둔다.
// 'use client' 파일의 함수는 서버 컴포넌트에서 부를 수 없어서 Dossier.tsx가 아니라 여기에 둔다.
export type Chapter = { id: string; label: string };

// 순서 = 스크롤 순서
export const CHAPTERS: readonly Chapter[] = [
  { id: 'intro', label: '소개' },
  { id: 'profile', label: '프로필' },
  { id: 'taste', label: '취향' },
  { id: 'fan', label: '팬네임' },
];

export function chapterNo(i: number): string {
  return String(i + 1).padStart(2, '0');
}
