import type { ApolloServerPlugin, GraphQLRequestContext, GraphQLFieldResolverParams } from '@apollo/server';

export interface ServerMetrics {
  totalRequests: number;
  totalErrors: number;
  avgDurationMs: number;
  uptimeSeconds: number;
  activeSubscriptions: number;
  memoryUsageMb: number;
}

const serverStartTime = Date.now();
let totalRequestsCount = 0;
let totalErrorsCount = 0;
let totalDurationSum = 0;
let activeSubscriptionsCount = 0;

export function updateSubscriptionCount(delta: number): void {
  activeSubscriptionsCount = Math.max(0, activeSubscriptionsCount + delta);
}

export function getServerMetrics(): ServerMetrics {
  const uptimeSeconds = Math.round((Date.now() - serverStartTime) / 1000);
  const avgDurationMs = totalRequestsCount > 0 ? Math.round((totalDurationSum / totalRequestsCount) * 100) / 100 : 0;
  const memoryUsageMb = Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;

  return {
    totalRequests: totalRequestsCount,
    totalErrors: totalErrorsCount,
    avgDurationMs,
    uptimeSeconds,
    activeSubscriptions: activeSubscriptionsCount,
    memoryUsageMb
  };
}

export interface ResolverSpan {
  path: string;
  parentType: string;
  fieldName: string;
  durationMs: number;
}

export function createTracingPlugin(): ApolloServerPlugin {
  return {
    async requestDidStart() {
      const requestStart = performance.now();
      totalRequestsCount++;
      const spans: ResolverSpan[] = [];

      return {
        async executionDidStart() {
          return {
            willResolveField({ info }: GraphQLFieldResolverParams<unknown, unknown>) {
              const fieldStart = performance.now();
              return () => {
                const durationMs = Math.round((performance.now() - fieldStart) * 100) / 100;
                if (!info.fieldName.startsWith('__')) {
                  spans.push({
                    path: info.path.key.toString(),
                    parentType: info.parentType.name,
                    fieldName: info.fieldName,
                    durationMs
                  });
                }
              };
            }
          };
        },
        async didEncounterErrors() {
          totalErrorsCount++;
        },
        async willSendResponse(requestContext: GraphQLRequestContext<Record<string, unknown>>) {
          const totalDurationMs = Math.round((performance.now() - requestStart) * 100) / 100;
          totalDurationSum += totalDurationMs;

          const body = requestContext.response.body;
          if (body && body.kind === 'single') {
            body.singleResult.extensions = {
              ...body.singleResult.extensions,
              tracing: {
                durationMs: totalDurationMs,
                resolverCount: spans.length,
                spans: spans.slice(0, 15)
              }
            };
          }
        }
      };
    }
  };
}
