const express = require('express');
const db = require('../db');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all books (Search & Filter)
router.get('/', authenticateToken, (req, res) => {
  const { title, author, category } = req.query;
  let query = 'SELECT * FROM books WHERE 1=1';
  const params = [];

  if (title) {
    query += ' AND title LIKE ?';
    params.push(`%${title}%`);
  }
  if (author) {
    query += ' AND author LIKE ?';
    params.push(`%${author}%`);
  }
  if (category) {
    query += ' AND category LIKE ?';
    params.push(`%${category}%`);
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

// Get single book by ID
router.get('/:id', authenticateToken, (req, res) => {
  db.get('SELECT * FROM books WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Book not found' });
    }
    res.json(row);
  });
});

// Admin ONLY: Add a new book
router.post('/', authenticateToken, requireRole('Admin'), (req, res) => {
  const { title, author, isbn, category, total_copies } = req.body;

  if (!title || !author || !isbn) {
    return res.status(400).json({ error: 'Title, author, and ISBN are required' });
  }

  const copies = total_copies || 1;

  db.run(
    `INSERT INTO books (title, author, isbn, category, total_copies, available_copies)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, author, isbn, category, copies, copies],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Book with this ISBN already exists' });
        }
        return res.status(500).json({ error: 'Database error' });
      }
      res.status(201).json({ id: this.lastID, title, author, isbn, category, total_copies: copies, available_copies: copies });
    }
  );
});

// Admin ONLY: Update a book
router.put('/:id', authenticateToken, requireRole('Admin'), (req, res) => {
  const { title, author, category, total_copies } = req.body;
  const bookId = req.params.id;

  // Need to adjust available_copies based on change in total_copies
  db.get('SELECT total_copies, available_copies FROM books WHERE id = ?', [bookId], (err, book) => {
    if (err || !book) return res.status(404).json({ error: 'Book not found' });

    let newAvailable = book.available_copies;
    if (total_copies !== undefined) {
      const diff = total_copies - book.total_copies;
      newAvailable = book.available_copies + diff;
      if (newAvailable < 0) {
        return res.status(400).json({ error: 'Cannot reduce total copies below currently borrowed copies' });
      }
    }

    db.run(
      `UPDATE books SET
        title = COALESCE(?, title),
        author = COALESCE(?, author),
        category = COALESCE(?, category),
        total_copies = COALESCE(?, total_copies),
        available_copies = ?
       WHERE id = ?`,
      [title, author, category, total_copies, newAvailable, bookId],
      function (err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Book updated successfully' });
      }
    );
  });
});

// Admin ONLY: Delete a book
router.delete('/:id', authenticateToken, requireRole('Admin'), (req, res) => {
  db.run('DELETE FROM books WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Book not found' });
    res.json({ message: 'Book deleted successfully' });
  });
});

module.exports = router;
