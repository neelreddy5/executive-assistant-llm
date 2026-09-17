import { CalendarDays } from "lucide-react";
import { calendarDateLabel, calendarEventTime, groupCalendarEvents, shiftCalendarDate } from "@/lib/calendar-events";
import type { CalendarDisplayStatus, CalendarEvents, GoogleCalendarResults } from "@/lib/types";

export function CalendarEventsCard({ agenda, status }: { agenda?: CalendarEvents | GoogleCalendarResults; status?: CalendarDisplayStatus }) {
  const days = agenda ? groupCalendarEvents(agenda) : [];
  const dateOptions = { month: "short", day: "numeric", year: "numeric" } as const;
  return (
    <section className="calendar-panel" aria-label="Calendar results" aria-busy={status?.state === "loading"}>
      <div className="panel-heading"><span className="calendar-heading"><CalendarDays size={15} aria-hidden="true" /> Calendar results</span></div>
      {status && status.state !== "complete" && <p className="calendar-empty" role="status">{status.message}</p>}
      {agenda && <>
      <div className="calendar-range">
        {"source" in agenda ? <strong>{agenda.events.length} {agenda.events.length === 1 ? "event" : "events"} returned</strong> :
          <strong>{calendarDateLabel(agenda.rangeStart, dateOptions)} – {calendarDateLabel(shiftCalendarDate(agenda.rangeEnd, -1), dateOptions)}</strong>}
        <span>{agenda.timezone}</span>
      </div>
      <p className="sr-only" role="status">Agenda updated. {agenda.events.length} events received.</p>
      {days.length === 0 ? <p className="calendar-empty">No events returned for this request.</p> : (
        <div className="calendar-days" tabIndex={0} role="region" aria-label="Agenda events">
          {days.map(({ date, events }) => (
            <section className="calendar-day" key={date}>
              <h2><time dateTime={date}>{calendarDateLabel(date, { weekday: "long", month: "short", day: "numeric" })}</time></h2>
              <ul>{events.map((event) => (
                <li key={event.id}>
                  <span className="calendar-event-time">{calendarEventTime(event, agenda.timezone)}</span>
                  <strong>{event.title}</strong>
                </li>
              ))}</ul>
            </section>
          ))}
        </div>
      )}
      {"source" in agenda && agenda.hasMore && <p className="calendar-empty">More results are available. Ask your assistant for the next page.</p>}
      </>}
    </section>
  );
}
