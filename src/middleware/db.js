import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

/*
// Supabase PostgreSQL connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL, //Supabase connection string
});
*/

//Local PostgreSQL connection
const db = new pg.Pool({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
});


export default db;