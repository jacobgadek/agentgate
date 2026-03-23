export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export class Logger {
  constructor(private level: LogLevel = 'info') {}

  private shouldLog(level: LogLevel): boolean {
    return LOG_PRIORITY[level] >= LOG_PRIORITY[this.level];
  }

  debug(message: string, data?: unknown) {
    if (this.shouldLog('debug')) console.debug(`[agentgate] ${message}`, data ?? '');
  }

  info(message: string, data?: unknown) {
    if (this.shouldLog('info')) console.info(`[agentgate] ${message}`, data ?? '');
  }

  warn(message: string, data?: unknown) {
    if (this.shouldLog('warn')) console.warn(`[agentgate] ${message}`, data ?? '');
  }

  error(message: string, data?: unknown) {
    if (this.shouldLog('error')) console.error(`[agentgate] ${message}`, data ?? '');
  }
}
