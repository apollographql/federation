// Simple debugging facility.

import chalk from 'chalk';
import { validateStringContainsBoolean } from './utils';

function indentString(indentLevel: number) : string {
  let str = "";
  for (let i = 0; i < indentLevel; i++) {
    str += chalk.blackBright("⎸ ");
  }
  return str;
}

function isEnabled(name: string): boolean {
  const v = process.env.APOLLO_FEDERATION_DEBUG;
  const bool = validateStringContainsBoolean(v);
  if (bool !== undefined) {
    return bool;
  }

  const enabledNames = v!.split(',').map(n => n.trim());
  return enabledNames.includes(name);
}

let currentIndentLevel = 0;
let currentIndentation = '';
let maxLoggerNameLength = 0;

const createdLoggers: DebugLogger[] = [];

export function newDebugLogger(name: string): DebugLogger {
  const enabled = isEnabled(name);
  const created = new DebugLogger(name, enabled);
  if (enabled) {
    // This next line is to avoid having JEST capture console logging if any logger is
    // enabled, as this make things unreadable
    global.console = require('console');
    createdLoggers.push(created);
    maxLoggerNameLength = Math.max(maxLoggerNameLength, name.length);
    for (const logger of createdLoggers) {
      DebugLogger.prototype['updateHeader'].call(logger, maxLoggerNameLength);
    }
  }
  return created;
}

function increaseIndentation() {
  currentIndentLevel++;
  currentIndentation = indentString(currentIndentLevel);
}

function decreaseIndentation() {
  if (currentIndentLevel > 0) {
    currentIndentLevel--;
    currentIndentation = indentString(currentIndentLevel);
  }
}

/**
 * A facility to log messages for debugging.
 *
 * All `DebugLogger` share an indentation level that is used before logged messages. That indentation level gets
 * increased by calling `group()` and decreased by `groupEnd()`. This is meant to help representing the nestedness
 * of the code being debugged.
 */
export class DebugLogger {
  private header: string;

  /**
   * Builds a new `DebugLogger`.
   *
   * @param enabled - whether the logger is enabled. If it is disabled, no message will be logged. Currently, a logger
   * cannot be enabled/disabled after construction.
   */
  constructor(readonly name: string, readonly enabled: boolean) {
    this.header = chalk.blackBright(`[${name}] `);
  }

  private updateHeader(maxLength: number) {
    let padding = "";
    if (maxLength > this.name.length) {
      const toPad = maxLength - this.name.length;
      for (let i = 0; i < toPad; i++) {
        padding += " ";
      }
    }
    this.header = chalk.blackBright('[' + padding + this.name + '] ');
  }

  private doLog(str: string) {
    const indent = this.header + currentIndentation;
    const withIndentedNewlines = str.replace(/\n/g, '\n' + indent + '  ');
    console.log(indent + withIndentedNewlines);
  }

  /**
   * Logs the provided message at the current indentation level, if this logger is enabled.
   *
   * @param message - the message to log. This can optionally be a closure, which allows for the message to only be
   * computed if the logger is enabled (the closure is only called in this case).
   * @param prefix - an optional string printed as a direct prefix of the message.
   */
  public log(message: string | (() => string), prefix: string = chalk.yellow('• ')): DebugLogger {
    if (!this.enabled) return this;

    if (typeof message !== 'string') {
      message = message();
    }
    this.doLog(prefix + message);
    return this;
  }

  /**
   * Logs the provided values, indented and one per line.
   *
   * @param values - an array of the values to log.
   * @param printFn - the function to apply to each of the value to convert it to a string to log.
   * @param initialMessage - an optional message to write before the grouped values.
   */
  public groupedValues<T>(values: T[], printFn: (v: T) => string, initialMessage?: string): DebugLogger {
    if (!this.enabled) return this;

    this.group(initialMessage);
    for (const value of values) {
      this.doLog('- ' + printFn(value));
    }
    return this.groupEnd();
  }

  /**
   * Logs the entries of the provided map, indented and one per line.
   *
   * @param map - a map of keys and values to log.
   * @param keyPrintFn - the function to apply to each of the key to convert it to a string to log.
   * @param valuePrintFn - the function to apply to each of the value to convert it to a string to log.
   */
  public groupedEntries<K, V>(
    map: Map<K, V>,
    keyPrintFn: (k: K) => string,
    valuePrintFn: (v : V) => string
  ): DebugLogger {
    if (!this.enabled) return this;

    this.group();
    for (const [k, v] of map.entries()) {
      this.doLog('- ' + keyPrintFn(k) + ': ' + valuePrintFn(v));
    }
    return this.groupEnd();
  }

  /**
   * Starts a new debug "group"; every following message logged after this called and before the corresponding
   * `groupEnd()` call will be indented by one more level than is current.
   *
   * @param openingMessage - an optional message to log _before_ starting the group. This can typically be used to
   * describe what the message logged within the group will describe.
   */
  public group(openingMessage?: string | (() => string)): DebugLogger {
    if (this.enabled) {
      if (openingMessage) {
        this.log(openingMessage, chalk.blue('‣ '));
      }
      increaseIndentation();
    }
    return this;
  }

  /**
   * Ends the current (last started) debug "group", thus decreasing the indent level to what it was before the
   * `group()` call this ends.
   *
   * If no group had been started, this is a no-op (and no `closingMessage` is printed in particular).
   *
   * @param closingMessage - an optional message to log _after_ ending the group. This can typically be used to
   * describe what the messages logged within the group yielded.
   */
  public groupEnd(closingMessage?: string | (() => string)): DebugLogger {
    if (!this.enabled) {
      return this;
    }
    decreaseIndentation();
    if (closingMessage) {
      this.log(closingMessage, chalk.green('⇒ '));
    }
    return this;
  }
}
