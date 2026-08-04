#!/usr/bin/env node
// Bumps CURRENT_PROJECT_VERSION (the iOS build number, distinct from
// MARKETING_VERSION/CFBundleShortVersionString) in the Xcode project file.
// App Store Connect rejects a TestFlight upload whose build number has
// already been used, so this needs to go up before every archive/upload --
// easy to forget when it means hand-editing project.pbxproj in Xcode's
// UI each time. Run via `npm run bump-build` from mobile-app/.
const fs = require("fs");
const path = require("path");

const pbxprojPath = path.join(__dirname, "..", "ios", "App", "App.xcodeproj", "project.pbxproj");
let contents = fs.readFileSync(pbxprojPath, "utf8");

const matches = [...contents.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)];
if (matches.length === 0) {
  console.error("Could not find CURRENT_PROJECT_VERSION in " + pbxprojPath);
  process.exit(1);
}

const current = parseInt(matches[0][1], 10);
const next = current + 1;

contents = contents.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${next};`);
fs.writeFileSync(pbxprojPath, contents);

console.log(`Build number bumped: ${current} -> ${next} (both Debug and Release configs).`);
console.log("Re-run `npx cap sync ios` if Xcode is already open, so it picks up the change.");
