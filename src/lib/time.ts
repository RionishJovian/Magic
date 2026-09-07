// App-wide time settings. The whole product runs on Myanmar time (UTC+06:30)
// no matter which device or browser locale is used, so every screen shows the
// same day/week/month boundaries.

export const APP_TIMEZONE = "Asia/Yangon";
export const APP_TZ_LABEL = "UTC+06:30";
export const APP_TZ_OFFSET_MINUTES = 6 * 60 + 30;

const MS = 60_000;

/** Format an instant in app time. */
export function fmtDateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString("en-GB", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString("en-GB", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtTime(value: string | number | Date): string {
  return new Date(value).toLocaleTimeString("en-GB", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** YYYY-MM-DD key for the given instant, in app time. */
export function appDayKey(value: string | number | Date): string {
  const shifted = new Date(new Date(value).getTime() + APP_TZ_OFFSET_MINUTES * MS);
  return shifted.toISOString().slice(0, 10);
}

/** Epoch ms of midnight (app time) for the day containing `value`. */
export function appStartOfDay(value: string | number | Date = Date.now()): number {
  const t = new Date(value).getTime();
  const shifted = t + APP_TZ_OFFSET_MINUTES * MS;
  const floored = Math.floor(shifted / 86_400_000) * 86_400_000;
  return floored - APP_TZ_OFFSET_MINUTES * MS;
}

/** Epoch ms of midnight (app time) `daysBack` days ago. */
export function appStartOfDaysAgo(daysBack: number, from: number = Date.now()): number {
  return appStartOfDay(from) - daysBack * 86_400_000;
}

/** Epoch ms of the 1st of the month at midnight (app time) containing `value`. */
export function appStartOfMonth(value: string | number | Date = Date.now()): number {
  const shifted = new Date(new Date(value).getTime() + APP_TZ_OFFSET_MINUTES * MS);
  const firstUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1, 0, 0, 0, 0);
  return firstUtc - APP_TZ_OFFSET_MINUTES * MS;
}

/** Epoch ms of 1 January midnight (app time) for the year containing `value`. */
export function appStartOfYear(value: string | number | Date = Date.now()): number {
  const shifted = new Date(new Date(value).getTime() + APP_TZ_OFFSET_MINUTES * MS);
  const firstUtc = Date.UTC(shifted.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
  return firstUtc - APP_TZ_OFFSET_MINUTES * MS;
}

/** 1–12 month index in app time for the given instant. */
export function appMonthIndex(value: string | number | Date = Date.now()): number {
  const shifted = new Date(new Date(value).getTime() + APP_TZ_OFFSET_MINUTES * MS);
  return shifted.getUTCMonth() + 1;
}

/** Human label for the current quota month, e.g. "August 2026". */
export function appMonthLabel(value: string | number | Date = Date.now()): string {
  const shifted = new Date(new Date(value).getTime() + APP_TZ_OFFSET_MINUTES * MS);
  return shifted.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Human label for the current quota year, e.g. "2026". */
export function appYearLabel(value: string | number | Date = Date.now()): string {
  const shifted = new Date(new Date(value).getTime() + APP_TZ_OFFSET_MINUTES * MS);
  return String(shifted.getUTCFullYear());
}

/** Current wall-clock time in the app timezone, as a display string. */
export function appNowLabel(): string {
  return `${fmtDateTime(Date.now())} (${APP_TZ_LABEL})`;
}

export function fmtMMK(amount: number): string {
  return `${new Intl.NumberFormat("en-US").format(Math.round(amount))} MMK`;
}
