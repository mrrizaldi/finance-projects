import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('routes/auth-layout.tsx', [
    route('login', 'routes/login.tsx'),
    route('register', 'routes/register.tsx'),
    route('forgot-password', 'routes/forgot-password.tsx'),
  ]),
  route('auth/callback', 'routes/auth-callback.tsx'),
  layout('routes/app-layout.tsx', [
    index('routes/home.tsx'),
    route('add', 'routes/add.tsx'),
    route('analytics', 'routes/analytics.tsx'),
    route('balances', 'routes/balances.tsx'),
    route('budget', 'routes/budget.tsx'),
    route('bulk', 'routes/bulk.tsx'),
    route('insights', 'routes/insights.tsx'),
    route('installments', 'routes/installments.tsx'),
    route('more', 'routes/more.tsx'),
    route('settings', 'routes/settings.tsx'),
    route('transactions', 'routes/transactions.tsx'),
  ]),
] satisfies RouteConfig;
