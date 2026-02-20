-- 001_init.sql
-- Self-hostable schema with local auth built into public.profiles
BEGIN;

-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Optional but nice for username/email case-insensitive comparisons:
-- CREATE EXTENSION IF NOT EXISTS citext;

-- ------------------------------------------------------------
-- Common helper: updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- PROFILES (auth + identity only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
                                               id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Auth
                                               email text UNIQUE,
                                               password_hash text NOT NULL,

    -- Identity
                                               username text UNIQUE NOT NULL,
                                               displayname text NOT NULL,
                                               role text NOT NULL DEFAULT 'default',

    -- "Wallet"/account balance-ish (kept here intentionally)
                                               tokens integer NOT NULL DEFAULT 0,

                                               created_at timestamptz NOT NULL DEFAULT now(),
                                               updated_at timestamptz NOT NULL DEFAULT now(),

    -- Optional: enforce lowercase username/email at the DB level.
                                               CONSTRAINT profiles_username_lower_chk CHECK (username = lower(username)),
                                               CONSTRAINT profiles_email_lower_chk CHECK (email IS NULL OR email = lower(email))
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- PROFILE_CUSTOMIZATION (1:1 with profiles)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_customization (
                                                            profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

                                                            bio text,
                                                            color text NOT NULL DEFAULT '#3b82f6',
                                                            text_color text NOT NULL DEFAULT '#f2f2f2',
                                                            name_color text NOT NULL DEFAULT '#3b82f6',
                                                            border text NOT NULL DEFAULT 'none',
                                                            border_color text NOT NULL DEFAULT '#000000',
                                                            background text NOT NULL DEFAULT 'default',
                                                            background_color text NOT NULL DEFAULT '#f2f2f2',
                                                            font text,
                                                            icon text,

                                                            created_at timestamptz NOT NULL DEFAULT now(),
                                                            updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profile_customization_updated_at ON public.profile_customization;
CREATE TRIGGER trg_profile_customization_updated_at
    BEFORE UPDATE ON public.profile_customization
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- PROFILE_STATISTICS (1:1 with profiles)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_statistics (
                                                         profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

                                                         boards_generated integer NOT NULL DEFAULT 0,
                                                         games_finished integer NOT NULL DEFAULT 0,
                                                         games_played integer NOT NULL DEFAULT 0,
                                                         money_won integer NOT NULL DEFAULT 0,
                                                         games_won integer NOT NULL DEFAULT 0,

                                                         daily_double_found integer NOT NULL DEFAULT 0,
                                                         daily_double_correct integer NOT NULL DEFAULT 0,

                                                         final_jeopardy_participations integer NOT NULL DEFAULT 0,
                                                         final_jeopardy_corrects integer NOT NULL DEFAULT 0,

                                                         clues_selected integer NOT NULL DEFAULT 0,
                                                         times_buzzed integer NOT NULL DEFAULT 0,
                                                         total_buzzes integer NOT NULL DEFAULT 0,

                                                         correct_answers integer NOT NULL DEFAULT 0,
                                                         wrong_answers integer NOT NULL DEFAULT 0,

                                                         clues_skipped integer NOT NULL DEFAULT 0,
                                                         true_daily_doubles integer NOT NULL DEFAULT 0,

                                                         created_at timestamptz NOT NULL DEFAULT now(),
                                                         updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profile_statistics_updated_at ON public.profile_statistics;
CREATE TRIGGER trg_profile_statistics_updated_at
    BEFORE UPDATE ON public.profile_statistics
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- Auto-create customization + statistics rows on profile insert
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_profile_children()
    RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.profile_customization (profile_id)
    VALUES (NEW.id)
    ON CONFLICT (profile_id) DO NOTHING;

    INSERT INTO public.profile_statistics (profile_id)
    VALUES (NEW.id)
    ON CONFLICT (profile_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_create_children ON public.profiles;
CREATE TRIGGER trg_profiles_create_children
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.create_profile_children();

-- ------------------------------------------------------------
-- JEOPARDY_BOARDS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jeopardy_boards (
                                                      id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
                                                      owner uuid,
                                                      board jsonb NOT NULL,
                                                      created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ONLY public.jeopardy_boards
    ADD CONSTRAINT jeopardy_boards_owner_fkey
        FOREIGN KEY (owner) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- IMAGE_ASSETS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.image_assets (
                                                   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                                   storage_key text,
                                                   sha256 text NOT NULL UNIQUE,
                                                   content_type text NOT NULL DEFAULT 'image/webp',

                                                   data bytea,
                                                   bytes integer NOT NULL,
                                                   width integer,
                                                   height integer,
                                                   source_url text,
                                                   license text,
                                                   attribution text,
                                                   created_at timestamptz NOT NULL DEFAULT now(),

                                                   CONSTRAINT image_assets_payload_chk
                                                       CHECK (data IS NOT NULL OR storage_key IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS image_assets_created_at_idx
    ON public.image_assets USING btree (created_at DESC);

-- ------------------------------------------------------------
-- TTS_ASSETS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tts_assets (
                                                 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                                                 sha256 text NOT NULL UNIQUE,
                                                 storage_key text,
                                                 content_type text NOT NULL DEFAULT 'audio/mpeg',

                                                 data bytea,
                                                 bytes integer NOT NULL,
                                                 provider text NOT NULL,
                                                 text text NOT NULL,
                                                 text_type text NOT NULL DEFAULT 'text',
                                                 voice_id text NOT NULL DEFAULT 'Matthew',
                                                 engine text NOT NULL DEFAULT 'standard',
                                                 language_code text,
                                                 created_at timestamptz NOT NULL DEFAULT now(),

                                                 CONSTRAINT tts_assets_payload_chk
                                                     CHECK (data IS NOT NULL OR storage_key IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS tts_assets_created_at_idx
    ON public.tts_assets USING btree (created_at DESC);

-- ------------------------------------------------------------
-- Helper: username availability
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_username_taken(candidate text)
    RETURNS boolean
    LANGUAGE sql
    STABLE
AS $$
SELECT exists (
    SELECT 1
    FROM public.profiles
    WHERE username = lower(trim(candidate))
);
$$;

COMMIT;
