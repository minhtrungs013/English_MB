import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, T } from '../../components/ui';
import type { IconName } from '../../lib/icons';
import { useTheme } from '../../state/store';

const ITEMS: Record<string, [string, IconName]> = {
  index: ['Home', 'grid'], library: ['Library', 'globe'], words: ['Words', 'book'], practice: ['Practice', 'pen']
};

interface BarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

/** The design's mobile bottom navigation, with the raised "+" (add word) button in the middle. */
function BottomBar({ state, navigation }: BarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tab = (i: number) => {
    const r = state.routes[i];
    const [label, icon] = ITEMS[r.name] ?? [r.name, 'grid'];
    const on = state.index === i;
    const color = on ? t.primaryInk : t.muted;
    return (
      <Pressable key={r.key} onPress={() => navigation.navigate(r.name)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 58, gap: 3 }}>
        <Icon name={icon} size={22} color={color} />
        <T size={11.5} weight="bold" style={{ color }}>{label}</T>
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border, paddingHorizontal: 6, paddingBottom: insets.bottom, height: 68 + insets.bottom }}>
      {tab(0)}{tab(1)}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Pressable onPress={() => router.push('/word-form')} accessibilityRole="button" accessibilityLabel="Add vocabulary"
          style={({ pressed }) => ({ width: 54, height: 54, borderRadius: 16, backgroundColor: pressed ? t.primaryHover : t.primary, alignItems: 'center', justifyContent: 'center', marginTop: -18, elevation: 6, shadowColor: t.primary, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } })}>
          <Icon name="plus" size={26} color="#fff" />
        </Pressable>
      </View>
      {tab(2)}{tab(3)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BottomBar {...(props as unknown as BarProps)} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="words" />
      <Tabs.Screen name="practice" />
    </Tabs>
  );
}
