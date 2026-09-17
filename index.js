import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { withRetry } from "./lib/retry.js";
import { generateReelVideo } from "./lib/video-generator.js";
import { postReelToFacebook } from "./lib/facebook-reel.js";
import { SITE_LINK_LINE } from "./lib/site-link.js";

// ---------- CONFIG (comes from environment variables / GitHub Secrets) ----------
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const STATE_FILE = "./state/posted.json";
const MAX_HISTORY = 500; // how many old movie IDs to remember, so we never repeat
const AUDIO_DIR = "./assets/audio";
const TMP_DIR = "./tmp-post";

// ---------- STATE HANDLING (avoids posting the same movie twice) ----------
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
  // Keep only the most recent MAX_HISTORY IDs so the file doesn't grow forever
  state.posted = state.posted.slice(-MAX_HISTORY);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function pickRandomAudio() {
  if (!fs.existsSync(AUDIO_DIR)) return null;
  const files = fs.readdirSync(AUDIO_DIR).filter((f) => f.endsWith(".mp3") || f.endsWith(".m4a"));
  if (files.length === 0) return null;
  return path.join(AUDIO_DIR, files[Math.floor(Math.random() * files.length)]);
}

// ---------- STEP 1: FETCH TRENDING / UPCOMING MOVIES FROM TMDB ----------
async function fetchCandidateMovies() {
  const southLangs = ["te", "ta", "ml", "kn"];
  const candidates = [];

  // Bollywood (Hindi) - upcoming + trending
  candidates.push(...(await fetchByLanguage("hi", "Bollywood")));

  // Hollywood (English)
  candidates.push(...(await fetchByLanguage("en", "Hollywood")));

  // South Indian (Telugu/Tamil/Malayalam/Kannada)
  for (const lang of southLangs) {
    candidates.push(...(await fetchByLanguage(lang, "South Indian")));
  }

  return candidates;
}

async function fetchByLanguage(langCode, industryLabel) {
  const url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&with_original_language=${langCode}&sort_by=popularity.desc&include_adult=false&page=1`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`TMDB fetch failed for ${industryLabel}:`, res.status);
    return [];
  }
  const data = await res.json();
  return (data.results || []).map((m) => ({
    id: m.id,
    title: m.title,
    overview: m.overview,
    releaseDate: m.release_date,
    posterPath: m.poster_path,
    industry: industryLabel,
    popularity: m.popularity,
  }));
}

// ---------- STEP 2: PICK ONE MOVIE NOT POSTED BEFORE ----------
function pickMovie(candidates, alreadyPosted) {
  const fresh = candidates
    .filter((m) => m.posterPath) // must have a poster image
    .filter((m) => !alreadyPosted.includes(m.id))
    .sort((a, b) => b.popularity - a.popularity);

  return fresh[0] || null;
}

// ---------- STEP 3: GENERATE CAPTION VIA GOOGLE GEMINI API (free tier, no card needed) ----------

// A pool of short, low-effort engagement questions (rotated randomly so
// captions don't feel repetitive). These are the kind of "Rate out of 10?" /
// "Comment Yes or No" hooks that drive high comment counts.
const ENGAGEMENT_QUESTIONS = [
  "Rate this movie out of 10 in comments!",
  "Kaun dekhega opening day pe? Comment karo Yes ya No!",
  "Excited ho iske liye? Comment mein batao!",
  "Konsa character sabse interesting lag raha hai? Comment karo!",
  "1 se 10 mein kitni excitement hai iske liye?",
  "Trailer dekha kya? Comment mein rating do!",
  "Tag that one friend who NEEDS to watch this!",
  "Hit LIKE agar excited ho, comment mein rating do!",
];

function pickEngagementQuestion() {
  return ENGAGEMENT_QUESTIONS[Math.floor(Math.random() * ENGAGEMENT_QUESTIONS.length)];
}

async function generateCaption(movie) {
  const engagementQuestion = pickEngagementQuestion();

  const prompt = `Write an engaging, short Facebook post caption (in Hinglish - Hindi+English mix, casual and exciting tone) announcing this movie. Include the release date if available, and a one-line hook about the plot. Then, on its own line, include this exact engagement question word-for-word (do not change it, do not translate it): "${engagementQuestion}". Then end with 5-6 relevant hashtags (mix of Hindi and English, movie-specific + generic like #Bollywood #NewRelease). Keep it under 90 words total. Do not use markdown formatting, just plain text with line breaks.

Movie: ${movie.title}
Industry: ${movie.industry}
Release Date: ${movie.releaseDate || "Coming soon"}
Overview: ${movie.overview || "No overview available"}

Respond with ONLY the caption text, nothing else.`;

  const response = await withRetry(() =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    ).then(async (res) => {
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API failed: ${res.status} ${errText}`);
      }
      return res;
    })
  );

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) return text.trim();

  // Fallback caption (still includes the engagement question) if Gemini fails
  return `${movie.title} - Coming Soon!\n\n${engagementQuestion}\n\n#${movie.industry.replace(/\s/g, "")}`;
}

// ---------- MAIN ----------
async function main() {
  console.log("Starting FB Movie Bot run...");

  if (!TMDB_API_KEY || !GEMINI_API_KEY || !FB_PAGE_ID || !FB_PAGE_ACCESS_TOKEN) {
    throw new Error(
      "Missing required environment variables. Need: TMDB_API_KEY, GEMINI_API_KEY, FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN"
    );
  }

  const state = loadState();
  const candidates = await fetchCandidateMovies();
  console.log(`Fetched ${candidates.length} candidate movies.`);

  const movie = pickMovie(candidates, state.posted);
  if (!movie) {
    console.log("No new/unposted movie found this run. Skipping.");
    return;
  }

  console.log(`Selected: ${movie.title} (${movie.industry})`);

  const caption = await generateCaption(movie);
  console.log("Generated caption:\n", caption);

  const posterUrl = `https://image.tmdb.org/t/p/original${movie.posterPath}`;
  const outputPath = `${TMP_DIR}/reel-${movie.id}.mp4`;
  const audioPath = pickRandomAudio();

  console.log("Generating video with ffmpeg...");
  await generateReelVideo({
    posterUrl,
    lines: [
      { text: movie.title, fontsize: 56 },
      { text: movie.releaseDate ? `Releasing: ${movie.releaseDate}` : "Coming Soon", fontsize: 38 },
    ],
    audioPath,
    outputPath,
    tmpDir: TMP_DIR,
  });
  console.log("Video generated:", outputPath);

  console.log("Uploading reel to Facebook...");
  const result = await postReelToFacebook(outputPath, `${caption}\n\n${SITE_LINK_LINE}`);
  console.log("Posted to Facebook successfully:", result.id || result.video_id);

  state.posted.push(movie.id);
  saveState(state);

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log("Run complete.");
}

main().catch((err) => {
  console.error("Bot run failed:", err.message);
  process.exit(1);
});
