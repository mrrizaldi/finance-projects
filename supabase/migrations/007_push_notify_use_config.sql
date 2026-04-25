-- Replace push notify trigger function to read PUSH_WEBHOOK_SECRET
-- from Supabase Vault instead of embedding it in the function body.
-- Secret stored in vault under name 'push_webhook_secret'.
-- The secret value is intentionally NOT committed to the repository.

CREATE OR REPLACE FUNCTION notify_push_on_transaction_insert()
RETURNS TRIGGER AS $$
DECLARE
  webhook_secret text;
BEGIN
  SELECT decrypted_secret INTO webhook_secret
    FROM vault.decrypted_secrets
    WHERE name = 'push_webhook_secret'
    LIMIT 1;

  IF webhook_secret IS NULL OR webhook_secret = '' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://finance-dashboard.mrrizaldi.my.id/api/push/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'transactions',
      'schema', 'public',
      'record', jsonb_build_object(
        'id', NEW.id,
        'user_id', NEW.user_id,
        'type', NEW.type,
        'amount', NEW.amount
      ),
      'old_record', null
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
