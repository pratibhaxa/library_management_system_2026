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

    // Seed initial dummy data if users table has 0 or 1 user (default admin)
    db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
      if (err) {
        console.error('Error checking users:', err);
        return;
      }
      if (row.count <= 1) {
        console.log('Seeding initial database with dummy data...');
        // Clear tables to ensure clean sequential IDs
        db.serialize(() => {
          db.run('DELETE FROM borrowings');
          db.run('DELETE FROM books');
          db.run('DELETE FROM users');
          db.run('DELETE FROM sqlite_sequence'); // Reset autoincrement IDs

          // Seed users
          const usersToSeed = [
            { username: 'admin', password: 'admin123', role: 'Admin' },
            { username: 'librarian', password: 'librarian123', role: 'Admin' },
            { username: 'john_doe', password: 'member123', role: 'Member' },
            { username: 'jane_smith', password: 'member123', role: 'Member' },
            { username: 'alice_jones', password: 'member123', role: 'Member' }
          ];

          let completedUsers = 0;
          usersToSeed.forEach((u) => {
            bcrypt.hash(u.password, 10, (err, hash) => {
              if (err) {
                console.error('Error hashing password for ' + u.username, err);
                return;
              }
              db.run(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                [u.username, hash, u.role],
                (err) => {
                  if (err) console.error('Error seeding user ' + u.username, err);
                  completedUsers++;
                  if (completedUsers === usersToSeed.length) {
                    console.log('Users seeded successfully.');
                    seedBooksAndBorrowings();
                  }
                }
              );
            });
          });
        });
      }
    });
  });
}

function seedBooksAndBorrowings() {
  const initialBooks = [
    { title: "To Kill a Mockingbird", author: "Harper Lee", isbn: "9780061120084", category: "Fiction", total: 5, available: 5 },
    { title: "1984", author: "George Orwell", isbn: "9780451524935", category: "Fiction", total: 4, available: 3 }, // 1 borrowed
    { title: "A Brief History of Time", author: "Stephen Hawking", isbn: "9780553380163", category: "Science", total: 3, available: 3 },
    { title: "The Great Gatsby", author: "F. Scott Fitzgerald", isbn: "9780743273565", category: "Fiction", total: 3, available: 2 }, // 1 borrowed
    { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", isbn: "9780062316097", category: "History", total: 4, available: 4 },
    { title: "Clean Code", author: "Robert C. Martin", isbn: "9780132350884", category: "Technology", total: 6, available: 5 }, // 1 borrowed
    { title: "The Hobbit", author: "J.R.R. Tolkien", isbn: "9780547928227", category: "Fiction", total: 5, available: 5 },
    { title: "Educated", author: "Tara Westover", isbn: "9780399590504", category: "Biography", total: 3, available: 3 },
    { title: "The Selfish Gene", author: "Richard Dawkins", isbn: "9780198788607", category: "Science", total: 2, available: 2 },
    { title: "Steve Jobs", author: "Walter Isaacson", isbn: "9781451648539", category: "Biography", total: 3, available: 3 }
  ];

  db.serialize(() => {
    const stmt = db.prepare('INSERT INTO books (title, author, isbn, category, total_copies, available_copies) VALUES (?, ?, ?, ?, ?, ?)');
    initialBooks.forEach((b) => {
      stmt.run(b.title, b.author, b.isbn, b.category, b.total, b.available);
    });
    stmt.finalize((err) => {
      if (err) {
        console.error('Error seeding books:', err);
      } else {
        console.log('Books seeded successfully.');
        seedBorrowings();
      }
    });
  });
}

function seedBorrowings() {
  const now = new Date();
  
  // 1. john_doe (user_id = 3) borrowed Clean Code (book_id = 6)
  // Borrowed 5 days ago, due in 9 days
  const date1_borrow = new Date();
  date1_borrow.setDate(now.getDate() - 5);
  const date1_due = new Date();
  date1_due.setDate(now.getDate() + 9);

  // 2. jane_smith (user_id = 4) borrowed 1984 (book_id = 2)
  // Borrowed 12 days ago, due in 2 days
  const date2_borrow = new Date();
  date2_borrow.setDate(now.getDate() - 12);
  const date2_due = new Date();
  date2_due.setDate(now.getDate() + 2);

  // 3. alice_jones (user_id = 5) borrowed The Great Gatsby (book_id = 4)
  // Borrowed 20 days ago, due 6 days ago (overdue!)
  const date3_borrow = new Date();
  date3_borrow.setDate(now.getDate() - 20);
  const date3_due = new Date();
  date3_due.setDate(now.getDate() - 6);

  // 4. john_doe (user_id = 3) borrowed The Hobbit (book_id = 7)
  // Borrowed 15 days ago, due 1 day ago, returned 1 day ago
  const date4_borrow = new Date();
  date4_borrow.setDate(now.getDate() - 15);
  const date4_due = new Date();
  date4_due.setDate(now.getDate() - 1);
  const date4_return = new Date();
  date4_return.setDate(now.getDate() - 1);

  const formatSqliteDate = (d) => d.toISOString().replace('T', ' ').substring(0, 19);

  const borrowings = [
    { user_id: 3, book_id: 6, borrow_date: formatSqliteDate(date1_borrow), due_date: formatSqliteDate(date1_due), return_date: null, fine: 0 },
    { user_id: 4, book_id: 2, borrow_date: formatSqliteDate(date2_borrow), due_date: formatSqliteDate(date2_due), return_date: null, fine: 0 },
    { user_id: 5, book_id: 4, borrow_date: formatSqliteDate(date3_borrow), due_date: formatSqliteDate(date3_due), return_date: null, fine: 0 },
    { user_id: 3, book_id: 7, borrow_date: formatSqliteDate(date4_borrow), due_date: formatSqliteDate(date4_due), return_date: formatSqliteDate(date4_return), fine: 0 }
  ];

  db.serialize(() => {
    const stmt = db.prepare('INSERT INTO borrowings (user_id, book_id, borrow_date, due_date, return_date, fine_amount) VALUES (?, ?, ?, ?, ?, ?)');
    borrowings.forEach((b) => {
      stmt.run(b.user_id, b.book_id, b.borrow_date, b.due_date, b.return_date, b.fine);
    });
    stmt.finalize((err) => {
      if (err) console.error('Error seeding borrowings:', err);
      else console.log('Borrowings seeded successfully.');
    });
  });
}

module.exports = db;
