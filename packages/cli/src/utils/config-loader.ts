
import * as fs from 'fs';
import * as path from 'path';

export interface LingoGuardConfig {
  scanPath?: string;
  ignorePatterns?: string[];
  extensions?: string[];
  minHealthScore?: number;
  failOnHighSeverity?: boolean;
  generateFixes?: boolean;
}

const DEFAULT_CONFIG: LingoGuardConfig = {
  scanPath: './src',
  ignorePatterns: [
    '**/node_modules/**',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/dist/**',
    '**/build/**',
  ],
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
  minHealthScore: 70,
  failOnHighSeverity: true,
  generateFixes: true,
};

export function loadConfig(cwd: string = process.cwd()): LingoGuardConfig {
  const configPath = path.join(cwd, '.lingoguardrc.json');

  if (fs.existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { ...DEFAULT_CONFIG, ...userConfig };
    } catch (error) {
      console.warn('Failed to parse .lingoguardrc.json, using defaults');
      return DEFAULT_CONFIG;
    }
  }

  return DEFAULT_CONFIG;
}