type DateInput = Date | string | number | null | undefined;

const toDate = (value: DateInput): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** End of the given date (23:59:59.999). Used so "valid until X" means through end of day X. */
export const endOfDay = (value: DateInput): Date | null => {
  const date = toDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
};

/** Days until date (can be negative if in the past). Uses calendar day difference. */
export const daysUntil = (value: DateInput): number | null => {
  const date = toDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
};

export const formatDate = (
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: '2-digit' }
): string => {
  const date = toDate(value);
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat(undefined, options).format(date);
};

export const formatTime = (
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
): string => {
  const date = toDate(value);
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat(undefined, options).format(date);
};

export const formatDateTime = (
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }
): string => {
  const date = toDate(value);
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat(undefined, options).format(date);
};

/** Relative "Xm ago / Xh ago / Xd ago" for reachability columns. */
export const timeAgo = (value: DateInput): string => {
  const date = toDate(value);
  if (!date) return 'never';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};
