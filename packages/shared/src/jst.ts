/*
 * 日時はすべて日本時間（JST、Asia/Tokyo）で扱う。
 *
 * - Date は正しい時刻（瞬間）を持つ。DB の列は TIMESTAMPTZ なので、Prisma もそのまま正しい時刻を返す。
 * - 文字列にするとき（API の出力・ログ）は toJstIsoString で "+09:00" 付きの JST にする。
 *   Date#toISOString() は UTC（"Z"）になるので、外に出す値には使わない。
 * - 画面に表示するときは formatJstDateTime（timeZone: Asia/Tokyo）を使う。
 * - 入力の文字列は parseJstDateTime で Date にする。オフセットの無い文字列は JST とみなす。
 */

export const APP_TIME_ZONE = "Asia/Tokyo";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const JST_OFFSET_LABEL = "+09:00";
const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

/** 日時を JST の ISO 8601 文字列（例: 2026-01-15T15:00:00.000+09:00）にする */
export function toJstIsoString(date = new Date()): string {
  // +9 時間した時刻の UTC の各部分が、JST の各部分になる
  const jst = new Date(date.getTime() + JST_OFFSET_MS);

  return (
    `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}` +
    `T${pad2(jst.getUTCHours())}:${pad2(jst.getUTCMinutes())}:${pad2(jst.getUTCSeconds())}` +
    `.${pad3(jst.getUTCMilliseconds())}${JST_OFFSET_LABEL}`
  );
}

/**
 * 日時の JST の日付（YYYY-MM-DD）を返す。
 * 保存値は UTC なので、Date#toISOString().slice(0, 10) だと JST の 0〜9 時が前日になる。必ずこれを使う
 */
export function toJstDateString(date = new Date()): string {
  return toJstIsoString(date).slice(0, 10);
}

/**
 * 日時を含む JST の日の 0 時（正しい時刻の Date）を返す。
 * 「今日」「○月○日」の範囲は [startOfJstDay(d), startOfJstDay(d) + 1 日) で作る
 */
export function startOfJstDay(date = new Date()): Date {
  const [year, month, day] = toJstDateString(date).split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!) - JST_OFFSET_MS);
}

/** 日時を JST で表示用に整形する */
export function formatJstDateTime(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("ja-JP", {
    ...options,
    timeZone: APP_TIME_ZONE,
  }).format(date);
}

function parseOffsetMs(offset: string): number {
  if (offset === "Z") {
    return 0;
  }

  const sign = offset.startsWith("-") ? -1 : 1;
  const digits = offset.slice(1).replace(":", "");
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));

  return sign * (hours * 60 + minutes) * 60 * 1000;
}

/**
 * 文字列または epoch ミリ秒を Date にする。不正な値なら null。
 * オフセット（Z や +09:00）の無い文字列は JST の日時とみなす（例: "2026-01-15 15:00" → JST 15:00）。
 */
export function parseJstDateTime(value: unknown): Date | null {
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== "string") {
    return null;
  }

  const match = DATE_TIME_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  const [, year, month, day, hour = "00", minute = "00", second = "00", ms, offset] = match;
  const millisecond = (ms ?? "0").padEnd(3, "0").slice(0, 3);
  // 書かれている日時を、いったん UTC の各部分として組み立てる（存在しない日付の検出にも使う）
  const parts = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number(millisecond),
    ),
  );

  if (
    Number.isNaN(parts.getTime()) ||
    parts.getUTCFullYear() !== Number(year) ||
    parts.getUTCMonth() !== Number(month) - 1 ||
    parts.getUTCDate() !== Number(day) ||
    parts.getUTCHours() !== Number(hour) ||
    parts.getUTCMinutes() !== Number(minute) ||
    parts.getUTCSeconds() !== Number(second)
  ) {
    return null;
  }

  const offsetMs = offset ? parseOffsetMs(offset) : JST_OFFSET_MS;
  return new Date(parts.getTime() - offsetMs);
}

/** parseJstDateTime と同じだが、不正な値なら例外を投げる */
export function createJstDateTime(value: string): Date {
  const date = parseJstDateTime(value);

  if (!date) {
    throw new Error(`Invalid JST date-time: ${value}`);
  }

  return date;
}
