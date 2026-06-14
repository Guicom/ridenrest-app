import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { RangeSlider, type RangeValue } from './slider';

const meta = {
  title: 'UI/RangeSlider',
  component: RangeSlider,
  // Args par défaut couvrant les props requises (les stories ci-dessous pilotent un
  // état local via `render` et ignorent ces valeurs — elles satisfont juste le type).
  args: { min: 0, max: 100, low: 0, high: 15, onChange: () => {} },
} satisfies Meta<typeof RangeSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({
  min = 0,
  max = 100,
  maxRange,
  initial = { low: 0, high: 15 },
}: {
  min?: number;
  max?: number;
  maxRange?: number;
  initial?: RangeValue;
}) {
  const [value, setValue] = useState<RangeValue>(initial);
  return (
    <View style={{ width: 280, gap: 12 }}>
      <Text>
        km {value.low} → km {value.high} ({value.high - value.low} km)
      </Text>
      <RangeSlider
        min={min}
        max={max}
        low={value.low}
        high={value.high}
        maxRange={maxRange}
        onChange={setValue}
        lowLabel="Borne de départ"
        highLabel="Borne de fin"
      />
    </View>
  );
}

export const Default: Story = {
  render: () => <Demo />,
};

export const Capped30km: Story = {
  // Cap d'étendue 30 km (parité epic mobile).
  render: () => <Demo max={200} maxRange={30} initial={{ low: 20, high: 50 }} />,
};

export const FullWidth: Story = {
  render: () => <Demo max={42} initial={{ low: 0, high: 42 }} />,
};
