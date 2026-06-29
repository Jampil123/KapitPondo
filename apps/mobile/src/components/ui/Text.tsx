/**
 * components/ui/Text.tsx
 * ----------------------------------------------------------------------------
 * The single Text component the whole app uses. Pick a `variant` from the type
 * scale; pick a `color` from semantic roles. Never set fontSize/fontFamily ad
 * hoc in screens — add a variant here instead so the scale stays disciplined.
 *
 *   <Text variant="h2">Contributions</Text>
 *   <Text variant="numeric" color="brand">{formatPeso(amount)}</Text>
 *   <Text variant="caption" color="muted">Due 15 Jun</Text>
 */
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { typography, type TextVariant } from '../../theme/typography';
import { semantic } from '../../theme/colors';

type ColorRole =
  | 'primary'    // default body text
  | 'secondary'
  | 'muted'
  | 'brand'
  | 'onBrand'
  | 'inherit';

const colorMap: Record<Exclude<ColorRole, 'inherit'>, string> = {
  primary: semantic.textPrimary,
  secondary: semantic.textSecondary,
  muted: semantic.textMuted,
  brand: semantic.brand,
  onBrand: semantic.textOnBrand,
};

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: ColorRole;
};

export function Text({
  variant = 'body',
  color = 'primary',
  style,
  ...rest
}: TextProps) {
  const colorStyle = color === 'inherit' ? undefined : { color: colorMap[color] };
  return <RNText style={[typography[variant], colorStyle, style]} {...rest} />;
}
