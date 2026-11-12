const Database = require('better-sqlite3');
const db = new Database('./data/orthoviewplus.db', {readonly: true, fileMustExist: true});
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));
db.close();
