import { parse } from 'graphql';
import { Plugin } from 'pretty-format';

export default {
  test(value: any) {
    if (typeof value === "string") {
      try {
        parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  },

  print(value: string) {
    return `#graphql\n${value}`;
  },
} as Plugin;
