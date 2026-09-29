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

export function formatStudyModalities(value) {
  const text = formatValue(value, '');
  if (!text) {
    return 'Unavailable';
  }

  return text.split('\\').filter(Boolean).join(', ');
}