import { parse, type DocumentNode } from 'graphql';

export function gql(strings: TemplateStringsArray, ...values: unknown[]): DocumentNode {
  const source = strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? String(values[i]) : ''), '');
  return parse(source);
}

