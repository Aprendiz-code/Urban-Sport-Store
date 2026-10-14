export type RequestQuery = Record<string, string | string[] | undefined>;

export function mergeRouteIdQuery(query: RequestQuery | undefined, id: string): RequestQuery {
  return { ...query, id };
}