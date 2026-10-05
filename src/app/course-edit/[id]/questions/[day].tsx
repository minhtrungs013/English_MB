import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Progress, TenseNote } from '../../../../components/course';
import { Sheet } from '../../../../components/sheet';
import { BackBar, Badge, Button, Card, Chip, ChipRow, EmptyState, Field, Icon, IconButton, Input, SectionTitle, T } from '../../../../components/ui';
import {
  api, ApiError, TENSE_LABEL, TENSES,
  type BankItem, type BankItemInput, type BankKind, type BankStatus, type CourseDetail, type Quota, type Tense
} from '../../../../lib/api';
import { errMsg, useStore, useTheme } from '../../../../state/store';

const KIND_LABEL: Record<BankKind, string> = { tense: 'Typed', tenseChoice: 'Multiple choice', recap: 'Recap story' };
const SOURCE_LABEL: Record<BankItem['source'], string> = { ai: 'AI', template: 'Template', manual: 'Written by you' };
const GROUPS: { status: BankStatus; title: string }[] = [
  { status: 'pending', title: 'Waiting for review' },
  { status: 'approved', title: 'Approved' },
  { status: 'rejected', title: 'Rejected' }
];

/** What the edit sheet is doing. */
type FormMode = { kind: 'add' } | { kind: 'recap' } | { kind: 'edit'; item: BankItem };
interface FormState {
  kind: BankKind; word: string; tense: Tense | ''; prompt: string; answer: string;
  /** Multiple choice: the 4 choices and which one is right. */
  choices: string[]; right: number;
  /** Typed: other accepted answers, comma-separated. */
  accept: string; explain: string;
}
const blankForm = (kind: BankKind): FormState => ({ kind, word: '', tense: '', prompt: '', answer: '', choices: ['', '', '', ''], right: 0, accept: '', explain: '' });
const formFrom = (q: BankItem): FormState => {
  const choices = [...q.choices, '', '', '', ''].slice(0, 4);
  const right = Math.max(0, choices.findIndex((c) => c === q.answer));
  return { kind: q.kind, word: q.word, tense: q.tense, prompt: q.prompt, answer: q.answer, choices, right, accept: q.accept.join(', '), explain: q.explain };
};
const blanks = (s: string) => s.split('___').length - 1;

/** One question in the bank, with its review actions. The card itself isn't tappable. */
function BankCard({ q, busy, onStatus, onEdit, onDelete }: {
  q: BankItem; busy: boolean; onStatus: (s: BankStatus) => void; onEdit: () => void; onDelete: () => void;
}) {
  const t = useTheme();
  const recap = q.kind === 'recap';
  const what = recap ? 'recap story' : 'question' + (q.word ? ' for ' + q.word : '');
  return (
    <View style={{ backgroundColor: t.surface, borderColor: q.status === 'pending' ? t.warning : t.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 8, opacity: q.status === 'rejected' ? 0.75 : 1 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Badge label={KIND_LABEL[q.kind] ?? q.kind} bg={t.primarySoft} fg={t.primaryInk} />
        {q.word ? <Badge label={q.word} bg={t.surface2} fg={t.text} /> : null}
        <Badge label={SOURCE_LABEL[q.source] ?? q.source} bg={t.surface2} fg={t.muted} />
      </View>
      <T weight={recap ? 'regular' : 'bold'} size={recap ? 14.5 : 15.5}>{q.prompt}</T>
      {q.kind === 'tenseChoice' ? (
        <View style={{ gap: 4 }}>
          {q.choices.map((c, k) => {
            const ok = c === q.answer;
            return (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: ok ? t.successSoft : t.surface2 }}>
                <T size={13} weight="extrabold" style={{ color: ok ? t.success : t.muted }}>{'ABCD'.charAt(k)}</T>
                <T size={13.5} weight={ok ? 'bold' : 'regular'} style={{ flex: 1, color: ok ? t.success : t.text }}>{c}</T>
                {ok ? <Icon name="check" size={16} color={t.success} /> : null}
              </View>
            );
          })}
        </View>
      ) : q.kind === 'tense' ? (
        <View style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: t.successSoft }}>
          <T size={13.5} weight="semibold" tone="success">Answer: {q.answer}{q.accept.length ? '  ·  also: ' + q.accept.join(', ') : ''}</T>
        </View>
      ) : null}
      {recap
        ? (q.explain ? <View style={{ borderRadius: 10, padding: 10, backgroundColor: t.surface2 }}><T size={13.5} tone="muted">{q.explain}</T></View> : null)
        : <TenseNote label={q.tenseLabel} explain={q.explain} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 2 }}>
        {q.status !== 'approved'
          ? <Button title="Approve" icon="check" size="sm" disabled={busy} onPress={() => onStatus('approved')} style={{ minHeight: 44 }} accessibilityLabel={'Approve ' + what} />
          : null}
        {q.status !== 'rejected'
          ? <Button title="Reject" icon="x" size="sm" variant="secondary" disabled={busy} onPress={() => onStatus('rejected')} style={{ minHeight: 44 }} accessibilityLabel={'Reject ' + what} />
          : null}
        <Button title="Edit" icon="edit" size="sm" variant="secondary" disabled={busy} onPress={onEdit} style={{ minHeight: 44 }} accessibilityLabel={'Edit ' + what} />
        <View style={{ flex: 1 }} />
        {busy ? <ActivityIndicator color={t.primary} accessibilityLabel="Saving" /> : <IconButton name="trash" tone="danger" label={'Delete ' + what} onPress={onDelete} />}
      </View>
    </View>
  );
}

export default function CourseQuestions() {
  const { id, day: dayParam } = useLocalSearchParams<{ id: string; day: string }>();
  const day = Number(dayParam);
  const { actions } = useStore();
  const t = useTheme();
  const { height } = useWindowDimensions();
  const [c, setC] = useState<CourseDetail | null>(null);
  const [items, setItems] = useState<BankItem[] | null>(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Generate with AI
  const [tenses, setTenses] = useState<Tense[]>([...TENSES]);
  const [perWord, setPerWord] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [genErr, setGenErr] = useState('');
  const [quota, setQuota] = useState<Quota | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Edit sheet
  const [mode, setMode] = useState<FormMode | null>(null);
  const [form, setForm] = useState<FormState>(blankForm('tense'));
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const res = await api.courseQuestions(id, day);
    setItems(res);
  }, [id, day]);

  useEffect(() => {
    let live = true;
    Promise.all([api.course(id), api.courseQuestions(id, day)])
      .then(([cd, qs]) => { if (live) { setC(cd); setItems(qs); } })
      .catch((e) => { if (live) setErr(errMsg(e)); });
    return () => { live = false; };
  }, [id, day]);
  useEffect(() => () => clearInterval(timer.current), []);

  const title = 'Day ' + (dayParam ?? '') + ' questions';
  if (!c || !items) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={title} />
        {err ? <EmptyState icon="alert" tone="red" title="Couldn’t open the questions" text={err} /> : <ActivityIndicator color={t.primary} style={{ marginTop: 40 }} />}
      </View>
    );
  }
  if (!c.isOwner) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BackBar title={title} />
        <EmptyState icon="lock" tone="red" title="Only the owner can edit" text="This course belongs to someone else." />
      </View>
    );
  }

  const words = c.days.find((d) => d.day === day)?.words ?? [];
  const pending = items.filter((q) => q.status === 'pending');
  const recap = items.find((q) => q.kind === 'recap' && q.status === 'approved');
  const aiLeft = quota ? Math.max(0, quota.limit - quota.used) : null;

  /* ---------- actions ---------- */
  const run = async (qid: string | null, p: Promise<unknown>, msg: string) => {
    if (qid) setBusyId(qid); else setBulkBusy(true);
    try {
      await p;
      await reload();
      actions.showToast(msg);
    } catch (e) {
      actions.showToast(errMsg(e), 'bad');
    } finally {
      if (qid) setBusyId(null); else setBulkBusy(false);
    }
  };
  const setStatus = (q: BankItem, s: BankStatus) =>
    run(q.id, api.updateQuestion(c.id, q.id, { status: s }), s === 'approved' ? 'Approved.' : s === 'rejected' ? 'Rejected.' : 'Moved back to review.');
  const approveAll = () => run(null, api.setQuestionsStatus(c.id, pending.map((q) => q.id), 'approved'), 'Approved ' + pending.length + (pending.length === 1 ? ' item.' : ' items.'));
  const remove = (q: BankItem) => Alert.alert(q.kind === 'recap' ? 'Delete this recap story?' : 'Delete this question?', 'This can’t be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void run(q.id, api.deleteQuestion(c.id, q.id), 'Deleted.') }
  ]);

  const toggleTense = (x: Tense) => setTenses((prev) => {
    if (!prev.includes(x)) return TENSES.filter((y) => y === x || prev.includes(y));
    if (prev.length === 1) { actions.showToast('Keep at least one tense.', 'bad'); return prev; }
    return prev.filter((y) => y !== x);
  });
  const generate = async () => {
    setGenerating(true); setGenErr(''); setElapsed(0);
    const started = Date.now();
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    try {
      const res = await api.generateQuestions(c.id, day, { tenses: tenses.length === TENSES.length ? undefined : tenses, perWord });
      setQuota(res.quota);
      await reload();
      const n = res.added + (res.added === 1 ? ' item' : ' items');
      actions.showToast(res.source === 'ai'
        ? 'Added ' + n + ' with AI · ' + Math.max(0, res.quota.limit - res.quota.used) + ' AI uses left today.'
        : 'AI is unavailable, so ' + n + ' came from built-in templates.');
    } catch (e) {
      const qb = e instanceof ApiError ? (e.body?.quota as Quota | undefined) : undefined;
      if (qb) setQuota(qb);
      else if (e instanceof ApiError && e.status === 429 && quota) setQuota({ ...quota, used: quota.limit });
      setGenErr(errMsg(e));
      actions.showToast(errMsg(e), 'bad');
    } finally {
      clearInterval(timer.current);
      setGenerating(false);
    }
  };

  /* ---------- edit sheet ---------- */
  const openForm = (m: FormMode) => {
    setMode(m); setFormErr('');
    setForm(m.kind === 'edit' ? formFrom(m.item) : m.kind === 'recap' ? blankForm('recap') : { ...blankForm('tense'), word: words[0]?.word ?? '' });
  };
  const set = (p: Partial<FormState>) => { setForm((f) => ({ ...f, ...p })); setFormErr(''); };
  const save = async () => {
    if (!mode) return;
    const f = form;
    if (!f.prompt.trim()) { setFormErr(f.kind === 'recap' ? 'Please write the story.' : 'Please write the sentence.'); return; }
    if (f.kind !== 'recap' && blanks(f.prompt) !== 1) { setFormErr('The sentence needs exactly one "___" where the verb goes.'); return; }
    const choices = f.choices.map((x) => x.trim());
    let body: BankItemInput;
    if (f.kind === 'recap') {
      body = { kind: 'recap', prompt: f.prompt.trim(), explain: f.explain.trim() };
    } else if (f.kind === 'tenseChoice') {
      if (choices.some((x) => !x)) { setFormErr('Fill in all 4 choices.'); return; }
      body = { kind: f.kind, word: f.word.trim(), tense: f.tense, prompt: f.prompt.trim(), choices, answer: choices[f.right], explain: f.explain.trim() };
    } else {
      if (!f.answer.trim()) { setFormErr('Please enter the correct answer.'); return; }
      const accept = f.accept.split(',').map((x) => x.trim()).filter(Boolean);
      body = { kind: f.kind, word: f.word.trim(), tense: f.tense, prompt: f.prompt.trim(), answer: f.answer.trim(), accept, explain: f.explain.trim() };
    }
    setSaving(true);
    try {
      if (mode.kind === 'edit') {
        const { kind: _kind, ...patch } = body;
        await api.updateQuestion(c.id, mode.item.id, patch);
      } else {
        await api.createQuestion(c.id, day, body);
      }
      await reload();
      setMode(null);
      actions.showToast(mode.kind === 'edit' ? 'Saved.' : body.kind === 'recap' ? 'Recap story saved and approved.' : 'Question added and approved.');
    } catch (e) {
      // Show the server's validation message in the form.
      setFormErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const sheetTitle = !mode ? '' : mode.kind === 'edit' ? (form.kind === 'recap' ? 'Edit recap story' : 'Edit question') : mode.kind === 'recap' ? 'Write recap story' : 'Add question';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <BackBar title={c.title} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12, paddingBottom: 32 }}>
        <T size={26} weight="extrabold" style={{ letterSpacing: -0.5 }}>{title}</T>
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: t.infoSoft }}>
          <Icon name="alert" size={18} color={t.info} />
          <T size={13.5} style={{ flex: 1, color: t.info }}>
            Homework uses the approved questions. It’s made when the first learner opens the day. Changes apply to homework nobody has handed in yet.
          </T>
        </View>

        {/* Generate with AI */}
        <Card style={{ gap: 12 }}>
          <T size={16.5} weight="extrabold">Generate with AI</T>
          {!words.length ? <T tone="muted">Add words to day {day} first.</T> : (
            <>
              <T size={13.5} tone="muted">Writes tense questions for {words.map((w) => w.word).join(', ')}{day > 1 ? ', plus a recap story of earlier words' : ''}. They wait for your review.</T>
              <Field label="Tenses">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {TENSES.map((x) => <Chip key={x} soft label={TENSE_LABEL[x]} on={tenses.includes(x)} onPress={() => toggleTense(x)} />)}
                </View>
              </Field>
              <Field label="Questions per word">
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[1, 2, 3].map((n) => <Chip key={n} label={String(n)} on={perWord === n} onPress={() => setPerWord(n)} />)}
                </View>
              </Field>
              {generating ? (
                <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
                  <Progress pct={Math.min(95, (elapsed / 40) * 100)} />
                  <T size={13} tone="muted">Writing questions… {elapsed}s · this can take up to 40 seconds.</T>
                </View>
              ) : null}
              {genErr && !generating ? <T size={13} weight="semibold" tone="danger">{genErr}</T> : null}
              <Button title={generating ? 'Generating…' : 'Generate with AI'} icon="sparkle" loading={generating} disabled={aiLeft === 0} onPress={generate} />
              {aiLeft !== null ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Icon name="sparkle" size={14} color={t.primary} />
                  <T size={12.5} tone="muted" style={{ flex: 1 }}>{aiLeft > 0 ? aiLeft + ' AI ' + (aiLeft === 1 ? 'use' : 'uses') + ' left today.' : 'No AI uses left today — try again tomorrow.'}</T>
                </View>
              ) : null}
            </>
          )}
        </Card>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Add question" icon="plus" variant="secondary" onPress={() => openForm({ kind: 'add' })} style={{ flex: 1 }} />
          {day > 1
            ? <Button title={recap ? 'Edit recap' : 'Write recap'} icon="pen" variant="secondary" style={{ flex: 1 }}
                onPress={() => openForm(recap ? { kind: 'edit', item: recap } : { kind: 'recap' })} />
            : null}
        </View>
        {day === 1 ? <T size={13} tone="muted">Day 1 has no warm-up, so it has no recap story.</T> : null}

        {!items.length ? <EmptyState icon="listcheck" title="No questions yet" text="Generate some with AI, or write your own." /> : null}

        {GROUPS.map(({ status, title: groupTitle }) => {
          const list = items.filter((q) => q.status === status);
          if (!list.length) return null;
          return (
            <View key={status} style={{ gap: 10, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                <SectionTitle style={{ flex: 1 }}>{groupTitle} · {list.length}</SectionTitle>
                {status === 'pending'
                  ? <Button title="Approve all" icon="check" size="sm" loading={bulkBusy} onPress={approveAll} style={{ minHeight: 44 }} accessibilityLabel={'Approve all ' + list.length + ' pending items'} />
                  : null}
              </View>
              {list.map((q) => (
                <BankCard key={q.id} q={q} busy={busyId === q.id || bulkBusy} onStatus={(s) => void setStatus(q, s)}
                  onEdit={() => openForm({ kind: 'edit', item: q })} onDelete={() => remove(q)} />
              ))}
            </View>
          );
        })}
      </ScrollView>

      <Sheet visible={!!mode} onClose={() => setMode(null)} title={sheetTitle}>
        <ScrollView style={{ maxHeight: height * 0.62 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
          {form.kind === 'recap' ? (
            <>
              <T size={13.5} tone="muted">A short English story using words from earlier days. Learners read it in day {day}’s warm-up.{mode?.kind === 'recap' ? ' It replaces this day’s recap.' : ''}</T>
              <Field label="Story (English)">
                <Input value={form.prompt} onChangeText={(v) => set({ prompt: v })} multiline placeholder="Yesterday our team deployed the hotfix…" maxLength={1500} accessibilityLabel="Story in English" />
              </Field>
              <Field label="Vietnamese translation">
                <Input value={form.explain} onChangeText={(v) => set({ explain: v })} multiline placeholder="Hôm qua nhóm chúng tôi…" maxLength={1500} accessibilityLabel="Vietnamese translation" />
              </Field>
            </>
          ) : (
            <>
              {mode?.kind === 'add' ? (
                <Field label="Type">
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Chip soft label="Typed" on={form.kind === 'tense'} onPress={() => set({ kind: 'tense' })} />
                    <Chip soft label="Multiple choice" on={form.kind === 'tenseChoice'} onPress={() => set({ kind: 'tenseChoice' })} />
                  </View>
                </Field>
              ) : null}
              <Field label="Word">
                <Input value={form.word} onChangeText={(v) => set({ word: v })} placeholder="deploy" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Word" />
                {words.length ? (
                  <ChipRow>
                    {words.map((w) => <Chip key={w.word} soft label={w.word} on={form.word.toLowerCase() === w.word.toLowerCase()} onPress={() => set({ word: w.word })} />)}
                  </ChipRow>
                ) : null}
              </Field>
              <Field label="Sentence" hint='Use one "___" for the verb, and put the base verb in brackets.'>
                <Input value={form.prompt} onChangeText={(v) => set({ prompt: v })} multiline placeholder="Yesterday we ___ (deploy) the hotfix." maxLength={300} accessibilityLabel="Sentence" />
              </Field>
              {form.kind === 'tenseChoice' ? (
                <Field label="Choices" hint="Tap the circle next to the correct one.">
                  <View style={{ gap: 8 }} accessibilityRole="radiogroup">
                    {form.choices.map((ch, k) => {
                      const on = form.right === k;
                      return (
                        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Pressable onPress={() => set({ right: k })} accessibilityRole="radio" accessibilityState={{ checked: on }}
                            accessibilityLabel={'Choice ' + 'ABCD'.charAt(k) + ' is correct'}
                            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                            <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? t.success : t.border, backgroundColor: on ? t.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                              {on ? <Icon name="check" size={14} color="#fff" strokeWidth={3} /> : null}
                            </View>
                          </Pressable>
                          <View style={{ flex: 1 }}>
                            <Input value={ch} onChangeText={(v) => set({ choices: form.choices.map((x, j) => (j === k ? v : x)) })} placeholder={'Choice ' + 'ABCD'.charAt(k)}
                              autoCapitalize="none" autoCorrect={false} maxLength={80} accessibilityLabel={'Choice ' + 'ABCD'.charAt(k)} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </Field>
              ) : (
                <>
                  <Field label="Correct answer">
                    <Input value={form.answer} onChangeText={(v) => set({ answer: v })} placeholder="deployed" autoCapitalize="none" autoCorrect={false} maxLength={80} accessibilityLabel="Correct answer" />
                  </Field>
                  <Field label="Also accept (optional)" hint="Other correct answers, separated by commas.">
                    <Input value={form.accept} onChangeText={(v) => set({ accept: v })} placeholder="have deployed" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Also accept" />
                  </Field>
                </>
              )}
              <Field label="Tense">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {TENSES.map((x) => <Chip key={x} soft label={TENSE_LABEL[x]} on={form.tense === x} onPress={() => set({ tense: form.tense === x ? '' : x })} />)}
                </View>
              </Field>
              <Field label="Explanation (optional)" hint="Why this tense — shown to learners after they answer.">
                <Input value={form.explain} onChangeText={(v) => set({ explain: v })} multiline placeholder="Dùng quá khứ đơn vì có “yesterday”." maxLength={1500} accessibilityLabel="Explanation" />
              </Field>
            </>
          )}
          {formErr ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, backgroundColor: t.dangerSoft }} accessibilityLiveRegion="polite">
              <Icon name="alert" size={16} color={t.danger} />
              <T size={13.5} weight="semibold" tone="danger" style={{ flex: 1 }}>{formErr}</T>
            </View>
          ) : null}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title="Cancel" variant="secondary" onPress={() => setMode(null)} style={{ flex: 1 }} />
          <Button title={mode?.kind === 'edit' ? 'Save' : form.kind === 'recap' ? 'Save recap' : 'Add question'} icon="check" loading={saving} onPress={save} style={{ flex: 1.4 }} />
        </View>
      </Sheet>
    </View>
  );
}
