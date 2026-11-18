import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, themed } from './theme';
import { Btn, Chip } from './ui';
import { Condition, GradeCompany, OwnedEntry } from './types';
import { VariantPrice } from './api';

export const CONDITIONS: Condition[] = [
  'Mint',
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
];
export const COMPANIES: GradeCompany[] = ['PSA', 'CGC', 'BGS', 'SGC'];

export type EntryValues = Omit<OwnedEntry, 'key' | 'card'>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export default function EntryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
  variants,
}: {
  /** printings that have a price; when there is more than one the user picks one */
  variants?: VariantPrice[];
  initial?: Partial<EntryValues>;
  submitLabel: string;
  onSubmit: (v: EntryValues) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [variant, setVariant] = useState<string | undefined>(initial?.variant);
  const [cost, setCost] = useState(initial?.cost != null ? String(initial.cost) : '');
  const [graded, setGraded] = useState(initial?.graded ?? false);
  const [condition, setCondition] = useState<Condition>(initial?.condition ?? 'Near Mint');
  const [company, setCompany] = useState<GradeCompany>(initial?.company ?? 'PSA');
  const [grade, setGrade] = useState(initial?.grade ?? '');
  const [declared, setDeclared] = useState(
    initial?.declaredValue != null ? String(initial.declaredValue) : '',
  );
  const [boughtOn, setBoughtOn] = useState(initial?.boughtOn ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState('');

  const submit = () => {
    const costNum = cost.trim() === '' ? 0 : Number(cost);
    if (isNaN(costNum) || costNum < 0) return setError('Cost must be a number like 12.50.');
    let declaredNum: number | undefined;
    if (graded && declared.trim() !== '') {
      declaredNum = Number(declared);
      if (isNaN(declaredNum) || declaredNum < 0) return setError('Your value must be a number like 150.');
    }
    if (graded && grade.trim() === '') return setError('Enter the grade, for example 10 or 9.5.');
    if (boughtOn.trim() !== '' && !validDate(boughtOn.trim()))
      return setError('Date must look like 2026-03-27.');
    setError('');
    onSubmit({
      qty,
      variant,
      cost: costNum,
      graded,
      condition: graded ? undefined : condition,
      company: graded ? company : undefined,
      grade: graded ? grade.trim() : undefined,
      declaredValue: graded ? declaredNum : undefined,
      boughtOn: boughtOn.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Text style={f.label}>COPIES</Text>
        <Pressable style={f.step} onPress={() => setQty((q) => Math.max(1, q - 1))}>
          <Text style={f.stepText}>−</Text>
        </Pressable>
        <Text style={f.qty}>{qty}</Text>
        <Pressable style={f.step} onPress={() => setQty((q) => Math.min(999, q + 1))}>
          <Text style={f.stepText}>+</Text>
        </Pressable>
      </View>
      {variants && variants.length > 1 ? (
        <View style={{ gap: 8 }}>
          <Text style={f.label}>PRINTING</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {variants.map((v) => (
              <Chip key={v.key} label={v.label} active={variant === v.key} onPress={() => setVariant(v.key)} />
            ))}
          </View>
        </View>
      ) : null}
      <TextInput
        value={cost}
        onChangeText={setCost}
        keyboardType="decimal-pad"
        placeholder="What you paid per copy ($)"
        placeholderTextColor={colors.muted}
        style={f.input}
      />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Chip label="Raw" active={!graded} onPress={() => setGraded(false)} />
        <Chip label="Graded" active={graded} onPress={() => setGraded(true)} />
      </View>
      {graded ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {COMPANIES.map((c) => (
              <Chip key={c} label={c} active={company === c} onPress={() => setCompany(c)} />
            ))}
          </View>
          <TextInput
            value={grade}
            onChangeText={setGrade}
            placeholder="Grade (e.g. 10)"
            placeholderTextColor={colors.muted}
            style={f.input}
          />
          <TextInput
            value={declared}
            onChangeText={setDeclared}
            keyboardType="decimal-pad"
            placeholder="Your own value per copy ($, optional)"
            placeholderTextColor={colors.muted}
            style={f.input}
          />
        </>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CONDITIONS.map((c) => (
            <Chip key={c} label={c} active={condition === c} onPress={() => setCondition(c)} />
          ))}
        </View>
      )}
      <TextInput
        value={boughtOn}
        onChangeText={setBoughtOn}
        placeholder="Date bought (YYYY-MM-DD, optional)"
        placeholderTextColor={colors.muted}
        style={f.input}
        autoCapitalize="none"
      />
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Notes (optional)"
        placeholderTextColor={colors.muted}
        style={f.input}
      />
      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Btn kind="gold" label={submitLabel} onPress={submit} />
        {onCancel ? <Btn label="Cancel" onPress={onCancel} /> : null}
        {onDelete ? <Btn label="Delete" icon="trash-outline" onPress={onDelete} /> : null}
      </View>
    </View>
  );
}

const f = themed(() => StyleSheet.create({
  label: { color: colors.muted, fontSize: 13, letterSpacing: 3, fontWeight: '700' },
  step: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: colors.text, fontSize: 22 },
  qty: { color: colors.text, fontSize: 20, fontWeight: '700', minWidth: 28, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
}));
