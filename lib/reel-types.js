// Picks which reel type to make today, rotating through all 5 so content stays varied.
const TYPES = ["countdown", "trivia", "rating_reveal", "poster_reveal", "weekly_roundup"];

export function pickReelType(date = new Date()) {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
  return TYPES[dayOfYear % TYPES.length];
}

// ---------- COUNTDOWN ----------
// Needs a movie with a future release date.
export function buildCountdown(movie, posterUrl) {
  const releaseDate = new Date(movie.releaseDate);
  const today = new Date();
  const daysLeft = Math.ceil((releaseDate - today) / (1000 * 60 * 60 * 24));
  if (isNaN(daysLeft) || daysLeft <= 0) return null;

  return {
    posterUrl,
    lines: [
      { text: `${daysLeft} DIN BAAKI`, fontsize: 72 },
      { text: movie.title, fontsize: 48 },
    ],
    caption: `${daysLeft} din baaki hai ${movie.title} ke liye! Kaun kaun excited hai? Countdown shuru!\n\n#${movie.industry.replace(
      /\s/g,
      ""
    )} #Countdown #ComingSoon #${movie.title.replace(/[^a-zA-Z0-9]/g, "")}`,
  };
}

// ---------- TRIVIA ----------
// Needs full movie details (budget, runtime, production countries) from TMDB.
export function buildTrivia(movie, details, posterUrl) {
  const facts = [];
  if (details?.budget > 0) {
    const budgetM = (details.budget / 1_000_000).toFixed(1);
    facts.push(`Budget: $${budgetM} Million`);
  }
  if (details?.runtime) {
    facts.push(`Runtime: ${details.runtime} minutes`);
  }
  if (details?.production_countries?.length) {
    facts.push(`Made in: ${details.production_countries.map((c) => c.name).join(", ")}`);
  }
  if (facts.length === 0) return null;

  const fact = facts[0]; // simplest, most reliably formatted fact
  return {
    posterUrl,
    lines: [
      { text: "KYA TUMHE PATA HAI?", fontsize: 56 },
      { text: movie.title, fontsize: 44 },
      { text: fact, fontsize: 40 },
    ],
    caption: `Kya tumhe pata hai ${movie.title} ke baare mein ye baat? ${fact}\n\n#MovieTrivia #DidYouKnow #${movie.industry.replace(
      /\s/g,
      ""
    )} #FilmyFacts`,
  };
}

// ---------- RATING REVEAL ----------
// Needs a movie with a TMDB vote average.
export function buildRatingReveal(movie, posterUrl) {
  if (!movie.voteAverage || movie.voteAverage <= 0) return null;
  const rating = movie.voteAverage.toFixed(1);
  const verdict = movie.voteAverage >= 7.5 ? "Blockbuster Alert!" : movie.voteAverage >= 6 ? "Worth a Watch" : "Mixed Reviews";

  return {
    posterUrl,
    lines: [
      { text: `${rating}/10`, fontsize: 80 },
      { text: verdict, fontsize: 48 },
      { text: movie.title, fontsize: 40 },
    ],
    caption: `${movie.title} ko mila hai ${rating}/10 rating! ${verdict}\n\nDekha kya tumne? Comment mein batao!\n\n#${movie.industry.replace(
      /\s/g,
      ""
    )} #MovieRating #Review`,
  };
}

// ---------- POSTER REVEAL ----------
// Needs multiple poster image URLs for one movie.
export function buildPosterReveal(movie, posterUrls) {
  if (!posterUrls || posterUrls.length < 2) return null;
  const slides = posterUrls.map((url, i) => ({
    imageUrl: url,
    caption: i === posterUrls.length - 1 ? movie.title : "",
  }));

  return {
    slides,
    caption: `${movie.title} ke saare posters ek jagah! Kaunsa sabse pasand aaya, comment karo!\n\n#${movie.industry.replace(
      /\s/g,
      ""
    )} #PosterReveal #${movie.title.replace(/[^a-zA-Z0-9]/g, "")}`,
  };
}

// ---------- WEEKLY ROUNDUP ----------
// Needs an array of { title, posterUrl } for movies releasing this week.
export function buildWeeklyRoundup(movies) {
  if (!movies || movies.length < 2) return null;
  const slides = movies.map((m) => ({
    imageUrl: m.posterUrl,
    caption: m.title,
  }));

  const titleList = movies.map((m) => m.title).join(", ");
  return {
    slides,
    caption: `Iss hafte releasing: ${titleList}. Kaunsi dekhne wale ho? Batao comment mein!\n\n#WeeklyReleases #NewMovies #ThisWeek #FilmyDuniya`,
  };
}
