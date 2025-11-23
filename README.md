# Mock Data Provider

A flexible and extensible **Mock Data Provider** designed to simulate realistic datasets for development, testing, and PoC integrations.  
It can generate **news data, hedge fund data, and any other future data types** with full persistence and deterministic historical reconstruction.

---

## 🚀 Features

- **Deterministic generation**  
  Once generated for a given time range, the data persists and is reused.

- **Persistent yearly XLSX storage**  
  Data is saved per year as `news_YYYY.xlsx` under `/logs/`.

- **Gap‑filling engine**  
  When a user requests a partial range, only missing gaps are generated.

- **Chronological ordering guaranteed**  
  Oldest → newest data sorting across the entire file.

- **Easy API access (JSON)**  
  Ready for integration with FastAPI, frontend dashboards, cron jobs, or ingestion systems.

---

## 📂 Project Structure

```
mock_data_provider/
│
├── src/
│   ├── server.js
│   ├── routes/
│   │   └── news.js
│   ├── data/
│   │   ├── authors.js
│   │   ├── tickers.js
│   │   ├── categories.js
│   │   └── topics.js
│   └── utils/random.js
│
├── logs/
│   └── news_2025.xlsx
│
├── package.json
└── README.md
```

---

## 🧩 Technologies

- Node.js  
- Express  
- XLSX  
- Day.js  
- Faker.js  
- Pure JSON REST API  

---

## 📦 Installation

```bash
git clone https://github.com/your-username/mock-data-provider.git
cd mock-data-provider
npm install
```

---

## ▶️ Running

```bash
node src/server.js
```

Server starts at:

```
http://localhost:3000
```

---

## 🔌 API Usage

### **GET /news?start=ISO&end=ISO**

Example:

```bash
curl "http://localhost:3000/news?start=2025-01-01T00:00:00Z&end=2025-01-03T00:00:00Z"
```

### Response:

```json
{
  "start": "...",
  "end": "...",
  "count": 42,
  "articles": [ ... ]
}
```

---

## 🗃️ Persistence Logic

### ✔ First request  
Generate → save → return.

### ✔ Future request  
Load file → detect missing ranges → generate gaps → merge → return.

### ✔ Backward request  
Generate before earliest timestamp → prepend in correct order.

### ✔ Ordering  
Always sorted from oldest to newest.

---

## 🛠 Extending

Add routes like:

```
src/routes/hedgefund.js
src/routes/weather.js
src/routes/forex.js
```

Add new datasets under `/src/data/`.

---

## 📘 Contributing

Standard GitHub flow:

1. Fork  
2. Branch  
3. Commit  
4. PR  

---

## 📝 License

MIT License.

---

Generated on: 2025-11-23 04:32:51
