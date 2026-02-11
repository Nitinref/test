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

    const basePath = path.isAbsolute(scanPath)
      ? scanPath
      : path.resolve(process.cwd(), scanPath);

    const cleanedExtensions = extensions.map(ext =>
      ext.startsWith('.') ? ext.slice(1) : ext
    );

    const pattern =
      cleanedExtensions.length > 1
        ? `**/*.{${cleanedExtensions.join(',')}}`
        : `**/*.${cleanedExtensions[0]}`;

    const files = await glob(pattern, {
      cwd: basePath,
      ignore: ignorePatterns,
      nodir: true,
      absolute: true,
    });

    return files;
  }
}
