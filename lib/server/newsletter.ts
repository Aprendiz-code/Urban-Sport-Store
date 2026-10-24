import { requireEmail } from '../api/validation.ts';

export async function subscribeNewsletter(body: any) {
  const email = requireEmail(body);
  return { subscribed: true, email };
}

