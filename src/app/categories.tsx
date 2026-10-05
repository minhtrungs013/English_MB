import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Sheet } from '../components/sheet';
import { BackBar, Button, Card, EmptyState, Field, Icon, IconButton, Input, T } from '../components/ui';
import { CAT_ICONS, type Category } from '../lib/data';
import { errMsg, useStore, useTheme } from '../state/store';

const TINTS = ['indigo', 'blue', 'green', 'orange', 'amber', 'red'] as const;

/** Create / edit form shown in a bottom sheet. */
function CategorySheet({ editing, onClose }: { editing: Category | null | 'new'; onClose: () => void }) {
  const { actions } = useStore();
  const t = useTheme();
  const cat = editing && editing !== 'new' ? editing : null;
  const [name, setName] = useState(cat?.name ?? '');
  const [icon, setIcon] = useState<Category['icon']>(cat?.icon ?? 'briefcase');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) { setErr('Please enter a category name.'); return; }
    setBusy(true);
    try {
      await actions.saveCategory(name.trim(), icon, cat?.id);
      actions.showToast(cat ? 'Category updated.' : 'Category “' + name.trim() + '” created.');
      onClose();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  };
  return (
    <Sheet visible={!!editing} onClose={onClose} title={cat ? 'Edit Category' : 'Create Category'}>
      <Field label="Name" error={err}>
        <Input value={name} onChangeText={(v) => { setName(v); setErr(''); }} placeholder="Technology" autoFocus invalid={!!err} returnKeyType="done" onSubmitEditing={save} />
      </Field>
      <Field label="Icon">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CAT_ICONS.map(([ic, label]) => {
            const on = icon === ic;
            return (
              <Pressable key={ic} onPress={() => setIcon(ic)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label}
                style={{ width: 52, height: 48, borderRadius: 10, borderWidth: 1, borderColor: on ? t.primary : t.border, backgroundColor: on ? t.primarySoft : t.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={ic} color={on ? t.primaryInk : t.muted} />
              </Pressable>
            );
          })}
        </View>
      </Field>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button title={cat ? 'Save' : 'Create'} loading={busy} onPress={save} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

export default function Categories() {
  const { data, actions } = useStore();
  const t = useTheme();
  const [editing, setEditing] = useState<Category | null | 'new'>(null);
  const tint = (i: number) => {
    const m = { indigo: [t.primarySoft, t.primaryInk], blue: [t.infoSoft, t.info], green: [t.successSoft, t.success], orange: [t.orangeSoft, t.orange], amber: [t.warningSoft, t.warning], red: [t.dangerSoft, t.danger] };
    return m[TINTS[i % TINTS.length]];
  };
  const remove = (c: Category) => Alert.alert('Delete “' + c.name + '”?', 'The words in this category won’t be deleted — they’ll just become uncategorized.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void actions.deleteCategory(c.id); } }
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title="Categories" right={<IconButton name="plus" label="New category" color={t.primaryInk} onPress={() => setEditing('new')} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 32 }}>
        <T tone="muted">Group words by the part of life you use them in.</T>
        {data.cats.length === 0 ? (
          <EmptyState icon="folder" title="No categories yet" text="Create a category like Work or Travel to keep related words together.">
            <Button title="New Category" icon="plus" onPress={() => setEditing('new')} />
          </EmptyState>
        ) : data.cats.map((c, i) => {
          const ws = data.words.filter((w) => w.cat === c.id);
          const pct = ws.length ? Math.round((ws.filter((w) => w.status === 'mastered').length / ws.length) * 100) : 0;
          const [bg, fg] = tint(i);
          return (
            <Card key={c.id} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={c.icon} size={24} color={fg} /></View>
                <View style={{ flex: 1 }}>
                  <T size={17} weight="extrabold">{c.name}</T>
                  <T size={13.5} tone="muted">{ws.length} words · {pct}% mastered</T>
                </View>
                <IconButton name="edit" label={'Edit ' + c.name} onPress={() => setEditing(c)} />
                <IconButton name="trash" label={'Delete ' + c.name} tone="danger" onPress={() => remove(c)} />
              </View>
              <View style={{ height: 6, borderRadius: 99, backgroundColor: t.surface3, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%` as const, height: '100%', backgroundColor: t.success }} />
              </View>
              <Button title="Open" icon="right" variant="secondary" size="sm" onPress={() => router.push({ pathname: '/words', params: { cat: c.id } })} />
            </Card>
          );
        })}
      </ScrollView>
      {editing ? <CategorySheet key={editing === 'new' ? 'new' : editing.id} editing={editing} onClose={() => setEditing(null)} /> : null}
    </View>
  );
}
