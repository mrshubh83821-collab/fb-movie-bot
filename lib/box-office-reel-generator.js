import { execSync } from "child_process";
import fs from "fs";
import https from "https";
import path from "path";

const WIDTH = 1080;
const HEIGHT = 1920;
const SLIDE_DURATION = 5; // seconds each movie is shown for

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

function escapeForDrawtext(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$"); // prevent the shell from treating $ as a variable
}

function formatRevenue(revenue) {
  return `$${(revenue / 1_000_000).toFixed(0)}M`;
}

async function makeClip(movie, clipPath, tmpDir, index) {
  const imgPath = `${tmpDir}/panel_${index}.jpg`;
  await downloadImage(`https://image.tmdb.org/t/p/original${movie.backdropPath}`, imgPath);

  const frames = SLIDE_DURATION * 25;
  const filters = [
    `[0:v]scale=${WIDTH * 2}:${HEIGHT * 2},zoompan=z='min(zoom+0.001,1.2)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=25[zoomed]`,
    `[zoomed]drawbox=x=0:y=0:w=${WIDTH}:h=${HEIGHT}:color=black@0.3:t=fill[dim]`,
    `[dim]drawtext=text='${escapeForDrawtext(
      formatRevenue(movie.revenue)
    )}':fontcolor=white:fontsize=140:font=Sans-Bold:borderw=5:bordercolor=black:x=(w-text_w)/2:y=h-620[num]`,
    `[num]drawtext=text='${escapeForDrawtext(
      movie.title.toUpperCase()
    )}':fontcolor=0xFFD700:fontsize=52:font=Sans-Bold:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-460[final]`,
  ];

  const cmd = `ffmpeg -y -loop 1 -i "${imgPath}" -filter_complex "${filters.join(
    ";"
  )}" -map "[final]" -t ${SLIDE_DURATION} -c:v libx264 -pix_fmt yuv420p -r 25 "${clipPath}"`;
  execSync(cmd, { stdio: "pipe" });
}

/**
 * Generates a short "reveal" reel comparing two movies' box office numbers:
 * movie1 shown first with its revenue + title, then movie2, one after the
 * other - Reels format performs much better than static photos on Facebook.
 */
export async function generateComparisonReel({ movie1, movie2, audioPath, outputPath, tmpDir }) {
  fs.mkdirSync(tmpDir, { recursive: true });

  const clip1 = `${tmpDir}/clip_0.mp4`;
  const clip2 = `${tmpDir}/clip_1.mp4`;
  await makeClip(movie1, clip1, tmpDir, 0);
  await makeClip(movie2, clip2, tmpDir, 1);

  const listFile = `${tmpDir}/concat_list.txt`;
  fs.writeFileSync(listFile, [clip1, clip2].map((p) => `file '${path.basename(p)}'`).join("\n"));
  const silentPath = `${tmpDir}/silent_combined.mp4`;
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${silentPath}"`, { stdio: "pipe" });

  const hasAudio = audioPath && fs.existsSync(audioPath);
  const cmd = hasAudio
    ? `ffmpeg -y -i "${silentPath}" -i "${audioPath}" -map 0:v -map 1:a -shortest -c:v copy -c:a aac -b:a 128k "${outputPath}"`
    : `ffmpeg -y -i "${silentPath}" -c copy "${outputPath}"`;
  execSync(cmd, { stdio: "pipe" });

  return outputPath;
}
