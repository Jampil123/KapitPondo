import { useEffect, useState } from 'react';
import { View, TextInput, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Search } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { semantic } from '@/theme/colors';
import { fetchStickers, type Sticker } from '@/api/stickers';

const COLUMNS = 4;

export function StickerPicker({ onPick }: { onPick: (url: string) => void }) {
  const [query, setQuery] = useState('');
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounced: search as the user types, trending when the box is empty.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetchStickers(query)
        .then((s) => { if (!cancelled) { setStickers(s); setError(null); } })
        .catch((e) => { if (!cancelled) setError((e as Error).message); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, query ? 350 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  return (
    <View style={{ height: 270, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: semantic.surfaceAlt, borderRadius: 18, paddingHorizontal: 12 }}>
        <Search size={16} color={semantic.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search stickers"
          placeholderTextColor={semantic.textMuted}
          style={{ flex: 1, height: 36, color: semantic.textPrimary }}
        />
        {loading ? <ActivityIndicator size="small" color={semantic.brandDark} /> : null}
      </View>

      {error ? (
        <Text variant="caption" color="secondary" style={{ textAlign: 'center', marginTop: 20 }}>{error}</Text>
      ) : !loading && stickers.length === 0 ? (
        <Text variant="caption" color="secondary" style={{ textAlign: 'center', marginTop: 20 }}>No stickers found</Text>
      ) : (
        <FlatList
          data={stickers}
          numColumns={COLUMNS}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          columnWrapperStyle={{ gap: 6 }}
          contentContainerStyle={{ gap: 6 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item.url)} style={{ flex: 1 / COLUMNS, aspectRatio: 1, borderRadius: 12, backgroundColor: semantic.surfaceAlt, padding: 4 }}>
              <Image source={{ uri: item.previewUrl }} style={{ flex: 1 }} contentFit="contain" />
            </Pressable>
          )}
        />
      )}

      <Text style={{ fontSize: 10, color: semantic.textMuted, textAlign: 'right' }}>Powered by GIPHY</Text>
    </View>
  );
}
