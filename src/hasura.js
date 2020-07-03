import { ApolloClient } from 'apollo-client';
import { HttpLink } from 'apollo-link-http';
import { InMemoryCache } from 'apollo-cache-inmemory';
// New Imports
import { split } from 'apollo-link';
import { WebSocketLink } from 'apollo-link-ws';
import { getMainDefinition } from 'apollo-utilities';
import gql from 'graphql-tag';

//TODO: change this
const graphqlUrl =
  process.env.NODE_ENV == 'development'
    ? 'localhost:8080/v1/graphql'
    : 'www.spinbi.com/v1/graphql';

const httpLink = new HttpLink({
  // You should use an absolute URL here
  uri:
    (process.env.NODE_ENV == 'development' ? 'http://' : 'https://') +
    graphqlUrl,
  headers: {
    'x-hasura-admin-secret': 'gkM7JbE3jZmdu9tKCVgWakkqMfk7WK5A'
  }
});

// Create the subscription websocket link
const wsLink = new WebSocketLink({
  uri:
    (process.env.NODE_ENV == 'development' ? 'ws://' : 'wss://') + graphqlUrl,
  options: {
    reconnect: true,
    connectionParams: {
      headers: {
        'x-hasura-admin-secret': 'gkM7JbE3jZmdu9tKCVgWakkqMfk7WK5A'
      }
    }
  }
});

// using the ability to split links, you can send data to each link
// depending on what kind of operation is being sent
const link = split(
  // split based on operation type
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink
);

// Create the apollo client
export const apolloClient = new ApolloClient({
  link,
  cache: new InMemoryCache(),
  connectToDevTools: true
});

//utilities
export function listQuery(table, returning) {
  return gql`
      query ${table}List($limit: Int, $offset: Int, $order_by: [${table}_order_by!], $where: ${table}_bool_exp) {
  
        ${table}(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
          ${returning}
        }
  
        ${table}_aggregate(where: $where) {
          aggregate {
            count
          }
        }
    }`;
}

export function readQueryFunction(fn, table, returning, subscribe) {
  const query = fn;
  const t = subscribe ? 'subscription' : 'query';

  const q = gql`${t} ${fn}($where: ${table}_bool_exp,
        $args: ${fn}_args!,
        $limit: Int, $offset: Int, $order_by: [${table}_order_by!],
        $distinct_on: [${table}_select_column!]) {
      ${query}(where: $where, args: $args, limit: $limit, offset: $offset, order_by: $order_by, distinct_on: $distinct_on) {
        ${returning}
      }
    }
    `;

  console.log(q);
  return q;
}

export function readQuery(table, returning, subscribe) {
  const query = table;
  table = table.replace(/_aggregate$/i, '');

  const t = subscribe ? 'subscription' : 'query';

  const q = gql`${t} ${table}($where: ${table}_bool_exp!,
        $limit: Int, $offset: Int, $order_by: [${table}_order_by!],
        $distinct_on: [${table}_select_column!]) {
      ${query}(where: $where, limit: $limit, offset: $offset, order_by: $order_by, distinct_on: $distinct_on) {
        ${returning}
      }
    }
    `;

  console.log(q);
  return q;
}

export function insertQuery(table, returning, onConflict) {
  if (onConflict) {
    return gql`mutation insert${table}($objects: [${table}_insert_input!]!, $on_conflict: ${table}_on_conflict) {
        insert_${table}(objects: $objects, on_conflict: $on_conflict) {
          ${returning || ''}
          affected_rows
        }
      }`;
  }

  return gql`mutation insert${table}($objects: [${table}_insert_input!]!) {
      insert_${table}(objects: $objects) {
        ${returning || ''}
        affected_rows
      }
    }`;
}

export function updateQuery(table, returning) {
  return gql`mutation update${table}($set: ${table}_set_input, $inc: ${table}_inc_input, $where: ${table}_bool_exp!) {
      update_${table}(where: $where, _set: $set, _inc: $inc) {
        ${returning || ''}
        affected_rows
      }
    }`;
}

export function deleteQuery(table, returning) {
  return gql`mutation delete${table}($where: ${table}_bool_exp!) {
      delete_${table}(where: $where) {
        ${returning || ''}
        affected_rows
      }
    }`;
}
