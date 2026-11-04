import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import {
  Client,
  InMemoryTransport,
  StreamableHTTPClientTransport
} from '@modelcontextprotocol/client';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import {
  decryptStatelessTokenBundle,
  encodeBase64TokenBundle,
  encryptStatelessTokenBundle,
  resolveRequestCredentials
} from '../auth.js';
import {
  assertSafeMerchantUrl,
  parseLandingPageHtml
} from '../clients/landing-page.js';
import { diagnoseIssueCode } from '../diagnostics.js';
import {
  createStreamableHttpFetchHandler,
  handleStatelessStreamableHttpRequest
} from '../http.js';
import { createFeedDoctorServer } from '../server.js';
import { connectStdioServer } from '../stdio.js';
import { createMockFetch, MOCK_LANDING_PAGES } from './fixtures.js';

const TEST_ENV = {
  GOOGLE_ACCESS_TOKEN: 'ya29.mock-google-token',
  MICROSOFT_ACCESS_TOKEN: 'EwB4A8l6BAA.mock-ms-token',
  MICROSOFT_DEVELOPER_TOKEN: '12345BINGDEV',
  FEED_DOCTOR_TOKEN_SECRET: 'super-secret-stateless-key-32bytes!'
};

function parseToolJson(result: Awaited<ReturnType<Client['callTool']>>) {
  assert.ok('content' in result && Array.isArray(result.content));
  const first = result.content[0] as { type: string; text?: string } | undefined;
  assert.ok(first && first.type === 'text' && typeof first.text === 'string');
  return JSON.parse(first.text) as Record<string, any>;
}

describe('feed-doctor-mcp unit & integration tests (offline, mocked APIs)', () => {
  it('maps Google and Microsoft issue codes to plain-English causes, attributes, fix steps, and TODO-verify / verified URLs', () => {
    const gPrice = diagnoseIssueCode({
      code: 'price_mismatch',
      platform: 'google',
      rawSeverity: 'DISAPPROVED',
      rawAttribute: 'price',
      actualOffendingValue: '199.00 USD'
    });
    assert.equal(gPrice.code, 'price_mismatch');
    assert.equal(gPrice.severity, 'disapproval');
    assert.equal(gPrice.affectedAttribute, 'price');
    assert.equal(gPrice.actualOffendingValue, '199.00 USD');
    assert.ok(gPrice.plainEnglishCause.includes('JSON-LD'));
    assert.ok(gPrice.fixSteps.length >= 3);
    assert.ok(gPrice.helpUrl.includes('support.google.com/merchants/answer/6098334'));
    assert.ok(gPrice.helpUrl.includes('TODO-verify'));
    assert.equal(gPrice.helpUrlVerification, 'TODO-verify');

    const mGtin = diagnoseIssueCode({
      code: 'bing_missing_gtin_or_mpn',
      platform: 'microsoft',
      rawSeverity: 'Disapproved'
    });
    assert.equal(mGtin.platform, 'microsoft');
    assert.equal(mGtin.affectedAttribute, 'gtin');
    assert.ok(mGtin.helpUrl.includes('help.ads.microsoft.com'));
    assert.equal(mGtin.helpUrlVerification, 'TODO-verify');

    // Fallback with verified local doc URL
    const unknownGoogle = diagnoseIssueCode({
      code: 'custom_new_merchant_api_issue',
      platform: 'google',
      rawAttribute: 'shipping_label',
      rawDocumentationUrl: 'https://developers.google.com/merchant/api'
    });
    assert.equal(unknownGoogle.helpUrl, 'https://developers.google.com/merchant/api');
    assert.equal(unknownGoogle.helpUrlVerification, 'verified-in-local-docs');
  });

  it('encrypts, decrypts, and resolves stateless per-request OAuth credentials with zero storage', () => {
    const token = encryptStatelessTokenBundle(
      {
        googleAccessToken: 'g-tok-1',
        googleMerchantAccountId: '77889900',
        microsoftAccessToken: 'm-tok-1',
        microsoftDeveloperToken: 'dev-tok-1',
        microsoftMerchantId: '554433',
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      TEST_ENV.FEED_DOCTOR_TOKEN_SECRET
    );
    assert.ok(token.startsWith('fdmcp_enc_'));

    const decrypted = decryptStatelessTokenBundle(
      token,
      TEST_ENV.FEED_DOCTOR_TOKEN_SECRET
    );
    assert.equal(decrypted.googleAccessToken, 'g-tok-1');
    assert.equal(decrypted.microsoftMerchantId, '554433');

    // Expired token should throw
    assert.throws(() =>
      decryptStatelessTokenBundle(
        token,
        TEST_ENV.FEED_DOCTOR_TOKEN_SECRET,
        Math.floor(Date.now() / 1000) + 7200
      )
    );

    // Resolve via Authorization: Bearer <encrypted_token>
    const resolved = resolveRequestCredentials({
      requestHeaders: {
        authorization: `Bearer ${token}`
      },
      env: { FEED_DOCTOR_TOKEN_SECRET: TEST_ENV.FEED_DOCTOR_TOKEN_SECRET }
    });
    assert.equal(resolved.googleAccessToken, 'g-tok-1');
    assert.equal(resolved.microsoftAccessToken, 'm-tok-1');

    // Resolve via base64url bundle
    const b64 = encodeBase64TokenBundle({
      googleAccessToken: 'g-b64',
      microsoftAccessToken: 'm-b64'
    });
    const resolvedB64 = resolveRequestCredentials({
      bearerToken: b64,
      env: {}
    });
    assert.equal(resolvedB64.googleAccessToken, 'g-b64');
    assert.equal(resolvedB64.microsoftAccessToken, 'm-b64');
  });

  it('parses landing page JSON-LD and meta tags and enforces SSRF + merchant domain guards', () => {
    const jacketSnap = parseLandingPageHtml(
      MOCK_LANDING_PAGES['https://shop.acme-outdoor.example/products/alpine-down-jacket'],
      'https://shop.acme-outdoor.example/products/alpine-down-jacket'
    );
    assert.equal(jacketSnap.extractionSource, 'json-ld');
    assert.equal(jacketSnap.price?.formatted, '219.00 USD');
    assert.equal(jacketSnap.availability, 'in_stock');
    assert.equal(jacketSnap.gtin, '00881234567228');

    const shoeSnap = parseLandingPageHtml(
      MOCK_LANDING_PAGES['https://shop.acme-outdoor.example/products/trailrunner-pro'],
      'https://shop.acme-outdoor.example/products/trailrunner-pro'
    );
    assert.equal(shoeSnap.extractionSource, 'meta-tags');
    assert.equal(shoeSnap.price?.formatted, '49.99 USD');
    assert.equal(shoeSnap.availability, 'in_stock');

    // SSRF & domain guards
    assert.throws(
      () => assertSafeMerchantUrl('http://127.0.0.1:8080/internal'),
      /private, loopback, or internal/
    );
    assert.throws(
      () => assertSafeMerchantUrl('http://169.254.169.254/latest/meta-data/'),
      /private, loopback, or internal/
    );
    assert.throws(
      () => assertSafeMerchantUrl('file:///etc/passwd'),
      /Unsupported URL protocol/
    );
    assert.throws(
      () =>
        assertSafeMerchantUrl('https://evil-competitor.example/products/1', [
          'https://shop.acme-outdoor.example'
        ]),
      /does not match the merchant's own domain/
    );
  });

  it('registers all 6 tools with readOnlyHint=true and destructiveHint=false and executes them via MCP Client', async () => {
    const server = createFeedDoctorServer({
      env: TEST_ENV,
      fetchFn: createMockFetch()
    });
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const toolsList = await client.listTools();
      const toolNames = toolsList.tools.map((t) => t.name).sort();
      assert.deepEqual(toolNames, [
        'compare_platforms',
        'diagnose_product',
        'feed_health_summary',
        'fix_plan',
        'list_accounts',
        'list_disapprovals'
      ]);

      for (const tool of toolsList.tools) {
        assert.ok(tool.title, `Tool ${tool.name} should have a title`);
        assert.equal(
          tool.annotations?.readOnlyHint,
          true,
          `Tool ${tool.name} must have readOnlyHint=true`
        );
        assert.equal(
          tool.annotations?.destructiveHint,
          false,
          `Tool ${tool.name} must have destructiveHint=false`
        );
        assert.equal(tool.inputSchema.type, 'object');
      }

      // 1. list_accounts
      const accountsRes = parseToolJson(
        await client.callTool({
          name: 'list_accounts',
          arguments: { platform: 'both' }
        })
      );
      assert.equal(accountsRes.readOnly, true);
      assert.equal(accountsRes.totalAccounts, 2);
      assert.equal(accountsRes.accounts[0].platform, 'google');
      assert.equal(accountsRes.accounts[0].accountId, '77889900');
      assert.equal(accountsRes.accounts[1].platform, 'microsoft');
      assert.equal(accountsRes.accounts[1].accountId, '554433');

      // 2. feed_health_summary
      const summaryRes = parseToolJson(
        await client.callTool({
          name: 'feed_health_summary',
          arguments: { platform: 'both' }
        })
      );
      assert.equal(summaryRes.accountIssues.length, 1);
      assert.equal(
        summaryRes.accountIssues[0].code,
        'account_misrepresentation_warning'
      );
      assert.equal(summaryRes.dataSources.length, 2);
      assert.equal(summaryRes.productHealth.google.counts.total, 4);
      assert.equal(summaryRes.productHealth.google.counts.approved, 2);
      assert.equal(summaryRes.productHealth.google.counts.disapproved, 2);
      assert.equal(summaryRes.productHealth.microsoft.counts.total, 3);
      assert.equal(summaryRes.productHealth.microsoft.counts.approved, 1);
      assert.equal(summaryRes.productHealth.microsoft.counts.disapproved, 2);
      assert.ok(summaryRes.crossPlatformDiscrepancyCount >= 5);

      // 3. list_disapprovals
      const disapprovalsRes = parseToolJson(
        await client.callTool({
          name: 'list_disapprovals',
          arguments: {
            platform: 'both',
            severity: 'disapproval'
          }
        })
      );
      assert.equal(disapprovalsRes.totalMatchingProducts, 4);
      const sku102Google = disapprovalsRes.disapprovals.find(
        (p: any) => p.sku === 'SKU-102' && p.platform === 'google'
      );
      assert.ok(sku102Google);
      assert.equal(sku102Google.issues[0].code, 'price_mismatch');
      assert.equal(
        sku102Google.issues[0].diagnostic.actualOffendingValue,
        '199.00 USD'
      );

      // 4. diagnose_product (with live landing page check!)
      const diag102 = parseToolJson(
        await client.callTool({
          name: 'diagnose_product',
          arguments: {
            sku: 'SKU-102',
            checkLandingPage: true
          }
        })
      );
      assert.equal(diag102.found, true);
      assert.equal(diag102.google.price.formatted, '199.00 USD');
      assert.equal(diag102.microsoft.price.formatted, '209.00 USD');
      assert.equal(diag102.landingPage.price.formatted, '219.00 USD');
      const lpPriceDisc = diag102.crossFeedAndLandingPageDiscrepancies.find(
        (d: any) => d.type === 'landing_page_price_mismatch'
      );
      assert.ok(lpPriceDisc, 'Should detect landing page price mismatch');
      assert.ok(lpPriceDisc.summary.includes('219.00 USD'));

      // 5. compare_platforms (cross-feed checks + landing page checks)
      const compareRes = parseToolJson(
        await client.callTool({
          name: 'compare_platforms',
          arguments: {
            checkLandingPagesForDiscrepancies: true
          }
        })
      );
      assert.equal(compareRes.googleSkuCount, 4);
      assert.equal(compareRes.microsoftSkuCount, 3);
      assert.ok(compareRes.countsByType.approval_asymmetry >= 2);
      assert.equal(compareRes.countsByType.missing_on_platform, 1); // SKU-104 missing on Microsoft
      assert.ok(compareRes.countsByType.attribute_backfill_opportunity >= 2); // SKU-101 GTIN + Brand backfill to Microsoft
      assert.ok(compareRes.countsByType.landing_page_price_mismatch >= 1);
      assert.ok(compareRes.countsByType.landing_page_availability_mismatch >= 1);

      // 6. fix_plan
      const planRes = parseToolJson(
        await client.callTool({
          name: 'fix_plan',
          arguments: {
            platform: 'both',
            checkLandingPages: true
          }
        })
      );
      assert.ok(planRes.totalFixItems >= 4);
      assert.equal(planRes.fixPlan[0].category, 'account_blocker');
      assert.equal(planRes.fixPlan[1].category, 'cross_feed_backfill');
      const sku101BackfillPatch =
        planRes.fixPlan[1].supplementalFeedPatchPreview.find(
          (row: any) =>
            row.sku === 'SKU-101' &&
            row.targetPlatform === 'microsoft' &&
            row.attribute === 'gtin'
        );
      assert.ok(sku101BackfillPatch);
      assert.equal(sku101BackfillPatch.suggestedValue, '00881234567891');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('serves stateless Streamable HTTP transport with per-request encrypted Bearer token', async () => {
    const encryptedBearer = encryptStatelessTokenBundle(
      {
        googleAccessToken: 'ya29.http-token',
        microsoftAccessToken: 'ms.http-token',
        microsoftDeveloperToken: 'dev-http-token',
        exp: Math.floor(Date.now() / 1000) + 3600
      },
      TEST_ENV.FEED_DOCTOR_TOKEN_SECRET
    );

    const handler = createStreamableHttpFetchHandler({
      env: { FEED_DOCTOR_TOKEN_SECRET: TEST_ENV.FEED_DOCTOR_TOKEN_SECRET },
      fetchFn: createMockFetch()
    });

    // Check /health endpoint
    const healthRes = await handler(new Request('http://localhost/health'));
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as Record<string, unknown>;
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.stateless, true);

    // Connect MCP Client over StreamableHTTPClientTransport using in-memory fetch
    const transport = new StreamableHTTPClientTransport(
      new URL('http://localhost/mcp'),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${encryptedBearer}`
          }
        },
        fetch: async (input, init) => {
          const req = new Request(input, init);
          return handler(req);
        }
      }
    );

    const client = new Client({ name: 'http-test-client', version: '1.0.0' });
    await client.connect(transport);
    try {
      const result = parseToolJson(
        await client.callTool({
          name: 'list_accounts',
          arguments: { platform: 'both' }
        })
      );
      assert.equal(result.totalAccounts, 2);
      assert.equal(result.accounts[0].accountId, '77889900');
      assert.equal(result.accounts[1].accountId, '554433');
    } finally {
      await client.close();
    }
  });

  it('supports direct WebStandardStreamableHTTPServerTransport stateless POST and StdioServerTransport over streams', async () => {
    // 1. Direct stateless WebStandardStreamableHTTPServerTransport
    const initReq = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'x-google-access-token': 'ya29.direct-stateless'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'stateless-probe', version: '1.0.0' }
        }
      })
    });
    const initRes = await handleStatelessStreamableHttpRequest(initReq, {
      fetchFn: createMockFetch()
    });
    assert.equal(initRes.status, 200);
    assert.equal(initRes.headers.get('mcp-session-id'), null);
    const initBody = (await initRes.json()) as Record<string, any>;
    assert.equal(initBody.result?.serverInfo?.name, 'feed-doctor-mcp');

    // 2. StdioServerTransport over in-memory streams
    const stdinStream = new PassThrough();
    const stdoutStream = new PassThrough();
    const stdioTransport = new StdioServerTransport(stdinStream, stdoutStream);
    const { server } = await connectStdioServer(
      { env: TEST_ENV, fetchFn: createMockFetch() },
      stdioTransport
    );
    try {
      assert.equal(server.isConnected(), true);
    } finally {
      await server.close();
    }
  });

  it('handles missing SKU gracefully and refuses missing credentials with clear guidance', async () => {
    const server = createFeedDoctorServer({
      env: {},
      fetchFn: createMockFetch()
    });
    const client = new Client({ name: 'edge-case-client', version: '1.0.0' });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      // Missing credentials should return tool error
      const noCredsRes = await client.callTool({
        name: 'list_accounts',
        arguments: { platform: 'both' }
      });
      assert.equal(noCredsRes.isError, true);

      // Per-call credential override with unknown SKU
      const unknownSku = parseToolJson(
        await client.callTool({
          name: 'diagnose_product',
          arguments: {
            sku: 'SKU-DOES-NOT-EXIST',
            credentials: {
              googleAccessToken: 'ya29.override-tok',
              microsoftAccessToken: 'ms.override-tok'
            }
          }
        })
      );
      assert.equal(unknownSku.found, false);
      assert.ok(unknownSku.message.includes('SKU-DOES-NOT-EXIST'));
    } finally {
      await client.close();
      await server.close();
    }
  });
});
