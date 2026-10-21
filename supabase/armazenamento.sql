-- Pasta privada "materiais" (rider, mapa de palco, fotos, release): cada conta envia na própria pasta
-- <user_id>/<evento_id>/arquivo; a equipe vê todas. Rodar no SQL Editor do Supabase (não roda no teste local).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiais', 'materiais', false, 26214400, array['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/zip','text/plain','audio/mpeg'])
on conflict (id) do nothing;
drop policy if exists materiais_enviar on storage.objects;
create policy materiais_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'materiais' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists materiais_ler on storage.objects;
create policy materiais_ler on storage.objects for select to authenticated
  using (bucket_id = 'materiais' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_equipe()));
drop policy if exists materiais_apagar on storage.objects;
create policy materiais_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'materiais' and (storage.foldername(name))[1] = auth.uid()::text);

-- Lembretes: todo dia às 08:07 de Brasília (11:07 UTC) chama a função com a chave interna.
create extension if not exists pg_net;
create extension if not exists pg_cron;
