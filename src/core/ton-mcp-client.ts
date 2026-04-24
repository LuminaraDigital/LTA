import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import type { TonConfig } from './types.js';

export interface TonMcpCallResult {
  readonly text: string;
  readonly structuredContent?: Record<string, unknown>;
  readonly isError: boolean;
}

export interface TonMcpClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<string[]>;
  callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<TonMcpCallResult>;
}

function extractText(result: {
  content?: Array<{ type: string; text?: string }>;
}): string {
  return (
    result.content
      ?.filter((item) => item.type === 'text')
      .map((item) => item.text ?? '')
      .join('\n') ?? ''
  );
}

export function buildTonMcpClient(config: TonConfig): TonMcpClient {
  const client = new Client({
    name: 'lta-ton-worker',
    version: '1.0.0',
  });
  const transport = new StdioClientTransport({
    command: config.mcpCommand,
    args: config.mcpArgs,
    env: {
      ...process.env,
      NETWORK: config.network,
      ...(config.tonCenterApiKey
        ? {
            TONCENTER_API_KEY: config.tonCenterApiKey,
            TONCENTER_KEY: config.tonCenterApiKey,
          }
        : {}),
    },
  });

  let connected = false;

  return {
    async connect() {
      if (connected) {
        return;
      }

      await client.connect(transport);
      connected = true;
    },
    async close() {
      if (!connected) {
        return;
      }

      await client.close();
      connected = false;
    },
    async listTools() {
      await this.connect();
      const { tools } = await client.listTools();
      return tools.map((tool) => tool.name);
    },
    async callTool(name, args) {
      await this.connect();
      const result = await client.callTool({
        name,
        arguments: args,
      });

      const base = {
        text: extractText(result as { content?: Array<{ type: string; text?: string }> }),
        isError: Boolean(result.isError),
      };

      const structuredContent = (result as { structuredContent?: Record<string, unknown> })
        .structuredContent;

      if (structuredContent == null) {
        return base;
      }

      return {
        ...base,
        structuredContent,
      };
    },
  };
}
