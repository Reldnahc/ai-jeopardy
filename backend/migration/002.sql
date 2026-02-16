-- 002_migrate_split_profile_tables.sql
BEGIN;

-- 1) Ensure helper exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- 2) Create new tables (safe if re-run)
CREATE TABLE IF NOT EXISTS public.profile_customization (
                                                            profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

                                                            bio text,
                                                            color text NOT NULL DEFAULT '#3b82f6',
                                                            text_color text NOT NULL DEFAULT '#ffffff',
                                                            font text,
                                                            icon text,

                                                            created_at timestamptz NOT NULL DEFAULT now(),
                                                            updated_at timestamptz NOT NULL DEFAULT now()
);

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

-- 3) updated_at triggers on new tables
DROP TRIGGER IF EXISTS trg_profile_customization_updated_at ON public.profile_customization;
CREATE TRIGGER trg_profile_customization_updated_at
    BEFORE UPDATE ON public.profile_customization
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profile_statistics_updated_at ON public.profile_statistics;
CREATE TRIGGER trg_profile_statistics_updated_at
    BEFORE UPDATE ON public.profile_statistics
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Backfill customization from existing profiles columns
--    (font/icon didn’t exist before, so they stay NULL unless you set defaults)
INSERT INTO public.profile_customization (profile_id, bio, color, text_color, created_at, updated_at)
SELECT p.id, p.bio, p.color, p.text_color, p.created_at, p.updated_at
FROM public.profiles p
ON CONFLICT (profile_id) DO UPDATE
    SET bio = EXCLUDED.bio,
        color = EXCLUDED.color,
        text_color = EXCLUDED.text_color,
        updated_at = now();

-- 5) Backfill statistics from existing profiles columns
INSERT INTO public.profile_statistics (
    profile_id,
    boards_generated,
    games_finished,
    money_won,
    games_won,
    created_at,
    updated_at
)
SELECT
    p.id,
    p.boards_generated,
    p.games_finished,
    p.money_won,
    p.games_won,
    p.created_at,
    p.updated_at
FROM public.profiles p
ON CONFLICT (profile_id) DO UPDATE
    SET boards_generated = EXCLUDED.boards_generated,
        games_finished = EXCLUDED.games_finished,
        money_won = EXCLUDED.money_won,
        games_won = EXCLUDED.games_won,
        updated_at = now();

-- NOTE:
-- games_played + all the new counters remain at DEFAULT 0 for now.
-- If you want to derive games_played from existing data later, do it with an UPDATE here.

-- 6) Add auto-create trigger for future inserts into profiles
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

-- 7) Drop moved columns from profiles
-- (If any app code still reads these, deploy code changes before running this.)
ALTER TABLE public.profiles
    DROP COLUMN IF EXISTS bio,
    DROP COLUMN IF EXISTS color,
    DROP COLUMN IF EXISTS text_color,
    DROP COLUMN IF EXISTS boards_generated,
    DROP COLUMN IF EXISTS games_finished,
    DROP COLUMN IF EXISTS money_won,
    DROP COLUMN IF EXISTS games_won;

COMMIT;


BEGIN;

ALTER TABLE public.profile_customization
    ADD COLUMN IF NOT EXISTS name_color text;

ALTER TABLE public.profile_customization
    ADD COLUMN IF NOT EXISTS border text;

-- Backfill existing rows (in case columns were added nullable)
UPDATE public.profile_customization
SET name_color = COALESCE(name_color, '#3b82f6');

UPDATE public.profile_customization
SET border = COALESCE(border, 'none');

-- Enforce NOT NULL + defaults going forward
ALTER TABLE public.profile_customization
    ALTER COLUMN name_color SET DEFAULT '#3b82f6',
    ALTER COLUMN name_color SET NOT NULL,
    ALTER COLUMN border SET DEFAULT 'none',
    ALTER COLUMN border SET NOT NULL;

COMMIT;
