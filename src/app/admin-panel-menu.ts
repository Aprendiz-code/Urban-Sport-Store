export interface AdminPanelMenuLink {
  label: string;
  view: "admin";
  href: "/admin";
}

export function getAdminPanelMenuLink(role: string | null, hasAdminAccess: boolean): AdminPanelMenuLink | null {
  if (!hasAdminAccess || !role || role.toUpperCase() === "CUSTOMER") return null;

  return {
    label: "Panel de Administración",
    view: "admin",
    href: "/admin",
  };
}