export const MODALITIES = [
  { code: 'XR', label: 'X-Ray', dicom: ['CR', 'DX', 'XR', 'RF'] },
  { code: 'CT', label: 'CT', dicom: ['CT'] },
  { code: 'MR', label: 'MRI', dicom: ['MR'] },
  { code: 'US', label: 'Ultrasound', dicom: ['US'] },
];

export const SCHEDULE_STATUSES = ['scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'];
export const PENDING_STATUSES = ['scheduled', 'checked_in', 'in_progress'];

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  checked_in: 'Checked In',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-Show',
};

export class ScheduleError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  // Reject impossible calendar dates like 2024-02-30 by checking if the parsed date matches the input
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const reconstructed = `${year}-${month}-${day}`;
  return reconstructed === value;
}

export function isPastDate(value, referenceDate = localDate()) {
  if (!isValidDate(value)) {
    return false;
  }
  return value < referenceDate;
}

function cleanText(value, maxLength) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, maxLength) : null;
}

const SELECT = `
  SELECT s.id, s.scheduled_date AS date, s.scheduled_time AS time, s.examination, s.modality, s.reference,
         s.status, s.notes, s.assigned_user_id AS assignedUserId,
         COALESCE(assignee.full_name, assignee.username) AS assignedTo,
         creator.username AS createdBy, s.created_at AS createdAt, s.updated_at AS updatedAt
  FROM imaging_schedule s
  LEFT JOIN users assignee ON assignee.id = s.assigned_user_id
  LEFT JOIN users creator ON creator.id = s.created_by
`;

export function createScheduleService(db, { alerts }) {
  const getById = db.prepare(`${SELECT} WHERE s.id = ?`);

  function validate(input) {
    const entry = {
      date: String(input.date || '').trim(),
      time: String(input.time || '').trim(),
      examination: cleanText(input.examination, 120),
      modality: String(input.modality || '').trim().toUpperCase(),
      reference: cleanText(input.reference, 40),
      notes: cleanText(input.notes, 300),
      assignedUserId: input.assignedUserId ? Number(input.assignedUserId) : null,
    };

    if (!isValidDate(entry.date)) {
      throw new ScheduleError('Enter a valid examination date.');
    }
    if (isPastDate(entry.date)) {
      throw new ScheduleError('Examination date cannot be in the past.');
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time)) {
      throw new ScheduleError('Enter a valid time (HH:MM).');
    }
    if (!entry.examination) {
      throw new ScheduleError('Examination description is required.');
    }
    if (!MODALITIES.some((item) => item.code === entry.modality)) {
      throw new ScheduleError('Select a valid modality.');
    }
    if (entry.assignedUserId) {
      const assignee = db
        .prepare(`SELECT id FROM users WHERE id = ? AND role = 'practitioner' AND status = 'active' AND restricted = 0`)
        .get(entry.assignedUserId);
      if (!assignee) {
        throw new ScheduleError('Assigned practitioner must be an active, unrestricted practitioner account.');
      }
    }
    return entry;
  }

  function findConflicts(entry, excludeId = null) {
    return db
      .prepare(
        `${SELECT}
         WHERE s.scheduled_date = @date AND s.scheduled_time = @time
           AND s.status NOT IN ('cancelled', 'no_show', 'completed')
           AND (s.modality = @modality OR (@assignee IS NOT NULL AND s.assigned_user_id = @assignee))
           AND (@excludeId IS NULL OR s.id != @excludeId)`,
      )
      .all({ date: entry.date, time: entry.time, modality: entry.modality, assignee: entry.assignedUserId, excludeId });
  }

  function raiseEntryAlerts(entry, id) {
    const resource = `schedule #${id}`;
    const when = `${entry.date} ${entry.time}`;
    if (!entry.assignedUserId) {
      alerts.raise({
        type: 'unassigned',
        description: `${entry.examination} (${entry.modality}) at ${when} has no assigned practitioner.`,
        resource,
        dedupeMinutes: 60,
      });
    }
    const conflicts = findConflicts(entry, id);
    if (conflicts.length > 0) {
      alerts.raise({
        type: 'scheduling_conflict',
        description: `${entry.examination} (${entry.modality}) at ${when} overlaps with ${conflicts
          .map((item) => `#${item.id}`)
          .join(', ')} on the same modality or practitioner.`,
        resource,
        dedupeMinutes: 60,
      });
    }
    return conflicts;
  }

  return {
    get(id) {
      return getById.get(Number(id)) ?? null;
    },

    list({ dateFrom, dateTo, modality, status } = {}) {
      const clauses = [];
      const params = {};
      if (isValidDate(dateFrom)) {
        clauses.push('s.scheduled_date >= @dateFrom');
        params.dateFrom = dateFrom;
      }
      if (isValidDate(dateTo)) {
        clauses.push('s.scheduled_date <= @dateTo');
        params.dateTo = dateTo;
      }
      if (modality && modality !== 'all') {
        clauses.push('s.modality = @modality');
        params.modality = String(modality).toUpperCase();
      }
      if (status === 'pending') {
        clauses.push(`s.status IN (${PENDING_STATUSES.map((item) => `'${item}'`).join(', ')})`);
      } else if (SCHEDULE_STATUSES.includes(status)) {
        clauses.push('s.status = @status');
        params.status = status;
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      return db.prepare(`${SELECT} ${where} ORDER BY s.scheduled_date, s.scheduled_time, s.id LIMIT 1000`).all(params);
    },

    create(input, actorId) {
      const entry = validate(input);
      const result = db
        .prepare(
          `INSERT INTO imaging_schedule (scheduled_date, scheduled_time, examination, modality, reference, assigned_user_id, notes, status, created_by, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, datetime('now'))`,
        )
        .run(entry.date, entry.time, entry.examination, entry.modality, entry.reference, entry.assignedUserId, entry.notes, actorId);
      const conflicts = raiseEntryAlerts(entry, result.lastInsertRowid);
      return { entry: getById.get(result.lastInsertRowid), conflicts };
    },

    update(id, input) {
      const existing = getById.get(Number(id));
      if (!existing) {
        throw new ScheduleError('Schedule entry not found.', 404);
      }
      const entry = validate({ ...existing, ...input });
      db.prepare(
        `UPDATE imaging_schedule SET scheduled_date = ?, scheduled_time = ?, examination = ?, modality = ?, reference = ?,
           assigned_user_id = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(entry.date, entry.time, entry.examination, entry.modality, entry.reference, entry.assignedUserId, entry.notes, existing.id);
      const conflicts = raiseEntryAlerts(entry, existing.id);
      return { before: existing, entry: getById.get(existing.id), conflicts };
    },

    setStatus(id, status) {
      const existing = getById.get(Number(id));
      if (!existing) {
        throw new ScheduleError('Schedule entry not found.', 404);
      }
      if (!SCHEDULE_STATUSES.includes(status)) {
        throw new ScheduleError('Invalid examination status.');
      }
      db.prepare(`UPDATE imaging_schedule SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, existing.id);

      const when = `${existing.date} ${existing.time}`;
      if (status === 'no_show' && existing.status !== 'no_show') {
        alerts.raise({
          type: 'no_show',
          description: `Patient did not attend ${existing.examination} (${existing.modality}) scheduled for ${when}.`,
          resource: `schedule #${existing.id}`,
        });
      }
      if (status === 'cancelled' && existing.status !== 'cancelled') {
        alerts.raise({
          type: 'cancellation',
          description: `${existing.examination} (${existing.modality}) scheduled for ${when} was cancelled.`,
          resource: `schedule #${existing.id}`,
        });
      }
      return { before: existing, entry: getById.get(existing.id) };
    },

    summaryForDate(date) {
      const rows = db
        .prepare(`SELECT status, COUNT(*) AS total FROM imaging_schedule WHERE scheduled_date = ? GROUP BY status`)
        .all(date);
      const counts = Object.fromEntries(SCHEDULE_STATUSES.map((item) => [item, 0]));
      for (const row of rows) {
        counts[row.status] = row.total;
      }
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      const pending = PENDING_STATUSES.reduce((sum, key) => sum + counts[key], 0);
      return { date, total, pending, ...counts };
    },

    modalityBreakdown({ date, dateFrom, dateTo }) {
      const today = db
        .prepare(`SELECT modality, status, COUNT(*) AS total FROM imaging_schedule WHERE scheduled_date = ? GROUP BY modality, status`)
        .all(date);
      const range = db
        .prepare(
          `SELECT modality, status, COUNT(*) AS total FROM imaging_schedule
           WHERE scheduled_date BETWEEN ? AND ? GROUP BY modality, status`,
        )
        .all(dateFrom, dateTo);
      const next = db
        .prepare(
          `SELECT modality, MIN(scheduled_date || ' ' || scheduled_time) AS nextAt FROM imaging_schedule
           WHERE status = 'scheduled' AND scheduled_date >= ? GROUP BY modality`,
        )
        .all(date);

      return MODALITIES.map((modality) => {
        const pick = (rows, statuses) =>
          rows
            .filter((row) => row.modality === modality.code && (!statuses || statuses.includes(row.status)))
            .reduce((sum, row) => sum + row.total, 0);

        const todayTotal = pick(today);
        const inProgress = pick(today, ['in_progress']);
        const todayPending = pick(today, PENDING_STATUSES);

        let activityStatus = 'no_activity';
        if (inProgress > 0) {
          activityStatus = 'in_use';
        } else if (todayPending > 0) {
          activityStatus = 'scheduled';
        } else if (todayTotal > 0) {
          activityStatus = 'idle';
        }

        return {
          code: modality.code,
          label: modality.label,
          dicom: modality.dicom,
          activityStatus,
          today: {
            total: todayTotal,
            pending: todayPending,
            inProgress,
            completed: pick(today, ['completed']),
            noShows: pick(today, ['no_show']),
            cancelled: pick(today, ['cancelled']),
          },
          period: {
            total: pick(range),
            completed: pick(range, ['completed']),
            noShows: pick(range, ['no_show']),
            cancelled: pick(range, ['cancelled']),
          },
          nextScheduled: next.find((row) => row.modality === modality.code)?.nextAt ?? null,
        };
      });
    },

    statusLabel(status) {
      return STATUS_LABELS[status] ?? status;
    },

    count() {
      return db.prepare('SELECT COUNT(*) AS total FROM imaging_schedule').get().total;
    },
  };
}
