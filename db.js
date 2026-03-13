const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.resolve(__dirname, 'library.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    // Users Table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Member' CHECK(role IN ('Admin', 'Member'))
      )
    `);

    // Books Table
    db.run(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        isbn TEXT UNIQUE NOT NULL,
        category TEXT,
        total_copies INTEGER NOT NULL DEFAULT 1,
        available_copies INTEGER NOT NULL DEFAULT 1
      )
    `);

    // Borrowings Table
    db.run(`
      CREATE TABLE IF NOT EXISTS borrowings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        book_id INTEGER NOT NULL,
        borrow_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        due_date DATETIME NOT NULL,
        return_date DATETIME,
        fine_amount REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (book_id) REFERENCES books (id)
      )
    `);

    // Optional: Seed an initial admin user if no users exist
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
      if (err) {
        console.error('Error checking users:', err);
        return;
      }
      if (row.count === 0) {
        bcrypt.hash('admin123', 10, (err, hash) => {
          if (err) {
            console.error('Error hashing password:', err);
            return;
          }
          db.run(
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
            ['admin', hash, 'Admin'],
            (err) => {
              if (err) console.error('Error inserting admin:', err);
              else console.log('Admin user seeded: username=admin, password=admin123');
            }
          );
        });
      }
    });
  });
}

module.exports = db;
