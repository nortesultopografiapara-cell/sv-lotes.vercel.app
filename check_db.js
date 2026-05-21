require('dotenv').config({ path: '.env.local' });
console.log(process.env.DATABASE_URL ? "Has DATABASE_URL" : "No DATABASE_URL");
