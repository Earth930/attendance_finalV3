const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const { Pool } = require('pg');
const app = express();


app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');


app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));


const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'attendance',
  password: '1234',
  port: 5432,
});


app.use(session({
  secret: 'mySecretKey',
  resave: false,
  saveUninitialized: true,
}));


const users = [
  { username: 'admin', password: '1234' }
];


app.get('/login', (req, res) => {
  res.render('login', { message: '' });
});


app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = authenticate(username, password);

  if (user) {
    req.session.user = user;
    return res.redirect('/dashboard');
  } else {
    return res.render('login', { message: 'Invalid credentials!' });
  }
});


app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect('/dashboard');
    }
    res.redirect('/login');
  });
});


app.get('/dashboard', (req, res) => {
  try {
    if (req.session.user) {
      res.render('index');
    }
    else {
      res.redirect('/login');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});


app.get('/insert', (req, res) => {
  if (!req.session.user) {
    res.redirect('/login');
  }
  else {
    res.render('insertStudent');
  }
});


app.post('/insert', (req, res) => {
  const {
    student_id,
    prefix_id,
    first_name,
    last_name,
    date_of_birth,
    sex,
    curriculum_id,
    prevoius_school,
    address,
    telephone,
    email,
    line_id,
    status,
  } = req.body;

  const query = `
      INSERT INTO student (student_id, prefix_id, first_name, last_name, date_of_birth, sex, curriculum_id, prevoius_school, address, telephone, email, line_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
`;

  pool.query(query, [student_id, prefix_id, first_name, last_name, date_of_birth, sex, curriculum_id, prevoius_school, address, telephone, email, line_id, status], (err, result) => {
    if (err) {
      console.error('Error executing query', err.stack);
      res.send('Error inserting data');
    } 
    else{
      res.redirect('/insert');
    }
  });
});


app.get('/showStudent', async (req, res) => {
  const searchTerm = req.query.search || '';
  try {
    if (!req.session.user) {
      res.redirect('/login');
    }
    else {
      const result = await pool.query(
        `SELECT s.student_id, s.first_name, s.last_name, s.sex, 
        c.short_name_en AS curriculum_name, s.status
       FROM student s
       LEFT JOIN curriculum c ON s.curriculum_id = c.id
       WHERE 
          s.student_id ILIKE $1 OR 
          s.first_name ILIKE $1 OR 
          s.last_name ILIKE $1 OR 
          c.short_name_en ILIKE $1 OR 
          s.status ILIKE $1`,
        [`%${searchTerm}%`]
      );

      res.render('showStudent', { student: result.rows, searchTerm });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});


app.get("/checkStudent", async (req, res) => {
  const searchTerm = req.query.search || '';


  try {
    if (req.session.user) {
      const result = await pool.query(
        `SELECT s.id,s.student_id, s.first_name, s.last_name, c.short_name_en AS curriculum_name,s.status
         FROM student s
         LEFT JOIN curriculum c ON s.curriculum_id = c.id
         WHERE 
            s.student_id ILIKE $1 OR 
            s.first_name ILIKE $1 OR 
            s.last_name ILIKE $1 OR 
            c.short_name_en ILIKE $1`,
        [`%${searchTerm}%`]
      );
      res.render('checkStudent', { student: result.rows, searchTerm });
    }
    else {
      res.redirect('/login');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving data');
  }
});

app.post('/attendance', async (req, res) => {
  const { section_id, student_id } = req.body;
  const attendanceData = student_id.map(id => ({
    student_id: id,
    section_id,
    status: req.body[`attendance_${id}`]
  }));

  try {
    await Promise.all(attendanceData.map(data => {
      return pool.query(
        `INSERT INTO student_list (student_id, section_id, active_date, status) 
         VALUES ($1, $2, NOW() AT TIME ZONE 'Asia/Bangkok', $3)
         ON CONFLICT (student_id, active_date) DO NOTHING`, 
        [data.student_id, data.section_id, data.status]
      );
    }));
    res.redirect('/checkStudent');
  } catch (error) {
    console.error('Error inserting attendance:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
});


app.get('/checkedStudent', async (req, res) => {
  const searchDate = req.query.search_date;
  try {
    if (!req.session.user) {
      res.redirect('/login');
    } else {
      let query = `
        SELECT 
          sl.id,
          s.student_id,
          s.first_name,
          s.last_name,
          sec.section,
          sl.active_date,
          sl.status
        FROM 
          student_list sl
        JOIN 
          student s ON s.id = sl.student_id 
        JOIN 
          section sec ON sec.id = sl.section_id
      `;
      let params = [];

      if (searchDate) {
        query += ` WHERE sl.active_date = $1`;
        params.push(searchDate);
      }

      const result = await pool.query(query, params);

      res.render('showChecked', { student_list: result.rows, searchDate });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});


app.post('/delete-student', (req, res) => {
  const studentId = req.body.id;
  const query = 'DELETE FROM student_list WHERE id = $1';
  
  pool.query(query, [studentId], (error, result) => {
      if (error) {
          console.error('Error deleting student:', error);
          res.status(500).send('Error deleting student');
      }
      else{
        res.redirect('/checkedStudent');
      }
  });
});


app.listen(3000, () => {
  console.log('Server is running on port 3000');
});


function authenticate(username, password) {
  return users.find(user => user.username === username && user.password === password);
}


