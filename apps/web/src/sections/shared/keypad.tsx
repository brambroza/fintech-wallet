import { useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

type KeypadProps = {
  onKey: (k: string) => void;
  onDelete: () => void;
  /** Bottom-left key: "." for amounts, nothing for PINs. */
  extra?: string;
  disabled?: boolean;
  size?: number;
};

/** Big touch keypad (also works with a physical keyboard via the parent's key handler). */
export function Keypad({ onKey, onDelete, extra, disabled, size = 64 }: KeypadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', extra ?? '', '0', 'del'];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
      {keys.map((k, i) =>
        k === '' ? (
          <Box key={i} />
        ) : (
          <ButtonBase
            key={i}
            disabled={disabled}
            aria-label={k === 'del' ? 'ลบ' : k}
            onClick={() => (k === 'del' ? onDelete() : onKey(k))}
            sx={{
              height: size,
              borderRadius: 1.5,
              typography: 'h4',
              bgcolor: 'background.neutral',
              '&:active': { bgcolor: 'action.selected' },
            }}
          >
            {k === 'del' ? <Iconify icon="solar:backspace-linear" width={28} /> : k}
          </ButtonBase>
        )
      )}
    </Box>
  );
}

// ----------------------------------------------------------------------

type PinPadProps = {
  onComplete: (pin: string) => void;
  error?: string | null;
  /** Change to clear the entered digits. */
  resetKey?: number;
  disabled?: boolean;
  title?: string;
};

/** 6-digit PIN entry. Digits are never echoed; physical keyboard digits work too. */
export function PinPad({ onComplete, error, resetKey, disabled, title = 'ใส่ PIN 6 หลัก' }: PinPadProps) {
  const [pin, setPin] = useState('');
  useEffect(() => setPin(''), [resetKey]);

  const add = (k: string) => {
    if (disabled) return;
    setPin((p) => {
      if (p.length >= 6) return p;
      const next = p + k;
      if (next.length === 6) setTimeout(() => onComplete(next), 0);
      return next;
    });
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) add(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return (
    <Stack spacing={2.5} alignItems="center" sx={{ width: 1, maxWidth: 320, mx: 'auto' }}>
      <Typography variant="h6">{title}</Typography>
      <Stack direction="row" spacing={2} aria-label={`ใส่แล้ว ${pin.length} จาก 6 หลัก`}>
        {Array.from({ length: 6 }, (_, i) => (
          <Box
            key={i}
            sx={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              bgcolor: i < pin.length ? (error ? 'error.main' : 'primary.main') : 'transparent',
              border: (t) => (i < pin.length ? 'none' : `2px solid ${error ? t.vars.palette.error.main : t.vars.palette.grey[400]}`),
            }}
          />
        ))}
      </Stack>
      <Typography variant="body2" color="error" sx={{ minHeight: 22 }} role="alert">
        {error ?? ''}
      </Typography>
      <Box sx={{ width: 1 }}>
        <Keypad onKey={add} onDelete={() => setPin((p) => p.slice(0, -1))} disabled={disabled} />
      </Box>
    </Stack>
  );
}

// ----------------------------------------------------------------------

/** Amount buffer like "45.5" (max 7 integer digits, 2 decimals). */
export function pushAmountKey(value: string, k: string): string {
  if (k === '.') return value.includes('.') ? value : `${value || '0'}.`;
  const [i, d] = value.split('.');
  if (d !== undefined) return d.length >= 2 ? value : value + k;
  if (i.length >= 7) return value;
  return value === '0' ? k : value + k;
}

export function displayAmount(value: string) {
  if (!value) return '0';
  const [i, d] = value.split('.');
  const int = Number(i || '0').toLocaleString('th-TH');
  return d === undefined ? int : `${int}.${d}`;
}
