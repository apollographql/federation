import loglevel from 'loglevel';
import type { Logger } from '@apollo/utils.logger';

export function getDefaultLogger(debug: boolean = false): Logger {
  const logger = loglevel.getLogger('apollo-gateway');

  const level = debug === true ? loglevel.levels.DEBUG : loglevel.levels.WARN;
  logger.setLevel(level);

  return logger;
}
