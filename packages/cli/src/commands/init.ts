import fs from "fs";
import path from "path";

export async function init() {
  const root = process.env.INIT_CWD || process.cwd();

  console.log("\n🛡️ Setting up LingoGuard...\n");

  // 1️⃣ Create config
  const configPath = path.join(root, ".lingoguardrc.json");

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          scanPath: "./src",
          ignorePatterns: [
            "**/node_modules/**",
            "**/dist/**",
            "**/build/**"
          ],
          extensions: [".js", ".jsx", ".ts", ".tsx"],
          minHealthScore: 70,
          failOnHighSeverity: true,
          generateFixes: true
        },
        null,
        2
      )
    );
    console.log("✅ Created .lingoguardrc.json");
  } else {
    console.log("⏭️ Config already exists");
  }

  // 2️⃣ Git check
  if (!fs.existsSync(path.join(root, ".git"))) {
    console.log("\n⚠️ Not a git repository.");
    console.log("Run: git init");
    console.log("Then run: npx lingoguard init\n");
    return;
  }

  // 3️⃣ Create workflow
  const workflowDir = path.join(root, ".github", "workflows");
  const workflowPath = path.join(workflowDir, "lingoguard.yml");

  if (fs.existsSync(workflowPath)) {
    console.log("⏭️ Workflow already exists");
  } else {
    fs.mkdirSync(workflowDir, { recursive: true });

    const workflowContent = `name: LingoGuard

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: write
  pull-requests: write
  checks: write

jobs:
  lingoguard:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run LingoGuard
        uses: Nitinref/test/packages/action@v1
        with:
          scan-path: ./src
          ignore-patterns: "**/node_modules/**,**/dist/**,**/build/**"
          github-token: \${{ secrets.GITHUB_TOKEN }}
`;

    fs.writeFileSync(workflowPath, workflowContent);
    console.log("✅ GitHub workflow added (PR comments enabled)");
  }

  console.log("\n🎉 LingoGuard setup complete!\n");
}