// Simple debugging facility.

import chalk from 'chalk';

function indentString(indentLevel: number) : string {
  let str = "";
  for (let i = 0; i < indentLevel; i++) {
    str += chalk.blackBright("⎸ ");
  }
  return str;
}

/**
 * A facility to log messages for debugging.
 *
 * A `DebugLogger` maintains an indentation level that is used before logged messages. That indentation level gets
 * increased by calling `group()` and decreased by `groupEnd()`. This is meant to help representing the nestedness
 * of the code being debugged.
 */
export class DebugLogger {
  private currentIndentLevel: number = 0;

  /**
   * Builds a new `DebugLogger`.
   *
   * @param enabled - whether the logger is enabled. If it is disabled, no message will be logged. Currently, a logger
   * cannot be enabled/disabled after construction.
   */
  constructor(private readonly enabled: boolean) {}

  /**
   * Logs the provided message at the current indentation level, if this logger is enabled.
   *
   * @param message - the message to log. This can optionally be a closure, which allows for the message to only be
   * computed if the logger is enabled (the closure is only called in this case).
   * @param prefix - an optional string printed as a direct prefix of the message.
   */
  public log(message: string | (() => string), prefix: string = chalk.yellow('• ')) {
    if (!this.enabled) return this;

    if (typeof message !== 'string') {
      message = message();
    }
    const indentStr = indentString(this.currentIndentLevel);
    console.log(indentStr + prefix + message);
    return this;
  }

  /**
   * Logs the provided values, indented and one per line.
   *
   * @param values - an array of the values to log.
   * @param printFn - the function to apply to each of the value to convert it to a string to log.
   */
  public groupedValues<T>(values: T[], printFn: (v: T) => string) {
    if (!this.enabled) return this;

    this.group();
    const indentStr = indentString(this.currentIndentLevel);
    for (const value of values) {
      console.log(indentStr + '- ' + printFn(value));
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
    valuePrintFn: (v : V) => string) {
    if (!this.enabled) return this;

    this.group();
    const indentStr = indentString(this.currentIndentLevel);
    for (const [k, v] of map.entries()) {
      console.log(indentStr + '- ' + keyPrintFn(k) + ': ' + valuePrintFn(v));
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
  public group(openingMessage?: string | (() => string)) {
    if (this.enabled) {
      if (openingMessage) {
        this.log(openingMessage, chalk.blue('‣ '));
      }
      this.currentIndentLevel++;
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
  public groupEnd(closingMessage?: string | (() => string)) {
    if (!this.enabled || this.currentIndentLevel == 0) {
      return this;
    }
    this.currentIndentLevel--;
    if (closingMessage) {
      this.log(closingMessage, chalk.green('⇒ '));
    }
    return this;
  }
}
