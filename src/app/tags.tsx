import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Sheet } from '../components/sheet';
import { BackBar, Button, Card, EmptyState, Field, Icon, IconButton, Input, T } from '../components/ui';
import { useStore, useTheme } from '../state/store';

export default function Tags() {
  const { data, actions } = useStore();
  const t = useTheme();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = data.tags.map((g) => ({ name: g, count: data.words.filter((w) => w.tags.includes(g)).length })).sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map((r) => r.count));

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const created = await actions.createTag(name.trim());
    setBusy(false);
    if (created) { actions.showToast('Tag #' + created + ' created.'); setName(''); setCreating(false); }
  };
  const remove = (g: string) => Alert.alert('Delete tag #' + g + '?', 'The tag will be removed from every word that uses it.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void actions.deleteTag(g); } }
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Tags" right={<IconButton name="plus" label="Create tag" color={t.primaryInk} onPress={() => setCreating(true)} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 32 }}>
        <T tone="muted">Tap a tag to see its words.</T>
        {rows.length === 0 ? (
          <EmptyState icon="tag" title="No tags yet" text="Tags like #meeting or #interview help you find words fast.">
            <Button title="Create Tag" icon="plus" onPress={() => setCreating(true)} />
          </EmptyState>
        ) : (
          <Card pad={false} style={{ paddingVertical: 4 }}>
            {rows.map((r, i) => (
              <View key={r.name} style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: t.border, paddingRight: 6 }}>
                <Pressable onPress={() => router.push({ pathname: '/words', params: { tag: r.name } })} accessibilityRole="button" accessibilityLabel={'#' + r.name + ', ' + r.count + ' words'}
                  style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 14, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="hash" size={16} color={t.primaryInk} /></View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <T weight="extrabold">#{r.name}</T>
                    <View style={{ height: 6, borderRadius: 99, backgroundColor: t.surface3, overflow: 'hidden' }}>
                      <View style={{ width: `${Math.round((r.count / max) * 100)}%` as const, height: '100%', backgroundColor: t.primary }} />
                    </View>
                  </View>
                  <T size={13.5} weight="semibold" tone="muted">{r.count} words</T>
                </Pressable>
                <IconButton name="trash" label={'Delete tag ' + r.name} tone="danger" onPress={() => remove(r.name)} />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
      <Sheet visible={creating} onClose={() => setCreating(false)} title="Create Tag">
        <Field label="Tag name" hint="Lowercase letters, numbers and dashes.">
          <Input value={name} onChangeText={setName} placeholder="frontend" autoCapitalize="none" autoCorrect={false} autoFocus returnKeyType="done" onSubmitEditing={create} />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Cancel" variant="secondary" onPress={() => setCreating(false)} style={{ flex: 1 }} />
          <Button title="Create" loading={busy} disabled={!name.trim()} onPress={create} style={{ flex: 1 }} />
        </View>
      </Sheet>
    </View>
  );
}
