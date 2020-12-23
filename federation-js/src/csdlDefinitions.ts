export default `
directive @cs__key(graph: cs__Graph!)
  repeatable on FRAGMENT_DEFINITION

directive @cs__resolve(
  graph: cs__Graph!,
  requires: cs__SelectionSet,
  provides: cs__SelectionSet)
  on FIELD_DEFINITION

directive @cs__error(
  graphs: [cs__Graph!],
  message: String)
    on OBJECT
    | INTERFACE
    | UNION
    | FIELD_DEFINITION

directive @cs__link(to: cs__OutboundLink!)
  on ENUM_VALUE

input cs__OutboundLink {
  http: cs__OutboundLinkHTTP
}

input cs__OutboundLinkHTTP {
  url: cs__URL
}

scalar cs__URL @specifiedBy(url: "https://specs.apollo.dev/v0.1#cs__url")
scalar cs__SelectionSet @specifiedBy(url: "https://specs.apollo.dev/v0.1#cs__selectionset")
`
