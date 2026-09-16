import { CalendarDays } from "lucide-react";
import { calendarDateLabel, calendarEventTime, groupCalendarEvents, shiftCalendarDate } from "@/lib/calendar-events";
import type { CalendarEvents } from "@/lib/types";

export function CalendarEventsCard({ agenda }: { agenda: CalendarEvents }) {
  const days = groupCalendarEvents(agenda);
  const dateOptions = { month: "short", day: "numeric", year: "numeric" } as const;
  return (
    <section className="calendar-panel" aria-label="Calendar agenda">
      <div className="panel-heading"><span className="calendar-heading"><CalendarDays size={15} aria-hidden="true" /> Your agenda</span></div>
      <div className="calendar-range">
        <strong>{calendarDateLabel(agenda.rangeStart, dateOptions)} – {calendarDateLabel(shiftCalendarDate(agenda.rangeEnd, -1), dateOptions)}</strong>
        <span>{agenda.timezone}</span>
      </div>
      <p className="sr-only" role="status">Agenda updated. {agenda.events.length} events received.</p>
      {days.length === 0 ? <p className="calendar-empty">No events in this date range.</p> : (
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
    </section>
  );
}
