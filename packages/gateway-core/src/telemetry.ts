import { trace, SpanKind, SpanStatusCode, context } from '@opentelemetry/api';

const tracer = trace.getTracer('secure-mcp-gateway', '0.1.0');

export function withTracing<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  return tracer.startActiveSpan(name, { kind: SpanKind.INTERNAL }, async (span) => {
    try {
      if (attributes) {
        Object.entries(attributes).forEach(([k, v]) => {
            if (v !== undefined) span.setAttribute(k, v);
        });
      }
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  });
}

