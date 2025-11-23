// src/server.js
const express = require("express");
const cors = require("cors");

// Routers
const newsRouter = require("./routes/news");
const hedgefundRouter = require("./routes/hedgefund");

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/news", newsRouter);
app.use("/hedgefunds", hedgefundRouter);

// Default root
app.get("/", (req, res) => {
  res.json({ msg: "Mock Data Provider Running" });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Mock Data Provider running on port ${PORT}`);
});
