module.exports = [
  {
    name: "Politics",
    entities: ["Donald Trump", "Joe Biden", "Vladimir Putin", "Xi Jinping"],
    subtopics: [
      { template: "{ENTITY} makes a surprise announcement on global diplomacy" },
      { template: "{ENTITY} criticizes economic policies in new speech" },
      { template: "{ENTITY} warns of rising geopolitical tension" }
    ]
  },
  {
    name: "Economy",
    entities: ["Federal Reserve", "ECB", "Bank of Japan"],
    subtopics: [
      { template: "{ENTITY} releases new inflation forecast" },
      { template: "{ENTITY} hints at possible rate cuts" },
      { template: "{ENTITY} announces tightening measures" }
    ]
  },
  {
    name: "Tech",
    entities: ["Apple", "Google", "Microsoft", "OpenAI"],
    subtopics: [
      { template: "{ENTITY} unveils breakthrough AI initiative" },
      { template: "{ENTITY} faces regulatory scrutiny" },
      { template: "{ENTITY} stock surges after strong earnings report" }
    ]
  }
];
