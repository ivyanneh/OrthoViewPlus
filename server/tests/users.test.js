import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

import { createDatabase } from '../src/db.js';
import { createUserService, UserError, ROLES, USER_STATUSES, MIN_PASSWORD_LENGTH } from '../src/services/users.js';

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

test('user management: create user with valid data', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
      fullName: 'Test User',
      email: 'test@example.com',
      department: 'Radiology',
    });

    assert.ok(user);
    assert.equal(user.username, 'testuser');
    assert.equal(user.role, 'practitioner');
    assert.equal(user.fullName, 'Test User');
    assert.equal(user.email, 'test@example.com');
    assert.equal(user.department, 'Radiology');
    assert.equal(user.status, 'active');
    assert.equal(user.restricted, false);
  });
});

test('user management: reject duplicate username', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    assert.throws(
      () => {
        users.create({
          username: 'testuser',
          password: 'AnotherPassword123',
          role: 'practitioner',
        });
      },
      (err) => err instanceof UserError && err.status === 409,
    );
  });
});

test('user management: reject username with invalid characters', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    assert.throws(
      () => {
        users.create({
          username: 'invalid@user',
          password: 'TestPassword123',
          role: 'practitioner',
        });
      },
      (err) => err instanceof UserError,
    );
  });
});

test('user management: reject username shorter than 3 characters', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    assert.throws(
      () => {
        users.create({
          username: 'ab',
          password: 'TestPassword123',
          role: 'practitioner',
        });
      },
      (err) => err instanceof UserError,
    );
  });
});

test('user management: reject password shorter than minimum length', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    assert.throws(
      () => {
        users.create({
          username: 'testuser',
          password: 'short',
          role: 'practitioner',
        });
      },
      (err) => err instanceof UserError && err.message.includes(MIN_PASSWORD_LENGTH),
    );
  });
});

test('user management: reject invalid role', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    assert.throws(
      () => {
        users.create({
          username: 'testuser',
          password: 'TestPassword123',
          role: 'invalid_role',
        });
      },
      (err) => err instanceof UserError,
    );
  });
});

test('user management: reject invalid email format', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    assert.throws(
      () => {
        users.create({
          username: 'testuser',
          password: 'TestPassword123',
          role: 'practitioner',
          email: 'invalid-email',
        });
      },
      (err) => err instanceof UserError,
    );
  });
});

test('user management: password is stored as bcrypt hash', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);
    const password = 'TestPassword123';

    const user = users.create({
      username: 'testuser',
      password,
      role: 'practitioner',
    });

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    assert.notEqual(row.password_hash, password);
    assert.match(row.password_hash, /^\$2[aby]\$/);
    assert.equal(bcrypt.compareSync(password, row.password_hash), true);
  });
});

test('user management: update user details', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
      fullName: 'Test User',
    });

    const result = users.update(user.id, {
      fullName: 'Updated Name',
      email: 'updated@example.com',
      department: 'Cardiology',
    }, 999);

    assert.equal(result.user.fullName, 'Updated Name');
    assert.equal(result.user.email, 'updated@example.com');
    assert.equal(result.user.department, 'Cardiology');
    assert.equal(result.roleChanged, false);
    assert.equal(result.passwordChanged, false);
  });
});

test('user management: update user role', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    const result = users.update(user.id, { role: 'administrator' }, 999);

    assert.equal(result.user.role, 'administrator');
    assert.equal(result.roleChanged, true);
  });
});

test('user management: prevent self role change', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    assert.throws(
      () => {
        users.update(user.id, { role: 'administrator' }, user.id);
      },
      (err) => err instanceof UserError && err.status === 409,
    );
  });
});

test('user management: prevent deactivating last active admin', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const admin = users.create({
      username: 'admin',
      password: 'TestPassword123',
      role: 'administrator',
    });

    assert.throws(
      () => {
        users.setStatus(admin.id, 'inactive', 999);
      },
      (err) => err instanceof UserError && err.status === 409,
    );
  });
});

test('user management: prevent removing last active admin', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const admin = users.create({
      username: 'admin',
      password: 'TestPassword123',
      role: 'administrator',
    });

    assert.throws(
      () => {
        users.setStatus(admin.id, 'removed', 999);
      },
      (err) => err instanceof UserError && err.status === 409,
    );
  });
});

test('user management: allow deactivating when multiple admins exist', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const admin1 = users.create({
      username: 'admin1',
      password: 'TestPassword123',
      role: 'administrator',
    });

    users.create({
      username: 'admin2',
      password: 'TestPassword123',
      role: 'administrator',
    });

    const result = users.setStatus(admin1.id, 'inactive', 999);
    assert.equal(result.status, 'inactive');
  });
});

test('user management: prevent editing removed account', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    users.setStatus(user.id, 'removed', 999);

    assert.throws(
      () => {
        users.update(user.id, { fullName: 'Updated' }, 999);
      },
      (err) => err instanceof UserError && err.status === 409,
    );
  });
});

test('user management: prevent reactivating removed account', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    users.setStatus(user.id, 'removed', 999);

    assert.throws(
      () => {
        users.setStatus(user.id, 'active', 999);
      },
      (err) => err instanceof UserError && err.status === 409,
    );
  });
});

test('user management: set user restriction', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    const result = users.setRestriction(user.id, true, 'Security review', 999);
    assert.equal(result.restricted, true);
    assert.equal(result.restrictionReason, 'Security review');
  });
});

test('user management: remove user restriction', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    users.setRestriction(user.id, true, 'Security review', 999);
    const result = users.setRestriction(user.id, false, null, 999);
    assert.equal(result.restricted, false);
    assert.equal(result.restrictionReason, null);
  });
});

test('user management: prevent restricting last active admin', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const admin = users.create({
      username: 'admin',
      password: 'TestPassword123',
      role: 'administrator',
    });

    assert.throws(
      () => {
        users.setRestriction(admin.id, true, 'Test', 999);
      },
      (err) => err instanceof UserError && err.status === 409,
    );
  });
});

test('user management: prevent self restriction', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    assert.throws(
      () => {
        users.setRestriction(user.id, true, 'Test', user.id);
      },
      (err) => err instanceof UserError && err.status === 409,
    );
  });
});

test('user management: record login timestamp', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    users.recordLogin(user.id);

    const updated = users.get(user.id);
    assert.ok(updated.lastLoginAt);
  });
});

test('user management: list all users', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    users.create({ username: 'user1', password: 'TestPassword123', role: 'practitioner' });
    users.create({ username: 'user2', password: 'TestPassword123', role: 'administrator' });

    const list = users.list();
    assert.equal(list.length, 2);
  });
});

test('user management: get user by id', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    const found = users.get(user.id);
    assert.ok(found);
    assert.equal(found.username, 'testuser');
  });
});

test('user management: get auth state for middleware', () => {
  withTemporaryDatabase((db) => {
    const users = createUserService(db);

    const user = users.create({
      username: 'testuser',
      password: 'TestPassword123',
      role: 'practitioner',
    });

    const authState = users.getAuthState(user.id);
    assert.ok(authState);
    assert.equal(authState.id, user.id);
    assert.equal(authState.username, 'testuser');
    assert.equal(authState.role, 'practitioner');
    assert.equal(authState.status, 'active');
    assert.equal(authState.restricted, 0);
  });
});
