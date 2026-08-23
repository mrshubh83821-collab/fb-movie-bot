import { execSync } from "child_process";
import fs from "fs";
import https from "https";

const WIDTH = 1080;
const HEIGHT = 1920; // vertical, Reels format
const DURATION = 15; // seconds

// Downloads the poster image from TMDB to a local temp file
function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", reject);
  });
}

// Escapes text so ffmpeg's drawtext filter doesn't break on special characters
function escapeForDrawtext(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019") // swap apostrophes for a safe character
    .replace(/%/g, "\\%");
}

/**
 * Generates a vertical Reel-format video from a movie poster:
 * - Ken Burns style slow zoom on the poster
 * - Movie title + release date overlaid as text
 * - Background audio track (royalty-free, provided by you in assets/audio)
 *
 * Returns the path to the generated .mp4 file.
 */
export async function generateReelVideo({ movie, posterUrl, audioPath, outputPath, tmpDir }) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const posterPath = `${tmpDir}/poster.jpg`;
  await downloadImage(posterUrl, posterPath);

  const title = escapeForDrawtext(movie.title);
  const releaseText = escapeForDrawtext(
    movie.releaseDate ? `Releasing: ${movie.releaseDate}` : "Coming Soon"
  );

  const framesTotal = DURATION * 25; // 25 fps

  // Ken Burns zoom (slow zoom-in on the poster) + centered text overlays near the bottom
  const filterComplex = [
    `[0:v]scale=${WIDTH * 2}:${HEIGHT * 2},zoompan=z='min(zoom+0.0007,1.3)':d=${framesTotal}:s=${WIDTH}x${HEIGHT}:fps=25[zoomed]`,
    `[zoomed]drawtext=text='${title}':fontcolor=white:fontsize=64:font=Sans:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-420[t1]`,
    `[t1]drawtext=text='${releaseText}':fontcolor=white:fontsize=42:font=Sans:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-330[t2]`,
  ].join(";");

  const hasAudio = audioPath && fs.existsSync(audioPath);

  const cmd = hasAudio
    ? `ffmpeg -y -loop 1 -i "${posterPath}" -i "${audioPath}" -filter_complex "${filterComplex}" -map "[t2]" -map 1:a -shortest -t ${DURATION} -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k "${outputPath}"`
    : `ffmpeg -y -loop 1 -i "${posterPath}" -filter_complex "${filterComplex}" -map "[t2]" -t ${DURATION} -c:v libx264 -pix_fmt yuv420p "${outputPath}"`;

  execSync(cmd, { stdio: "pipe" });

  return outputPath;
}
