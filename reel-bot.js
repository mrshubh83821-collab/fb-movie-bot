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

  if (type === "countdown") {
    for (const movie of fresh) {
      if (!movie.releaseDate) continue;
      const posterUrl = `https://image.tmdb.org/t/p/original${movie.posterPath}`;
      const content = buildCountdown(movie, posterUrl);
      if (content) return { content, movieId: movie.id, isSlideshow: false };
    }
    return null;
  }

  if (type === "trivia") {
    for (const movie of fresh.slice(0, 8)) {
      const details = await fetchMovieDetails(movie.id);
      const posterUrl = `https://image.tmdb.org/t/p/original${movie.posterPath}`;
      const content = buildTrivia(movie, details, posterUrl);
      if (content) return { content, movieId: movie.id, isSlideshow: false };
    }
    return null;
  }

  if (type === "rating_reveal") {
    for (const movie of fresh) {
      const posterUrl = `https://image.tmdb.org/t/p/original${movie.posterPath}`;
      const content = buildRatingReveal(movie, posterUrl);
      if (content) return { content, movieId: movie.id, isSlideshow: false };
    }
    return null;
  }

  if (type === "poster_reveal") {
    for (const movie of fresh.slice(0, 8)) {
      const posters = await fetchMoviePosters(movie.id, 4);
      const content = buildPosterReveal(movie, posters);
      if (content) return { content, movieId: movie.id, isSlideshow: true };
    }
    return null;
  }

  if (type === "weekly_roundup") {
    const movies = await fetchThisWeeksReleases(5);
    const content = buildWeeklyRoundup(movies);
    if (content) return { content, movieId: `weekly-${new Date().toISOString().split("T")[0]}`, isSlideshow: true };
    return null;
  }

  return null;
}

async function main() {
  console.log("Starting Reel Bot run...");

  if (!TMDB_API_KEY || !FB_PAGE_ID || !FB_PAGE_ACCESS_TOKEN) {
    throw new Error("Missing required environment variables. Need: TMDB_API_KEY, FB_PAGE_ID, FB_PAGE_ACCESS_TOKEN");
  }

  const audioPath = pickRandomAudio();
  if (!audioPath) {
    console.log("No audio files found in assets/audio/. Continuing without audio.");
  }

  const state = loadState();
  const candidates = await fetchCandidateMoviesForReel();
  console.log(`Fetched ${candidates.length} candidate movies.`);

  // Rotate through all 5 types, starting with today's type; fall back to the next
  // type in the rotation if today's type has no usable data (e.g. no upcoming release).
  const allTypes = ["countdown", "trivia", "rating_reveal", "poster_reveal", "weekly_roundup"];
  const todayType = pickReelType();
  const startIndex = allTypes.indexOf(todayType);
  const orderedTypes = [...allTypes.slice(startIndex), ...allTypes.slice(0, startIndex)];

  let result = null;
  let usedType = null;
  for (const type of orderedTypes) {
    console.log(`Trying reel type: ${type}`);
    result = await tryBuildContent(type, candidates, state.posted);
    if (result) {
      usedType = type;
      break;
    }
  }

  if (!result) {
    console.log("No usable content found for any reel type this run. Skipping.");
    return;
  }

  console.log(`Using reel type: ${usedType}`);
  const outputPath = `${TMP_DIR}/reel-${Date.now()}.mp4`;

  if (result.isSlideshow) {
    console.log("Generating slideshow video with ffmpeg...");
    await generateSlideshowReel({ slides: result.content.slides, audioPath, outputPath, tmpDir: TMP_DIR });
  } else {
    console.log("Generating video with ffmpeg...");
    await generateReelVideo({
      posterUrl: result.content.posterUrl,
      lines: result.content.lines,
      audioPath,
      outputPath,
      tmpDir: TMP_DIR,
    });
  }
  console.log("Video generated:", outputPath);

  console.log("Uploading reel to Facebook...");
  const fbResult = await postReelToFacebook(outputPath, result.content.caption);
  console.log("Reel posted successfully:", fbResult.id || fbResult.video_id);

  state.posted.push(result.movieId);
  saveState(state);

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  console.log("Reel bot run complete.");
}

main().catch((err) => {
  console.error("Reel bot run failed:", err.message);
  process.exit(1);
});
