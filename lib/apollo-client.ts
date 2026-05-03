import { ApolloClient, InMemoryCache, from, createHttpLink } from '@apollo/client';
import { urlTransformerLink } from './apolloLinks';

const httpLink = createHttpLink({
  uri: process.env.NEXT_PUBLIC_SALEOR_API_URL || 'https://api.coupiya.com/saleor/graphql/',
});

export const client = new ApolloClient({
  link: from([urlTransformerLink, httpLink]),
  cache: new InMemoryCache(),
});