import { describe, expect, it } from "vitest";
import {
  APP_TIME_ZONE,
  createJstDateTime,
  formatJstDateTime,
  parseJstDateTime,
  startOfJstDay,
  toJstDateString,
  toJstIsoString,
} from "./jst.js";

// UTC 2026-01-15 06:00:00.000 と JST 2026-01-15 15:00:00.000 は同じ時刻
const INSTANT = new Date("2026-01-15T06:00:00.000Z");
const JST_ISO = "2026-01-15T15:00:00.000+09:00";

describe("APP_TIME_ZONE", () => {
  it("Asia/Tokyo", () => {
    expect(APP_TIME_ZONE).toBe("Asia/Tokyo");
  });
});

describe("toJstIsoString", () => {
  it("日時を +09:00 付きの JST の文字列にする", () => {
    expect(toJstIsoString(INSTANT)).toBe(JST_ISO);
  });

  it("JST では日付が変わる時刻も正しく変換する", () => {
    expect(toJstIsoString(new Date("2026-12-31T15:00:00.000Z"))).toBe(
      "2027-01-01T00:00:00.000+09:00",
    );
  });

  it("ミリ秒を 3 桁で出す", () => {
    expect(toJstIsoString(new Date("2026-01-01T00:00:00.007Z"))).toBe(
      "2026-01-01T09:00:00.007+09:00",
    );
  });

  it("文字列に戻すと同じ時刻になる", () => {
    expect(new Date(toJstIsoString(INSTANT)).getTime()).toBe(INSTANT.getTime());
  });

  it("引数を省略すると現在時刻を使う", () => {
    const before = Date.now();
    const result = new Date(toJstIsoString()).getTime();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(Date.now());
  });
});

describe("toJstDateString", () => {
  it("JST の日付を返す", () => {
    expect(toJstDateString(INSTANT)).toBe("2026-01-15");
  });

  it("JST の 0〜9 時は、UTC では前日でも JST の日付になる", () => {
    // JST 2026-01-15 08:59 = UTC 2026-01-14 23:59
    expect(toJstDateString(new Date("2026-01-14T23:59:00.000Z"))).toBe("2026-01-15");
  });

  it("JST の 23:59 は当日のまま", () => {
    expect(toJstDateString(new Date("2026-01-15T14:59:59.999Z"))).toBe("2026-01-15");
  });
});

describe("startOfJstDay", () => {
  it("JST のその日の 0 時を返す", () => {
    expect(startOfJstDay(INSTANT).toISOString()).toBe("2026-01-14T15:00:00.000Z");
    expect(toJstIsoString(startOfJstDay(INSTANT))).toBe("2026-01-15T00:00:00.000+09:00");
  });

  it("JST の 0 時ちょうどはその日の 0 時", () => {
    const midnight = new Date("2026-01-14T15:00:00.000Z");
    expect(startOfJstDay(midnight).getTime()).toBe(midnight.getTime());
  });

  it("JST の 0〜9 時でも、UTC の前日ではなく JST の当日の 0 時になる", () => {
    expect(toJstIsoString(startOfJstDay(new Date("2026-01-14T23:59:00.000Z")))).toBe(
      "2026-01-15T00:00:00.000+09:00",
    );
  });

  it("月末・年末もまたげる", () => {
    expect(toJstIsoString(startOfJstDay(new Date("2026-12-31T15:30:00.000Z")))).toBe(
      "2027-01-01T00:00:00.000+09:00",
    );
  });
});

describe("formatJstDateTime", () => {
  it("JST で表示用に整形する", () => {
    const text = formatJstDateTime(INSTANT, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    expect(text).toBe("2026/01/15 15:00");
  });

  it("timeZone を指定しても JST で整形する", () => {
    const text = formatJstDateTime(INSTANT, { hour: "2-digit", hour12: false, timeZone: "UTC" });

    expect(text).toBe("15時");
  });
});

describe("parseJstDateTime", () => {
  it("オフセットの無い文字列は JST とみなす", () => {
    expect(parseJstDateTime("2026-01-15T15:00:00.000")?.getTime()).toBe(INSTANT.getTime());
    expect(parseJstDateTime("2026-01-15 15:00")?.getTime()).toBe(INSTANT.getTime());
  });

  it("日付だけなら JST の 0 時", () => {
    expect(parseJstDateTime("2026-01-15")?.toISOString()).toBe("2026-01-14T15:00:00.000Z");
  });

  it("+09:00 や Z が付いていればそのオフセットに従う", () => {
    expect(parseJstDateTime(JST_ISO)?.getTime()).toBe(INSTANT.getTime());
    expect(parseJstDateTime("2026-01-15T06:00:00.000Z")?.getTime()).toBe(INSTANT.getTime());
    expect(parseJstDateTime("2026-01-15T07:00:00+0100")?.getTime()).toBe(INSTANT.getTime());
  });

  it("前後の空白を無視する", () => {
    expect(parseJstDateTime("  2026-01-15 15:00  ")?.getTime()).toBe(INSTANT.getTime());
  });

  it("ミリ秒の桁が少なくても読む", () => {
    expect(parseJstDateTime("2026-01-15T15:00:00.5")?.toISOString()).toBe(
      "2026-01-15T06:00:00.500Z",
    );
  });

  it("epoch ミリ秒はそのまま Date にする", () => {
    expect(parseJstDateTime(INSTANT.getTime())?.getTime()).toBe(INSTANT.getTime());
  });

  it("存在しない日付や不正な形式は null", () => {
    expect(parseJstDateTime("2026-02-30")).toBeNull();
    expect(parseJstDateTime("2026-01-15 24:00")).toBeNull();
    expect(parseJstDateTime("2026/01/15")).toBeNull();
    expect(parseJstDateTime("")).toBeNull();
    expect(parseJstDateTime(Number.NaN)).toBeNull();
    expect(parseJstDateTime(null)).toBeNull();
    expect(parseJstDateTime({})).toBeNull();
  });
});

describe("createJstDateTime", () => {
  it("正しい値なら Date を返す", () => {
    expect(createJstDateTime("2026-01-15 15:00").getTime()).toBe(INSTANT.getTime());
  });

  it("不正な値なら例外を投げる", () => {
    expect(() => createJstDateTime("2026-13-01")).toThrow("Invalid JST date-time: 2026-13-01");
  });
});
