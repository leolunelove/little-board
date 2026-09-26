-- Close the retired app's RPC access without deleting its preserved records.
-- Conditional so fresh Little Board projects can apply this migration too.
do $$
declare signature text; target regprocedure;
begin
 foreach signature in array array[
  'public.edit_private_board(text,jsonb)',
  'public.read_owner_board(text)',
  'public.read_shared_board(text)',
  'public.rls_auto_enable()'
 ] loop
  target := to_regprocedure(signature);
  if target is not null then
   execute format('revoke execute on function %s from public, anon, authenticated', target);
  end if;
 end loop;
end;
$$;
