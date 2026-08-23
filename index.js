import fs from "fs";
import fetch from "node-fetch";

// ---------- CONFIG (comes from environment variables / GitHub Secrets) ----------
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const STATE_FILE = "./state/posted.json";
const MAX_HISTORY = 500; // how many old movie IDs to remember, so we never repeat

// Industries -> TMDB language / region filters
const INDUSTRIES = [
  { name: "Bollywood", language: "hi", region: "IN" },
  { name: "Hollywood", language: "en", region: "US" },
  { name: "South Indian", language: "te|ta|ml|kn", region: "IN" }, // handled specially below
];

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
async function generateCaption(movie) {
  const prompt = `Write an engaging, short Facebook post caption (in Hinglish - Hindi+English mix, casual and exciting tone) announcing this movie. Include the release date if available, a one-line hook about the plot, and end with 5-6 relevant hashtags (mix of Hindi and English, movie-specific + generic like #Bollywood #NewRelease). Keep it under 80 words total. Do not use markdown formatting, just plain text with line breaks.

Movie: ${movie.title}
Industry: ${movie.industry}
Release Date: ${movie.releaseDate || "Coming soon"}
Overview: ${movie.overview || "No overview available"}

Respond with ONLY the caption text, nothing else.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/ gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
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

// ---------- STEP 4: POST TO FACEBOOK PAGE ----------
async function postToFacebook(movie, caption) {
  const imageUrl = `https://image.tmdb.org/t/p/original${movie.posterPath}`;

  const url = `https://graph.facebook.com/v21.0/${FB_PAGE_ID}/photos`;
  const params = new URLSearchParams({
    url: imageUrl,
    caption: caption,
    access_token: FB_PAGE_ACCESS_TOKEN,
  });

  const res = await fetch(`${url}?${params.toString()}`, { method: "POST" });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Facebook post failed: ${JSON.stringify(data)}`);
  }

  return data; // contains post id
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

  const result = await postToFacebook(movie, caption);
  console.log("Posted to Facebook successfully:", result.id || result.post_id);

  state.posted.push(movie.id);
  saveState(state);

  console.log("Run complete.");
}

main().catch((err) => {
  console.error("Bot run failed:", err.message);
  process.exit(1);
});
