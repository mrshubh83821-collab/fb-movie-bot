// post-grid.js
// Picks a trending movie, fetches several backdrop stills from TMDB,
// arranges them in an 8-image grid (like "VISHWANATH & SONS" style posts),
// and posts it as a photo to the MoviesTrend Facebook Page with a
// "Rate the movie out of 10" style caption.

import fs from "fs";
import path from "path";
import sharp from "sharp";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const STATE_FILE = "./state/grid-posted.json";
const TMP_DIR = "/tmp/movie-grid";

function requireEnv() {
  const missing = ["TMDB_API_KEY", "FB_PAGE_ID", "FB_PAGE_ACCESS_TOKEN"].filter(
    (k) => !process.env[k]
  );
  if (missing.length) {
    throw new Error("Missing required env vars: " + missing.join(", "));
  }
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { posted: [] };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { posted: [] };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  state.posted = state.posted.slice(-500);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchCandidateMovies() {
  const urls = [
    `https://api.themoviedb.org/3/trending/movie/day?api_key=${TMDB_API_KEY}`,
    `https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_API_KEY}&region=IN`,
  ];
  const all = [];
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const data = await res.json();
    all.push(...(data.results || []));
  }
  return all;
}

async function fetchStills(movieId) {
  const url = `https://api.themoviedb.org/3/movie/${movieId}/images?api_key=${TMDB_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.backdrops || [])
    .filter((b) => b.iso_639_1 === null || b.iso_639_1 === "en")
    .sort((a, b) => b.vote_average - a.vote_average)
    .slice(0, 8)
    .map((b) => b.file_path);
}

async function downloadImage(filePath, destPath) {
  const url = `https://image.tmdb.org/t/p/w780${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed: ${res.status}`);
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function buildGridImage(movieTitle, stillPaths, outputPath) {
  const COLS = 2;
  const CELL_W = 540;
  const CELL_H = 340;
  const HEADER_H = 200;
  const rows = Math.ceil(stillPaths.length / COLS);
  const CANVAS_W = CELL_W * COLS;
  const CANVAS_H = HEADER_H + CELL_H * rows;

  const headerSvg = `
    <svg width="${CANVAS_W}" height="${HEADER_H}">
      <rect width="100%" height="100%" fill="#000000"/>
      <text x="50%" y="${HEADER_H / 2 + 18}" font-family="Georgia, serif" font-size="52" font-weight="bold"
        fill="#D4AF37" text-anchor="middle" letter-spacing="2">${escapeXml(movieTitle.toUpperCase())}</text>
    </svg>`;

  const composites = [{ input: Buffer.from(headerSvg), top: 0, left: 0 }];

  for (let i = 0; i < stillPaths.length; i++) {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    const top = HEADER_H + row * CELL_H;
    const left = col * CELL_W;

    const imgPath = path.join(TMP_DIR, `still-${i}.jpg`);
    const resized = await sharp(imgPath)
      .resize(CELL_W, CELL_H, { fit: "cover" })
      .toBuffer();
    composites.push({ input: resized, top, left });
  }

  await sharp({
    create: { width: CANVAS_W, height: CANVAS_H, channels: 3, background: "#000000" },
  })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toFile(outputPath);
}

async function postPhotoToFacebook(imagePath, caption) {
  const form = new FormData();
  form.append("caption", caption);
  form.append("access_token", FB_PAGE_ACCESS_TOKEN);
  form.append("source", new Blob([fs.readFileSync(imagePath)]), "grid.jpg");

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${FB_PAGE_ID}/photos`,
    { method: "POST", body: form }
  );
  const data = await res.json();
  if (!data.id) {
    throw new Error("Facebook photo post failed: " + JSON.stringify(data));
  }
  return data.id;
}

async function main() {
  requireEnv();
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const state = loadState();
  const candidates = await fetchCandidateMovies();
  console.log(`Fetched ${candidates.length} candidate movies.`);

  let movie = null;
  let stills = [];
  const sorted = candidates
    .filter((m) => !state.posted.includes(m.id))
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const tryList = sorted.length ? sorted : candidates;

  for (const candidate of tryList.slice(0, 10)) {
    const s = await fetchStills(candidate.id);
    if (s.length >= 6) {
      movie = candidate;
      stills = s.slice(0, 8);
      break;
    }
  }

  if (!movie) {
    console.log("No movie with enough stills found. Skipping.");
    return;
  }
  console.log(`Selected: ${movie.title} (${stills.length} stills)`);

  for (let i = 0; i < stills.length; i++) {
    await downloadImage(stills[i], path.join(TMP_DIR, `still-${i}.jpg`));
  }

  const outputPath = path.join(TMP_DIR, "grid.jpg");
  await buildGridImage(movie.title, stills, outputPath);
  console.log("Grid built:", outputPath);

  const caption = `${movie.title}\n\nRate the movie out of 10! 🎬\n\n#${movie.title.replace(/[^a-zA-Z0-9]/g, "")} #MovieRating #Bollywood #Hollywood #MovieLovers #RateIt`;

  const photoId = await postPhotoToFacebook(outputPath, caption);
  console.log("Posted! Facebook photo_id:", photoId);

  state.posted.push(movie.id);
  saveState(state);

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

main().catch((err) => {
  console.error("Bot run failed:", err.message);
  process.exit(1);
});
