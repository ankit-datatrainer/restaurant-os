/** Builds a one-event .ics file in the browser and hands it to the guest as a download. */

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** RFC 5545 text escaping. */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

export function buildIcs(event: { uid: string; start: number; minutes: number; title: string; location?: string | null; description?: string }): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Restaurant OS//Table booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}@restaurant-os`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.start + event.minutes * 60_000)}`,
    `SUMMARY:${esc(event.title)}`,
  ];
  if (event.location) lines.push(`LOCATION:${esc(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${esc(event.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
