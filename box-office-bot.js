import fs from "fs";
import { pickBoxOfficeComparison } from "./lib/box-office-source.js";
import { generateComparisonCard } from "./lib/compare-graphic.js";
import { postGeneratedPhoto } from "./lib/facebook-photo-upload.js";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const STATE_FILE = "./state/posted-boxoffice.json"; // separate state file, never touches the other bots' state
const TMP_DIR = "./tmp-boxoffice";
const MAX_HISTORY = 200;

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { posted: [] };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { posted: [] };
  }
}

function saveState(state) {
  fs.mkdirSync("./state", { recursive: true });
  state.posted = state.posted.slice(-MAX_HISTORY);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function formatRevenue(revenue) {
  return `$${(revenue / 1_000_000).toFixed(0)} Million`;
}

async function main() {
  console.log("Starting Box Office Comparison Bot run...");

  if (!TMDB_API_KEY || !FB_PAGE_ID || !FB_PAGE_ACCESS_TOKEN) {
    throw new Error("Missing required environment variables. Need: TMDB_API_KEY, FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN");
  }

  const state = loadState();
  const pair = await pickBoxOfficeComparison(state.posted);

  if (!pair) {
    console.log("No fresh box-office pair found this run (or not enough revenue data available). Skipping.");
    return;
  }

  const { movie1, movie2, pairKey } = pair;
  console.log(`Comparing: ${movie1.title} (${formatRevenue(movie1.revenue)}) vs ${movie2.title} (${formatRevenue(movie2.revenue)})`);

  const cardPath = `${TMP_DIR}/compare.jpg`;
  console.log("Generating comparison graphic...");
  await generateComparisonCard({ movie1, movie2, outputPath: cardPath, tmpDir: TMP_DIR });
  console.log("Graphic generated:", cardPath);

  const winner = movie1.revenue >= movie2.revenue ? movie1 : movie2;
  const caption = `'${winner.title.toUpperCase()}' has earned ${formatRevenue(
    winner.revenue
  )} at the box office - see how it stacks up against '${
    winner === movie1 ? movie2.title : movie1.title
  }'!\n\nKaunsi movie zyada pasand aayi? Comment mein batao!\n\n#BoxOffice #MovieStats #FilmyDuniya`;

  const result = await postGeneratedPhoto(cardPath, caption);
  console.log("Posted to Facebook successfully:", result.id || result.post_id);

  state.posted.push(pairKey);
  saveState(state);

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log("Run complete.");
}

main().catch((err) => {
  console.error("Bot run failed:", err.message);
  process.exit(1);
});
