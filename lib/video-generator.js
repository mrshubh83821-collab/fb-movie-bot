import { execSync } from "child_process";
import fs from "fs";
import https from "https";

const WIDTH = 1080;
const HEIGHT = 1920; // vertical, Reels format
const DURATION = 15; // seconds, for single-poster reels
const SLIDE_DURATION = 3.5; // seconds per slide, for slideshow reels

// Downloads an image from a URL to a local temp file
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
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019") // swap apostrophes for a safe character
    .replace(/%/g, "\\%");
}

/**
 * Generates a single-poster vertical Reel with a Ken Burns zoom and up to 3 lines
 * of overlaid text (used by countdown, trivia, and rating-reveal reel types).
 *
 * `lines` is an array of { text, fontsize } from top-most to bottom-most overlay line.
 */
export async function generateReelVideo({ posterUrl, lines, audioPath, outputPath, tmpDir }) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const posterPath = `${tmpDir}/poster.jpg`;
  await downloadImage(posterUrl, posterPath);

  const framesTotal = DURATION * 25; // 25 fps

  const filters = [
    `[0:v]scale=${WIDTH * 2}:${HEIGHT * 2},zoompan=z='min(zoom+0.0007,1.3)':d=${framesTotal}:s=${WIDTH}x${HEIGHT}:fps=25[zoomed]`,
  ];

  // Stack text lines bottom-up, each ~90px above the previous
  let lastLabel = "zoomed";
  const baseY = HEIGHT - 420;
  lines.forEach((line, i) => {
    const nextLabel = `t${i}`;
    const y = baseY - i * 90;
    const fontsize = line.fontsize || 48;
    filters.push(
      `[${lastLabel}]drawtext=text='${escapeForDrawtext(line.text)}':fontcolor=white:fontsize=${fontsize}:font=Sans:borderw=3:bordercolor=black:x=(w-text_w)/2:y=${y}[${nextLabel}]`
    );
    lastLabel = nextLabel;
  });

  const hasAudio = audioPath && fs.existsSync(audioPath);
  const cmd = hasAudio
    ? `ffmpeg -y -loop 1 -i "${posterPath}" -i "${audioPath}" -filter_complex "${filters.join(";")}" -map "[${lastLabel}]" -map 1:a -shortest -t ${DURATION} -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k "${outputPath}"`
    : `ffmpeg -y -loop 1 -i "${posterPath}" -filter_complex "${filters.join(";")}" -map "[${lastLabel}]" -t ${DURATION} -c:v libx264 -pix_fmt yuv420p "${outputPath}"`;

  execSync(cmd, { stdio: "pipe" });
  return outputPath;
}

/**
 * Generates a multi-slide slideshow reel (used by poster-reveal and weekly-roundup
 * reel types). `slides` is an array of { imageUrl, caption }. Each slide is shown
 * for SLIDE_DURATION seconds with a gentle zoom and its caption overlaid, then all
 * slides are concatenated and a single audio track is laid over the whole thing.
 */
export async function generateSlideshowReel({ slides, audioPath, outputPath, tmpDir }) {
  fs.mkdirSync(tmpDir, { recursive: true });

  const clipPaths = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const imagePath = `${tmpDir}/slide_${i}.jpg`;
    await downloadImage(slide.imageUrl, imagePath);

    const clipPath = `${tmpDir}/clip_${i}.mp4`;
    const frames = Math.round(SLIDE_DURATION * 25);
    const filters = [
      `[0:v]scale=${WIDTH * 2}:${HEIGHT * 2},zoompan=z='min(zoom+0.0015,1.15)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=25[zoomed]`,
    ];
    let lastLabel = "zoomed";
    if (slide.caption) {
      filters.push(
        `[zoomed]drawtext=text='${escapeForDrawtext(slide.caption)}':fontcolor=white:fontsize=50:font=Sans:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-300[t1]`
      );
      lastLabel = "t1";
    }

    const cmd = `ffmpeg -y -loop 1 -i "${imagePath}" -filter_complex "${filters.join(";")}" -map "[${lastLabel}]" -t ${SLIDE_DURATION} -c:v libx264 -pix_fmt yuv420p -r 25 "${clipPath}"`;
    execSync(cmd, { stdio: "pipe" });
    clipPaths.push(clipPath);
  }

  const listFile = `${tmpDir}/concat_list.txt`;
  fs.writeFileSync(listFile, clipPaths.map((p) => `file '${p}'`).join("\n"));
  const silentPath = `${tmpDir}/silent_combined.mp4`;
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${silentPath}"`, { stdio: "pipe" });

  const hasAudio = audioPath && fs.existsSync(audioPath);
  const cmd = hasAudio
    ? `ffmpeg -y -i "${silentPath}" -i "${audioPath}" -map 0:v -map 1:a -shortest -c:v copy -c:a aac -b:a 128k "${outputPath}"`
    : `ffmpeg -y -i "${silentPath}" -c copy "${outputPath}"`;
  execSync(cmd, { stdio: "pipe" });

  return outputPath;
}
