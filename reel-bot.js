import fs from "fs";
import path from "path";
import { fetchCandidateMoviesForReel } from "./lib/movie-source.js";
import { fetchMovieDetails, fetchMoviePosters, fetchThisWeeksReleases } from "./lib/tmdb-details.js";
import {
  pickReelType,
  buildCountdown,
  buildTrivia,
  buildRatingReveal,
  buildPosterReveal,
  buildWeeklyRoundup,
} from "./lib/reel-types.js";
import { generateReelVideo, generateSlideshowReel } from "./lib/video-generator.js";
import { postReelToFacebook } from "./lib/facebook-reel.js";

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

function pickRandomAudio() {
  if (!fs.existsSync(AUDIO_DIR)) return null;
  const files = fs.readdirSync(AUDIO_DIR).filter((f) => f.endsWith(".mp3") || f.endsWith(".m4a"));
  if (files.length === 0) return null;
  return path.join(AUDIO_DIR, files[Math.floor(Math.random() * files.length)]);
}

function freshCandidates(candidates, alreadyPosted) {
  return candidates
    .filter((m) => m.posterPath)
    .filter((m) => !alreadyPosted.includes(m.id))
    .sort((a, b) => b.popularity - a.popularity);
}

// Tries to build content for the given type. Returns { content, movieId, isSlideshow } or null
// if this type's data requirements aren't met (e.g. no upcoming movie for a countdown today).
async function tryBuildContent(type, candidates, alreadyPosted) {
  const fresh = freshCandidates(candidates, alreadyPosted);
