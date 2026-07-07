import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export { webpush };

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
};
