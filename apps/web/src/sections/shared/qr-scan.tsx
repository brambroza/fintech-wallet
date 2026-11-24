import { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';

import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';

// ----------------------------------------------------------------------

/** Camera QR reader. Calls onResult once per distinct value. */
export function QrScan({ onResult, paused }: { onResult: (value: string) => void; paused?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Box sx={{ width: 1, maxWidth: 360, mx: 'auto', borderRadius: 2, overflow: 'hidden', bgcolor: 'common.black', aspectRatio: '1 / 1' }}>
      {error ? (
        <Alert severity="warning" sx={{ m: 2 }}>
          {error}
        </Alert>
      ) : (
        <Scanner
          paused={paused}
          formats={['qr_code']}
          constraints={{ facingMode: 'environment' }}
          onScan={(codes) => codes[0]?.rawValue && onResult(codes[0].rawValue)}
          onError={() => setError('เปิดกล้องไม่ได้ อนุญาตให้ใช้กล้องในเบราว์เซอร์ หรือใช้เครื่องสแกน')}
          styles={{ container: { width: '100%', height: '100%' } }}
        />
      )}
    </Box>
  );
}
