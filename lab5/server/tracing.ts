import type { ApolloServerPlugin, GraphQLRequestContext, GraphQLFieldResolverParams } from '@apollo/server';
import { TRACING_CONFIG } from './shared/constants.js';

export interface ServerMetrics {
  totalRequests: number;
  totalErrors: number;
  avgDurationMs: number;
  uptimeSeconds: number;
  activeSubscriptions: number;
  memoryUsageMb: number;
}

export interface ResolverSpan {
  path: string;
  parentType: string;
  fieldName: string;
  durationMs: number;
}

class SystemMetricsRegistry {
  private readonly serverStartTime = Date.now();
  private totalRequests = 0;
  private totalErrors = 0;
  private totalDurationSum = 0;
  private activeSubscriptions = 0;

  recordRequestStart(): void {
    this.totalRequests++;
  }

  recordRequestError(): void {
    this.totalErrors++;
  }

  recordRequestCompletion(durationMs: number): void {
    this.totalDurationSum += durationMs;
  }

  updateSubscriptions(delta: number): void {
    this.activeSubscriptions = Math.max(0, this.activeSubscriptions + delta);
  }

  getSnapshot(): ServerMetrics {
    const uptimeSeconds = Math.round((Date.now() - this.serverStartTime) / TRACING_CONFIG.MS_PER_SECOND);
    const avgDurationMs =
      this.totalRequests > 0
        ? Math.round((this.totalDurationSum / this.totalRequests) * TRACING_CONFIG.DECIMAL_PRECISION) /
          TRACING_CONFIG.DECIMAL_PRECISION
        : 0;

    const memoryUsageMb =
      Math.round((process.memoryUsage().rss / TRACING_CONFIG.BYTES_PER_MB) * TRACING_CONFIG.MB_DECIMAL_PRECISION) /
      TRACING_CONFIG.MB_DECIMAL_PRECISION;

    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      avgDurationMs,
      uptimeSeconds,
      activeSubscriptions: this.activeSubscriptions,
      memoryUsageMb
    };
  }
}

const metricsRegistry = new SystemMetricsRegistry();

export function updateSubscriptionCount(delta: number): void {
  metricsRegistry.updateSubscriptions(delta);
}

export function getServerMetrics(): ServerMetrics {
  return metricsRegistry.getSnapshot();
}

function roundToPrecision(value: number): number {
  return Math.round(value * TRACING_CONFIG.DECIMAL_PRECISION) / TRACING_CONFIG.DECIMAL_PRECISION;
}

export function createTracingPlugin(): ApolloServerPlugin {
  return {
    async requestDidStart() {
      const requestStart = performance.now();
      metricsRegistry.recordRequestStart();
      const spans: ResolverSpan[] = [];

      return {
        async executionDidStart() {
          return {
            willResolveField({ info }: GraphQLFieldResolverParams<unknown, unknown>) {
              const fieldStart = performance.now();
              return () => {
                const durationMs = roundToPrecision(performance.now() - fieldStart);
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
          metricsRegistry.recordRequestError();
        },
        async willSendResponse(requestContext: GraphQLRequestContext<Record<string, unknown>>) {
          const totalDurationMs = roundToPrecision(performance.now() - requestStart);
          metricsRegistry.recordRequestCompletion(totalDurationMs);

          const body = requestContext.response.body;
          if (body && body.kind === 'single') {
            body.singleResult.extensions = {
              ...body.singleResult.extensions,
              tracing: {
                durationMs: totalDurationMs,
                resolverCount: spans.length,
                spans: spans.slice(0, TRACING_CONFIG.SPANS_MAX_RETAINED)
              }
            };
          }
        }
      };
    }
  };
}
