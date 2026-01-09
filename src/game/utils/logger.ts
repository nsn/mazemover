import { LOG_LEVEL, CURRENT_LOG_LEVEL } from "../config";

/**
 * Logging utility that respects configured log level
 */
export const logger = {
  /**
   * Debug level logging - most verbose
   */
  debug(...args: any[]): void {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG) {
      console.log(...args);
    }
  },

  /**
   * Info level logging - general information
   */
  info(...args: any[]): void {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO) {
      console.log(...args);
    }
  },

  /**
   * Warning level logging - potential issues
   */
  warn(...args: any[]): void {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN) {
      console.warn(...args);
    }
  },

  /**
   * Error level logging - critical issues
   */
  error(...args: any[]): void {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR) {
      console.error(...args);
    }
  },
};
