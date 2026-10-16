import { redirect } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import { isRecovery } from '@/lib/recovery';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export async function clientLoader() {
  const supabase = getBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !isRecovery()) return redirect('/');
  return null;
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
