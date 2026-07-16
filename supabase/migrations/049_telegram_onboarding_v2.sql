-- 049: onboarding v2 — pending/approved link status + connect tokens.
ALTER TABLE public.telegram_links
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending','approved')),
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE TABLE IF NOT EXISTS public.telegram_connect_tokens (
  token       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_connect_tokens_user ON public.telegram_connect_tokens(user_id);
ALTER TABLE public.telegram_connect_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_token ON public.telegram_connect_tokens;
CREATE POLICY own_token ON public.telegram_connect_tokens FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
