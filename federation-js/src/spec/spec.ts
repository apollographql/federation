import dedent from 'dedent'

type SpecConstructor<S extends Spec> = {
  readonly IDENTITY: string
  readonly PREFIX: string
  readonly DEFAULT_VERSION: string

  new(identity: string, version: string, prefix: string): S
}

export default class Spec {
  static readonly LIBRARY: string = `https://lib.apollo.dev`
  static get IDENTITY() {
    return `${this.LIBRARY}/${this.PREFIX}`
  }
  static readonly PREFIX: string
  static readonly DEFAULT_VERSION: string

  static default<S extends Spec>(
    this: SpecConstructor<S>,
    version = this.DEFAULT_VERSION,
    prefix = this.PREFIX,
  ): S
  {
    return new this(this.IDENTITY, version, prefix)
  }

  constructor(
    public readonly identity: string,
    public readonly version: string,
    public readonly prefix: string) {}

  readonly prefixed = (name: string) => `${this.prefix}__${name}`

  get hasDefaultPrefix() {
    return this.prefix === this.defaultPrefix
  }

  get defaultPrefix(): string {
    return (this.constructor as any).PREFIX
  }

  get url(): string {
    return `${this.identity}/${this.version}`
  }

  urlFor(name?: string): string {
    return name ? `${this.url}/#${this.prefixed(name)}` : this.url
  }

  get definitions(): string {
    return this.items
      .map(item => item.definition)
      .join('\n')
  }

  protected specifiedBy(name: string): string {
    return `@specifiedBy(url: ${str(this.urlFor(name))})`
  }

  items: Defined[] = []
  protected addItem<D extends Defined>(def: D): D {
    this.items.push(def)
    return def
  }

  protected enum(name: string): Enum {
    return new Enum(this.prefixed(name))
  }

  protected scalar(name: string, urlName = name.toLocaleLowerCase()): Scalar<string> {
    return this.addItem(new Scalar(this.prefixed(name), this.urlFor(urlName)))
  }

  protected input<A>(name: string, fields: A): InputType<A> {
    return this.addItem(new InputType(this.prefixed(name), fields))
  }

  protected directive<A>(name: string, args: A, repeatableOn: string): Directive<A> {
    const tag =
      name === this.defaultPrefix
        ? `@${this.prefix}`
        : `@${this.prefixed(name)}`

    function directive(input: Input<A>) {
      let argStr = printArgsInput(args, input)
      argStr = argStr ? `(${argStr})` : ''
      return `${tag}${argStr}`
    }
    return this.addItem(Object.defineProperties(directive, {
      args: { writable: false, value: args },
      definition: {
        writable: false,
        value: `directive ${tag}(\n${printArgsDef(args)})\n  ${repeatableOn}`
      }
    }))
  }
}

function printArgsDef<A>(args: A) {
  return Object.entries(args)
    .map(([name, type]) => `  ${name}: ${type}`)
    .join(',\n')
}

function printArgsInput<A>(args: A, input: Input<A>) {
  return Object.entries(input)
    .map(([name, value]) => {
      let type = (args as any)[name]
      if (!type) return ''
      return type.printArg(name, value)
    })
    .filter(x => x)
    .join(', ')
}

interface Defined {
  readonly definition: string
}

export interface Type<V> {
  readonly Value?: V

  readonly typename: string
  toString(): string
  printValue(value: V): string
  printArg(name: string, value: V): string | undefined
}

export class BaseType<V> implements Type<V> {
  constructor(public readonly typename: string) {}

  toString() {
    return this.typename
  }

  printValue(value: V) {
    return str(`${value}`)
  }

  printArg(name: string, value: V) {
    return value ? `${name}: ${this.printValue(value)}` : undefined
  }
}

export class Scalar<V> extends BaseType<V> {
  get Value() { return undefined as unknown as V }

  constructor(name: string, public readonly specifiedByUrl?: string) {
    super(name)
  }

  private get specifiedBy() {
    const {specifiedByUrl} = this
    return specifiedByUrl ?
      `@specifiedBy(url: ${str(specifiedByUrl)})`
      : undefined
  }

  get definition() {
    const {specifiedBy} = this
    return specifiedBy ?
      `scalar ${this.typename} ${this.specifiedBy}`
      : `scalar ${this.typename}`
  }
}

export class RawScalar<T=number> extends Scalar<T> {
  printValue(value: T) {
    return str(value)
  }
}

export class InputType<A> extends BaseType<Input<A>> {
  constructor(typename: string, public readonly args: A) {
    super(typename)
  }

  printValue(value: Input<A>) {
    return `{ ${printArgsInput(this.args, value)} }`
  }

  get definition() {
    return dedent `
      input ${this.typename} {
        ${printArgsDef(this.args)}
      }
    `
  }
}

export const Float = new RawScalar('Float')
export const Int = new RawScalar('Int')
export const Bool = new RawScalar<boolean>('Boolean')
export const Str = new RawScalar<string>('String')

type OptionalKeys<A> = {
  [k in keyof A]-?: A[k] extends NonNull<infer _>
    ? never : k
}[keyof A]

export type RequiredKeys<A> = Exclude<keyof A, OptionalKeys<A>>

export type Value<T> = T extends Type<infer V> ? V : T

export type Input<A> = {
  [k in RequiredKeys<A>]: Value<A[k]>
} & {
  [k in OptionalKeys<A>]?: Value<A[k]>
}

export interface Directive<A> {
  readonly args: A
  readonly definition: string
  (input: Input<A>): string
}

export class Enum extends BaseType<string> {
  printValue(value: string) { return value }
  define(values: Iterable<[string, string | string[]]>) {
    const lines = []
    for (const [name, directives] of values) {
      const dirs = Array.prototype.concat.call([], directives).join('\n    ')
      lines.push(dirs ? `${name} ${dirs}` : name)
    }
    return `enum ${this.typename} {\n  ${lines.join('\n  ')}\n}\n`
  }
}

export class List<V, T extends Type<V>> extends BaseType<V[]> {
  constructor(public readonly type: T) {
    super(type.typename)
  }

  toString(): string {
    return `[${this.type}]`
  }

  printValue(value: [V]): string {
    return str(value.map(item => this.type.printValue(item)))
  }
}

export class NonNull<T extends Type<any>> extends BaseType<NonNullable<Value<T>>> {
  constructor(public readonly type: T) {
    super(type.typename)
  }

  toString() {
    return `${this.type}!`
  }

  printValue(value: Value<T>) {
    return this.type.printValue(value)
  }
}


export function must<T extends Type<any>>(type: T): NonNull<T> {
  return new NonNull(type)
}

export function list<V, T extends Type<V>>(type: T): List<V, T> {
  return new List(type)
}

export const str = (value: any) => JSON.stringify(value)
