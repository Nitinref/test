
import { LingoGuard } from "@lingoguard/cli";

async function run() {
  const command = process.argv[2];

  if (command !== "scan") {
    console.log("Usage: lingoguard scan");
    return;
  }

  const scanner = new LingoGuard({});

  console.log("🔍 Scanning project...");

  const results = await scanner.scan({
    scanPath: process.cwd(),
    extensions: [".js", ".ts", ".jsx", ".tsx"],
  });

  console.log(`\nHealth Score: ${results.health.score}/100`);
  console.log(`Issues Found: ${results.health.issuesFound}\n`);

  if (results.health.issuesFound > 0) {
    console.log("⚠️ Issues detected. Fix before commit.");
    process.exit(1);
  }

  console.log("✅ All good!");
}

run();
