-- Small image attachments stay inside the existing private board row.
-- Existing owner/viewer RLS policies continue to control all access.
create or replace function little_private.validate_images() returns trigger
language plpgsql set search_path='' as $$
declare item jsonb; image jsonb; total_bytes bigint := 0;
begin
 if jsonb_typeof(new.tasks) is distinct from 'array' then return new; end if;
 for item in select value from jsonb_array_elements(new.tasks) loop
  if item ? 'images' then
   if jsonb_typeof(item->'images') is distinct from 'array' then raise exception 'Invalid images'; end if;
   if jsonb_array_length(item->'images') > 3 then raise exception 'Use up to three images per item'; end if;
   for image in select value from jsonb_array_elements(item->'images') loop
    if jsonb_typeof(image) is distinct from 'object' or jsonb_typeof(image->'name') is distinct from 'string' or char_length(image->>'name') > 120 or jsonb_typeof(image->'id') is distinct from 'string' or jsonb_typeof(image->'src') is distinct from 'string' then raise exception 'Invalid image'; end if;
    if image->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'Invalid image ID'; end if;
    if char_length(image->>'src') > 131112 or image->>'src' !~ '^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Use a small compressed image'; end if;
    total_bytes := total_bytes + char_length(image->>'src') * 3 / 4;
   end loop;
  end if;
 end loop;
 if total_bytes > 2097152 then raise exception 'Board image allowance reached'; end if;
 return new;
end; $$;
revoke all on function little_private.validate_images() from public, anon, authenticated;
drop trigger if exists little_images on public.little_boards;
create trigger little_images before insert or update on public.little_boards for each row execute function little_private.validate_images();
