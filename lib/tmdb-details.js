import fetch from "node-fetch";

const TMDB_API_KEY = process.env.TMDB_API_KEY;

// Full movie details - includes budget, runtime, production countries (for trivia)
export async function fetchMovieDetails(movieId) {
  const res = await fetch(`https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_API_KEY}`);
  if (!res.ok) return null;
  return res.json();
}

// Up to `limit` official poster images for a movie (for the poster-reveal reel type)
export async function fetchMoviePosters(movieId, limit = 4) {
  const res = await fetch(
    `https://api.themoviedb.org/3/movie/${movieId}/images?api_key=${TMDB_API_KEY}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.posters || [])
    .slice(0, limit)
    .map((p) => `https://image.tmdb.org/t/p/original${p.file_path}`);
}

// Movies releasing in India in the next 7 days (for the weekly-roundup reel type)
export async function fetchThisWeeksReleases(limit = 5) {
  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().split("T")[0];

  const url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&region=IN&sort_by=popularity.desc&include_adult=false&primary_release_date.gte=${fmt(
    today
  )}&primary_release_date.lte=${fmt(nextWeek)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || [])
    .filter((m) => m.poster_path)
    .slice(0, limit)
    .map((m) => ({
      id: m.id,
      title: m.title,
      releaseDate: m.release_date,
      posterUrl: `https://image.tmdb.org/t/p/original${m.poster_path}`,
    }));
}
