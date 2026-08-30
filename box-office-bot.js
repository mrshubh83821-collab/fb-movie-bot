import fs from "fs";
import path from "path";
import { pickBoxOfficeComparison } from "./lib/box-office-source.js";
import { generateComparisonReel } from "./lib/box-office-reel-generator.js";
import { postReelToFacebook } from "./lib/facebook-reel.js";
import { SITE_LINK_LINE } from "./lib/site-link.js";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const STATE_FILE = "./state/posted-boxoffice.json";
const TMP_DIR = "./tmp-boxoffice";
const AUDIO_DIR = "./assets/audio";
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

function pickRandomAudio() {
  if (!fs.existsSync(AUDIO_DIR)) return null;
  const files = fs.readdirSync(AUDIO_DIR).filter((f) => f.endsWith(".mp3") || f.endsWith(".m4a"));
  if (files.length === 0) return null;
  return path.join(AUDIO_DIR, files[Math.floor(Math.random() * files.length)]);
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

  const outputPath = `${TMP_DIR}/compare-reel.mp4`;
  const audioPath = pickRandomAudio();

  console.log("Generating comparison reel...");
  await generateComparisonReel({ movie1, movie2, audioPath, outputPath, tmpDir: TMP_DIR });
  console.log("Reel generated:", outputPath);

  const winner = movie1.revenue >= movie2.revenue ? movie1 : movie2;
  const loser = winner === movie1 ? movie2 : movie1;
  const caption = `'${winner.title.toUpperCase()}' has earned ${formatRevenue(
    winner.revenue
  )} at the box office - see how it stacks up against '${loser.title}'!\n\nKaunsi movie zyada pasand aayi? Comment mein batao!\n\n#BoxOffice #MovieStats #FilmyDuniya`;

  const result = await postReelToFacebook(outputPath, `${caption}\n\n${SITE_LINK_LINE}`);
  console.log("Posted to Facebook successfully:", result.id || result.video_id);

  state.posted.push(pairKey);
  saveState(state);

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log("Run complete.");
}

main().catch((err) => {
  console.error("Bot run failed:", err.message);
  process.exit(1);
});
