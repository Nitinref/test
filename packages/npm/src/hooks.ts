import fs from "fs";
import path from "path";

export function installHook() {
  try {
    const gitDir = path.join(process.cwd(), ".git");

    if (!fs.existsSync(gitDir)) {
      console.log("⚠️ No git repo found. Skpping hook install.");
      return;
    }

    const hookPath = path.join(gitDir, "hooks", "pre-commit");

    const script = `#!/bin/sh
echo "🔍 Running LingoGuard scan..."
npx lingoguard scan || true
`;

    fs.writeFileSync(hookPath, script);
    fs.chmodSync(hookPath, 0o755);

    console.log("✅ LingoGuard git hook installed");
  } catch (err) {
    console.log("⚠️ Git hook install failed");
  }
}