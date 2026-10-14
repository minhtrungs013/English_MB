import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Icon, IconButton, LevelBadge, PosBadge, T } from '../components/ui';
import { ApiError } from '../lib/api';
import { applyEvent, chatAsk, chatStatus, loadChat, saveChat, setWordDraft, type ChatCard, type ChatMsg, type ChatStatus } from '../lib/chat';
import { speak } from '../lib/speech';
import { useStore, useTheme } from '../state/store';

const SUGGESTIONS = ['Giải thích từ “device”', 'So sánh present perfect và past simple', 'Đặt câu với “follow up”'];
/** Lessons without drills (nothing to practise). */
const NO_PRACTICE = new Set(['aux-cheatsheet']);

/** **bold** inside a line. */
function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <T key={i} size={14.5} weight="extrabold">{p.slice(2, -2)}</T> : p))}</>;
}

/** Just enough markdown for the bot: paragraphs, "- " lists and bold. */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push(<T key={blocks.length} size={14.5}>{para.map((l, i) => <T key={i} size={14.5}>{i ? '\n' : ''}<Inline text={l} /></T>)}</T>);
    para = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const item = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (item) {
      flush();
      blocks.push(
        <View key={blocks.length} style={{ flexDirection: 'row', gap: 6, paddingLeft: 2 }}>
          <T size={14.5}>•</T>
          <T size={14.5} style={{ flex: 1 }}><Inline text={item[1]} /></T>
        </View>
      );
    } else if (!line.trim()) flush();
    else para.push(line);
  }
  flush();
  return <View style={{ gap: 6 }}>{blocks}</View>;
}

function WordCard({ card }: { card: ChatCard }) {
  const { data, actions } = useStore();
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  // The live state wins: a word saved after the answer came shows as saved.
  const mine = data.words.find((w) => w.word.toLowerCase() === card.word.toLowerCase());
  const status = mine ? 'mine' : card.status;
  return (
    <View style={{ borderWidth: 1, borderColor: t.border, borderLeftWidth: 3, borderLeftColor: t.primary, borderRadius: 12, padding: 12, gap: 6, backgroundColor: t.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
          <T size={17} weight="extrabold">{card.word}</T>
          {card.ipa ? <T size={13} tone="muted" ipa>{card.ipa}</T> : null}
        </View>
        <IconButton name="volume" label={'Nghe phát âm ' + card.word} size={40} onPress={() => speak(card.word)} />
      </View>
      {card.pos || card.level ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {card.pos ? <PosBadge pos={card.pos} /> : null}
          {card.level ? <LevelBadge level={card.level} /> : null}
        </View>
      ) : null}
      {card.vi ? <T weight="bold">{card.vi}</T> : null}
      {card.meaning ? <T size={13.5} tone="muted">{card.meaning}</T> : null}
      {card.ex ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <T size={13.5} style={{ flex: 1, fontStyle: 'italic' }}>“{card.ex}”</T>
          <IconButton name="volume" label="Nghe câu ví dụ" size={40} onPress={() => speak(card.ex)} />
        </View>
      ) : null}
      <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: 8, marginTop: 2, gap: 8 }}>
        {status === 'mine' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Icon name="checkc" size={16} color={t.success} />
              <T size={13} weight="semibold" tone="muted">Đã có trong sổ của bạn</T>
            </View>
            <Button title="Xem từ" variant="ghost" size="sm" onPress={() => { const id = mine?.id ?? card.id; if (id) router.push({ pathname: '/word/[id]', params: { id } }); }} />
          </View>
        ) : status === 'library' && card.id ? (
          <>
            <T size={13} weight="semibold" tone="muted">Từ này có trong thư viện</T>
            <Button title="Lưu vào My Vocabulary" icon="plus" size="sm" loading={busy}
              onPress={async () => { setBusy(true); await actions.saveFromLibrary({ id: card.id!, word: card.word }); setBusy(false); }} />
          </>
        ) : (
          <Button title="Thêm vào My Vocabulary" icon="plus" size="sm" onPress={() => { setWordDraft(card); router.push('/word-form'); }} />
        )}
      </View>
    </View>
  );
}

/**
 * The study assistant (opened from the chat bubble). Answers stream in; word cards and lesson buttons come from the server.
 * History stays on this device (secure storage, per user).
 */
export default function Chat() {
  const { data, actions } = useStore();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const user = data.userId;
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    let alive = true;
    void loadChat(user).then((m) => { if (alive) { setMsgs(m); setLoaded(true); } });
    chatStatus().then((s) => { if (alive) setStatus(s); }).catch(() => { /* the count is optional */ });
    return () => { alive = false; abort.current?.abort(); };
  }, [user]);
  useEffect(() => { if (loaded && !busy) void saveChat(user, msgs); }, [user, msgs, busy, loaded]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (q.length > 500) { actions.showToast('Câu hỏi tối đa 500 ký tự.', 'bad'); return; }
    const history: ChatMsg[] = [...msgs, { role: 'user', text: q }];
    setMsgs([...history, { role: 'assistant', text: '' }]);
    setInput('');
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    // After "new conversation" the list is empty: late events have nowhere to go.
    const update = (fn: (m: ChatMsg) => ChatMsg) => setMsgs((prev) => (prev.length && prev[prev.length - 1].role === 'assistant' ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev));
    try {
      await chatAsk(history, (e) => {
        if (e.type === 'done') setStatus((st) => ({ fake: st?.fake ?? false, ...e.quota }));
        else update((m) => applyEvent(m, e));
      }, ctl.signal);
    } catch (e) {
      if (!ctl.signal.aborted) update((m) => ({ ...m, error: e instanceof ApiError ? e.message : 'Đã có lỗi. Bạn thử lại sau nhé.' }));
    } finally {
      setBusy(false);
      abort.current = null;
    }
  };

  const reset = () => { abort.current?.abort(); setMsgs([]); setBusy(false); };
  const left = status ? Math.max(0, status.limit - status.used) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60 + insets.top, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
          <Icon name="sparkle" size={18} color={t.primaryInk} />
        </View>
        <View style={{ flex: 1 }}>
          <T size={16} weight="extrabold" numberOfLines={1}>Trợ lý tiếng Anh</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {status?.fake ? <Badge label="Chế độ thử" bg={t.warningSoft} fg={t.warning} /> : null}
            <T size={12.5} tone="muted" numberOfLines={1}>{left !== null ? 'Còn ' + left + '/' + status!.limit + ' tin hôm nay' : 'Hỏi về từ vựng và ngữ pháp'}</T>
          </View>
        </View>
        {msgs.length ? <IconButton name="plus" label="Cuộc trò chuyện mới" onPress={reset} /> : null}
        <IconButton name="x" label="Đóng trợ lý" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {!loaded ? <ActivityIndicator color={t.primary} /> : !msgs.length ? (
          <View style={{ gap: 12 }}>
            <T tone="muted">Xin chào{data.settings.name ? ' ' + data.settings.name : ''}! Mình giúp bạn giải thích từ, đặt câu và ôn ngữ pháp. Câu trả lời bằng tiếng Việt, ví dụ bằng tiếng Anh.</T>
            {SUGGESTIONS.map((x) => (
              <Pressable key={x} onPress={() => void send(x)} accessibilityRole="button"
                style={({ pressed }) => ({ alignSelf: 'flex-start', paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: t.border, backgroundColor: pressed ? t.surface2 : t.surface })}>
                <T size={13.5} weight="semibold">{x}</T>
              </Pressable>
            ))}
          </View>
        ) : msgs.map((m, i) => (
          m.role === 'user' ? (
            <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: t.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderBottomRightRadius: 4 }}>
              <T size={14.5} tone="white">{m.text}</T>
            </View>
          ) : (
            <View key={i} style={{ alignSelf: 'flex-start', width: '94%', gap: 8 }} accessibilityLiveRegion={i === msgs.length - 1 ? 'polite' : 'none'}>
              {(m.cards ?? []).map((c, j) => <WordCard key={j} card={c} />)}
              {m.text ? (
                <View style={{ backgroundColor: t.surface2, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderBottomLeftRadius: 4 }}>
                  <Markdown text={m.text} />
                </View>
              ) : !m.error && busy && i === msgs.length - 1 ? (
                <View style={{ alignSelf: 'flex-start', padding: 12, backgroundColor: t.surface2, borderRadius: 14 }} accessibilityLabel="Đang trả lời">
                  <ActivityIndicator size="small" color={t.muted} />
                </View>
              ) : null}
              {(m.missing ?? []).length ? <T size={13} tone="muted">Không tìm thấy dữ liệu cho: {m.missing!.join(', ')}</T> : null}
              {(m.lessons ?? []).map((l) => (
                <View key={l.id} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Button title={'Mở bài ' + l.name} icon="book" variant="secondary" size="sm" style={{ minHeight: 44 }}
                    onPress={() => router.push({ pathname: '/grammar/[tense]', params: { tense: l.id } })} />
                  {NO_PRACTICE.has(l.id) ? null : (
                    <Button title="Luyện 10 câu" variant="ghost" size="sm" style={{ minHeight: 44 }}
                      onPress={() => router.push({ pathname: '/grammar/practice', params: { mode: l.id } })} />
                  )}
                </View>
              ))}
              {m.error ? (
                <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.dangerSoft, padding: 10, borderRadius: 10 }}>
                  <Icon name="alert" size={16} color={t.danger} />
                  <T size={13} tone="danger" style={{ flex: 1 }}>{m.error}</T>
                </View>
              ) : null}
            </View>
          )
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 + insets.bottom, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface }}>
        <TextInput value={input} onChangeText={setInput} placeholder="Hỏi về một từ hoặc ngữ pháp…" placeholderTextColor={t.faint} multiline maxLength={500}
          accessibilityLabel="Câu hỏi" submitBehavior="submit" returnKeyType="send" onSubmitEditing={() => void send(input)}
          style={{ flex: 1, minHeight: 44, maxHeight: 120, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, borderWidth: 1, borderColor: t.border, borderRadius: t.radius.sm, backgroundColor: t.bg, color: t.text, fontFamily: t.font.regular, fontSize: 15 }} />
        <Pressable onPress={() => void send(input)} disabled={busy || !input.trim()} accessibilityRole="button" accessibilityLabel="Gửi"
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: t.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.primaryHover : t.primary, opacity: busy || !input.trim() ? 0.5 : 1 })}>
          <Icon name="right" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
