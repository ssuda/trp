const fs = require("fs");
const path = require("path");

function isChromiumExecutable(filePath) {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return normalized.endsWith("/chrome.exe");
}

function findChromiumExecutable(directory) {
  if (!directory || !fs.existsSync(directory)) {
    return null;
  }

  const pending = [directory];

  while (pending.length) {
    const current = pending.shift();
    let entries;

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (ex) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        pending.push(fullPath);
      } else if (entry.isFile() && isChromiumExecutable(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

function chromiumDirectories(resourcesPath = process.resourcesPath) {
  const directories = [];

  if (resourcesPath) {
    directories.push(
      path.join(
        resourcesPath,
        "node_modules",
        "puppeteer",
        ".local-chromium"
      ),
      path.join(
        resourcesPath,
        "app",
        "node_modules",
        "puppeteer",
        ".local-chromium"
      ),
      path.join(
        resourcesPath,
        "app",
        "node_modules",
        "puppeteer-core",
        ".local-chromium"
      )
    );
  }

  try {
    const puppeteerDirectory = path.dirname(
      require.resolve("puppeteer/package.json")
    );
    directories.push(path.join(puppeteerDirectory, ".local-chromium"));
  } catch (ex) {
    // Handled by caller
  }

  return [...new Set(directories)];
}

function getEmbeddedChromiumPath(resourcesPath = process.resourcesPath) {
  for (const directory of chromiumDirectories(resourcesPath)) {
    const executablePath = findChromiumExecutable(directory);
    if (executablePath) {
      return executablePath;
    }
  }

  return null;
}

module.exports = {
  chromiumDirectories,
  findChromiumExecutable,
  getEmbeddedChromiumPath,
  isChromiumExecutable
};
