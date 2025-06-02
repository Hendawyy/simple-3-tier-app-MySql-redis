require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const redis = require("redis");

const app = express();
const port = process.env.PORT || 3000;

// MySQL connection pool
const db = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
});

// Redis client
const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT || 6379,
  },
});

redisClient.connect().catch(console.error);

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

// Ensure the `counter` table exists
const ensureTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS counter (
      id INT PRIMARY KEY AUTO_INCREMENT,
      value INT NOT NULL DEFAULT 0
    )
  `);

  const [rows] = await db.query("SELECT COUNT(*) as count FROM counter");
  if (rows[0].count === 0) {
    await db.query("INSERT INTO counter (value) VALUES (0)");
  }
};
ensureTable();

app.get("/api/increment", async (req, res) => {
  try {
    // Try Redis cache first
    const cachedValue = await redisClient.get("counter");
    if (cachedValue !== null) {
      const newValue = parseInt(cachedValue) + 1;
      await redisClient.set("counter", newValue.toString());
      await db.query("UPDATE counter SET value = ?", [newValue]);
      return res.json({ counter: newValue });
    }

    // Fallback to MySQL
    const [rows] = await db.query("SELECT value FROM counter LIMIT 1");
    let current = rows[0]?.value ?? 0;
    current++;
    await db.query("UPDATE counter SET value = ?", [current]);
    await redisClient.set("counter", current.toString());
    res.json({ counter: current });
  } catch (err) {
    console.error("Error incrementing counter:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Backend API listening at http://0.0.0.0:${port}`);
});
