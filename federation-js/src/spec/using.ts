import { default as Spec, Str, must } from './spec'

export default class Using extends Spec {
  static PREFIX = 'using'
  static DEFAULT_VERSION = 'v0.1'
  using = this.directive('using', {
    spec: must(Str),
    prefix: Str,
  }, 'repeatable on SCHEMA')

  usingSpec(spec: Spec): string {
    if (spec.identity === this.identity &&
      spec.version === Using.DEFAULT_VERSION &&
      spec.hasDefaultPrefix) {
      // Omit default using directive
      return ''
    }
    return !spec.hasDefaultPrefix
      ? this.using({ spec: spec.url, prefix: spec.prefix })
      : this.using({ spec: spec.url })
  }
}
