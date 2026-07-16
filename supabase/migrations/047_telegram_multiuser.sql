-- 047: Phase 2 multi-user — telegram chat linking + invite codes.
CREATE TABLE IF NOT EXISTS public.telegram_links (
  chat_id     bigint PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_links_user ON public.telegram_links(user_id);
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_link ON public.telegram_links;
CREATE POLICY own_link ON public.telegram_links FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.invite_codes (
  code        text PRIMARY KEY,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text,
  used_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at     timestamptz,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invite_codes_creator ON public.invite_codes(created_by);
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_invites ON public.invite_codes;
CREATE POLICY own_invites ON public.invite_codes FOR ALL
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
