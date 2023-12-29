const express = require('express');
const multer = require('multer');
const app = express();
const session = require('express-session');
const server = require('http').createServer(app);
app.use(express.json());
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const cors = require('cors');
const pool = require('./db');
const helmet = require('helmet');
app.use(helmet());
app.use(
  cors()
);
app.use(express.json());
// app.use(
//   session({
//     secret: process.env.COOKIE_SECRET,
//     credentials: true,
//     name: 'vraj',
//     resave: false,
//     saveUninitialized: false,
//     cookie: {
//       secure: process.env.ENVIRONMENT === 'production',
//       httpOnly: true,
//       expires: 1000 * 60 * 60 * 24 * 7,
//       sameSite: process.env.ENVIRONMENT === 'production' ? 'none' : 'lax',
//     },
//   }),
// );
app.post('/handlelogin', async (req, res) => {
  try {
    const allUsers = await pool.query('SELECT * FROM "user1"');
    const usersData = allUsers.rows;
    const { username, password } = req.body;
    const isValidLogin = usersData.some(
      (user) => user.user_name === username && user.password === password,
    );
    if (isValidLogin) {
      return res.json({ message: 'Login successful' });
    } else {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.post('/checkuser', async (req, res) => {
  try {
    const { username } = req.body;
    const userQuery = 'SELECT user_name FROM "user1" WHERE user_name = $1';
    const { rowCount } = await pool.query(userQuery, [username]);

    if (rowCount > 0) {
      return res.status(401).json({ error: 'User Already Exists' });
    } else {
      return res.json({ message: 'SignUp successful' });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/updateprofile', upload.single('file'), async (req, res) => {
  try {
    console.log(req);
    const { username } = req.body;
    const file = req.file.buffer;
    const userExistsQuery = 'SELECT * FROM user1 WHERE user_name = $1';
    const userExistsResult = await pool.query(userExistsQuery, [username]);
    if (userExistsResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const updateQuery = 'UPDATE user1 SET profile = $1 WHERE user_name = $2';
    const updateValues = [file, username];
    await pool.query(updateQuery, updateValues);
    res.json({ success: true, message: 'Image uploaded and stored successfully.' });
  } catch (err) {
    console.error('Error storing image data:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
app.post('/unfollow', async (req, res) => {
  try {
    const { person1, person2 } = req.body;
    const query = `DELETE FROM following WHERE person1=$1 AND person2=$2`;
    await pool.query(query, [person1, person2]);
    const query1 = `DELETE FROM notifications WHERE person1=$1 AND person2=$2 AND id=$3`;
    await pool.query(query1, [person1, person2, 'following']);
    res.json('yes');
  } catch (err) {
    console.log(err.message);
  }
});
// For fetching the image
app.put('/fetchImage', async (req, res) => {
  try {
    const { username1 } = req.body;
    const result = await pool.query('SELECT * FROM user1 WHERE user_name = $1', [username1]);
    if (result.rows.length === 0 || !result.rows[0].profile) {
      res.status(404).json({ success: false, message: 'Image not found for the given username.' });
      return;
    }
    // Determine the appropriate Content-Type based on the image format
    const imageFormat = 'image/jpeg'; // Change this to the actual image format
    res.writeHead(200, {
      'Content-Type': imageFormat,
    });
    res.end(result.rows[0].profile);
  } catch (err) {
    console.error('Error fetching image data:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/insert', async (req, res) => {
  try {
    const { username, password, phone } = req.body;
    const fs = require('fs');
    const filePath = '/Users/vrajshah1510/Documents/SOCIALMEDIAAPP/frontend/src/Images/profile.png'; // Replace with the actual file path
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath);
      const newTodo = await pool.query(
        'INSERT INTO "user1" (user_name, password, phone, profile) VALUES($1, $2, $3, $4) RETURNING *',
        [username, password, phone, fileContent],
      );
      await newTodo.json();
      res.json('YES');
    } else {
      res.status(404).json('File not found');
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json('Internal Server Error');
  }
});

app.post('/sentrequest', async (req, res) => {
  // console.log(req.body);
  try {
    const { person1, person2, id, pid } = req.body;
    await pool.query(`INSERT INTO "requestsent" (person1, person2) VALUES ($1, $2)`, [
      person1,
      person2,
    ]);
    await pool.query(
      `INSERT INTO "notifications" (person1, person2, id, pid) VALUES ($1, $2, $3, $4)`,
      [person1, person2, id, pid],
    );
    res.json('YES');
  } catch (err) {
    console.error(err.message);
  }
});
app.put('/fetchnotifications', async (req, res) => {
  try {
    const { username } = req.body;

    const query = `
      SELECT n.*, u1.profile AS person1_profile, u2.profile AS person2_profile
      FROM notifications n
      LEFT JOIN user1 u1 ON n.person1 = u1.user_name
      LEFT JOIN user1 u2 ON n.person2 = u2.user_name
      WHERE n.person2 = $1 OR n.person1 = $1
    `;
    const result = await pool.query(query, [username]);
    const allNotifications = result.rows;
    res.writeHead(200, {
      'Content-Type': 'application/json',
    });
    const updatedNotifications = allNotifications.map((notification) => ({
      ...notification,
      person1_profile: notification.person1_profile
        ? notification.person1_profile.toString('base64')
        : null,
      person2_profile: notification.person2_profile
        ? notification.person2_profile.toString('base64')
        : null,
    }));
    res.end(JSON.stringify(updatedNotifications));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.put('/deleterequest', async (req, res) => {
  console.log(req.body);
  try {
    const { person1, person2 } = req.body;
    await pool.query('DELETE FROM requestsent WHERE person1=$1 AND person2=$2', [person1, person2]);
    await pool.query(
      'DELETE FROM notifications WHERE person1=$1 AND person2=$2 AND id=$3 AND pid=$4',
      [person1, person2, 'follow', '-1'],
    );
    res.json('YES');
  } catch (err) {
    console.error(err.message);
  }
});
app.put('/checkfollower', async (req, res) => {
  try {
    const { person2, person1 } = req.body;
    const response = await pool.query('SELECT * FROM following WHERE person1=$1 AND person2=$2', [
      person2,
      person1,
    ]);
    // const allTodos = response.rows;
    res.json({ success: true, data: response.rows });
  } catch (err) {
    console.error(err.message);
  }
});
app.post('/removeFollower', async (req, res) => {
  try {
    const { person1, person2 } = req.body;
    const response = await pool.query('DELETE FROM following WHERE person1=$1 AND person2=$2', [
      person2,
      person1,
    ]);
    const allTodos = response.rows;
    const query1 = `DELETE FROM notifications WHERE person1=$1 AND person2=$2 AND id=$3`;
    await pool.query(query1, [person2, person1, 'following']);
    res.json({ success: true, data: allTodos.rows });
  } catch (err) {
    console.error(err.message);
  }
});
app.put('/deleterequest1', async (req, res) => {
  // console.log(
  try {
    const { user1, user2 } = req.body;
    await pool.query('DELETE FROM requestsent WHERE person1=$1 AND person2=$2', [user1, user2]);
  } catch (err) {
    console.error(err.message);
  }
});
app.post('/addfollowing', async (req, res) => {
  try {
    const { user1, user2 } = req.body;
    const newTodo = await pool.query('INSERT INTO following VALUES($1, $2) RETURNING *', [
      user1,
      user2,
    ]);
  } catch (err) {
    console.error(err.message);
  }
});
app.put('/updatenotification', async (req, res) => {
  // console.log(person1);
  try {
    const { user1, user2, id1, pid1 } = req.body;
    const deleteResult = await pool.query(
      'DELETE FROM notifications WHERE person1=$1 AND person2=$2 AND id=$3 AND pid=$4',
      [user1, user2, id1, pid1],
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    } else {
      await pool.query('INSERT INTO notifications VALUES($1, $2, $3, $4)', [
        user1,
        user2,
        'following',
        pid1,
      ]);
      return res.status(200).json({ message: 'Notification updated successfully' });
    }
  } catch (err) {
    console.error(err.message);
    // Respond with an error status code and message
    return res.status(500).json({ error: 'Internal server error' });
  }
});
app.put('/updatenote', async (req, res) => {
  try {
    const { username, inputValue } = req.body;
    const updateQuery = `
      UPDATE "user1"
      SET note = $2
      WHERE user_name = $1
      RETURNING *
    `;
    const updatedUser = await pool.query(updateQuery, [username, inputValue]);
    res.json({ success: true, message: 'Profile updated successfully', data: updatedUser.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.get('/fetch1', async (req, res) => {
  try {
    const query = `
      SELECT user_name,profile FROM "user1";
    `;
    const result = await pool.query(query);
    const allTodos = result.rows;
    res.writeHead(200, {
      'Content-Type': 'application/json', // Assuming the response is JSON
    });

    const updatedTodos = allTodos.map((todo) => ({
      user_name: todo.user_name,
      profile: todo.profile ? todo.profile.toString('base64') : null, // Assuming profile is a Buffer
    }));
    res.end(JSON.stringify(updatedTodos));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.put('/fetchnote', async (req, res) => {
  try {
    const { username1 } = req.body;
    const allTodos = await pool.query('SELECT note FROM user1 WHERE user_name ILIKE $1', [
      username1,
    ]);
    res.json({ success: true, data: allTodos.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
app.put('/follow', async (req, res) => {
  try {
    const { person1, person2 } = req.body;
    const allTodos = await pool.query('SELECT * FROM following WHERE person1=$1 AND person2=$2', [
      person1,
      person2,
    ]);
    res.json({ success: true, data: allTodos.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
app.put('/requestsent', async (req, res) => {
  try {
    const { person1, person2 } = req.body;
    const allTodos = await pool.query('SELECT * FROM requestsent WHERE person1=$1 AND person2=$2', [
      person1,
      person2,
    ]);
    res.json({ success: true, data: allTodos.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
app.put('/followers', async (req, res) => {
  try {
    const { person } = req.body;
    const allTodos = await pool.query('SELECT * FROM requestsent WHERE person2=$1', [person]);
    res.json({ success: true, data: allTodos.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
app.put('/following', async (req, res) => {
  try {
    const { person } = req.body;
    const allTodos = await pool.query('SELECT * FROM requestsent WHERE person1=$1', [person]);
    res.json({ success: true, data: allTodos.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
app.put('/followersofuser', async (req, res) => {
  const { username1 } = req.body;
  try {
    const query = `
      SELECT following.person2, user1.profile
      FROM following
      JOIN user1 ON following.person2 = user1.user_name
      WHERE following.person1 = $1;
    `;
    const result = await pool.query(query, [username1]);
    const allTodos = result.rows;
    res.writeHead(200, {
      'Content-Type': 'application/json', // Assuming the response is JSON
    });

    const updatedTodos = allTodos.map((todo) => ({
      person2: todo.person2,
      profile: todo.profile ? todo.profile.toString('base64') : null, // Assuming profile is a Buffer
    }));
    res.end(JSON.stringify(updatedTodos));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.put('/userfollowing', async (req, res) => {
  const { username1 } = req.body;
  try {
    const query = `
      SELECT following.person1, user1.profile
      FROM following
      JOIN user1 ON following.person1 = user1.user_name
      WHERE following.person2 = $1;
    `;
    const result = await pool.query(query, [username1]);
    const allTodos = result.rows;
    res.writeHead(200, {
      'Content-Type': 'application/json', // Assuming the response is JSON
    });
    const updatedTodos = allTodos.map((todo) => ({
      person1: todo.person1,
      profile: todo.profile ? todo.profile.toString('base64') : null, // Assuming profile is a Buffer
    }));
    res.end(JSON.stringify(updatedTodos));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.put('/mutual', async (req, res) => {
  const { user1, user2 } = req.body;
  try {
    const query = `SELECT t1.person2,u1.profile
                  FROM following t1 JOIN user1 u1 ON t1.person2=u1.user_name
                  WHERE t1.person1 =$1
                  INTERSECT
                  SELECT t2.person2,u2.profile
                  FROM following t2 JOIN user1 u2 ON t2.person2=u2.user_name
                  WHERE t2.person1 =$2;
                  `;
    const result = await pool.query(query, [user1, user2]);
    const allTodos = result.rows;
    res.writeHead(200, {
      'Content-Type': 'application/json', // Assuming the response is JSON
    });
    const updatedTodos = allTodos.map((todo) => ({
      person2: todo.person2,
      profile: todo.profile ? todo.profile.toString('base64') : null, // Assuming profile is a Buffer
    }));
    res.end(JSON.stringify(updatedTodos));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.listen(3000, () => {
  console.log('Server has started');
});
// console.log(`${__dirname}/user_uploads`);
