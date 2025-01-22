const baseUrl = 'http://localhost:5584';
let token = '';
let currentUser = '';

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const showRegisterButton = document.getElementById('show-register');
  const board = document.getElementById('board');
  const logoutButton = document.getElementById('logout');
  const gameStatus = document.getElementById('game-status');


  let gameId = null;  // Storing the game ID
let token = '';      // Token for authentication

const pollGameState = async () => {
  try {
    const response = await fetch(`${baseUrl}/games/${gameId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      const gameState = await response.json();
      updateBoard(gameState.moves);
      gameStatus.textContent = gameState.winner ? `Winner: ${gameState.winner}` : 'Your Turn!';
    }
  } catch (err) {
    console.error('Error polling game state:', err);
  }
};

// Start polling the game state every 2 seconds
setInterval(pollGameState, 2000);

const initBoard = async () => {
  board.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.dataset.index = i;
    cell.addEventListener('click', makeMove);
    board.appendChild(cell);
  }

  // Create a new game and fetch the game ID
  const response = await fetch(`${baseUrl}/games`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ opponentId: 1 }), 
  });

  if (response.ok) {
    const data = await response.json();
    gameId = data.gameId;  // Set the game ID from the response
  }
};

const makeMove = async (event) => {
  const index = event.target.dataset.index;

  // Check if the cell is already taken
  if (event.target.classList.contains('taken')) return;

  try {
    // Send the move to the server
    const response = await fetch(`${baseUrl}/games/${gameId}/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ position: index }),
    });

    const data = await response.json();

    // If the response is successful
    if (response.ok) {
      // Update the game board with the latest moves
      updateBoard(data.moves);

      // Show the current status of the game (who's turn it is or the winner)
      gameStatus.textContent = data.winner ? `Winner: ${data.winner}` : 'Your Turn!';
    } else {
      // Handling errors
      alert(data);
    }
  } catch (err) {
    console.error('Error during move:', err);
  }
};

  
  // Start a game (after login)
const startGame = async (opponentId) => {
  try {
    const response = await fetch(`${baseUrl}/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ opponentId }),
    });

    const data = await response.json();
    if (response.ok) {
      gameId = data.gameId; // Store the gameId for future moves
      initBoard();
    } else {
      alert(data);
    }
  } catch (err) {
    console.error(err);
  }
};

// Update the board state based on moves
const updateBoard = (moves) => {
  const cells = board.children;
  moves.forEach((move, index) => {
    cells[move].textContent = index % 2 === 0 ? 'X' : 'O';  // X for player 1, O for player 2
    cells[move].classList.add('taken');
  });
};

// Show correct game status based on the moves
const showGameStatus = (moves, winner) => {
  const player = moves.length % 2 === 0 ? 'X' : 'O';
  gameStatus.textContent = winner ? `Winner: ${winner}` : `${player}'s Turn!`;
};


  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
      const response = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (response.ok) {
        token = data.token;
        currentUser = username;
        document.getElementById('auth').style.display = 'none';
        document.getElementById('game').style.display = 'block';
        document.getElementById('user').textContent = username;
        initBoard();
      } else {
        alert(data);
      }
    } catch (err) {
      console.error(err);
    }
  });

  logoutButton.addEventListener('click', () => {
    token = '';
    currentUser = '';
    document.getElementById('auth').style.display = 'block';
    document.getElementById('game').style.display = 'none';
  });

  // Register functionality
  showRegisterButton.addEventListener('click', () => {
    const authDiv = document.getElementById('auth');
    authDiv.innerHTML = `
      <h2>Register</h2>
      <form id="register-form">
        <input type="text" id="new-username" placeholder="Username" required>
        <input type="password" id="new-password" placeholder="Password (min 6 characters)" required>
        <button type="submit">Register</button>
      </form>
      <button id="back-to-login">Back to Login</button>
    `;

    const registerForm = document.getElementById('register-form');
    const backToLogin = document.getElementById('back-to-login');

    // Handle registration submission
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('new-username').value;
      const password = document.getElementById('new-password').value;

      try {
        const response = await fetch(`${baseUrl}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        const data = await response.text();
        if (response.ok) {
          alert('Registration successful! Please log in.');
          backToLogin.click();
        } else {
          alert(data);
        }
      } catch (err) {
        console.error(err);
      }
    });

    // Handle back to login action
    backToLogin.addEventListener('click', () => {
      // Reset to the login form view
      document.getElementById('auth').innerHTML = `
        <h2>Login</h2>
        <form id="login-form">
          <input type="text" id="username" placeholder="Username" required>
          <input type="password" id="password" placeholder="Password" required>
          <button type="submit">Login</button>
        </form>
        <button id="show-register">Register</button>
      `;
      
      // Re-attach the event listeners to the buttons
      const newLoginForm = document.getElementById('login-form');
      const newShowRegisterButton = document.getElementById('show-register');

      newLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
          const response = await fetch(`${baseUrl}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });
          const data = await response.json();
          if (response.ok) {
            token = data.token;
            currentUser = username;
            document.getElementById('auth').style.display = 'none';
            document.getElementById('game').style.display = 'block';
            document.getElementById('user').textContent = username;
            initBoard();
          } else {
            alert(data);
          }
        } catch (err) {
          console.error(err);
        }
      });

      newShowRegisterButton.addEventListener('click', () => {
        showRegisterButton.click();
      });

      document.getElementById('auth').style.display = 'block';
      document.getElementById('game').style.display = 'none';
    });
  });
});
