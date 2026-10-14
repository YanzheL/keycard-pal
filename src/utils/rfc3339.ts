const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** A moment in RFC 3339, in the phone's time zone with its offset; null past what it can write. */
export function rfc3339(ms: number): string | null {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 0 || year > 9999) return null;
  const offset = -date.getTimezoneOffset();
  const local = new Date(ms + offset * 60_000);
  const zone =
    offset === 0
      ? 'Z'
      : `${offset > 0 ? '+' : '-'}${pad(
          Math.floor(Math.abs(offset) / 60),
        )}:${pad(Math.abs(offset) % 60)}`;
  return (
    `${pad(local.getUTCFullYear(), 4)}-${pad(local.getUTCMonth() + 1)}-${pad(
      local.getUTCDate(),
    )} ` +
    `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(
      local.getUTCSeconds(),
    )}${zone}`
  );
}
