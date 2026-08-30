import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

// Uploads a locally-generated image file (not a URL) to the Page as a photo
// post. Used for the box-office comparison graphic, which is composed
// locally rather than being a direct TMDB poster URL.
export async function postGeneratedPhoto(imagePath, caption) {
  const form = new FormData();
  form.append("source", fs.createReadStream(imagePath));
  form.append("caption", caption);
  form.append("access_token", FB_PAGE_ACCESS_TOKEN);

  const res = await fetch(`https://graph.facebook.com/v21.0/${FB_PAGE_ID}/photos`, {
    method: "POST",
    body: form,
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Facebook photo post failed: ${JSON.stringify(data)}`);
  }

  return data;
}
