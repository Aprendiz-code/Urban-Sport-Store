import { requireEmail } from '../api/validation.js';

export async function subscribeNewsletter(body: any) {
  const email = requireEmail(body);
  return { subscribed: true, email };
}
