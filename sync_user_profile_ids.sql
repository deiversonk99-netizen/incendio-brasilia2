-- Migration: Sync user_profiles.id with auth.users.id
-- Created: 2026-05-20
-- Description: Fixes missing user IDs in user_profiles table, which caused
-- users to be invisible in the "Create Board" dropdown even when they had
-- been pre-registered in the settings permissions panel.

-- Step 1: Backfill existing records where id is NULL but user has signed up
UPDATE public.user_profiles p
SET id = u.id,
    status = CASE WHEN p.status = 'BLOCKED' THEN 'BLOCKED' ELSE 'ACTIVE' END
FROM auth.users u
WHERE lower(p.email) = lower(u.email) AND p.id IS NULL;

-- Step 2: Trigger on auth.users INSERT
-- When a user signs up, automatically update their profile if pre-created by admin
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.user_profiles
    SET id = NEW.id,
        status = CASE WHEN status = 'BLOCKED' THEN 'BLOCKED' ELSE 'ACTIVE' END
    WHERE lower(email) = lower(NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();

-- Step 3: Trigger on user_profiles INSERT
-- When admin adds a profile, auto-fill id if user already has an auth account
CREATE OR REPLACE FUNCTION public.handle_new_profile_insert()
RETURNS TRIGGER AS $$
DECLARE
    auth_id UUID;
BEGIN
    IF NEW.id IS NULL THEN
        SELECT id INTO auth_id FROM auth.users WHERE lower(email) = lower(NEW.email) LIMIT 1;
        IF auth_id IS NOT NULL THEN
            NEW.id := auth_id;
            NEW.status := CASE WHEN NEW.status = 'BLOCKED' THEN 'BLOCKED' ELSE 'ACTIVE' END;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

DROP TRIGGER IF EXISTS on_profile_inserted ON public.user_profiles;

CREATE TRIGGER on_profile_inserted
    BEFORE INSERT ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_insert();

-- Step 4: Permite que uma sessão autenticada reivindique somente o perfil
-- pré-cadastrado com o mesmo e-mail. Perfis bloqueados nunca são reativados.
CREATE OR REPLACE FUNCTION public.activate_current_user_profile()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_email text := lower(COALESCE(auth.jwt() ->> 'email', ''));
    v_profile public.user_profiles%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Sessão autenticada inválida';
    END IF;

    SELECT * INTO v_profile
    FROM public.user_profiles
    WHERE lower(email) = v_email
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Perfil não autorizado';
    END IF;

    IF v_profile.status = 'BLOCKED' THEN
        RAISE EXCEPTION 'Perfil bloqueado';
    END IF;

    UPDATE public.user_profiles
    SET id = auth.uid(), status = 'ACTIVE', email = v_email
    WHERE lower(email) = v_email
    RETURNING * INTO v_profile;

    RETURN row_to_json(v_profile);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_current_user_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_current_user_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_current_user_profile() TO authenticated;
