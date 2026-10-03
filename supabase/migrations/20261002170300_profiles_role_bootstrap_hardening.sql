BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Auth-trigger writes cross schema boundaries and cannot rely on client grants.
CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_values jsonb;
  column_list text := 'id';
  value_list text := '(pg_catalog.jsonb_populate_record(NULL::public.profiles, $1)).id';
  full_name_value text;
  profile_role text := 'CUSTOMER';
  role_type text;
  role_constraints text;
BEGIN
  SELECT profile_type.typtype::text
  INTO role_type
  FROM pg_catalog.pg_attribute AS profile_column
  JOIN pg_catalog.pg_type AS profile_type
    ON profile_type.oid = profile_column.atttypid
  WHERE profile_column.attrelid = 'public.profiles'::regclass
    AND profile_column.attname = 'role'
    AND profile_column.attnum > 0
    AND NOT profile_column.attisdropped;

  IF role_type IS NULL THEN
    RAISE EXCEPTION 'public.profiles.role is required for auth profile bootstrap';
  ELSIF role_type = 'e' THEN
    SELECT enum_value.enumlabel
    INTO profile_role
    FROM pg_catalog.pg_enum AS enum_value
    JOIN pg_catalog.pg_attribute AS profile_column
      ON profile_column.atttypid = enum_value.enumtypid
    WHERE profile_column.attrelid = 'public.profiles'::regclass
      AND profile_column.attname = 'role'
      AND profile_column.attnum > 0
      AND NOT profile_column.attisdropped
      AND pg_catalog.lower(enum_value.enumlabel) IN ('customer', 'user')
    ORDER BY CASE pg_catalog.lower(enum_value.enumlabel)
      WHEN 'customer' THEN 0
      ELSE 1
    END
    LIMIT 1;
  ELSE
    SELECT pg_catalog.string_agg(pg_catalog.pg_get_constraintdef(profile_constraint.oid), ' ')
    INTO role_constraints
    FROM pg_catalog.pg_constraint AS profile_constraint
    WHERE profile_constraint.conrelid = 'public.profiles'::regclass
      AND profile_constraint.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(profile_constraint.oid) ILIKE '%role%';

    IF pg_catalog.strpos(role_constraints, '''CUSTOMER''') > 0 THEN
      profile_role := 'CUSTOMER';
    ELSIF pg_catalog.strpos(role_constraints, '''customer''') > 0 THEN
      profile_role := 'customer';
    ELSIF pg_catalog.strpos(role_constraints, '''USER''') > 0 THEN
      profile_role := 'USER';
    ELSIF pg_catalog.strpos(role_constraints, '''user''') > 0 THEN
      profile_role := 'user';
    END IF;
  END IF;

  IF profile_role IS NULL THEN
    RAISE EXCEPTION 'public.profiles.role has no recognized non-privileged customer value';
  END IF;

  full_name_value := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    NEW.phone,
    'Cliente'
  );
  profile_values := pg_catalog.jsonb_build_object('id', NEW.id);

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = 'email' AND attnum > 0 AND NOT attisdropped
  ) THEN
    profile_values := profile_values || pg_catalog.jsonb_build_object(
      'email', COALESCE(NEW.email, NEW.phone, NEW.id::text)
    );
    column_list := column_list || ', email';
    value_list := value_list || ', (pg_catalog.jsonb_populate_record(NULL::public.profiles, $1)).email';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = 'full_name' AND attnum > 0 AND NOT attisdropped
  ) THEN
    profile_values := profile_values || pg_catalog.jsonb_build_object('full_name', full_name_value);
    column_list := column_list || ', full_name';
    value_list := value_list || ', (pg_catalog.jsonb_populate_record(NULL::public.profiles, $1)).full_name';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = 'first_name' AND attnum > 0 AND NOT attisdropped
  ) THEN
    profile_values := profile_values || pg_catalog.jsonb_build_object(
      'first_name', NULLIF(pg_catalog.split_part(full_name_value, ' ', 1), '')
    );
    column_list := column_list || ', first_name';
    value_list := value_list || ', (pg_catalog.jsonb_populate_record(NULL::public.profiles, $1)).first_name';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = 'last_name' AND attnum > 0 AND NOT attisdropped
  ) THEN
    profile_values := profile_values || pg_catalog.jsonb_build_object(
      'last_name', NULLIF(pg_catalog.btrim(pg_catalog.substr(
        full_name_value,
        pg_catalog.length(pg_catalog.split_part(full_name_value, ' ', 1)) + 1
      )), '')
    );
    column_list := column_list || ', last_name';
    value_list := value_list || ', (pg_catalog.jsonb_populate_record(NULL::public.profiles, $1)).last_name';
  END IF;

  profile_values := profile_values || pg_catalog.jsonb_build_object('role', profile_role);
  column_list := column_list || ', role';
  value_list := value_list || ', (pg_catalog.jsonb_populate_record(NULL::public.profiles, $1)).role';

  profile_values := profile_values || pg_catalog.jsonb_build_object('is_active', true);
  column_list := column_list || ', is_active';
  value_list := value_list || ', (pg_catalog.jsonb_populate_record(NULL::public.profiles, $1)).is_active';

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = 'created_at' AND attnum > 0 AND NOT attisdropped
  ) THEN
    profile_values := profile_values || pg_catalog.jsonb_build_object('created_at', pg_catalog.now());
    column_list := column_list || ', created_at';
    value_list := value_list || ', (pg_catalog.jsonb_populate_record(NULL::public.profiles, $1)).created_at';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.profiles'::regclass
      AND attname = 'updated_at' AND attnum > 0 AND NOT attisdropped
  ) THEN
    profile_values := profile_values || pg_catalog.jsonb_build_object('updated_at', pg_catalog.now());
    column_list := column_list || ', updated_at';
    value_list := value_list || ', (pg_catalog.jsonb_populate_record(NULL::public.profiles, $1)).updated_at';
  END IF;

  EXECUTE pg_catalog.format(
    'INSERT INTO public.profiles (%s) SELECT %s ON CONFLICT (id) DO NOTHING',
    column_list,
    value_list
  ) USING profile_values;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_auth_user_created() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_created();

-- Manual owner-only promotion example after independently verifying the UUID:
-- UPDATE public.profiles SET role = 'ADMIN', is_active = true
-- WHERE id = '<verified-auth-user-uuid>';
-- Adapt the role literal only if the actual column is an enum; never derive it
-- from signup input, Auth metadata, URL parameters, or browser storage.

COMMIT;