import { createServer } from 'node:http';
import { metadata, product } from './catalog.mjs';
createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4399');
  response.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/health') {
    response.end('{}');
    return;
  }
  if (url.pathname === '/api/v1/catalog/metadata') {
    response.end(JSON.stringify(metadata));
    return;
  }
  if (url.searchParams.get('q') === 'unavailable') {
    response.statusCode = 503;
    response.end(
      JSON.stringify({
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Unavailable',
          requestId: 'test',
        },
      }),
    );
    return;
  }
  if (url.pathname === '/api/v1/products') {
    const query = (url.searchParams.get('q') ?? '').toLowerCase();
    const found =
      !query || product.translations.ru.name.toLowerCase().includes(query);
    response.end(
      JSON.stringify({
        items: found ? [product] : [],
        total: found ? 1 : 0,
        page: 1,
        limit: 12,
      }),
    );
    return;
  }
  if (url.pathname === `/api/v1/products/${product.slug}`) {
    response.end(JSON.stringify(product));
    return;
  }
  response.statusCode = 404;
  response.end(
    JSON.stringify({
      error: { code: 'NOT_FOUND', message: 'Not found', requestId: 'test' },
    }),
  );
}).listen(4399, '127.0.0.1');
