import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { semantic, intent } from '@/theme/colors';

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CHART_H = 96;

/** Running-total line chart, one point per month (My reports, Member balances). */
export function GrowthChart({ points }: { points: { label: string; value: number }[] }) {
  const [w, setW] = useState(0);
  const max = Math.max(...points.map((p) => p.value), 1);
  const pad = 6;
  const xy = points.map((p, i) => ({
    x: points.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (points.length - 1),
    y: pad + (CHART_H - pad * 2) * (1 - p.value / max),
  }));
  const line = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = xy.length ? `${line} L${xy[xy.length - 1].x},${CHART_H} L${xy[0].x},${CHART_H} Z` : '';
  const last = xy[xy.length - 1];
  // Label every month when it fits, otherwise just the ends.
  const showLabel = (i: number) => points.length <= 7 || i === 0 || i === points.length - 1;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 ? (
        <Svg width={w} height={CHART_H}>
          <Defs>
            <SvgGradient id="growth" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={intent.success.base} stopOpacity={0.28} />
              <Stop offset="1" stopColor={intent.success.base} stopOpacity={0} />
            </SvgGradient>
          </Defs>
          <Path d={area} fill="url(#growth)" />
          <Path d={line} stroke={intent.success.base} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {last ? <Circle cx={last.x} cy={last.y} r={4.5} fill={semantic.surface} stroke={intent.success.base} strokeWidth={2.5} /> : null}
        </Svg>
      ) : <View style={{ height: CHART_H }} />}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        {points.map((p, i) => (
          <Text key={i} style={{ fontSize: 10, fontFamily: 'Poppins_600SemiBold', color: semantic.textMuted, opacity: showLabel(i) ? 1 : 0 }}>{p.label}</Text>
        ))}
      </View>
    </View>
  );
}
