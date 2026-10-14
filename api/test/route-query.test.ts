import { describe, expect, it } from 'vitest';
import { mergeRouteIdQuery } from '../../lib/api-helpers/route-query.js';

describe('route query normalization', () => {
  it('preserves existing parameters and gives the path ID precedence', () => {
    expect(mergeRouteIdQuery({ cursor: 'next', id: 'untrusted-query-id' }, 'path-id'))
      .toEqual({ cursor: 'next', id: 'path-id' });
  });

  it('creates the query for a native request with none', () => {
    expect(mergeRouteIdQuery(undefined, 'path-id')).toEqual({ id: 'path-id' });
  });
});