import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { getBrowserClient } from '@/lib/supabase';
import { setLocale, storedLocale, type Locale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export function RegisterForm() {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [locale, setLocaleState] = useState<Locale>(storedLocale());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Ganti bahasa langsung switch tampilan form + disimpan buat metadata signup.
  function handleLocaleChange(v: string | null) {
    const next = (v === 'en' ? 'en' : 'id') as Locale;
    setLocaleState(next);
    setLocale(next);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('auth.register.passwordMismatch'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.register.passwordTooShort'));
      return;
    }

    setLoading(true);
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName, locale } },
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
          <CardDescription>{t('auth.register.checkEmailDesc', { email })}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link to="/login" className="text-sm text-primary hover:underline">
            {t('auth.register.backToLogin')}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t('auth.register.title')}</CardTitle>
        <CardDescription>{t('auth.register.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="locale">{t('auth.register.language')}</Label>
            <Select value={locale} onValueChange={handleLocaleChange}>
              <SelectTrigger id="locale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id">{t('languages.id')}</SelectItem>
                <SelectItem value="en">{t('languages.en')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">{t('auth.register.name')}</Label>
            <Input id="name" type="text" placeholder={t('auth.register.namePlaceholder')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.login.email')}</Label>
            <Input id="email" type="email" placeholder={t('auth.login.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.login.password')}</Label>
            <Input id="password" type="password" placeholder={t('auth.register.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('auth.register.confirmPassword')}</Label>
            <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('common.processing') : t('auth.register.submit')}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" className="text-primary hover:underline">{t('auth.register.loginLink')}</Link>
        </p>
      </CardFooter>
    </Card>
  );
}
