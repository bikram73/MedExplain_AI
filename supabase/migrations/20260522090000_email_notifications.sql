-- Queue transactional emails so cron-job.org can deliver them outside the user request path.

CREATE TABLE public.email_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('welcome', 'first_login')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, type)
);

ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own email notifications"
  ON public.email_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own email notifications"
  ON public.email_notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own email notifications"
  ON public.email_notifications
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_email_notifications_pending
  ON public.email_notifications (sent_at, created_at DESC);

CREATE OR REPLACE FUNCTION public.queue_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  display_name TEXT;
BEGIN
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.email_notifications (user_id, email, type, subject, body)
  VALUES (
    NEW.id,
    NEW.email,
    'welcome',
    'Welcome to MedExplain.AI',
    'Hi ' || display_name || E',\n\nYour MedExplain.AI account is ready. You can sign in with ' || NEW.email || E'.\n\nIf you did not create this account, you can ignore this email.'
  )
  ON CONFLICT (user_id, type) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_welcome_email
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.queue_welcome_email();

CREATE OR REPLACE FUNCTION public.queue_first_login_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  display_name TEXT;
BEGIN
  IF NEW.last_sign_in_at IS NULL OR OLD.last_sign_in_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.email_notifications (user_id, email, type, subject, body)
  VALUES (
    NEW.id,
    NEW.email,
    'first_login',
    'Thanks for logging in to MedExplain.AI',
    'Hi ' || display_name || E',\n\nThanks for signing in for the first time. Your account is active and ready to use.\n\nIf this was not you, please secure your account immediately.'
  )
  ON CONFLICT (user_id, type) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_first_login_email
AFTER UPDATE OF last_sign_in_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.queue_first_login_email();

REVOKE EXECUTE ON FUNCTION public.queue_welcome_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_first_login_email() FROM PUBLIC, anon, authenticated;