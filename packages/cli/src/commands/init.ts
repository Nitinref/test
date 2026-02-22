import fs from "fs";
import path from "path";

export async function init() {
  const root = process.env.INIT_CWD || process.cwd();

  console.log("\n🛡️ Setting up LingoGuard...\n");

  // =========================
  // 1️⃣ Create config file
  // =========================
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
    console.log("⏭️  Config already exists");
  }

  // =========================
  // 2️⃣ Ensure Git repo exists
  // =========================
  const gitPath = path.join(root, ".git");

  if (!fs.existsSync(gitPath)) {
    console.log("\n⚠️ Not a git repository.");
    console.log("Run: git init");
    console.log("Then run: npx lingoguard init\n");
    return;
  }

  // =========================
  // 3️⃣ Create GitHub workflow
  // =========================
  const workflowDir = path.join(root, ".github", "workflows");
  const workflowPath = path.join(workflowDir, "lingoguard.yml");

  if (fs.existsSync(workflowPath)) {
    console.log("⏭️  Workflow already exists");
  } else {
    fs.mkdirSync(workflowDir, { recursive: true });

    // 🔥 Detect if Lingoguard Action exists
    const actionPath = path.join(root, "packages", "action");

    const workflowContent = fs.existsSync(actionPath)
      ? `name: LingoGuard

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  lingoguard:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Run LingoGuard Action
        uses: ./packages/action
        with:
          scan-path: .
          github-token: \${{ secrets.GITHUB_TOKEN }}
          auto-fix: false
`
      : `name: LingoGuard

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  lingoguard:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Run LingoGuard scan
        run: npx lingoguard scan
`;

    fs.writeFileSync(workflowPath, workflowContent);
    console.log("✅ GitHub workflow added");
  }

  console.log("\n🎉 LingoGuard setup complete!\n");
}