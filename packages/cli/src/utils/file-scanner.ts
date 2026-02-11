import { glob } from 'glob';
import * as path from 'path';
import { ScanOptions } from '../types';

export class FileScanner {
  async scan(options: ScanOptions): Promise<string[]> {
  const {
  scanPath,
  ignorePatterns = [],
  extensions = ['.js', '.jsx', '.ts', '.tsx'],
} = options;


    // Always resolve absolute path
    const absolutePath = path.resolve(process.cwd(), scanPath);

    // Build extension pattern
    const extPattern =
      extensions.length > 1
        ? `**/*{${extensions.join(',')}}`
        : `**/*${extensions[0]}`;

    // IMPORTANT: Use forward slashes for glob
    const pattern = `${absolutePath.replace(/\\/g, '/')}/${extPattern}`;

    const files = await glob(pattern, {
      ignore: ignorePatterns,
      nodir: true,
    });

    return files;
  }
}
