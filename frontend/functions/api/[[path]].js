/**
 * CloudPDF Studio — Cloudflare Pages API Reverse Proxy Function
 *
 * Route: /api/* -> [[path]].js
 * Proxies all incoming /api/* calls from the Cloudflare Pages React frontend
 * to the AWS EC2 origin configured via the API_ORIGIN environment variable.
 */

export async function onRequest(context) {
  const { request, env } = context;

  // 1. Validate upstream origin configuration
  const origin = env.API_ORIGIN;
  if (!origin) {
    return new Response(
      JSON.stringify({
        detail: "API_ORIGIN environment variable is not configured on Cloudflare Pages.",
        status: 502,
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }

  try {
    const incomingUrl = new URL(request.url);
    // Strip trailing slashes from the configured origin base
    let baseOrigin = origin.trim().replace(/\/+$/, "");
    if (!baseOrigin.startsWith("http://") && !baseOrigin.startsWith("https://")) {
      baseOrigin = `http://${baseOrigin}`;
    }
    // Construct the destination URL preserving exact pathname and query string
    const targetUrl = new URL(`${baseOrigin}${incomingUrl.pathname}${incomingUrl.search}`);

    // Cloudflare Workers restricts direct raw IP fetch() calls (Error 1003).
    // If an AWS EC2 IPv4 address is provided, resolve to the canonical AWS EC2 hostname.
    const ipMatch = targetUrl.hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipMatch) {
      targetUrl.hostname = `ec2-${ipMatch[1]}-${ipMatch[2]}-${ipMatch[3]}-${ipMatch[4]}.ap-south-1.compute.amazonaws.com`;
    }

    // 2. Prepare request headers to forward upstream
    const forwardHeaders = new Headers();
    const hopByHopHeaders = new Set([
      "connection",
      "keep-alive",
      "proxy-authenticate",
      "proxy-authorization",
      "te",
      "trailers",
      "transfer-encoding",
      "upgrade",
      "host",
      "cdn-loop",
    ]);

    for (const [key, value] of request.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (!hopByHopHeaders.has(lowerKey) && !lowerKey.startsWith("cf-")) {
        forwardHeaders.set(key, value);
      }
    }

    // Set Host header to match upstream target
    forwardHeaders.set("Host", targetUrl.host);

    // Forward client IP and protocol headers
    const clientIp =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      request.headers.get("X-Real-IP");
    if (clientIp) {
      forwardHeaders.set("X-Real-IP", clientIp.split(",")[0].trim());
      forwardHeaders.set("X-Forwarded-For", clientIp);
    }
    forwardHeaders.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));
    forwardHeaders.set("X-Forwarded-Host", incomingUrl.host);

    // 3. Configure upstream fetch options
    const method = request.method.toUpperCase();
    const fetchOptions = {
      method,
      headers: forwardHeaders,
      // CRITICAL: Do NOT automatically follow 301/302/307 redirects.
      // S3 presigned URL redirects must be passed back to the client
      // so the browser downloads directly from Amazon S3.
      redirect: "manual",
    };

    // Forward payload stream for methods that permit request bodies
    if (!["GET", "HEAD"].includes(method)) {
      fetchOptions.body = request.body;
      fetchOptions.duplex = "half";
    }

    // 4. Dispatch request to upstream EC2 API
    const upstreamResponse = await fetch(targetUrl.toString(), fetchOptions);

    // 5. Build response back to the client
    const responseHeaders = new Headers();
    for (const [key, value] of upstreamResponse.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (!hopByHopHeaders.has(lowerKey)) {
        responseHeaders.set(key, value);
      }
    }

    // Strictly disable caching for all API responses
    responseHeaders.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    );
    responseHeaders.set("Pragma", "no-cache");

    // For manual redirects (301, 302, 303, 307, 308) or HEAD, body must be null
    const isRedirect = [301, 302, 303, 307, 308].includes(upstreamResponse.status);
    const responseBody = isRedirect || method === "HEAD" ? null : upstreamResponse.body;

    return new Response(responseBody, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // 6. Return safe 502 error without leaking internal origin or credentials
    return new Response(
      JSON.stringify({
        detail: "Failed to connect to upstream CloudPDF Studio API service.",
        status: 502,
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  }
}

