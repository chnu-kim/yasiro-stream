// 사이트에 직접 올린 캐릭터 그림(public/art/v1)을 AVIF → WebP 순서로 고르게 하는 <picture>.
// next/image는 images.unoptimized라 원본 PNG(1MB대)를 그대로 보내서 쓰지 않는다. 그림은 표시 크기에 맞춘 폭별 파일로 미리 만들어 둔다.
// 파일: public/art/v1/{name}-{폭}.{avif,webp}. 그림을 바꾸면 v2 폴더로 올린다(public/_headers가 /art/*를 1년 immutable로 캐시).
// props: name, widths(만들어 둔 폭들), width·height(원본 비율), alt, sizes, priority(첫 화면 그림: eager + fetchPriority high), className, style,
// decoding(기본 async. 페이지 전환으로 이어지는 캐릭터 그림은 sync: 전환이 곧바로 끝나는 모션 줄이기에서 새 그림이 몇 프레임 비어 보이지 않게).
import type { CSSProperties } from 'react';

export default function ArtImage({
  name,
  widths,
  width,
  height,
  alt,
  sizes,
  priority = false,
  className,
  style,
  decoding = 'async',
}: {
  name: string;
  widths: readonly number[];
  width: number;
  height: number;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  decoding?: 'async' | 'sync';
}) {
  const set = (ext: string) => widths.map((w) => `/art/v1/${name}-${w}.${ext} ${w}w`).join(', ');
  return (
    <picture>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
      <img
        src={`/art/v1/${name}-${widths[widths.length - 1]}.webp`}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding={decoding}
        className={className}
        style={style}
      />
    </picture>
  );
}
