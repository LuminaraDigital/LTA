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

  it('loads AI API keys from the private AI secret file', () => {
    const aiSecretPath = '/tmp/lta-ai-secret.json';
    writeFileSync(
      aiSecretPath,
      JSON.stringify(
        {
          openaiApiKey: 'openai-secret',
          kimiApiKey: 'kimi-secret',
        },
        null,
        2,
      ),
    );

    const config = loadConfigFromEnv({
      NODE_ENV: 'test',
      LTA_AI_SECRET_FILE: aiSecretPath,
    });

    expect(config.ai.localSecretFilePath).toBe(aiSecretPath);
    expect(config.ai.openaiApiKey).toBe('openai-secret');
    expect(config.ai.kimiApiKey).toBe('kimi-secret');
  });
});
