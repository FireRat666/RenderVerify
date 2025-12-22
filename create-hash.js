// Use This Script to create the password hash for the initial SuperAdmin in the database
const bcrypt = require('bcryptjs');
const password = 'a-very-strong-and-secret-password'; // Change this!
const hash = bcrypt.hashSync(password, 10);
console.log(hash);
