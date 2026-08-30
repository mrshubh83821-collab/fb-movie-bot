import { execSync } from "child_process";
import fs from "fs";
import https from "https";

const WIDTH = 1080;
const PANEL_HEIGHT = 660;
const HEIGHT = PANEL_HEIGHT * 2;

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
  const millions = revenue / 1_000_000;
  return `$${millions.toFixed(0)}M`;
}

/**
 * Generates a two-panel box-office comparison graphic: movie1 on top,
 * movie2 on bottom, each with its own poster/backdrop as background, a big
 * revenue figure, and the movie title - in the style of popular movie-stat
 * comparison posts.
 */
export async function generateComparisonCard({ movie1, movie2, outputPath, tmpDir }) {
  fs.mkdirSync(tmpDir, { recursive: true });

  const bg1Path = `${tmpDir}/bg1.jpg`;
  const bg2Path = `${tmpDir}/bg2.jpg`;
  await downloadImage(`https://image.tmdb.org/t/p/original${movie1.backdropPath}`, bg1Path);
  await downloadImage(`https://image.tmdb.org/t/p/original${movie2.backdropPath}`, bg2Path);

  function panelFilters(inputLabel, movie, outLabel) {
    const revenueText = formatRevenue(movie.revenue);
    return [
      `[${inputLabel}]scale=${WIDTH}:${PANEL_HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${PANEL_HEIGHT}[${outLabel}_bg]`,
      `[${outLabel}_bg]drawbox=x=0:y=0:w=${WIDTH}:h=${PANEL_HEIGHT}:color=black@0.35:t=fill[${outLabel}_dim]`,
      `[${outLabel}_dim]drawtext=text='${escapeForDrawtext(
        revenueText
      )}':fontcolor=white:fontsize=110:font=Sans-Bold:borderw=4:bordercolor=black:x=60:y=${
        PANEL_HEIGHT - 220
      }[${outLabel}_num]`,
      `[${outLabel}_num]drawtext=text='${escapeForDrawtext(
        movie.title.toUpperCase()
      )}':fontcolor=0xFFD700:fontsize=42:font=Sans-Bold:borderw=2:bordercolor=black:x=60:y=${
        PANEL_HEIGHT - 90
      }[${outLabel}]`,
    ];
  }

  const filters = [...panelFilters("0:v", movie1, "top"), ...panelFilters("1:v", movie2, "bottom")];
  filters.push(`[top][bottom]vstack=inputs=2[stacked]`);
  filters.push(`[stacked]drawbox=x=0:y=${PANEL_HEIGHT - 2}:w=${WIDTH}:h=4:color=white:t=fill[final]`);

  const cmd = `ffmpeg -y -i "${bg1Path}" -i "${bg2Path}" -filter_complex "${filters.join(
    ";"
  )}" -map "[final]" -frames:v 1 "${outputPath}"`;
  execSync(cmd, { stdio: "pipe" });

  return outputPath;
}
