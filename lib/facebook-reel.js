import fs from "fs";
import fetch from "node-fetch";

const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

/**
 * Uploads and publishes a local .mp4 file as a Facebook Reel on the Page.
 * Uses the Video Reels publishing flow: start -> upload binary -> finish/publish.
 */
export async function postReelToFacebook(videoPath, description) {
  // Step 1: start an upload session
  const startRes = await fetch(
    `https://graph.facebook.com/v21.0/${FB_PAGE_ID}/video_reels?upload_phase=start&access_token=${FB_PAGE_ACCESS_TOKEN}`,
    { method: "POST" }
  );
  const startData = await startRes.json();
  if (!startRes.ok) {
    throw new Error(`Reel upload start failed: ${JSON.stringify(startData)}`);
  }
  const { video_id, upload_url } = startData;

  // Step 2: upload the actual video binary
  const fileBuffer = fs.readFileSync(videoPath);
  const uploadRes = await fetch(upload_url, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${FB_PAGE_ACCESS_TOKEN}`,
      "Content-Type": "application/octet-stream",
      file_size: fileBuffer.length.toString(),
    },
    body: fileBuffer,
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || uploadData.success === false) {
    throw new Error(`Reel binary upload failed: ${JSON.stringify(uploadData)}`);
  }

  // Step 3: publish the reel
  const finishRes = await fetch(`https://graph.facebook.com/v21.0/${FB_PAGE_ID}/video_reels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      access_token: FB_PAGE_ACCESS_TOKEN,
      video_id,
      upload_phase: "finish",
      video_state: "PUBLISHED",
      description,
    }),
  });
  const finishData = await finishRes.json();
  if (!finishRes.ok) {
    throw new Error(`Reel publish failed: ${JSON.stringify(finishData)}`);
  }

  return finishData;
}
