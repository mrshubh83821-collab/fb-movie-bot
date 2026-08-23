import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { fetchCandidateMoviesForReel } from "./lib/movie-source.js";
import { generateReelVideo } from "./lib/video-generator.js";
import { postReelToFacebook } from "./lib/facebook-reel.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const STATE_FILE = "./state/posted-reels.json"; // separate state file, never touches state/posted.json
const AUDIO_DIR = "./assets/audio";
const TMP_DIR = "./tmp-reel";
const MAX_HISTORY = 500;

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

function pickMovie(candidates, alreadyPosted) {
  const fresh = candidates
    .filter((m) => m.posterPath)
    .filter((m) => !alreadyPosted.includes(m.id))
    .sort((a, b) => b.popularity - a.popularity);
  return fresh[0] || null;
}

function pickRandomAudio() {
  if (!fs.existsSync(AUDIO_DIR)) return null;
  const files = fs.readdirSync(AUDIO_DIR).filter((f) => f.endsWith(".mp3") || f.endsWith(".m4a"));
  if (files.length === 0) return null;
  const chosen = files[Math.floor(Math.random() * files.length)];
  return path.join(AUDIO_DIR, chosen);
}

async function generateReelCaption(movie) {
  const prompt = `Write a short, punchy Facebook Reel caption (Hinglish, casual, exciting) for this movie. 1-2 lines max, then 5-6 hashtags. No markdown.

Movie: ${movie.title}
Industry: ${movie.industry}
Release Date: ${movie.releaseDate || "Coming soon"}
Overview: ${movie.overview || "N/A"}

Respond with ONLY the caption text.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? text.trim() : `${movie.title} - Coming Soon! #${movie.industry.replace(/\s/g, "")}`;
}

async function main() {
  console.log("Starting Reel Bot run...");

  if (!TMDB_API_KEY || !GEMINI_API_KEY || !FB_PAGE_ID || !FB_PAGE_ACCESS_TOKEN) {
    throw new Error(
      "Missing required environment variables. Need: TMDB_API_KEY, GEMINI_API_KEY, FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN"
    );
  }

  const audioPath = pickRandomAudio();
  if (!audioPath) {
    console.log(
      "No audio files found in assets/audio/. Add a few royalty-free .mp3 tracks there (see README). Continuing without audio for now."
    );
  }

  const state = loadState();
  const candidates = await fetchCandidateMoviesForReel();
  console.log(`Fetched ${candidates.length} candidate movies.`);

  const movie = pickMovie(candidates, state.posted);
  if (!movie) {
    console.log("No new/unposted movie found for a reel this run. Skipping.");
    return;
  }
  console.log(`Selected for reel: ${movie.title} (${movie.industry})`);

  const caption = await generateReelCaption(movie);
  console.log("Generated reel caption:\n", caption);

  const posterUrl = `https://image.tmdb.org/t/p/original${movie.posterPath}`;
  const outputPath = `${TMP_DIR}/reel-${movie.id}.mp4`;

  console.log("Generating video with ffmpeg...");
  await generateReelVideo({ movie, posterUrl, audioPath, outputPath, tmpDir: TMP_DIR });
  console.log("Video generated:", outputPath);

  console.log("Uploading reel to Facebook...");
  const result = await postReelToFacebook(outputPath, caption);
  console.log("Reel posted successfully:", result.id || result.video_id);

  state.posted.push(movie.id);
  saveState(state);

  // cleanup temp files
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  console.log("Reel bot run complete.");
}

main().catch((err) => {
  console.error("Reel bot run failed:", err.message);
  process.exit(1);
});
