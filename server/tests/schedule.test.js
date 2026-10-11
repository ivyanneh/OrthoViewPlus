import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDatabase } from '../src/db.js';
import { createUserService } from '../src/services/users.js';
import { createAlertService } from '../src/services/alerts.js';
import { createScheduleService, ScheduleError, MODALITIES, SCHEDULE_STATUSES, isValidDate, localDate, isPastDate } from '../src/services/schedule.js';

function withTemporaryDatabase(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orthoviewplus-test-'));
  const databasePath = path.join(directory, 'test.db');
  const db = createDatabase(databasePath);

  try {
    run(db);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function futureDate(days = 0) {
  return localDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
}

test('scheduling: create valid schedule entry', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({
      username: 'admin',
      password: 'TestPassword123',
      role: 'administrator',
    });

    const practitioner = users.create({
      username: 'practitioner',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    const today = localDate();

    const { entry } = schedule.create(
      {
        date: today,
        time: '14:30',
        examination: 'Knee X-Ray',
        modality: 'XR',
        reference: 'REF-123',
        notes: 'Patient preparation required',
        assignedUserId: practitioner.id,
      },
      admin.id,
    );

    assert.ok(entry);
    assert.equal(entry.date, today);
    assert.equal(entry.time, '14:30');
    assert.equal(entry.examination, 'Knee X-Ray');
    assert.equal(entry.modality, 'XR');
    assert.equal(entry.status, 'scheduled');
    assert.equal(entry.assignedUserId, practitioner.id);
  });
});

test('scheduling: reject invalid date format', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    assert.throws(
      () => {
        schedule.create(
          {
            date: 'invalid-date',
            time: '14:30',
            examination: 'Test',
            modality: 'XR',
          },
          admin.id,
        );
      },
      (err) => err instanceof ScheduleError,
    );
  });
});

test('scheduling: reject impossible calendar date (30 February)', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    assert.throws(
      () => {
        schedule.create(
          {
            date: '2024-02-30',
            time: '14:30',
            examination: 'Test',
            modality: 'XR',
          },
          admin.id,
        );
      },
      (err) => err instanceof ScheduleError && err.message.includes('valid examination date'),
    );
  });
});

test('scheduling: reject invalid time format', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    assert.throws(
      () => {
        schedule.create(
          {
            date: futureDate(1),
            time: '25:00',
            examination: 'Test',
            modality: 'XR',
          },
          admin.id,
        );
      },
      (err) => err instanceof ScheduleError,
    );
  });
});

test('scheduling: reject missing examination', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    assert.throws(
      () => {
        schedule.create(
          {
            date: futureDate(1),
            time: '14:30',
            examination: '',
            modality: 'XR',
          },
          admin.id,
        );
      },
      (err) => err instanceof ScheduleError,
    );
  });
});

test('scheduling: reject invalid modality', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    assert.throws(
      () => {
        schedule.create(
          {
            date: futureDate(1),
            time: '14:30',
            examination: 'Test',
            modality: 'INVALID',
          },
          admin.id,
        );
      },
      (err) => err instanceof ScheduleError,
    );
  });
});

test('scheduling: reject assignment to inactive practitioner', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });
    const practitioner = users.create({
      username: 'practitioner',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    users.setStatus(practitioner.id, 'inactive', admin.id);

    assert.throws(
      () => {
        schedule.create(
          {
            date: futureDate(1),
            time: '14:30',
            examination: 'Test',
            modality: 'XR',
            assignedUserId: practitioner.id,
          },
          admin.id,
        );
      },
      (err) => err instanceof ScheduleError,
    );
  });
});

test('scheduling: reject assignment to restricted practitioner', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });
    const practitioner = users.create({
      username: 'practitioner',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    users.setRestriction(practitioner.id, true, 'Security review', admin.id);

    assert.throws(
      () => {
        schedule.create(
          {
            date: futureDate(1),
            time: '14:30',
            examination: 'Test',
            modality: 'XR',
            assignedUserId: practitioner.id,
          },
          admin.id,
        );
      },
      (err) => err instanceof ScheduleError && err.message.includes('unrestricted'),
    );
  });
});

test('scheduling: reject assignment to administrator', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({
      username: 'admin',
      password: 'TestPassword123',
      role: 'administrator',
    });

    assert.throws(
      () => {
        schedule.create(
          {
            date: futureDate(1),
            time: '14:30',
            examination: 'Test',
            modality: 'XR',
            assignedUserId: admin.id,
          },
          admin.id,
        );
      },
      (err) => err instanceof ScheduleError,
    );
  });
});

test('scheduling: detect modality conflict', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });
    const practitioner = users.create({
      username: 'practitioner',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    schedule.create(
      {
        date: futureDate(1),
        time: '14:30',
        examination: 'Knee X-Ray',
        modality: 'XR',
        assignedUserId: practitioner.id,
      },
      admin.id,
    );

    const { conflicts } = schedule.create(
      {
        date: futureDate(1),
        time: '14:30',
        examination: 'Hip X-Ray',
        modality: 'XR',
        assignedUserId: null,
      },
      admin.id,
    );

    assert.ok(conflicts.length > 0);
  });
});

test('scheduling: detect practitioner conflict', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });
    const practitioner = users.create({
      username: 'practitioner',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    schedule.create(
      {
        date: futureDate(1),
        time: '14:30',
        examination: 'Knee X-Ray',
        modality: 'XR',
        assignedUserId: practitioner.id,
      },
      admin.id,
    );

    const { conflicts } = schedule.create(
      {
        date: futureDate(1),
        time: '14:30',
        examination: 'CT Scan',
        modality: 'CT',
        assignedUserId: practitioner.id,
      },
      admin.id,
    );

    assert.ok(conflicts.length > 0);
  });
});

test('scheduling: update schedule entry', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    const { entry } = schedule.create(
      {
        date: futureDate(1),
        time: '14:30',
        examination: 'Knee X-Ray',
        modality: 'XR',
      },
      admin.id,
    );

    const { entry: updated } = schedule.update(entry.id, { examination: 'Hip X-Ray' });
    assert.equal(updated.examination, 'Hip X-Ray');
  });
});

test('scheduling: change status', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    const { entry } = schedule.create(
      {
        date: futureDate(1),
        time: '14:30',
        examination: 'Test',
        modality: 'XR',
      },
      admin.id,
    );

    const { entry: updated } = schedule.setStatus(entry.id, 'completed');
    assert.equal(updated.status, 'completed');
  });
});

test('scheduling: reject invalid status', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    const { entry } = schedule.create(
      {
        date: futureDate(1),
        time: '14:30',
        examination: 'Test',
        modality: 'XR',
      },
      admin.id,
    );

    assert.throws(() => schedule.setStatus(entry.id, 'invalid_status'), (err) => err instanceof ScheduleError);
  });
});

test('scheduling: list with date range filter', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    schedule.create({ date: futureDate(1), time: '14:30', examination: 'Test', modality: 'XR' }, admin.id);
    schedule.create({ date: futureDate(2), time: '14:30', examination: 'Test', modality: 'XR' }, admin.id);
    schedule.create({ date: futureDate(3), time: '14:30', examination: 'Test', modality: 'XR' }, admin.id);

    const entries = schedule.list({ dateFrom: futureDate(1), dateTo: futureDate(2) });
    assert.equal(entries.length, 2);
  });
});

test('scheduling: list with modality filter', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    schedule.create({ date: futureDate(1), time: '14:30', examination: 'Test', modality: 'XR' }, admin.id);
    schedule.create({ date: futureDate(1), time: '15:30', examination: 'Test', modality: 'CT' }, admin.id);

    const entries = schedule.list({ modality: 'XR' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].modality, 'XR');
  });
});

test('scheduling: list with status filter', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    const { entry: entry1 } = schedule.create({ date: futureDate(1), time: '14:30', examination: 'Test', modality: 'XR' }, admin.id);
    const { entry: entry2 } = schedule.create({ date: futureDate(1), time: '15:30', examination: 'Test', modality: 'XR' }, admin.id);

    schedule.setStatus(entry1.id, 'completed');

    const entries = schedule.list({ status: 'completed' });
    assert.equal(entries.length, 1);
  });
});

test('scheduling: list with pending status filter', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    const { entry: entry1 } = schedule.create({ date: futureDate(1), time: '14:30', examination: 'Test', modality: 'XR' }, admin.id);
    const { entry: entry2 } = schedule.create({ date: futureDate(1), time: '15:30', examination: 'Test', modality: 'XR' }, admin.id);

    schedule.setStatus(entry1.id, 'completed');

    const entries = schedule.list({ status: 'pending' });
    assert.equal(entries.length, 1);
  });
});

test('scheduling: get entry by id', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    const { entry } = schedule.create(
      {
        date: futureDate(1),
        time: '14:30',
        examination: 'Test',
        modality: 'XR',
      },
      admin.id,
    );

    const found = schedule.get(entry.id);
    assert.ok(found);
    assert.equal(found.id, entry.id);
  });
});

test('scheduling: summary for date', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    const { entry: entry1 } = schedule.create({ date: futureDate(1), time: '14:30', examination: 'Test', modality: 'XR' }, admin.id);
    const { entry: entry2 } = schedule.create({ date: futureDate(1), time: '15:30', examination: 'Test', modality: 'XR' }, admin.id);

    schedule.setStatus(entry1.id, 'completed');
    schedule.setStatus(entry2.id, 'in_progress');

    const summary = schedule.summaryForDate(futureDate(1));
    assert.equal(summary.total, 2);
    assert.equal(summary.completed, 1);
    assert.equal(summary.in_progress, 1);
  });
});

test('scheduling: modality breakdown', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    schedule.create({ date: futureDate(1), time: '14:30', examination: 'Test', modality: 'XR' }, admin.id);
    schedule.create({ date: futureDate(1), time: '15:30', examination: 'Test', modality: 'CT' }, admin.id);

    const breakdown = schedule.modalityBreakdown({ date: futureDate(1), dateFrom: futureDate(1), dateTo: futureDate(16) });
    assert.equal(breakdown.length, MODALITIES.length);
  });
});

test('scheduling: status label', () => {
  const alerts = createAlertService(createDatabase(':memory:'));
  const schedule = createScheduleService(createDatabase(':memory:'), { alerts });

  assert.equal(schedule.statusLabel('scheduled'), 'Scheduled');
  assert.equal(schedule.statusLabel('completed'), 'Completed');
  assert.equal(schedule.statusLabel('cancelled'), 'Cancelled');
});

test('scheduling: count entries', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    schedule.create({ date: futureDate(1), time: '14:30', examination: 'Test', modality: 'XR' }, admin.id);
    schedule.create({ date: futureDate(1), time: '15:30', examination: 'Test', modality: 'XR' }, admin.id);

    assert.equal(schedule.count(), 2);
  });
});

test('scheduling: isValidDate validates correct dates', () => {
  assert.equal(isValidDate(futureDate(1)), true);
  assert.equal(isValidDate('2024-02-29'), true); // Leap year
  assert.equal(isValidDate('2023-02-28'), true);
});

test('scheduling: isValidDate rejects invalid dates', () => {
  assert.equal(isValidDate('2024-02-30'), false); // Impossible date
  assert.equal(isValidDate('2023-02-29'), false); // Non-leap year
  assert.equal(isValidDate('invalid'), false);
  assert.equal(isValidDate('2024/12/15'), false);
  assert.equal(isValidDate(''), false);
});

test('scheduling: isPastDate correctly identifies past dates', () => {
  const referenceDate = '2024-12-15';
  assert.equal(isPastDate('2024-12-14', referenceDate), true); // Yesterday
  assert.equal(isPastDate('2024-01-01', referenceDate), true); // Earlier this year
  assert.equal(isPastDate('2023-12-31', referenceDate), true); // Last year
  assert.equal(isPastDate('2024-12-15', referenceDate), false); // Today (reference date)
  assert.equal(isPastDate('2024-12-16', referenceDate), false); // Tomorrow
  assert.equal(isPastDate('2025-01-01', referenceDate), false); // Next year
  assert.equal(isPastDate('invalid', referenceDate), false); // Invalid date returns false
});

test('scheduling: reject past date for new appointment', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    // Use a fixed reference date for testing
    const referenceDate = '2024-12-15';

    assert.throws(
      () => {
        schedule.create(
          {
            date: futureDate(-1), // Yesterday
            time: '14:30',
            examination: 'Test',
            modality: 'XR',
          },
          admin.id,
        );
      },
      (err) => err instanceof ScheduleError && err.message.includes('cannot be in the past'),
    );
  });
});

test('scheduling: accept today for new appointment', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    const { entry } = schedule.create(
      {
        date: localDate(), // Today
        time: '14:30',
        examination: 'Test',
        modality: 'XR',
      },
      admin.id,
    );

    assert.ok(entry);
    assert.equal(entry.date, localDate());
  });
});

test('scheduling: accept future date for new appointment', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    const futureDate = localDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)); // 7 days from now

    const { entry } = schedule.create(
      {
        date: futureDate,
        time: '14:30',
        examination: 'Test',
        modality: 'XR',
      },
      admin.id,
    );

    assert.ok(entry);
    assert.equal(entry.date, futureDate);
  });
});

test('scheduling: rejected past-date appointment does not create database record', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    const initialCount = schedule.count();

    assert.throws(
      () => {
        schedule.create(
          {
            date: '2020-01-01', // Past date
            time: '14:30',
            examination: 'Test',
            modality: 'XR',
          },
          admin.id,
        );
      },
      (err) => err instanceof ScheduleError,
    );

    const finalCount = schedule.count();
    assert.equal(initialCount, finalCount); // No record created
  });
});

test('scheduling: historical records remain viewable via list', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const alerts = createAlertService(db);
    const schedule = createScheduleService(db, { alerts });

    const admin = users.create({ username: 'admin', password: 'TestPassword123', role: 'administrator' });

    // Create a historical record directly in the database (bypassing validation)
    db.prepare(
      `INSERT INTO imaging_schedule (scheduled_date, scheduled_time, examination, modality, status, created_by, updated_at)
       VALUES (?, ?, ?, ?, 'completed', ?, datetime('now'))`,
    ).run('2024-01-01', '14:30', 'Historical Exam', 'XR', admin.id);

    // Verify it can be listed
    const entries = schedule.list({ dateFrom: '2024-01-01', dateTo: '2024-01-01' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].date, '2024-01-01');
  });
});

test('scheduling: localDate returns current date in YYYY-MM-DD format', () => {
  const date = localDate();
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(date));
});

test('scheduling: MODALITIES are defined', () => {
  assert.ok(MODALITIES.length > 0);
  assert.ok(MODALITIES.find((m) => m.code === 'XR'));
  assert.ok(MODALITIES.find((m) => m.code === 'CT'));
  assert.ok(MODALITIES.find((m) => m.code === 'MR'));
  assert.ok(MODALITIES.find((m) => m.code === 'US'));
});

test('scheduling: SCHEDULE_STATUSES are defined', () => {
  assert.ok(SCHEDULE_STATUSES.includes('scheduled'));
  assert.ok(SCHEDULE_STATUSES.includes('completed'));
  assert.ok(SCHEDULE_STATUSES.includes('cancelled'));
  assert.ok(SCHEDULE_STATUSES.includes('no_show'));
});
