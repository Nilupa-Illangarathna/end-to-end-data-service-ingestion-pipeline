const express = require("express");
const dayjs = require("dayjs");
const { faker } = require("@faker-js/faker");
const random = require("../utils/random");
const topics = require("../data/topics");
const authors = require("../data/authors");
const tickers = require("../data/tickers");
const categories = require("../data/categories");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// Excel file location
const EXCEL_PATH = path.join(__dirname, "..", "logs", "news_history.xlsx");

// Ensure logs folder exists
const LOGS_DIR = path.join(__dirname, "..", "logs");
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR);
}

/**
 * Append rows to Excel
 */
function appendToExcel(rows) {
    let workbook;
    let worksheet;

    if (fs.existsSync(EXCEL_PATH)) {
        workbook = XLSX.readFile(EXCEL_PATH);
        worksheet = workbook.Sheets["News"] || XLSX.utils.aoa_to_sheet([]);
    } else {
        workbook = XLSX.utils.book_new();
        worksheet = XLSX.utils.aoa_to_sheet([]);
    }

    // Convert sheet to JSON for easier appending
    let existing = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    // Append new rows
    const updated = existing.concat(rows);

    // Convert JSON back to sheet
    const newSheet = XLSX.utils.json_to_sheet(updated);

    workbook.Sheets["News"] = newSheet;
    workbook.SheetNames = ["News"];

    XLSX.writeFile(workbook, EXCEL_PATH);
}

/**
 * GET /news?start=ISO&end=ISO
 *
 * Generates realistic news items between start and end timestamps.
 */
router.get("/", (req, res) => {
    const { start, end } = req.query;

    if (!start || !end) {
        return res.status(400).json({ error: "start and end query params required" });
    }

    const startTime = dayjs(start);
    const endTime = dayjs(end);

    if (!startTime.isValid() || !endTime.isValid()) {
        return res.status(400).json({ error: "Invalid start/end timestamp" });
    }

    if (endTime.isBefore(startTime)) {
        return res.status(400).json({ error: "end must be >= start" });
    }

    const durationMinutes = endTime.diff(startTime, "minute");

    const articleCount = random.int(5, 20); // Avg. 5–20 articles per hour
    let articles = [];

    for (let i = 0; i < articleCount; i++) {
        const randomTime = startTime.add(random.int(0, durationMinutes), "minute");

        const topic = random.pick(topics);
        const subtopic = random.pick(topic.subtopics);

        const title = subtopic.template.replace("{ENTITY}", random.pick(topic.entities));
        const summary = faker.lorem.sentences(2);

        const article = {
            title,
            summary,
            content: faker.lorem.paragraphs(random.int(1, 4)),
            url: faker.internet.url(),
            image_url: random.chance(0.7) ? faker.image.url() : null,
            source: "mock-news-api",
            publisher: random.pick(["Reuters", "Bloomberg", "CNN", "BBC", "NYTimes"]),
            authors: random.chance(0.3) ? [] : [random.pick(authors)],
            tickers: random.pickMulti(tickers, random.int(1, 3)),
            category: random.pick(categories),
            sentiment: random.pick(["positive", "neutral", "negative"]),
            published_at: randomTime.toISOString(),
            raw: null,
        };

        articles.push(article);
    }

    // Prepare rows for Excel logging
    const excelRows = articles.map(a => ({
        published_at: a.published_at,
        title: a.title,
        summary: a.summary,
        url: a.url,
        image_url: a.image_url,
        source: a.source,
        publisher: a.publisher,
        authors: a.authors.join(", "),
        tickers: a.tickers.join(", "),
        category: a.category,
        sentiment: a.sentiment,
    }));

    appendToExcel(excelRows);

    res.json({
        start,
        end,
        count: articles.length,
        articles,
    });
});

module.exports = router;
