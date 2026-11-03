import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { createDatabase } from '../src/db.js';
import { createClinicalRouter } from '../src/routes/clinical.js';
import { createNotificationService } from '../src/services/notifications.js';

async function requestWithUser(router, user, method, route) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method });
    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('notification routes enforce ownership and support read and read-all state', async () => {
  const db = createDatabase(':memory:');
  try {
    const insertUser = db.prepare(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    );
    const firstUserId = insertUser.run('notify-one', 'test-hash', 'practitioner').lastInsertRowid;
    const secondUserId = insertUser.run('notify-two', 'test-hash', 'radiologist').lastInsertRowid;
    const notifications = createNotificationService(db);
    const ownNotification = notifications.create({
      userId: firstUserId,
      type: 'test',
      title: 'Own notification',
      message: 'Visible to its owner.',
    });
    const otherNotification = notifications.create({
      userId: secondUserId,
      type: 'test',
      title: 'Other notification',
      message: 'Must not be exposed.',
    });
    const router = createClinicalRouter({
      patients: {},
      appointments: {},
      requests: {},
      reports: {},
      studies: {},
      notifications,
      audit: { log() {} },
      users: {},
    });
    const user = { id: firstUserId, role: 'practitioner', username: 'notify-one' };

    const listed = await requestWithUser(router, user, 'GET', '/notifications');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.unread, 1);
    assert.deepEqual(listed.body.notifications.map((item) => item.id), [ownNotification.id]);

    const denied = await requestWithUser(router, user, 'POST', `/notifications/${otherNotification.id}/read`);
    assert.equal(denied.status, 404);
    assert.equal(notifications.unreadCount(secondUserId), 1);

    const marked = await requestWithUser(router, user, 'POST', `/notifications/${ownNotification.id}/read`);
    assert.equal(marked.status, 200);
    assert.ok(marked.body.notification.readAt);
    assert.equal(notifications.unreadCount(firstUserId), 0);

    notifications.create({
      userId: firstUserId,
      type: 'test',
      title: 'Another own notification',
      message: 'Mark all read.',
    });
    const markAll = await requestWithUser(router, user, 'POST', '/notifications/read-all');
    assert.equal(markAll.status, 200);
    assert.equal(notifications.unreadCount(firstUserId), 0);
    assert.equal(notifications.unreadCount(secondUserId), 1);
  } finally {
    db.close();
  }
});
