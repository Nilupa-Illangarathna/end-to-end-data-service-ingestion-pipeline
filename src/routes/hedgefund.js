// src/routes/hedgefund.js
const express = require("express");
const dayjs = require("dayjs");
const { faker } = require("@faker-js/faker");
const funds = require("../data/funds");
const companies = require("../data/companies");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// =======================================
// Config
// =======================================

const LOGS_DIR = path.join(__dirname, "..", "logs");

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

function pickDet(arr, baseSeed, salt = 0) {
  if (!arr.length) return null;
  return arr[(baseSeed + salt) % arr.length];
}

// =======================================
// XLSX helpers
// =======================================

function getYearFilePath(year) {
  return path.join(LOGS_DIR, `hedgefund_${year}.xlsx`);
}

function normalizeRow(row) {
  const parseList = (val) => {
    if (!val) return [];
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  };

  return {
    fund_name: row.fund_name || "",
    fund_manager: row.fund_manager || "",
    cik: row.cik || null,
    quarter: row.quarter || "",
    filing_date: row.filing_date,   // ISO string
    report_date: row.report_date,   // ISO string

    return_1m: row.return_1m !== "" ? Number(row.return_1m) : null,
    return_3m: row.return_3m !== "" ? Number(row.return_3m) : null,
    return_6m: row.return_6m !== "" ? Number(row.return_6m) : null,
    return_1y: row.return_1y !== "" ? Number(row.return_1y) : null,

    top_holdings: parseList(row.top_holdings_json),
    new_positions: parseList(row.new_positions_json),
    decreased_positions: parseList(row.decreased_positions_json),
    sold_out_positions: parseList(row.sold_out_positions_json),

    source: row.source || "mock-hedgefund-api",
  };
}

function loadAllRows() {
  if (!fs.existsSync(LOGS_DIR)) return [];

  const files = fs
    .readdirSync(LOGS_DIR)
    .filter((f) => /^hedgefund_\d{4}\.xlsx$/.test(f));

  let all = [];

  for (const file of files) {
    const book = XLSX.readFile(path.join(LOGS_DIR, file));
    const sheet = book.Sheets["HedgeFunds"];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    rows.forEach((r) => all.push(normalizeRow(r)));
  }

  all.sort(
    (a, b) =>
      new Date(a.filing_date).getTime() - new Date(b.filing_date).getTime()
  );

  return all;
}

function saveAllRows(rows) {
  if (!rows.length) return;

  const byYear = {};
  for (const r of rows) {
    const filingYear = dayjs(r.filing_date).year();
    if (!byYear[filingYear]) byYear[filingYear] = [];
    byYear[filingYear].push(r);
  }

  for (const [yearStr, yearRows] of Object.entries(byYear)) {
    yearRows.sort(
      (a, b) =>
        new Date(a.filing_date).getTime() - new Date(b.filing_date).getTime()
    );

    const excelRows = yearRows.map((r) => ({
      fund_name: r.fund_name,
      fund_manager: r.fund_manager,
      cik: r.cik,
      quarter: r.quarter,
      filing_date: r.filing_date,
      report_date: r.report_date,
      return_1m: r.return_1m,
      return_3m: r.return_3m,
      return_6m: r.return_6m,
      return_1y: r.return_1y,
      source: r.source || "mock-hedgefund-api",
      top_holdings_json: JSON.stringify(r.top_holdings || []),
      new_positions_json: JSON.stringify(r.new_positions || []),
      decreased_positions_json: JSON.stringify(r.decreased_positions || []),
      sold_out_positions_json: JSON.stringify(r.sold_out_positions || []),
    }));

    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(excelRows);
    book.Sheets["HedgeFunds"] = sheet;
    book.SheetNames = ["HedgeFunds"];
    XLSX.writeFile(book, getYearFilePath(Number(yearStr)));
  }
}

// =======================================
// Quarter timeline helpers
// =======================================

function buildQuarterDefsBetween(startTime, endTime) {
  const startYear = startTime.year() - 1; // include Q4 of previous year (filed in this year)
  const endYear = endTime.year();

  const defs = [];

  for (let y = startYear; y <= endYear; y++) {
    // Q1
    defs.push({
      quarter: `${y}Q1`,
      report_date: dayjs(`${y}-03-31`),
      filing_date: dayjs(`${y}-05-15`),
    });

    // Q2
    defs.push({
      quarter: `${y}Q2`,
      report_date: dayjs(`${y}-06-30`),
      filing_date: dayjs(`${y}-08-15`),
    });

    // Q3
    defs.push({
      quarter: `${y}Q3`,
      report_date: dayjs(`${y}-09-30`),
      filing_date: dayjs(`${y}-11-15`),
    });

    // Q4 (filed in next year)
    defs.push({
      quarter: `${y}Q4`,
      report_date: dayjs(`${y}-12-31`),
      filing_date: dayjs(`${y + 1}-02-15`),
    });
  }

  return defs
    .filter(
      (d) =>
        !d.filing_date.isBefore(startTime) && !d.filing_date.isAfter(endTime)
    )
    .sort((a, b) => a.filing_date.valueOf() - b.filing_date.valueOf());
}

// =======================================
// Deterministic fund-quarter generator
// =======================================

function generateFundQuarterRecord(fund, quarterDef, prevRecord) {
  const { quarter, report_date, filing_date } = quarterDef;
  const seedBase = hashString(`${fund.name}|${quarter}`);

  // Deterministic AUM (5–50B)
  const fundAUM = ((seedBase % 46) + 5) * 1_000_000_000;

  // Number of holdings: 10–25
  const holdingsCount = (seedBase % 16) + 10;

  const usedTickers = new Set();
  const rawHoldings = [];

  // Build holdings universe deterministically
  for (
    let i = 0;
    i < companies.length && rawHoldings.length < holdingsCount;
    i++
  ) {
    const idx = (seedBase + i * 13) % companies.length;
    const company = companies[idx];
    if (usedTickers.has(company.ticker)) continue;
    usedTickers.add(company.ticker);

    const rawWeightUnit = ((seedBase >> (i % 16)) & 0xf) + 1; // 1–16 arbitrary units
    rawHoldings.push({
      company,
      rawWeightUnit,
    });
  }

  const totalUnits = rawHoldings.reduce(
    (sum, h) => sum + h.rawWeightUnit,
    0
  );

  const holdings = rawHoldings.map((h, i) => {
    const weight = (h.rawWeightUnit / totalUnits) * 100;
    const market_value = (fundAUM * weight) / 100;
    const price =
      h.company.basePrice ||
      50 + ((seedBase + i * 17) % 250); // fallback deterministic price

    const shares_held = market_value / price;

    return {
      ticker: h.company.ticker,
      company_name: h.company.name,
      shares_held: Number(shares_held.toFixed(2)),
      market_value: Number(market_value.toFixed(2)),
      weight: Number(weight.toFixed(3)),
      change_percent: null, // fill after comparing to prevRecord
    };
  });

  // Sort by weight desc for "top holdings"
  holdings.sort((a, b) => b.weight - a.weight);

  // Compute changes vs previous quarter if available
  let new_positions = [];
  let decreased_positions = [];
  let sold_out_positions = [];

  if (prevRecord && Array.isArray(prevRecord.top_holdings)) {
    const prevMap = new Map();
    prevRecord.top_holdings.forEach((h) => {
      prevMap.set(h.ticker, h);
    });

    // mark new/decreased & fill change_percent
    for (const h of holdings) {
      const prev = prevMap.get(h.ticker);
      if (!prev) {
        // new
        h.change_percent = null;
        new_positions.push(h);
      } else {
        const prevWeight = prev.weight || 0;
        if (prevWeight > 0) {
          const diff = ((h.weight - prevWeight) / prevWeight) * 100;
          h.change_percent = Number(diff.toFixed(2));
          if (diff < -5) {
            decreased_positions.push(h);
          }
        } else {
          h.change_percent = null;
        }
        prevMap.delete(h.ticker);
      }
    }

    // whatever is left in prevMap = sold out
    sold_out_positions = Array.from(prevMap.values()).map((h) => ({
      ...h,
      change_percent: -100,
    }));
  } else {
    // First quarter we know → everything is "new"
    new_positions = holdings.slice();
  }

  // Deterministic returns
  const seed = seedBase;
  const r1m = (seed % 800) / 100 - 4; // -4% to +4%
  const r3m = (seed % 1500) / 100 - 7.5; // -7.5% to +7.5%
  const r6m = (seed % 2200) / 100 - 11; // -11% to +11%
  const r1y = (seed % 3000) / 100 - 15; // -15% to +15%

  return {
    fund_name: fund.name,
    fund_manager: fund.manager,
    cik: fund.cik,
    quarter,
    filing_date: filing_date.toISOString(),
    report_date: report_date.toISOString(),
    return_1m: Number(r1m.toFixed(2)),
    return_3m: Number(r3m.toFixed(2)),
    return_6m: Number(r6m.toFixed(2)),
    return_1y: Number(r1y.toFixed(2)),
    top_holdings: holdings,
    new_positions,
    decreased_positions,
    sold_out_positions,
    source: "mock-hedgefund-api",
  };
}

// =======================================
// GET /hedgefunds?start=ISO&end=ISO
// =======================================

router.get("/", (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res
      .status(400)
      .json({ error: "start and end query params required" });
  }

  const startTime = dayjs(start);
  const endTime = dayjs(end);

  if (!startTime.isValid() || !endTime.isValid()) {
    return res.status(400).json({ error: "Invalid start/end timestamp" });
  }

  if (!endTime.isAfter(startTime)) {
    return res.status(400).json({ error: "end must be > start" });
  }

  // 1) Load current records
  let rows = loadAllRows();

  // Build index by (fund_name|quarter) for fast existence check
  const index = new Map();
  for (const r of rows) {
    const key = `${r.fund_name}|${r.quarter}`;
    index.set(key, r);
  }

  // 2) Build all quarters whose filing_date is within [start, end]
  const quarterDefs = buildQuarterDefsBetween(startTime, endTime);

  // 3) Generate missing fund-quarter records
  const newlyGenerated = [];

  for (const qDef of quarterDefs) {
    for (const fund of funds) {
      const key = `${fund.name}|${qDef.quarter}`;
      if (index.has(key)) {
        continue; // already have this filing
      }

      // find previous record for this fund (if any)
      const prev = rows
        .filter((r) => r.fund_name === fund.name)
        .filter((r) => dayjs(r.filing_date).isBefore(qDef.filing_date))
        .sort(
          (a, b) =>
            dayjs(b.filing_date).valueOf() - dayjs(a.filing_date).valueOf()
        )[0];

      const record = generateFundQuarterRecord(fund, qDef, prev || null);
      newlyGenerated.push(record);
      index.set(key, record);
      rows.push(record);
    }
  }

  // 4) If we generated anything, persist to XLSX files
  if (newlyGenerated.length > 0) {
    rows.sort(
      (a, b) =>
        new Date(a.filing_date).getTime() - new Date(b.filing_date).getTime()
    );
    saveAllRows(rows);
  }

  // 5) Filter for requested date range on filing_date
  const filtered = rows.filter((r) => {
    const t = dayjs(r.filing_date);
    return (
      (t.isSame(startTime) || t.isAfter(startTime)) &&
      (t.isBefore(endTime) || t.isSame(endTime))
    );
  });

  return res.json({
    start,
    end,
    count: filtered.length,
    records: filtered,
  });
});

module.exports = router;
