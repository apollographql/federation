import {
    GraphQLExecutionResult as GraphQLExecutionResult0,
    GraphQLExecutor as GraphQLExecutor1,
    GraphQLRequest as GraphQLRequest1,
    GraphQLResponse as GraphQLResponse1,
    GraphQLRequestContext as GraphQLRequestContext1,
    GraphQLRequestContextExecutionDidStart as GraphQLRequestContextExecutionDidStart1,
    ValueOrPromise as ValueOrPromise1,
    VariableValues as VariableValues1,
} from 'apollo-server-types-v0';
import {
    GraphQLExecutionResult as GraphQLExecutionResult3,
    GraphQLExecutor as GraphQLExecutor3,
    GraphQLRequest as GraphQLRequest3,
    GraphQLResponse as GraphQLResponse3,
    GraphQLRequestContext as GraphQLRequestContext3,
    GraphQLRequestContextExecutionDidStart as GraphQLRequestContextExecutionDidStart3,
    ValueOrPromise as ValueOrPromise3,
    VariableValues as VariableValues3,
} from 'apollo-server-types-v3';

/**
 * For the migration from Apollo Server 2 to 3, there was some breaking changes with the TS types.
 * Because of this we need to have the renamed types here either be the types from AS2 or AS3.
 *
 * Any of the types here have changes from the different versions of 'apollo-server-types'
 * and should be imported through here and not directly to keep consistent.
 */
export type GraphQLExecutionResult = GraphQLExecutionResult0 | GraphQLExecutionResult3;
export type GraphQLExecutor<TContext> = GraphQLExecutor1<TContext> | GraphQLExecutor3<TContext>;
export type GraphQLRequest = GraphQLRequest1 | GraphQLRequest3;
export type GraphQLResponse = GraphQLResponse1 | GraphQLResponse3;
export type GraphQLRequestContext<TContext = Record<string, any>> =
    GraphQLRequestContext1<TContext>
    | GraphQLRequestContext3<TContext>;
export type GraphQLRequestContextExecutionDidStart<TContext> =
    GraphQLRequestContextExecutionDidStart1<TContext>
    | GraphQLRequestContextExecutionDidStart3<TContext>;
export type ValueOrPromise<T> = ValueOrPromise1<T> | ValueOrPromise3<T>;
export type VariableValues = VariableValues1 | VariableValues3;
