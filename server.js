const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const bookRoutes = require('./routes/books');
const circulationRoutes = require('./routes/circulation');
require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/circulation', circulationRoutes);

app.get('/', (req, res) => {
  res.send('Library Management API is running...');
});

// For testing purposes
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
