import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Field, Icon, Input, T } from '../components/ui';
import { errMsg, useStore, useTheme } from '../state/store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const { actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const isReg = mode === 'register';

  const submit = async () => {
    const v = isReg && !name.trim() ? 'Please enter your name.'
      : !EMAIL_RE.test(email.trim()) ? 'Please enter a valid email address.'
      : !password ? 'Please enter your password.'
      : isReg && password.length < 8 ? 'Password must be at least 8 characters.'
      : isReg && password !== confirm ? 'Passwords don’t match.' : '';
    if (v) { setErr(v); return; }
    setErr('');
    setBusy(true);
    try {
      if (isReg) await actions.register(name.trim(), email.trim(), password);
      else await actions.login(email.trim(), password);
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };

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
            <T size={26} weight="extrabold" style={{ letterSpacing: -0.5 }}>{isReg ? 'Create your account' : 'Welcome back'}</T>
            <T tone="muted" style={{ marginTop: 4 }}>{isReg ? 'Start building your personal vocabulary collection.' : 'Log in to keep learning your words.'}</T>
          </View>
          {err ? (
            <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10, backgroundColor: t.dangerSoft }}>
              <Icon name="alert" size={16} color={t.danger} />
              <T size={14} weight="semibold" tone="danger" style={{ flex: 1 }}>{err}</T>
            </View>
          ) : null}
          {isReg && (
            <Field label="Name">
              <Input value={name} onChangeText={setName} placeholder="Trung" autoComplete="name" textContentType="name" />
            </Field>
          )}
          <Field label="Email">
            <Input value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
          </Field>
          <Field label="Password">
            <View>
              <Input value={password} onChangeText={setPassword} secureTextEntry={!show} autoCapitalize="none" placeholder={isReg ? 'At least 8 characters' : ''}
                autoComplete={isReg ? 'new-password' : 'current-password'} style={{ paddingRight: 50 }} />
              <Pressable onPress={() => setShow(!show)} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'}
                style={{ position: 'absolute', right: 2, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={show ? 'eyeOff' : 'eye'} size={18} color={t.muted} />
              </Pressable>
            </View>
          </Field>
          {isReg && (
            <Field label="Confirm password">
              <Input value={confirm} onChangeText={setConfirm} secureTextEntry={!show} autoCapitalize="none" autoComplete="new-password" />
            </Field>
          )}
          <Button title={isReg ? (busy ? 'Creating account…' : 'Create account') : (busy ? 'Logging in…' : 'Log in')} size="lg" loading={busy} onPress={submit} block />
          <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
            <T size={14} tone="muted">{isReg ? 'Already have an account?' : 'New to Wordbook?'}</T>
            <Pressable onPress={() => { setMode(isReg ? 'login' : 'register'); setErr(''); setPassword(''); setConfirm(''); }} accessibilityRole="button" hitSlop={8}>
              <T size={14} weight="bold" tone="primaryInk">{isReg ? 'Log in' : 'Create an account'}</T>
            </Pressable>
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
