import Spec from './spec'

export default class Local extends Spec {
  static PREFIX = 'local'
  static DEFAULT_VERSION = 'v0.1'

  namer(): Namer {
    let count = 0
    const prefix = `${this.prefix}__id`
    const definitions: Map<any, { id: string, def?: string }> = new Map
    return Object.defineProperties(next, {
      definitions: {
        configurable: false,
        get() {
          const output = [...definitions.values()]
            .map(({def}) => def)
            .join('\n')
          definitions.clear()
          return output
        }
      }
    })

    function next<K>(key: K,
      define?: (id: string, key: K) => string) {
      const existing = definitions.get(key)
      if (existing) return existing.id

      const id = `${prefix}_${count++}_${asValidIdentifier(`${key}`)}`
      definitions.set(key, {
        id, def: typeof define === 'function' ? define(id, key) : void 0
      })
      return id
    }
  }
}

export interface Namer {
  (name: string, define?: (id: string) => string): string
  readonly definitions: string
}

function asValidIdentifier(input: string) {
  return input.trim()
    .replace(/(\s|,|{|})+/g, '_')
    .replace(/_+/g, '_')
    .replace(/[^A-Za-z_0-9]/g, '')
    .replace(/_*$/, '')
}
