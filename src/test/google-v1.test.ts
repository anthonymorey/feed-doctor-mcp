import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { GoogleMerchantClient, MerchantApiError } from '../clients/google.js';
import { normalizeGoogleProduct } from '../normalizer.js';
import { createFeedDoctorServer } from '../server.js';
import type { FetchLike } from '../types.js';
import { createMockFetch, MOCK_GOOGLE_PRODUCTS } from './fixtures.js';

const ENV = { GOOGLE_ACCESS_TOKEN: 'ya29.sensitive-google-token' };

async function withServer<T>(
  fetchFn: FetchLike,
  work: (client: Client) => Promise<T>
): Promise<T> {
  const server = createFeedDoctorServer({ env: ENV, fetchFn });
  const client = new Client({ name: 'google-v1-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  try {
    return await work(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function toolText(result: Awaited<ReturnType<Client['callTool']>>): string {
  assert.ok('content' in result && Array.isArray(result.content));
  const first = result.content[0] as { type: string; text?: string };
  assert.equal(first.type, 'text');
  return first.text ?? '';
}

function urlOf(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
}

const errorFetch =
  (status: number, body: string): FetchLike =>
  async () =>
    new Response(body, { status, headers: { 'Content-Type': 'application/json' } });

describe('Google Merchant API v1 migration', () => {
  it('requests only /v1/ Merchant API paths across all tools', async () => {
    const urls: string[] = [];
    const mock = createMockFetch();
    const fetchFn: FetchLike = async (input, init) => {
      urls.push(urlOf(input));
      return mock(input, init);
    };
    await withServer(fetchFn, async (client) => {
      for (const name of [
        'list_accounts',
        'feed_health_summary',
        'list_disapprovals',
        'compare_platforms',
        'fix_plan'
      ]) {
        const res = await client.callTool({ name, arguments: { platform: 'google' } });
        assert.notEqual(res.isError, true, name);
      }
    });
    const googleUrls = urls.filter((u) => u.startsWith('https://merchantapi.googleapis.com/'));
    for (const prefix of ['/accounts/v1/accounts', '/datasources/v1/', '/products/v1/']) {
      assert.ok(googleUrls.some((u) => u.includes(prefix)), prefix);
    }
    // No pre-release versions (v1beta / v1alpha) anywhere.
    assert.ok(googleUrls.every((u) => u.includes('/v1/') && !/\/v1[a-z]/.test(u)));
  });

  it('list_accounts and feed_health_summary succeed with a warning when no accounts are linked', async () => {
    for (const body of ['{}', '{"accounts":[]}']) {
      const urls: string[] = [];
      const fetchFn: FetchLike = async (input) => {
        urls.push(urlOf(input));
        return new Response(body, { status: 200 });
      };
      await withServer(fetchFn, async (client) => {
        const list = await client.callTool({ name: 'list_accounts', arguments: { platform: 'google' } });
        assert.notEqual(list.isError, true);
        const listJson = JSON.parse(toolText(list));
        assert.equal(listJson.totalAccounts, 0);
        assert.deepEqual(listJson.warnings, ['No Merchant Center account is linked to this Google login.']);

        const health = await client.callTool({ name: 'feed_health_summary', arguments: { platform: 'google' } });
        assert.notEqual(health.isError, true);
        const healthJson = JSON.parse(toolText(health));
        assert.deepEqual(healthJson.accounts, []);
        assert.deepEqual(healthJson.warnings, ['No Merchant Center account is linked to this Google login.']);
      });
      // No per-account calls are attempted without an account.
      assert.ok(urls.every((u) => new URL(u).pathname === '/accounts/v1/accounts'));
    }
  });

  it('maps 403 SERVICE_DISABLED to an operator message without leaking secrets', async () => {
    const body = '{"error":{"code":403,"status":"PERMISSION_DENIED","details":[{"reason":"SERVICE_DISABLED"}]}}';
    await withServer(errorFetch(403, body), async (client) => {
      const res = await client.callTool({ name: 'list_accounts', arguments: { platform: 'google' } });
      assert.equal(res.isError, true);
      assert.equal(
        toolText(res),
        'The Merchant API is not enabled for this FeedDoctor deployment. The operator has been notified.'
      );
      assert.ok(!JSON.stringify(res).includes('sensitive'));
      assert.ok(!JSON.stringify(res).includes('googleapis'));
    });
  });

  it('maps 403 PERMISSION_DENIED, 401, 404 and other statuses to actionable messages', async () => {
    const cases: Array<[number, string, string | RegExp]> = [
      [401, '{"error":{"code":401,"status":"UNAUTHENTICATED"}}', 'Google rejected the connection. Reconnect at https://feeds.theownersdesk.net/connect/google.'],
      [403, '{"error":{"code":403,"status":"PERMISSION_DENIED"}}', 'This Google login does not have access to that Merchant Center account.'],
      [404, '<html>Not Found</html>', 'Merchant Center resource not found.'],
      [503, 'sensitive upstream body', /^Unable to complete the request\. .*\(Google HTTP 503\)$/]
    ];
    for (const [status, body, expected] of cases) {
      await withServer(errorFetch(status, body), async (client) => {
        for (const name of ['list_accounts', 'fix_plan']) {
          const res = await client.callTool({ name, arguments: { platform: 'google' } });
          assert.equal(res.isError, true);
          if (typeof expected === 'string') assert.equal(toolText(res), expected);
          else assert.match(toolText(res), expected);
          assert.ok(!JSON.stringify(res).includes('sensitive'));
        }
      });
    }
  });

  it('client throws MerchantApiError with parsed status and reason', async () => {
    const client = new GoogleMerchantClient({
      accessToken: 'sensitive',
      fetchFn: errorFetch(403, '{"error":{"code":403,"status":"PERMISSION_DENIED","details":[{"reason":"SERVICE_DISABLED"}]}}')
    });
    await assert.rejects(client.listAccounts(), (e) => {
      assert.ok(e instanceof MerchantApiError);
      assert.equal(e.httpStatus, 403);
      assert.equal(e.status, 'PERMISSION_DENIED');
      assert.equal(e.reason, 'SERVICE_DISABLED');
      return true;
    });
  });

  it('follows nextPageToken with pageSize=250 and caps accounts at 5 pages and products at 4', async () => {
    const seen: URL[] = [];
    const fetchFn: FetchLike = async (input) => {
      const url = new URL(urlOf(input));
      seen.push(url);
      const page = Number(url.searchParams.get('pageToken') ?? '0');
      const key = url.pathname.endsWith('/products') ? 'products' : 'accounts';
      return Response.json({
        [key]: [key === 'products' ? { offerId: `SKU-${page}` } : { accountId: String(page) }],
        nextPageToken: String(page + 1)
      });
    };
    const client = new GoogleMerchantClient({ accessToken: 't', fetchFn });

    const accounts = await client.listAccounts();
    assert.deepEqual(accounts.map((a) => a.accountId), ['0', '1', '2', '3', '4']);
    assert.ok(seen.every((u) => u.searchParams.get('pageSize') === '250'));
    assert.deepEqual(seen.slice(1).map((u) => u.searchParams.get('pageToken')), ['1', '2', '3', '4']);

    seen.length = 0;
    const products = await client.listProducts('accounts/42');
    assert.equal(products.length, 4);
    assert.equal(seen.length, 4);
    assert.ok(seen.every((u) => u.pathname === '/products/v1/accounts/42/products'));

    // Stops as soon as nextPageToken is absent.
    seen.length = 0;
    const single = new GoogleMerchantClient({
      accessToken: 't',
      fetchFn: async (input) => {
        seen.push(new URL(urlOf(input)));
        return Response.json({ accounts: [{ accountId: '1' }] });
      }
    });
    assert.equal((await single.listAccounts()).length, 1);
    assert.equal(seen.length, 1);
  });

  it('normalizes v1 productAttributes, enum availability, NOT_IMPACTED and the legacy shape', () => {
    const v1 = normalizeGoogleProduct({
      name: 'accounts/1/products/en~AU~SKU-V1',
      productAttributes: {
        title: 'V1 Product',
        link: 'https://shop.example/p',
        availability: 'OUT_OF_STOCK',
        condition: 'NEW',
        price: { amountMicros: '12500000', currencyCode: 'AUD' }
      },
      productStatus: {
        itemLevelIssues: [{ code: 'missing_size', severity: 'NOT_IMPACTED', attribute: 'size' }]
      }
    });
    assert.equal(v1.sku, 'SKU-V1');
    assert.equal(v1.title, 'V1 Product');
    assert.equal(v1.availability, 'out_of_stock');
    assert.equal(v1.condition, 'new');
    assert.equal(v1.price?.formatted, '12.50 AUD');
    assert.equal(v1.channel, 'online');
    assert.equal(v1.issues[0]?.severity, 'warning');
    assert.equal(v1.approvalStatus, 'limited');

    const legacyRaw = MOCK_GOOGLE_PRODUCTS.find((p) => p.attributes && !p.productAttributes);
    assert.ok(legacyRaw, 'fixtures keep one legacy-shape product');
    const legacy = normalizeGoogleProduct(legacyRaw);
    assert.equal(legacy.title, legacyRaw.attributes?.title);
    assert.equal(legacy.availability, 'in_stock');
  });
});
