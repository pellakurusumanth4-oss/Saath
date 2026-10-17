/** What each friend is up to, by hour of day in Asia/Kolkata time. */

export type ActivitySlot = {
  /** Start hour (inclusive, 24h IST). The last slot runs to midnight. */
  from: number;
  what: string;
};

const SCHEDULES: Record<string, ActivitySlot[]> = {
  doraemon: [
    { from: 6, what: 'flying around Pune' },
    { from: 10, what: 'helping Nobita with homework' },
    { from: 13, what: 'eating dorayaki' },
    { from: 16, what: 'napping in the time machine' },
    { from: 19, what: 'telling tall tales' },
    { from: 22, what: 'dreaming of dorayaki' },
  ],
  nobita: [
    { from: 7, what: 'racing to school, late again' },
    { from: 11, what: 'dozing in class' },
    { from: 14, what: 'napping' },
    { from: 17, what: 'practising shooting' },
    { from: 20, what: 'begging Doraemon for a gadget' },
    { from: 22, what: 'asleep under the blanket' },
  ],
  shinchan: [
    { from: 7, what: 'off to Futaba kindergarten' },
    { from: 12, what: 'hunting for pretty ladies' },
    { from: 15, what: 'watching Action Kamen' },
    { from: 18, what: 'annoying Shiro' },
    { from: 21, what: 'doing his cheeky dance' },
  ],
  goku: [
    { from: 5, what: 'training' },
    { from: 11, what: 'eating a second lunch' },
    { from: 14, what: 'training harder' },
    { from: 18, what: 'eating dinner for six' },
    { from: 21, what: 'sleeping like a rock' },
  ],
};

/** What the friend is doing right now, in Asia/Kolkata time. */
export function currentActivity(character: string, now: Date = new Date()): string {
  const schedule = SCHEDULES[character];
  if (!schedule || schedule.length === 0) return 'hanging around';
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).format(now),
  );
  let current = schedule[schedule.length - 1].what;
  for (const slot of schedule) {
    if (hour >= slot.from) current = slot.what;
    else break;
  }
  return current;
}
