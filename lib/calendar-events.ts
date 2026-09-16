import type { CalendarEvent, CalendarEvents } from "./types";

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function isDateTime(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)
    && isDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

export function parseCalendarEvents(input: unknown): CalendarEvents {
  if (!input || typeof input !== "object") throw new Error("Calendar results must be an object.");
  const value = input as Record<string, unknown>;
  if (!isDate(value.rangeStart) || !isDate(value.rangeEnd) || value.rangeEnd <= value.rangeStart) {
    throw new Error("Supply valid rangeStart and exclusive rangeEnd dates in ascending order.");
  }
  if (typeof value.timezone !== "string" || !value.timezone.trim()) throw new Error("Supply an IANA timezone.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: value.timezone }); }
  catch { throw new Error("Supply a valid IANA timezone."); }
  if (!Array.isArray(value.events)) throw new Error("Supply an events array; use [] only for a successful empty query.");
  const events = new Map<string, CalendarEvent>();
  for (const item of value.events) {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim()
      || typeof item.title !== "string" || typeof item.allDay !== "boolean") {
      throw new Error("Each event needs an id, title, and boolean allDay.");
    }
    const validDates = item.allDay
      ? isDate(item.start) && isDate(item.end) && item.end > item.start
      : isDateTime(item.start) && isDateTime(item.end) && Date.parse(item.end) > Date.parse(item.start);
    if (!validDates) throw new Error("Event dates must match allDay and end after start; timed events need UTC offsets.");
    events.set(item.id, { id: item.id, title: item.title.trim() || "Untitled event", start: item.start, end: item.end, allDay: item.allDay });
  }
  return { rangeStart: value.rangeStart, rangeEnd: value.rangeEnd, timezone: value.timezone, events: [...events.values()] };
}

export function shiftCalendarDate(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function localDate(timestamp: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(timestamp);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function groupCalendarEvents(result: CalendarEvents): { date: string; events: CalendarEvent[] }[] {
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of result.events) {
    const first = event.allDay ? event.start : localDate(Date.parse(event.start), result.timezone);
    // Subtract one millisecond so a midnight ending does not occupy the next day.
    const last = event.allDay ? shiftCalendarDate(event.end, -1) : localDate(Date.parse(event.end) - 1, result.timezone);
    const end = last < result.rangeEnd ? last : shiftCalendarDate(result.rangeEnd, -1);
    for (let day = first > result.rangeStart ? first : result.rangeStart; day <= end; day = shiftCalendarDate(day, 1)) {
      groups.set(day, [...(groups.get(day) ?? []), event]);
    }
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([date, events]) => ({
    date,
    events: events.sort((a, b) => Number(b.allDay) - Number(a.allDay)
      || (a.allDay ? a.start.localeCompare(b.start) : Date.parse(a.start) - Date.parse(b.start))
      || a.title.localeCompare(b.title)),
  }));
}

export function calendarDateLabel(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function calendarEventTime(event: CalendarEvent, timezone: string): string {
  if (event.allDay) return "All day";
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  const multiDay = localDate(start, timezone) !== localDate(end, timezone);
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour: "numeric", minute: "2-digit", timeZoneName: "short",
    ...(multiDay ? { month: "short", day: "numeric" } as const : {}),
  });
  return `${format.format(start)} – ${format.format(end)}`;
}
