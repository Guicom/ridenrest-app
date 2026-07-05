import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './card';

const meta = {
  title: 'UI/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Tour du Mont-Blanc</CardTitle>
        <CardDescription>7 étapes · 170 km · 11 000 m D+</CardDescription>
      </CardHeader>
      <CardContent>
        <CardDescription>
          Hébergements et points d&apos;eau cartographiés le long de la trace.
        </CardDescription>
        <Button size="lg" label="Ouvrir l'aventure" />
      </CardContent>
    </Card>
  ),
};

export const Empty: Story = {
  render: () => (
    <Card>
      <CardTitle>Carte vide</CardTitle>
    </Card>
  ),
};
