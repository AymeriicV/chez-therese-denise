const PARIS_TIME_ZONE = "Europe/Paris";

function asDate(value: string | Date) {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00Z`);
  }
  return new Date(value);
}

function hasDateParts(options: Intl.DateTimeFormatOptions) {
  return Boolean(options.weekday || options.year || options.month || options.day);
}

function hasTimeParts(options: Intl.DateTimeFormatOptions) {
  return Boolean(options.hour || options.minute || options.second);
}

export function formatParisDate(value: string | Date, options: Intl.DateTimeFormatOptions = {}) {
  const config: Intl.DateTimeFormatOptions = { timeZone: PARIS_TIME_ZONE, ...options };
  if (!hasDateParts(options)) {
    config.dateStyle = "medium";
  }
  return new Intl.DateTimeFormat("fr-FR", config).format(asDate(value));
}

export function formatParisDateTime(value: string | Date, options: Intl.DateTimeFormatOptions = {}) {
  const config: Intl.DateTimeFormatOptions = { timeZone: PARIS_TIME_ZONE, ...options };
  if (!hasDateParts(options)) {
    config.dateStyle = "medium";
  }
  if (!hasTimeParts(options)) {
    config.timeStyle = "short";
  }
  return new Intl.DateTimeFormat("fr-FR", config).format(asDate(value));
}

export function formatParisTime(value: string | Date, options: Intl.DateTimeFormatOptions = {}) {
  const config: Intl.DateTimeFormatOptions = { timeZone: PARIS_TIME_ZONE, ...options };
  if (!hasTimeParts(options)) {
    config.hour = "2-digit";
    config.minute = "2-digit";
    config.second = "2-digit";
  }
  return new Intl.DateTimeFormat("fr-FR", config).format(asDate(value));
}

export function parisDateInput(reference = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

export function parisDateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(asDate(value));
}

export function shiftParisDateInput(value: string, deltaDays: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return parisDateInput(date);
}

export function weekStartFromParisDateInput(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  return parisDateInput(date);
}
