const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

const JWT_SECRET = 'your_jwt_secret_key';
const PORT = 5584;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize the database
let db = new sqlite3.Database('./tic_tac_toe.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');

    // Create tables
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL
        );
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS games (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          player_x INTEGER NOT NULL,
          player_o INTEGER NOT NULL,
          winner TEXT,
          moves TEXT DEFAULT '[]',
          FOREIGN KEY (player_x) REFERENCES users (id),
          FOREIGN KEY (player_o) REFERENCES users (id)
        );
      `);

      console.log('Database tables initialized.');
    });
  }
});

// Middleware for token verification
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).send('Access Denied');

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send('Invalid Token');
    req.user = user;
    next();
  });
};

// User registration
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password || password.length < 6) {
      return res.status(400).send('Invalid username or password');
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user into the database
    db.run(
      'INSERT INTO users (username, password) VALUES (?, ?)', 
      [username, hashedPassword], 
      function (err) {
        if (err) {
          // Handle unique username constraint error
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(400).send('Username already exists');
          }
          // Handle other database errors
          console.error('Database error:', err);
          return res.status(500).send('Internal Server Error');
        }
        // Registration successful
        res.status(201).send('User registered successfully');
      }
    );
  } catch (error) {
    console.error('Error in /register:', error);
    res.status(500).send('Internal Server Error');
  }
});


// User login
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Username and password are required');
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).send('Internal Server Error');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).send('Invalid username or password');
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  });
});


// Start a new game
app.post('/games', authenticateToken, (req, res) => {
  const { opponentId } = req.body;

  if (!opponentId) return res.status(400).send('Opponent ID is required');

  db.run('INSERT INTO games (player_x, player_o, moves) VALUES (?, ?, ?)', [req.user.id, opponentId, '[]'], function (err) {
    if (err) return res.status(500).send('Internal Server Error');
    res.status(201).json({ gameId: this.lastID });
  });
});

// Make a move
app.post('/games/:gameId/move', authenticateToken, (req, res) => {
  const { gameId } = req.params;
  const { position } = req.body;

  console.log(`Player ${req.user.username} is making a move at position ${position}`); // Log the move

  // Validate the position
  if (position < 0 || position > 8) return res.status(400).send('Invalid move position');

  // Retrieve the game from the database
  db.get('SELECT * FROM games WHERE id = ?', [gameId], (err, game) => {
    if (err || !game) return res.status(404).send('Game not found');

    const moves = JSON.parse(game.moves); // Convert moves into an array

    // Check whose turn it is (Player X goes first)
    const isPlayerTurn =
      (moves.length % 2 === 0 && game.player_x === req.user.id) || // Player X's turn
      (moves.length % 2 === 1 && game.player_o === req.user.id);   // Player O's turn

    if (!isPlayerTurn) {
      console.log(`Not ${req.user.username}'s turn. Current player: ${moves.length % 2 === 0 ? 'X' : 'O'}`);
      return res.status(403).send('Not your turn');
    }

    // Check if the position is already taken
    if (moves.includes(position)) {
      return res.status(400).send('Invalid move: Position already taken');
    }

    // Add the move to the game state
    moves.push(position);

    // Check for a winner
    const winner = checkWinner(moves, game.player_x, game.player_o);

    // Update the game state in the database
    db.run('UPDATE games SET moves = ?, winner = ? WHERE id = ?', [JSON.stringify(moves), winner, gameId], (err) => {
      if (err) {
        console.error('Error updating game:', err);
        return res.status(500).send('Internal Server Error');
      }

      console.log(`Game updated. Current moves: ${moves}. Winner: ${winner ? winner : 'None'}`);  // Log updated game state

      // Respond with the updated game state (moves and winner)
      res.json({ moves, winner });
    });
  });
});

// Fetch game history
app.get('/users/:userId/history', authenticateToken, (req, res) => {
  const { userId } = req.params;

  if (parseInt(userId) !== req.user.id) return res.status(403).send('Forbidden');

  db.all(`
    SELECT g.id, g.winner, g.moves, u1.username AS player_x, u2.username AS player_o
    FROM games g
    JOIN users u1 ON g.player_x = u1.id
    JOIN users u2 ON g.player_o = u2.id
    WHERE g.player_x = ? OR g.player_o = ?
  `, [userId, userId], (err, games) => {
    if (err) return res.status(500).send('Internal Server Error');
    res.json(games);
  });
});

// Helper function to check the winner
const checkWinner = (moves, playerX, playerO) => {
  const winningCombinations = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  const board = Array(9).fill(null);
  moves.forEach((move, index) => {
    board[move] = index % 2 === 0 ? 'X' : 'O';
  });

  for (const [a, b, c] of winningCombinations) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] === 'X' ? playerX : playerO;
    }
  }

  return moves.length === 9 ? 'Draw' : null;
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
