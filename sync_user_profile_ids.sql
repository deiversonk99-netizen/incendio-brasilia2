-- Migration: Sync user_profiles.id with auth.users.id
-- Created: 2026-05-20
-- Description: Fixes missing user IDs in user_profiles table, which caused
-- users to be invisible in the "Create Board" dropdown even when they had
-- been pre-registered in the settings permissions panel.

-- Step 1: Backfill existing records where id is NULL but user has signed up
UPDATE public.user_profiles p
SET id = u.id
FROM auth.users u
WHERE p.email = u.email AND p.id IS NULL;

-- Step 2: Trigger on auth.users INSERT
-- When a user signs up, automatically update their profile if pre-created by admin
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.user_profiles
    SET id = NEW.id
    WHERE email = NEW.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
        SELECT id INTO auth_id FROM auth.users WHERE email = NEW.email LIMIT 1;
        IF auth_id IS NOT NULL THEN
            NEW.id := auth_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_inserted ON public.user_profiles;

CREATE TRIGGER on_profile_inserted
    BEFORE INSERT ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_insert();
