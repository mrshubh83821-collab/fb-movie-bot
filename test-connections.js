import fetch from "node-fetch";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

async function testTMDB() {
  const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&with_original_language=hi`);
  if (res.ok) {
    const data = await res.json();
    console.log(`✅ TMDB OK - fetched ${data.results.length} movies`);
  } else {
    console.log(`❌ TMDB FAILED - status ${res.status}`);
  }
}

async function testGemini() {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Say OK" }] }] }),
    }
  );
  if (res.ok) {
    console.log("✅ Gemini API OK");
  } else {
    const text = await res.text();
    console.log(`❌ Gemini API FAILED - ${res.status} ${text}`);
  }
}

async function testFacebook() {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${FB_PAGE_ID}?fields=name&access_token=${FB_PAGE_ACCESS_TOKEN}`
  );
  const data = await res.json();
  if (res.ok) {
    console.log(`✅ Facebook Page OK - connected to: ${data.name}`);
  } else {
    console.log(`❌ Facebook FAILED - ${JSON.stringify(data)}`);
  }
}

async function run() {
  console.log("Testing all connections...\n");
  await testTMDB();
  await testGemini();
  await testFacebook();
  console.log("\nDone. Fix any ❌ before running the real bot.");
}

run();
