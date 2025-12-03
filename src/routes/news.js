// src/routes/news.js
const express = require("express");
const dayjs = require("dayjs");
const { faker } = require("@faker-js/faker");
const topics = require("../data/topics");
const authors = require("../data/authors");
const tickers = require("../data/tickers");
const categories = require("../data/categories");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// =======================================
// Config
// =======================================

const LOGS_DIR = path.join(__dirname, "..", "logs");
const STORAGE_FILE = path.join(LOGS_DIR, "news.xlsx");

// Ensure logs folder exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

// =======================================
// Deterministic helpers
// =======================================

// Strong deterministic hash (non-crypto)
function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0;
  }
  return h >>> 0;
}

// Always choose valid index, NEVER undefined
function pickDet(arr, baseSeed, salt = 0) {
  if (!arr.length) return null;
  return arr[(baseSeed + salt) % arr.length];
}

// =======================================
// XLSX storage helpers
// =======================================

function normalizeRow(row) {
  return {
    title: row.title || "",
    summary: row.summary || "",
    content: row.content || "",
    url: row.url || "",
    image_url: row.image_url || null,
    source: row.source || "mock-news-api",
    publisher: row.publisher || "",
    authors: row.authors
      ? String(row.authors)
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
      : [],
    tickers: row.tickers
      ? String(row.tickers)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    category: row.category || "",
    sentiment: row.sentiment || "neutral",
    published_at: row.published_at,
    raw: null,
  };
}

function loadAllRows() {
  if (!fs.existsSync(STORAGE_FILE)) return [];

  const book = XLSX.readFile(STORAGE_FILE);
  const sheet = book.Sheets["News"];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const all = rows.map(normalizeRow);

  all.sort(
    (a, b) =>
      new Date(a.published_at) - new Date(b.published_at)
  );

  return all;
}

function saveAllRows(rows) {
  if (!rows.length) return;

  rows.sort(
    (a, b) => new Date(a.published_at) - new Date(b.published_at)
  );

  const excelRows = rows.map((r) => ({
    published_at: r.published_at,
    title: r.title,
    summary: r.summary,
    content: r.content,
    url: r.url,
    image_url: r.image_url,
    source: r.source,
    publisher: r.publisher,
    authors: r.authors.join(", "),
    tickers: r.tickers.join(", "),
    category: r.category,
    sentiment: r.sentiment,
  }));

  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(excelRows);
  book.Sheets["News"] = sheet;
  book.SheetNames = ["News"];

  XLSX.writeFile(book, STORAGE_FILE);
}

// =======================================
// Deterministic Article Generator
// =======================================

function generateArticleAtTime(instant) {
  const published_at = instant.toISOString();
  const seed = hashString(published_at);

  faker.seed(seed);

  const topic = pickDet(topics, seed, 11);
  const sub = pickDet(topic.subtopics, seed, 111);
  const entity = pickDet(topic.entities, seed, 222);

  const title = sub.template.replace("{ENTITY}", entity);

  const summary = faker.lorem.sentences(2);
  const content = faker.lorem.paragraphs(((seed >> 7) % 3) + 1);

  const publisherList = ["Reuters", "Bloomberg", "CNN", "BBC", "NYTimes"];
  const publisher = pickDet(publisherList, seed, 333);

  const noAuthor = ((seed >> 11) % 4) === 0;
  const articleAuthors = noAuthor ? [] : [pickDet(authors, seed, 444)];

  const tickerCount = ((seed >> 15) % 3) + 1;
  const articleTickers = [];
  for (let i = 0; i < tickerCount; i++) {
    articleTickers.push(pickDet(tickers, seed, 555 + i));
  }

  const category = pickDet(categories, seed, 666);
  const sentiments = ["positive", "neutral", "negative"];
  const sentiment = pickDet(sentiments, seed, 777);

  const hasImage = ((seed >> 21) % 3) !== 0;
  const image_url = hasImage ? faker.image.url() : null;

  return {
    title,
    summary,
    content,
    url: faker.internet.url(),
    image_url,
    source: "mock-news-api",
    publisher,
    authors: articleAuthors,
    tickers: articleTickers,
    category,
    sentiment,
    published_at,
    raw: null,
  };
}

function generateArticlesForRange(from, to) {
  let articles = [];

  let cursor = from;
  const endExclusive = to;

  while (cursor.isBefore(endExclusive)) {
    articles.push(generateArticleAtTime(cursor));

    const seed = hashString(cursor.toISOString());
    const intervalSeconds = (seed % 5) + 1;

    cursor = cursor.add(intervalSeconds, "second");
  }

  return articles;
}

// =======================================
// GET /news
// =======================================

router.get("/", (req, res) => {
  const { start, end } = req.query;
  if (!start || !end)
    return res.status(400).json({ error: "start & end required" });

  let startTime = dayjs(start);
  let endTime = dayjs(end);

  if (!startTime.isValid() || !endTime.isValid())
    return res.status(400).json({ error: "Invalid timestamps" });

  if (!endTime.isAfter(startTime))
    return res.status(400).json({ error: "end must be > start" });

  let rows = loadAllRows();

  const generationRanges = [];

  if (rows.length === 0) {
    generationRanges.push({ from: startTime, to: endTime });
  } else {
    const first = dayjs(rows[0].published_at);
    const last = dayjs(rows[rows.length - 1].published_at);

    const lastSeed = hashString(last.toISOString());
    const lastInterval = (lastSeed % 5) + 1;
    const coverageEnd = last.add(lastInterval, "second");

    if (endTime.isBefore(first) || endTime.isSame(first)) {
      generationRanges.push({ from: startTime, to: first });
    } else if (startTime.isAfter(coverageEnd)) {
      generationRanges.push({ from: coverageEnd, to: endTime });
    } else {
      if (startTime.isBefore(first))
        generationRanges.push({ from: startTime, to: first });

      if (endTime.isAfter(coverageEnd))
        generationRanges.push({ from: coverageEnd, to: endTime });
    }
  }

  let newArticles = [];
  for (const r of generationRanges) {
    newArticles = newArticles.concat(
      generateArticlesForRange(r.from, r.to)
    );
  }

  if (newArticles.length > 0) {
    rows = rows.concat(newArticles);
    rows.sort(
      (a, b) =>
        new Date(a.published_at) - new Date(b.published_at)
    );
    saveAllRows(rows);
  }

  const filtered = rows.filter((a) => {
    const t = dayjs(a.published_at);
    return (
      (t.isSame(startTime) || t.isAfter(startTime)) &&
      t.isBefore(endTime)
    );
  });

  return res.json({
    start,
    end,
    count: filtered.length,
    articles: filtered,
  });
});

module.exports = router;
