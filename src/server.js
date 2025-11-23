const express = require("express");
const cors = require("cors");
const newsRouter = require("./routes/news");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/news", newsRouter);

// Default
app.get("/", (req, res) => {
  res.json({ msg: "Mock News Provider Running" });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Mock News Provider running on port ${PORT}`);
});
