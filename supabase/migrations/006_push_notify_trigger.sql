-- Webhook trigger: fire HTTP POST to push notify endpoint on every transaction INSERT
-- Uses pg_net extension (pre-installed in Supabase projects)
-- Note: PUSH_WEBHOOK_SECRET is embedded in function body — replace if rotating the secret

CREATE OR REPLACE FUNCTION notify_push_on_transaction_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://finance-dashboard.mrrizaldi.my.id/api/push/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', 'fcac955e3fff0bf8a3c1f52d14e89deaf56ac6445379ab527b086f3bd9ef7cba'
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

DROP TRIGGER IF EXISTS push_notify_on_insert ON transactions;
CREATE TRIGGER push_notify_on_insert
  AFTER INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION notify_push_on_transaction_insert();
