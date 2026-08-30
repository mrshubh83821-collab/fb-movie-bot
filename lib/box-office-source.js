import { fetchCandidateMoviesForReel } from "./movie-source.js";
import { fetchMovieDetails } from "./tmdb-details.js";

/**
 * Finds two movies with strong box-office (revenue) data to compare, from
 * today's trending pool. Fetches full details (which include revenue) for
 * the most popular candidates, keeps ones with real revenue numbers, and
 * returns the top two by revenue.
 */
export async function pickBoxOfficeComparison(alreadyPostedPairs = []) {
  const candidates = await fetchCandidateMoviesForReel();
  const topCandidates = candidates
    .filter((m) => m.posterPath)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 20); // limit detail lookups to the most popular ones

  const withRevenue = [];
  for (const movie of topCandidates) {
    const details = await fetchMovieDetails(movie.id);
    if (details?.revenue > 0) {
      withRevenue.push({
        id: movie.id,
        title: movie.title,
        industry: movie.industry,
        revenue: details.revenue,
        backdropPath: details.backdrop_path || movie.posterPath,
      });
    }
    if (withRevenue.length >= 8) break; // enough candidates to pick a good pair from
  }

  withRevenue.sort((a, b) => b.revenue - a.revenue);

  // Try to avoid repeating the exact same pair we've posted before
  for (let i = 0; i < withRevenue.length - 1; i++) {
    const pairKey = `${withRevenue[i].id}-${withRevenue[i + 1].id}`;
    if (!alreadyPostedPairs.includes(pairKey)) {
      return { movie1: withRevenue[i], movie2: withRevenue[i + 1], pairKey };
    }
  }

  return null;
}
