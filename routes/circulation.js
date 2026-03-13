const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const FINE_RATE_PER_DAY = 0.50;
const MAX_BORROW_LIMIT = 3;
const BORROW_DAYS = 14;

// Borrow a book
router.post('/borrow', authenticateToken, (req, res) => {
  const { book_id } = req.body;
  const user_id = req.user.id;

  if (!book_id) {
    return res.status(400).json({ error: 'book_id is required' });
  }

  // 1. Check if user already has 3 books borrowed
  db.get('SELECT COUNT(*) as count FROM borrowings WHERE user_id = ? AND return_date IS NULL', [user_id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    if (row.count >= MAX_BORROW_LIMIT) {
      return res.status(400).json({ error: `Borrowing limit reached (Max ${MAX_BORROW_LIMIT} books)` });
    }

    // 2. Check if book is available
    db.get('SELECT available_copies FROM books WHERE id = ?', [book_id], (err, book) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      if (!book) return res.status(404).json({ error: 'Book not found' });

      if (book.available_copies <= 0) {
        return res.status(400).json({ error: 'Book is currently out of stock' });
      }

      // 3. Borrow the book
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + BORROW_DAYS);
      const dueDateStr = dueDate.toISOString().split('T')[0] + ' 23:59:59'; // End of the due date

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.run(
          'INSERT INTO borrowings (user_id, book_id, due_date) VALUES (?, ?, ?)',
          [user_id, book_id, dueDateStr],
          function (err) {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Database error while borrowing' });
            }

            db.run(
              'UPDATE books SET available_copies = available_copies - 1 WHERE id = ?',
              [book_id],
              (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ error: 'Database error while updating book copies' });
                }

                db.run('COMMIT');
                res.status(201).json({ message: 'Book borrowed successfully', due_date: dueDateStr });
              }
            );
          }
        );
      });
    });
  });
});

// Return a book
router.post('/return', authenticateToken, (req, res) => {
  const { borrowing_id } = req.body;
  const user_id = req.user.id;

  if (!borrowing_id) {
    return res.status(400).json({ error: 'borrowing_id is required' });
  }

  db.get('SELECT * FROM borrowings WHERE id = ? AND user_id = ? AND return_date IS NULL', [borrowing_id, user_id], (err, borrowing) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!borrowing) return res.status(404).json({ error: 'Active borrowing record not found' });

    const returnDate = new Date();
    const dueDate = new Date(borrowing.due_date);

    let fineAmount = 0;
    if (returnDate > dueDate) {
      const diffTime = Math.abs(returnDate - dueDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      fineAmount = diffDays * FINE_RATE_PER_DAY;
    }

    const returnDateStr = returnDate.toISOString().replace('T', ' ').substring(0, 19);

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      db.run(
        'UPDATE borrowings SET return_date = ?, fine_amount = ? WHERE id = ?',
        [returnDateStr, fineAmount, borrowing_id],
        (err) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Database error while returning' });
          }

          db.run(
            'UPDATE books SET available_copies = available_copies + 1 WHERE id = ?',
            [borrowing.book_id],
            (err) => {
              if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Database error while updating book copies' });
              }

              db.run('COMMIT');
              res.json({ message: 'Book returned successfully', fine_amount: fineAmount });
            }
          );
        }
      );
    });
  });
});

// Get user's borrowing history
router.get('/history', authenticateToken, (req, res) => {
  const user_id = req.user.id;

  const query = `
    SELECT b.id as borrowing_id, bk.title, bk.author, b.borrow_date, b.due_date, b.return_date, b.fine_amount
    FROM borrowings b
    JOIN books bk ON b.book_id = bk.id
    WHERE b.user_id = ?
    ORDER BY b.borrow_date DESC
  `;

  db.all(query, [user_id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

module.exports = router;
