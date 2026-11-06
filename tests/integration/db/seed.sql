-- Disposable test identities (never real accounts). Applied by the database owner after the migrations, the same
-- way the project owner creates profiles in the SQL editor.
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000001', 'admin@test.invalid'),
  ('00000000-0000-4000-a000-000000000002', 'manager@test.invalid'),
  ('00000000-0000-4000-a000-000000000003', 'no-profile@test.invalid');

insert into public.profiles (user_id, display_name, role) values
  ('00000000-0000-4000-a000-000000000001', 'Test Admin', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'Test Manager', 'manager');
