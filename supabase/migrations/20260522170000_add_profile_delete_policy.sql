-- Allow authenticated users to delete their own profile row so account-data cleanup works without admin access.

CREATE POLICY "Users delete own profile"
  ON public.profiles
  FOR DELETE
  USING (auth.uid() = id);