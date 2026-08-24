import fetch from "node-fetch";

const TMDB_API_KEY = process.env.TMDB_API_KEY;

export async function fetchCandidateMoviesForReel() {
  const southLangs = ["te", "ta", "ml", "kn"];
  const candidates = [];

  candidates.push(...(await fetchByLanguage("hi", "Bollywood")));
  candidates.push(...(await fetchByLanguage("en", "Hollywood")));
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
    voteAverage: m.vote_average,
  }));
}
