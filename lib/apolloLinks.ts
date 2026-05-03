import { ApolloLink, Observable } from '@apollo/client';
import { normalizeImageUrl } from './utils';

const convertUrls = (data: any): any => {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map(item => convertUrls(item));
  }
  if (typeof data === 'object') {
    const result: any = {};
    for (const key in data) {
      if (key === 'url' && typeof data[key] === 'string') {
        result[key] = normalizeImageUrl(data[key]);
      } else {
        result[key] = convertUrls(data[key]);
      }
    }
    return result;
  }
  return data;
};

export const urlTransformerLink = new ApolloLink((operation, forward) => {
  return new Observable(observer => {
    const subscription = forward(operation).subscribe({
      next: result => {
        if (result.data) {
          result.data = convertUrls(result.data);
        }
        observer.next(result);
      },
      error: observer.error.bind(observer),
      complete: observer.complete.bind(observer),
    });
    return () => subscription.unsubscribe();
  });
});