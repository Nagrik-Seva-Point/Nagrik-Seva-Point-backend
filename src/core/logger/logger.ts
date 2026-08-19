type LogLevel = "info" | "warn" | "error" | "debug";

class Logger {
  private format(level: LogLevel, message: string) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
  }

  info(message: string, ...args: unknown[]) {
    console.info(this.format("info", message), ...args);
  }

  warn(message: string, ...args: unknown[]) {
    console.warn(this.format("warn", message), ...args);
  }

  error(message: string, ...args: unknown[]) {
    console.error(this.format("error", message), ...args);
  }

  debug(message: string, ...args: unknown[]) {
    console.debug(this.format("debug", message), ...args);
  }
}

export const logger = new Logger();
