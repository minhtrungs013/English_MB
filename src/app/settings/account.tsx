import { Alert } from 'react-native';
import { Button, Card, Field, Input, SectionTitle, T } from '../../components/ui';
import { SettingsScreen } from '../../components/settings/parts';
import { api } from '../../lib/api';
import { errMsg, useStore, useTheme } from '../../state/store';

export default function AccountSettings() {
  const { data, actions } = useStore();
  const t = useTheme();
  const st = data.settings;
  const deleteAccount = () => Alert.alert('Delete your account?', 'This permanently deletes your account and all of your vocabulary. This action cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete account', style: 'destructive', onPress: async () => {
      try { await api.deleteAccount(); await actions.logout(); actions.showToast('Your account has been deleted.'); }
      catch (e) { actions.showToast(errMsg(e), 'bad'); }
    } }
  ]);
  return (
    <SettingsScreen title="Account">
      <Card style={{ gap: 14 }}>
        <SectionTitle>Profile</SectionTitle>
        <Field label="Name"><Input value={st.name} onChangeText={(v) => actions.setSettings({ name: v })} /></Field>
        <Field label="Email" hint="Used to log in; can’t be changed."><Input value={st.email} editable={false} style={{ color: t.muted }} /></Field>
      </Card>
      <Card style={{ gap: 10 }}>
        <SectionTitle>Sign-in</SectionTitle>
        <T size={13.5} tone="muted">Signed in as {st.email}. Change your password on the web app.</T>
        <Button title="Log out" icon="logout" variant="secondary" onPress={() => actions.logout()} />
      </Card>
      <Card style={{ gap: 10 }}>
        <SectionTitle>Danger zone</SectionTitle>
        <T size={13.5} tone="muted">Deleting your account removes all of your vocabulary for good.</T>
        <Button title="Delete account" icon="trash" variant="dangerSoft" onPress={deleteAccount} />
      </Card>
    </SettingsScreen>
  );
}
