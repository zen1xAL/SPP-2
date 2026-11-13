import {
  type DocumentNode,
  type FieldNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
  Kind,
  GraphQLError
} from 'graphql';
import type { ApolloServerPlugin } from '@apollo/server';

export interface ComplexityConfig {
  maxComplexity: number;
  maxDepth: number;
  scalarCost?: number;
  objectCost?: number;
  defaultListMultiplier?: number;
}

export const DEFAULT_COMPLEXITY_CONFIG: ComplexityConfig = {
  maxComplexity: 1000,
  maxDepth: 6,
  scalarCost: 1,
  objectCost: 2,
  defaultListMultiplier: 3
};

export interface ComplexityResult {
  complexity: number;
  depth: number;
}

export function calculateQueryComplexity(
  document: DocumentNode,
  config: ComplexityConfig = DEFAULT_COMPLEXITY_CONFIG
): ComplexityResult {
  let maxDepth = 0;
  let totalComplexity = 0;

  for (const definition of document.definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) {
      const op = definition as OperationDefinitionNode;
      if (op.selectionSet) {
        const { complexity, depth } = analyzeSelectionSet(op.selectionSet, 1, 1, config);
        totalComplexity += complexity;
        if (depth > maxDepth) maxDepth = depth;
      }
    }
  }

  return { complexity: totalComplexity, depth: maxDepth };
}

function analyzeSelectionSet(
  selectionSet: SelectionSetNode,
  currentDepth: number,
  currentMultiplier: number,
  config: ComplexityConfig
): { complexity: number; depth: number } {
  let complexity = 0;
  let maxChildDepth = currentDepth;

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const field = selection as FieldNode;
      const fieldName = field.name.value;

      if (fieldName.startsWith('__')) {
        continue;
      }

      let multiplier = 1;
      if (field.arguments) {
        for (const arg of field.arguments) {
          if (arg.name.value === 'first' || arg.name.value === 'limit') {
            if (arg.value.kind === Kind.INT) {
              multiplier = parseInt(arg.value.value, 10);
            }
          }
        }
      }

      if (field.selectionSet) {
        let childMultiplier = 1;
        if (multiplier > 1) {
          childMultiplier = multiplier;
        } else if (fieldName === 'edges' || fieldName === 'node') {
          childMultiplier = 1;
        } else if (fieldName === 'reviews' || fieldName === 'inventory' || fieldName === 'priceHistory' || fieldName.endsWith('s')) {
          childMultiplier = config.defaultListMultiplier ?? 3;
        }

        const child = analyzeSelectionSet(field.selectionSet, currentDepth + 1, currentMultiplier * childMultiplier, config);
        complexity += (config.objectCost ?? 2) * currentMultiplier + child.complexity;
        if (child.depth > maxChildDepth) {
          maxChildDepth = child.depth;
        }
      } else {
        complexity += (config.scalarCost ?? 1) * currentMultiplier;
      }
    }
  }

  return { complexity, depth: maxChildDepth };
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
                  code: 'GRAPHQL_VALIDATION_FAILED',
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
                  code: 'GRAPHQL_VALIDATION_FAILED',
                  complexity,
                  maxComplexity: config.maxComplexity
                }
              }
            );
          }

          if (requestContext.contextValue) {
            (requestContext.contextValue as Record<string, unknown>).queryComplexity = complexity;
            (requestContext.contextValue as Record<string, unknown>).queryDepth = depth;
          }
        },
        async willSendResponse(requestContext) {
          const { contextValue, response } = requestContext;
          if (contextValue && (contextValue as Record<string, unknown>).queryComplexity !== undefined) {
            if (response.body.kind === 'single') {
              response.body.singleResult.extensions = {
                ...response.body.singleResult.extensions,
                complexity: (contextValue as Record<string, unknown>).queryComplexity,
                depth: (contextValue as Record<string, unknown>).queryDepth
              };
            }
          }
        }
      };
    }
  };
}
