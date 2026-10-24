export function isPaymentReturnPath(pathname: string): boolean {
  return pathname === '/checkout/return';
}

export function getPaymentReturnDestination(
  hasAuthenticatedUser: boolean,
): 'account' | 'login' {
  return hasAuthenticatedUser ? 'account' : 'login';
}
