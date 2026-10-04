import { describe, expect, it } from 'vitest';
import { getAdminPanelMenuLink } from './admin-panel-menu';

describe('getAdminPanelMenuLink', () => {
  it('shows the admin link and points it to the admin route for an active ADMIN profile', () => {
    expect(getAdminPanelMenuLink('ADMIN', true)).toEqual({
      label: 'Panel de Administración',
      view: 'admin',
      href: '/admin',
    });
  });

  it('hides the admin link for a customer profile', () => {
    expect(getAdminPanelMenuLink('CUSTOMER', false)).toBeNull();
  });

  it('hides the admin link for an inactive admin profile', () => {
    expect(getAdminPanelMenuLink(null, false)).toBeNull();
  });

  it('keeps the link for another role with verified admin access', () => {
    expect(getAdminPanelMenuLink('LOGISTICS', true)?.href).toBe('/admin');
  });
});