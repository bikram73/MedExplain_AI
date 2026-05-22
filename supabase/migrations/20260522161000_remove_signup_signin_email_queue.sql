-- Remove custom signup/signin queued email pipeline.

DROP TRIGGER IF EXISTS on_auth_user_created_welcome_email ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_first_login_email ON auth.users;

DROP FUNCTION IF EXISTS public.queue_welcome_email();
DROP FUNCTION IF EXISTS public.queue_first_login_email();

DROP TABLE IF EXISTS public.email_notifications;