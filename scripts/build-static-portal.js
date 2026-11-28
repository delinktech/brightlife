/**
 * Compiles the Brightlife SHG modular HTML views and scripts into a single
 * standalone static HTML application for local preview and GitHub Pages deployment.
 */

const fs = require("fs");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const viewsDir = path.join(rootDir, "src", "client", "views");
const scriptsDir = path.join(rootDir, "src", "client", "scripts");

const indexHtmlPath = path.join(viewsDir, "Index.html");
let indexContent = fs.readFileSync(indexHtmlPath, "utf8");

function resolveInclude(match, includeName) {
  const cleanName = includeName.trim().replace(/['"]/g, "");

  // Candidate paths
  const candidates = [
    path.join(scriptsDir, cleanName + ".html"),
    path.join(scriptsDir, cleanName),
    path.join(viewsDir, cleanName + ".html"),
    path.join(viewsDir, cleanName)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      let content = fs.readFileSync(candidate, "utf8");
      // Recursively resolve nested includes if any
      content = content.replace(/<\?!=\s*include\(([^)]+)\);\s*\?>/g, resolveInclude);
      return content;
    }
  }

  console.warn("Could not find partial for include:", cleanName);
  return `<!-- Missing include: ${cleanName} -->`;
}

// Replace all <?!= include('...'); ?> tags
const compiledHtml = indexContent.replace(/<\?!=\s*include\(([^)]+)\);\s*\?>/g, resolveInclude);

// Output to preview/index.html
const previewDir = path.join(rootDir, "preview");
if (!fs.existsSync(previewDir)) {
  fs.mkdirSync(previewDir, { recursive: true });
}

const previewIndexPath = path.join(previewDir, "index.html");
fs.writeFileSync(previewIndexPath, compiledHtml, "utf8");

// Also output to root preview.html for easy double-clicking
const previewRootPath = path.join(rootDir, "preview.html");
fs.writeFileSync(previewRootPath, compiledHtml, "utf8");

// Output to dashboard/index.html for GitHub Pages production/staging path
const dashboardDir = path.join(rootDir, "dashboard");
if (!fs.existsSync(dashboardDir)) {
  fs.mkdirSync(dashboardDir, { recursive: true });
}
const dashboardIndexPath = path.join(dashboardDir, "index.html");
fs.writeFileSync(dashboardIndexPath, compiledHtml, "utf8");

// Output to staging/index.html for isolated staging testing
const stagingDir = path.join(rootDir, "staging");
if (!fs.existsSync(stagingDir)) {
  fs.mkdirSync(stagingDir, { recursive: true });
}
const stagingIndexPath = path.join(stagingDir, "index.html");
fs.writeFileSync(stagingIndexPath, compiledHtml, "utf8");

// Ensure .nojekyll exists across deployment directories to bypass Jekyll on GitHub Pages
[rootDir, dashboardDir, stagingDir].forEach(dir => {
  const nojekyllPath = path.join(dir, ".nojekyll");
  if (!fs.existsSync(nojekyllPath)) {
    fs.writeFileSync(nojekyllPath, "", "utf8");
  }
});

console.log(`[BUILD SUCCESS] Static portal compiled successfully!`);
console.log(`  - Local Preview: ${previewIndexPath} (${(compiledHtml.length / 1024).toFixed(1)} KB)`);
console.log(`  - GitHub Pages Dashboard: ${dashboardIndexPath}`);
console.log(`  - GitHub Pages Staging: ${stagingIndexPath}`);
