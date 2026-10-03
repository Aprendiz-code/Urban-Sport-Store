-- Grant required service_role permissions for admin backend writes.
GRANT INSERT ON public.products TO service_role;
GRANT INSERT ON public.audit_logs TO service_role;
