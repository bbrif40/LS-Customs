-- Vault values are configured on the target environment, never stored in source.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('ls-customs-operations','* * * * *',$job$
  select net.http_post(
    url:=(select decrypted_secret from vault.decrypted_secrets where name='operations_worker_url' limit 1),
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
      (select decrypted_secret from vault.decrypted_secrets where name='operations_worker_token' limit 1)),
    body:='{}'::jsonb,timeout_milliseconds:=100000)
  where exists(select 1 from vault.decrypted_secrets where name='operations_worker_url')
    and exists(select 1 from vault.decrypted_secrets where name='operations_worker_token');
$job$);
