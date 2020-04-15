import { handleRequest } from './handler'
import { log } from './sentry'

self.addEventListener('fetch', event => {
  try {
    event.respondWith(handleRequest(event))
  } catch (e) {
    event.waitUntil(log(e, event.request));
    event.respondWith(
      new Response('Internal Server Error', { status: 500 })
    );
  }
})