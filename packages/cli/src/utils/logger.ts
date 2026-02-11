

import chalk from 'chalk';

export class Logger {
  static success(message: string): void {
    console.log(chalk.green('✓'), message);
  }

  static error(message: string): void {
    console.error(chalk.red('✗'), message);
  }

  static warning(message: string): void {
    console.warn(chalk.yellow('⚠'), message);
  }

  static info(message: string): void {
    console.log(chalk.blue('ℹ'), message);
  }

  static debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(chalk.gray('🐛'), message);
    }
  }

  static header(message: string): void {
    console.log('\n' + chalk.bold.cyan(message) + '\n');
  }

  static result(label: string, value: string | number, color: 'green' | 'yellow' | 'red' = 'green'): void {
    const colorFn = color === 'green' ? chalk.green : color === 'yellow' ? chalk.yellow : chalk.red;
    console.log(chalk.gray(label + ':'), colorFn(value));
  }
}