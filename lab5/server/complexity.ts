import {
  type DocumentNode,
  type FieldNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
  Kind,
  GraphQLError
} from 'graphql';
import type { ApolloServerPlugin } from '@apollo/server';
import { COMPLEXITY_CONFIG } from './shared/constants.js';

export interface ComplexityConfig {
  maxComplexity: number;
  maxDepth: number;
  scalarCost?: number;
  objectCost?: number;
  defaultListMultiplier?: number;
}

export const DEFAULT_COMPLEXITY_CONFIG: ComplexityConfig = {
  maxComplexity: COMPLEXITY_CONFIG.DEFAULT_MAX_COMPLEXITY,
  maxDepth: COMPLEXITY_CONFIG.DEFAULT_MAX_DEPTH,
  scalarCost: COMPLEXITY_CONFIG.SCALAR_COST,
  objectCost: COMPLEXITY_CONFIG.OBJECT_COST,
  defaultListMultiplier: COMPLEXITY_CONFIG.DEFAULT_LIST_MULTIPLIER
};

export interface ComplexityResult {
  complexity: number;
  depth: number;
}

export interface ComplexityContext {
  queryComplexity?: number;
  queryDepth?: number;
}

function extractArgumentMultiplier(field: FieldNode): number {
  if (!field.arguments) {
    return 1;
  }

  for (const arg of field.arguments) {
    const isLimitArg = arg.name.value === 'first' || arg.name.value === 'limit';
    if (isLimitArg && arg.value.kind === Kind.INT) {
      const parsed = parseInt(arg.value.value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return 1;
}

function resolveChildMultiplier(fieldName: string, argumentMultiplier: number, defaultMultiplier: number): number {
  if (argumentMultiplier > 1) {
    return argumentMultiplier;
  }
  if (fieldName === 'edges' || fieldName === 'node') {
    return 1;
  }
  if (fieldName === 'reviews' || fieldName === 'inventory' || fieldName === 'priceHistory' || fieldName.endsWith('s')) {
    return defaultMultiplier;
  }
  return 1;
}

function analyzeSelectionSet(
  selectionSet: SelectionSetNode,
  currentDepth: number,
  currentMultiplier: number,
  config: ComplexityConfig
): ComplexityResult {
  let complexity = 0;
  let maxChildDepth = currentDepth;
  const scalarCost = config.scalarCost ?? COMPLEXITY_CONFIG.SCALAR_COST;
  const objectCost = config.objectCost ?? COMPLEXITY_CONFIG.OBJECT_COST;
  const defaultListMultiplier = config.defaultListMultiplier ?? COMPLEXITY_CONFIG.DEFAULT_LIST_MULTIPLIER;

  for (const selection of selectionSet.selections) {
    if (selection.kind !== Kind.FIELD) {
      continue;
    }

    const field = selection as FieldNode;
    const fieldName = field.name.value;

    if (fieldName.startsWith('__')) {
      continue;
    }

    if (!field.selectionSet) {
      complexity += scalarCost * currentMultiplier;
      continue;
    }

    const argMultiplier = extractArgumentMultiplier(field);
    const childMultiplier = resolveChildMultiplier(fieldName, argMultiplier, defaultListMultiplier);
    const childAnalysis = analyzeSelectionSet(field.selectionSet, currentDepth + 1, currentMultiplier * childMultiplier, config);

    complexity += objectCost * currentMultiplier + childAnalysis.complexity;
    if (childAnalysis.depth > maxChildDepth) {
      maxChildDepth = childAnalysis.depth;
    }
  }

  return { complexity, depth: maxChildDepth };
}

export function calculateQueryComplexity(
  document: DocumentNode,
  config: ComplexityConfig = DEFAULT_COMPLEXITY_CONFIG
): ComplexityResult {
  let maxDepth = 0;
  let totalComplexity = 0;

  for (const definition of document.definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) {
      continue;
    }

    const operation = definition as OperationDefinitionNode;
    if (!operation.selectionSet) {
      continue;
    }

    const { complexity, depth } = analyzeSelectionSet(operation.selectionSet, 1, 1, config);
    totalComplexity += complexity;
    if (depth > maxDepth) {
      maxDepth = depth;
    }
  }

  return { complexity: totalComplexity, depth: maxDepth };
}

export function createComplexityPlugin(config: ComplexityConfig = DEFAULT_COMPLEXITY_CONFIG): ApolloServerPlugin {
  return {
    async requestDidStart() {
      return {
        async validationDidStart() {
          return async (validationErrors) => {
            if (validationErrors && validationErrors.length > 0) return;
          };
        },
        async didResolveOperation(requestContext) {
          if (!requestContext.document) return;

          const { complexity, depth } = calculateQueryComplexity(requestContext.document, config);

          if (depth > config.maxDepth) {
            throw new GraphQLError(
              `Query rejected: Depth of ${depth} exceeds maximum permitted depth of ${config.maxDepth}.`,
              {
                extensions: {
                  code: COMPLEXITY_CONFIG.ERROR_CODE,
                  depth,
                  maxDepth: config.maxDepth
                }
              }
            );
          }

          if (complexity > config.maxComplexity) {
            throw new GraphQLError(
              `Query rejected: Complexity score of ${complexity} exceeds budget of ${config.maxComplexity}.`,
              {
                extensions: {
                  code: COMPLEXITY_CONFIG.ERROR_CODE,
                  complexity,
                  maxComplexity: config.maxComplexity
                }
              }
            );
          }

          const ctx = requestContext.contextValue as ComplexityContext | undefined;
          if (ctx) {
            ctx.queryComplexity = complexity;
            ctx.queryDepth = depth;
          }
        },
        async willSendResponse(requestContext) {
          const ctx = requestContext.contextValue as ComplexityContext | undefined;
          const { response } = requestContext;

          if (ctx?.queryComplexity !== undefined && response.body.kind === 'single') {
            response.body.singleResult.extensions = {
              ...response.body.singleResult.extensions,
              complexity: ctx.queryComplexity,
              depth: ctx.queryDepth
            };
          }
        }
      };
    }
  };
}
