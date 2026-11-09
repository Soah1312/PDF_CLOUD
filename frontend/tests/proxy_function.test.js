import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';

test('1. API Proxy Routing: preserves pathname and query parameters', async () => {
  let capturedUrl = null;
  let capturedOptions = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return new Response(JSON.stringify({ status: 'healthy' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const incomingRequest = new Request(
    'https://cloudpdf.pages.dev/api/v1/files?page=2&status=COMPLETED',
    {
      method: 'GET',
      headers: { 'User-Agent': 'CloudPDF-Browser' },
    }
  );

  const context = {
    request: incomingRequest,
    env: { API_ORIGIN: 'http://13.126.230.166' },
  };

  const response = await onRequest(context);
  assert.equal(response.status, 200);
  assert.equal(
    capturedUrl,
    'http://ec2-13-126-230-166.ap-south-1.compute.amazonaws.com/api/v1/files?page=2&status=COMPLETED'
  );
  assert.equal(capturedOptions.method, 'GET');
  assert.equal(capturedOptions.headers.get('Host'), 'ec2-13-126-230-166.ap-south-1.compute.amazonaws.com');
  assert.equal(capturedOptions.headers.get('X-Forwarded-Host'), 'cloudpdf.pages.dev');
});

test('2. Header Forwarding: preserves Authorization and X-Guest-Session-ID headers', async () => {
  let capturedHeaders = null;

  globalThis.fetch = async (url, options) => {
    capturedHeaders = options.headers;
    return new Response(JSON.stringify({ user: 'authenticated' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const incomingRequest = new Request('https://cloudpdf.pages.dev/api/v1/auth/me', {
    method: 'GET',
    headers: {
      Authorization: 'Bearer mock-cognito-jwt-token-12345',
      'X-Guest-Session-ID': 'guest-session-uuid-67890',
      'CF-Connecting-IP': '203.0.113.42',
    },
  });

  const context = {
    request: incomingRequest,
    env: { API_ORIGIN: 'http://ec2.cloudpdf.internal' },
  };

  const response = await onRequest(context);
  assert.equal(response.status, 200);
  assert.equal(
    capturedHeaders.get('Authorization'),
    'Bearer mock-cognito-jwt-token-12345'
  );
  assert.equal(
    capturedHeaders.get('X-Guest-Session-ID'),
    'guest-session-uuid-67890'
  );
  assert.equal(capturedHeaders.get('X-Real-IP'), '203.0.113.42');
});

test('3. Multipart Form-Data Uploads: forwards method, content-type, and payload stream', async () => {
  let capturedOptions = null;

  globalThis.fetch = async (url, options) => {
    capturedOptions = options;
    return new Response(JSON.stringify({ job_id: 'job-abc-123', status: 'PENDING' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const formData = new FormData();
  formData.append(
    'file',
    new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' }),
    'sample.pdf'
  );

  const incomingRequest = new Request('https://cloudpdf.pages.dev/api/v1/files/upload', {
    method: 'POST',
    body: formData,
  });

  const context = {
    request: incomingRequest,
    env: { API_ORIGIN: 'http://13.126.230.166' },
  };

  const response = await onRequest(context);
  assert.equal(response.status, 200);
  assert.equal(capturedOptions.method, 'POST');
  assert.match(
    capturedOptions.headers.get('Content-Type'),
    /multipart\/form-data/
  );
  assert.ok(capturedOptions.body);
  assert.equal(capturedOptions.duplex, 'half');
});

test('4. S3 Presigned URL Redirects: preserves 307 redirect and Location header without rewriting', async () => {
  const s3PresignedUrl =
    'https://cloudpdf-studio-storage-2026.s3.ap-south-1.amazonaws.com/users/sub/doc.pdf?X-Amz-Signature=abc123';

  globalThis.fetch = async (url, options) => {
    // Assert redirect is set to manual
    assert.equal(options.redirect, 'manual');
    return new Response(null, {
      status: 307,
      statusText: 'Temporary Redirect',
      headers: {
        Location: s3PresignedUrl,
        'X-Guest-Session-ID': 'session-456',
      },
    });
  };

  const incomingRequest = new Request(
    'https://cloudpdf.pages.dev/api/v1/files/file-id-123/download',
    {
      method: 'GET',
    }
  );

  const context = {
    request: incomingRequest,
    env: { API_ORIGIN: 'http://13.126.230.166' },
  };

  const response = await onRequest(context);
  assert.equal(response.status, 307);
  // Crucial check: Location header is untouched and not rewritten
  assert.equal(response.headers.get('Location'), s3PresignedUrl);
  assert.equal(response.headers.get('X-Guest-Session-ID'), 'session-456');
});

test('5. Cache Prevention: strictly injects no-store and no-cache headers', async () => {
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ data: 'dynamic' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const incomingRequest = new Request('https://cloudpdf.pages.dev/api/v1/pdf/merge', {
    method: 'POST',
  });

  const context = {
    request: incomingRequest,
    env: { API_ORIGIN: 'http://13.126.230.166' },
  };

  const response = await onRequest(context);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.match(response.headers.get('Cache-Control'), /no-cache/);
  assert.equal(response.headers.get('Pragma'), 'no-cache');
});

test('6. Error Handling: returns 502 when API_ORIGIN is missing', async () => {
  const incomingRequest = new Request('https://cloudpdf.pages.dev/api/health');
  const context = {
    request: incomingRequest,
    env: {}, // API_ORIGIN missing
  };

  const response = await onRequest(context);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.match(body.detail, /API_ORIGIN/);
});

test('7. Error Handling: returns 502 without leaking credentials on network failure', async () => {
  globalThis.fetch = async () => {
    throw new Error('Connection refused to 13.126.230.166:80');
  };

  const incomingRequest = new Request('https://cloudpdf.pages.dev/api/health');
  const context = {
    request: incomingRequest,
    env: { API_ORIGIN: 'http://13.126.230.166' },
  };

  const response = await onRequest(context);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.detail, 'Failed to connect to upstream CloudPDF Studio API service.');
  // Ensure the EC2 IP is NOT leaked in the response body
  assert.ok(!JSON.stringify(body).includes('13.126.230.166'));
});

