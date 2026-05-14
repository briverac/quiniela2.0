import { teamCodeToFlagIso } from "../lib/teamFlagIso";

type Props = {
  code: string | null | undefined;
  /** Display width in CSS px (height follows flag aspect). */
  size?: number;
  className?: string;
  title?: string;
};

/**
 * Country flag from flagcdn (lazy-loaded). No image when code is unknown or null
 * (e.g. bracket placeholders).
 */
export function TeamFlag({ code, size = 22, className, title }: Props) {
  const iso = teamCodeToFlagIso(code);
  if (!iso) return null;
  const w = size <= 24 ? 40 : size <= 32 ? 80 : 160;
  const src = `https://flagcdn.com/w${w}/${iso}.png`;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={Math.round((size * 15) / 22)}
      className={className ? `team-flag ${className}` : "team-flag"}
      loading="lazy"
      decoding="async"
      title={title}
    />
  );
}
