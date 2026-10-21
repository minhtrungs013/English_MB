import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Field, Icon, Input, T } from '../components/ui';
import { api } from '../lib/api';
import { errMsg, useStore, useTheme } from '../state/store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
const TITLES: Record<Mode, [string, string]> = {
  login: ['Welcome back', 'Log in to keep learning your words.'],
  register: ['Create your account', 'Start building your personal vocabulary collection.'],
  verify: ['Check your email', ''],
  forgot: ['Forgot your password?', 'Enter your email and we’ll send you a 6-digit code.'],
  reset: ['Set a new password', '']
};
const LABELS: Record<Mode, [string, string]> = {
  login: ['Log in', 'Logging in…'],
  register: ['Create account', 'Sending code…'],
  verify: ['Verify email', 'Checking…'],
  forgot: ['Send code', 'Sending…'],
  reset: ['Save new password', 'Saving…']
};

export default function Login() {
  const { actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const isReg = mode === 'register';
  const newPw = mode === 'register' || mode === 'reset';
  const codeSent = mode === 'verify' || mode === 'reset';
  const go = (m: Mode) => { setMode(m); setErr(''); setNote(''); setPassword(''); setConfirm(''); setCode(''); };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { setErr(errMsg(e)); }
    setBusy(false);
  };

  const submit = async () => {
    if (busy) return;
    const askPw = mode === 'login' || newPw;
    const v = isReg && !name.trim() ? 'Please enter your name.'
      : !EMAIL_RE.test(email.trim()) ? 'Please enter a valid email address.'
      : codeSent && !/^\d{6}$/.test(code.trim()) ? 'Please enter the 6-digit code from the email.'
      : askPw && !password ? 'Please enter your password.'
      : newPw && password.length < 8 ? 'Password must be at least 8 characters.'
      : newPw && password !== confirm ? 'Passwords don’t match.' : '';
    if (v) { setErr(v); return; }
    setErr(''); setNote('');
    const em = email.trim();
    await run(async () => {
      if (mode === 'login') await actions.login(em, password);
      else if (mode === 'register') { await actions.register(name.trim(), em, password); go('verify'); }
      else if (mode === 'verify') await actions.verifyRegister(em, code.trim());
      else if (mode === 'forgot') { await api.forgotPassword(em); go('reset'); }
      else await actions.resetPassword(em, code.trim(), password);
    });
  };

  const resend = () => run(async () => {
    setErr('');
    if (mode === 'verify') await api.registerResend(email.trim());
    else await api.forgotPassword(email.trim());
    setNote('We sent a new code.');
  });

  const link = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" hitSlop={8}>
      <T size={14} weight="bold" tone="primaryInk">{label}</T>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Card style={{ padding: 24, gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="book" size={19} color="#fff" strokeWidth={2.2} />
            </View>
            <T size={18} weight="extrabold">Wordbook</T>
          </View>
          <View>
            <T size={26} weight="extrabold" style={{ letterSpacing: -0.5 }}>{TITLES[mode][0]}</T>
            <T tone="muted" style={{ marginTop: 4 }}>{codeSent ? 'We sent a 6-digit code to ' + email.trim() + '. It works for 10 minutes; check your spam folder too.' : TITLES[mode][1]}</T>
          </View>
          {err ? (
            <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10, backgroundColor: t.dangerSoft }}>
              <Icon name="alert" size={16} color={t.danger} />
              <T size={14} weight="semibold" tone="danger" style={{ flex: 1 }}>{err}</T>
            </View>
          ) : note ? <T size={14} tone="muted">{note}</T> : null}
          {isReg && (
            <Field label="Name">
              <Input value={name} onChangeText={setName} placeholder="Trung" autoComplete="name" textContentType="name" />
            </Field>
          )}
          {!codeSent && (
            <Field label="Email">
              <Input value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
            </Field>
          )}
          {codeSent && (
            <Field label="Code">
              <Input value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} placeholder="123456" keyboardType="number-pad" maxLength={6} autoFocus
                autoComplete="one-time-code" textContentType="oneTimeCode" style={{ letterSpacing: 6, fontSize: 20, fontWeight: '700' }} />
            </Field>
          )}
          {(mode === 'login' || newPw) && <Field label={mode === 'reset' ? 'New password' : 'Password'}>
            <View>
              <Input value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none" placeholder={newPw ? 'At least 8 characters' : ''}
                autoComplete={newPw ? 'new-password' : 'current-password'} style={{ paddingRight: 50 }} />
              <Pressable onPress={() => setShow(!show)} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 2, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={show ? 'eyeOff' : 'eye'} size={18} color={t.muted} />
              </Pressable>
            </View>
          </Field>}
          {mode === 'login' && <View style={{ alignItems: 'flex-end', marginTop: -8 }}>{link('Forgot password?', () => go('forgot'))}</View>}
          {newPw && (
            <Field label="Confirm password">
              <Input value={confirm} onChangeText={setConfirm} secureTextEntry={!show} autoCapitalize="none" autoComplete="new-password" />
            </Field>
          )}
          <Button title={LABELS[mode][busy ? 1 : 0]} size="lg" loading={busy} onPress={submit} block />
          <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
            {codeSent ? (
              <>
                <T size={14} tone="muted">No email?</T>
                {link('Send a new code', resend)}
                <T size={14} tone="muted">·</T>
                {link('Change email', () => go(mode === 'verify' ? 'register' : 'forgot'))}
              </>
            ) : mode === 'forgot' ? link('Back to log in', () => go('login')) : (
              <>
                <T size={14} tone="muted">{isReg ? 'Already have an account?' : 'New to Wordbook?'}</T>
                {link(isReg ? 'Log in' : 'Create an account', () => go(isReg ? 'login' : 'register'))}
              </>
            )}
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
