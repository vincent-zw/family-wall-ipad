export function localReminderValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function defaultReminderValue(reference = new Date()) {
  const next = new Date(reference.getTime() + 30 * 60 * 1000);
  next.setMinutes(Math.ceil(next.getMinutes() / 5) * 5, 0, 0);
  return localReminderValue(next);
}

export function parseLocalReminderValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day || parsed.getHours() !== hour || parsed.getMinutes() !== minute) return null;
  return parsed;
}

export type ReminderRepeat = "once" | "daily" | "weekdays" | "weekly" | undefined;

export function reminderDueLabel(dueDate: Date | null, repeat: ReminderRepeat, repeatWeekdays: number[] = []) {
  if (!dueDate || Number.isNaN(dueDate.getTime())) return "请选择时间";
  const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(dueDate);
  if (repeat === "daily") return `每天 ${time}`;
  if (repeat === "weekdays") return `每个工作日 ${time}`;
  if (repeat === "weekly") {
    const selectedDays = repeatWeekdays.length ? repeatWeekdays : [dueDate.getDay()];
    const weekdayLabels = [
      { value: 1, label: "周一" }, { value: 2, label: "周二" }, { value: 3, label: "周三" },
      { value: 4, label: "周四" }, { value: 5, label: "周五" }, { value: 6, label: "周六" }, { value: 0, label: "周日" },
    ];
    const weekdays = weekdayLabels.filter((day) => selectedDays.includes(day.value)).map((day) => day.label).join("、");
    return `每周 ${weekdays} ${time}`;
  }
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(dueDate);
}
