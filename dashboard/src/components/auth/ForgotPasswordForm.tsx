import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { getBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export function ForgotPasswordForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t('auth.register.checkEmailTitle')}</CardTitle>
          <CardDescription>{t('auth.forgot.sentDesc')} <strong>{email}</strong></CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link to="/login" className="text-sm text-primary hover:underline">{t('auth.register.backToLogin')}</Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t('auth.forgot.title')}</CardTitle>
        <CardDescription>{t('auth.forgot.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleReset} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.login.email')}</Label>
            <Input id="email" type="email" placeholder={t('auth.login.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('auth.forgot.sending') : t('auth.forgot.submit')}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <Link to="/login" className="text-sm text-muted-foreground hover:text-primary">{t('auth.register.backToLogin')}</Link>
      </CardFooter>
    </Card>
  );
}
