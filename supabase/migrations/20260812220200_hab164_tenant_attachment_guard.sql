-- HAB-164: service-request file metadata is a write and follows the same tenant-only guard.

drop trigger if exists service_request_attachments_tenant_read_only
on public.service_request_attachments;

create trigger service_request_attachments_tenant_read_only
before insert on public.service_request_attachments
for each row execute function public.enforce_tenant_service_request_comment_read_only();
