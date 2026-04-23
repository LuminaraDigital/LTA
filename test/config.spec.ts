import { describe, expect, it } from 'vitest';

import { loadConfigFromEnv } from '../src/core/config.js';
import { writeFileSync } from 'node:fs';

describe('secret-backed TON config', () => {
  it('merges secret-backed wallet attachment metadata into runtime config', () => {
    const secretPath = '/tmp/lta-ton-secret.json';
    writeFileSync(
      secretPath,
      JSON.stringify(
        {
          tonCenterApiKey: 'secret-key',
          attachedWallets: [
            {
              address: 'UQExampleInlineOwner',
              label: 'lta-primary',
              network: 'mainnet',
            },
          ],
        },
        null,
        2,
      ),
    );

    const config = loadConfigFromEnv({
      NODE_ENV: 'test',
      LTA_LOCAL_SECRET_FILE: secretPath,
    });

    expect(config.ton.localSecretFilePath).toBe(secretPath);
    expect(config.ton.tonCenterApiKey).toBe('secret-key');
    expect(config.ton.attachedWallets[0]?.address).toBe('UQExampleInlineOwner');
    expect(config.ton.attachedWallets[0]?.operatorLabel).toBe('lta-primary');
  });
});
