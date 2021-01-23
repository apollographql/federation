import { default as Spec, must, list, Str, Bool } from './spec'
import dedent from 'dedent'

export default class Join extends Spec {
  static PREFIX = 'join'
  static DEFAULT_VERSION = 'v0.1'

  Graph =
    this.enum('Graph')
  FragmentId =
    this.scalar('FragmentId')
  Url =
    this.scalar('Url')
  OutboundLinkHttp =
    this.input('OutboundLinkHttp', {
      url: must(this.Url)
    })
  OutboundLink =
    this.input('OutboundLink', {
      http: this.OutboundLinkHttp
    })
  owner = this.directive('owner', {
    graph: this.Graph,
    valueType: Bool,
  }, 'on OBJECT | INTERFACE')
  key = this.directive('key', {
    graph: must(this.Graph)
  }, 'repeatable on FRAGMENT_DEFINITION')
  join = this.directive('join', {
    graph: must(this.Graph),
    type: Str,
    requires: this.FragmentId,
    provides: this.FragmentId,
  }, 'on OBJECT | INTERFACE | UNION | FIELD_DEFINITION')
  error = this.directive('error', {
    graph: must(list(must(this.Graph))),
    message: Str,
  }, dedent `
    repeatable on OBJECT
      | INTERFACE
      | UNION
      | FIELD_DEFINITION
  `)
  link = this.directive('link', {
    to: must(this.OutboundLink)
  }, 'on ENUM_VALUE')
}
