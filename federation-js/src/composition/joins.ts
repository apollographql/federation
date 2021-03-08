import { SelectionNode } from "graphql";

export const JOINS = Symbol('joins');

export type IntoFragment = ReadonlyArray<SelectionNode>

export interface TypeJoin {
  readonly graph: string
  readonly type: string
  readonly requires?: IntoFragment
}

export interface FieldJoin {
  readonly graph: string
  readonly requires?: IntoFragment
  readonly provides?: IntoFragment
}

export type JoinInput = TypeJoin | FieldJoin

export function addJoins(target: any, ...data: JoinInput[]) {
  (target[JOINS] ?? (target[JOINS] = []))
    .push(...data)
}

export function getJoins(target: any): JoinInput[] {
  return target[JOINS] ?? []
}
