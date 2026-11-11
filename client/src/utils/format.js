export function formatValue(value, fallback = 'Unavailable') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return String(value);
}

export function formatCount(value) {
  if (value === null || value === undefined || value === '') {
    return 'Unavailable';
  }

  const number = Number(value);
  if (Number.isNaN(number)) {
    return String(value);
  }

  return number.toLocaleString();
}

export function formatDicomDate(value) {
  const text = formatValue(value, '');
  if (!text) {
    return 'Unavailable';
  }

  if (/^\d{8}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  return text;
}

export function formatOrthancTimestamp(value) {
  const text = formatValue(value, '');
  if (!text) {
    return 'Unavailable';
  }

  if (/^\d{8}T\d{6}/.test(text)) {
    const year = text.slice(0, 4);
    const month = text.slice(4, 6);
    const day = text.slice(6, 8);
    const hour = text.slice(9, 11);
    const minute = text.slice(11, 13);
    const second = text.slice(13, 15);
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  return text;
}

export function formatActionLabel(value) {
  const text = formatValue(value, '');
  if (!text) {
    return 'Unavailable';
  }

  const words = text.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatRole(role) {
  if (role === 'administrator') return 'Administrator';
  if (role === 'radiologist') return 'Radiologist';
  if (role === 'practitioner') return 'Practitioner';
  return role ? String(role) : 'System';
}

export function homePathFor(role) {
  if (role === 'administrator') return '/admin/dashboard';
  if (role === 'radiologist') return '/dashboard';
  if (role === 'practitioner') return '/practitioner/dashboard';
  return '/dashboard';
}

export const APPOINTMENT_STATUS = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  completed: { label: 'Completed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  missed: { label: 'Missed', tone: 'warn' },
};

export const REPORT_STATUS = {
  draft: { label: 'Draft', tone: 'warn' },
  approved: { label: 'Approved', tone: 'ok' },
};

// SQLite datetime('now') values are UTC without a zone marker; show them in local time.
export function formatDateTime(value) {
  const text = formatValue(value, '');
  if (!text) {
    return 'Unavailable';
  }
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)$/.exec(text);
  if (!match) {
    return text;
  }
  const date = new Date(`${match[1]}T${match[2]}Z`);
  if (Number.isNaN(date.getTime())) {
    return text;
  }
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function shiftLocalDate(date, days) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

export const SCHEDULE_STATUS = {
  scheduled: { label: 'Scheduled', tone: 'info' },
  checked_in: { label: 'Checked In', tone: 'info' },
  in_progress: { label: 'In Progress', tone: 'primary' },
  completed: { label: 'Completed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  no_show: { label: 'No-Show', tone: 'warn' },
};

export const ALERT_TYPE = {
  no_show: { label: 'No-Show', tone: 'warn' },
  cancellation: { label: 'Cancellation', tone: 'neutral' },
  scheduling_conflict: { label: 'Scheduling Conflict', tone: 'danger' },
  unassigned: { label: 'Unassigned Examination', tone: 'warn' },
  access: { label: 'Account / Access', tone: 'danger' },
  system: { label: 'System', tone: 'info' },
};

export const MODALITY_LABELS = { XR: 'X-Ray', CT: 'CT', MR: 'MRI', US: 'Ultrasound' };

export function getApiError(error, fallback) {
  return error?.response?.data?.error || fallback;
}

export function getInitials(name) {
  const text = formatValue(name, '');
  return text ? text.slice(0, 2).toUpperCase() : '--';
}

export function formatStudyModalities(value) {
  const text = formatValue(value, '');
  if (!text) {
    return 'Unavailable';
  }

  return text.split('\\').filter(Boolean).join(', ');
}