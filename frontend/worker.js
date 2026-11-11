export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Proxy /api/* requests to the AWS EC2 FastAPI backend
    if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
      const origin = env.API_ORIGIN;
      if (!origin) {
        return new Response(
          JSON.stringify({
            detail: "API_ORIGIN environment variable is not configured.",
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
        let baseOrigin = origin.trim().replace(/\/+$/, "");
        if (!baseOrigin.startsWith("http://") && !baseOrigin.startsWith("https://")) {
          baseOrigin = `http://${baseOrigin}`;
        }
        const targetUrl = new URL(`${baseOrigin}${url.pathname}${url.search}`);

        // Cloudflare Workers restricts direct raw IP fetch() calls (Error 1003).
        // If an AWS EC2 IPv4 address is provided, resolve to the canonical AWS EC2 hostname.
        const ipMatch = targetUrl.hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (ipMatch) {
          targetUrl.hostname = `ec2-${ipMatch[1]}-${ipMatch[2]}-${ipMatch[3]}-${ipMatch[4]}.ap-south-1.compute.amazonaws.com`;
        }

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

        forwardHeaders.set("Host", targetUrl.host);

        const clientIp =
          request.headers.get("CF-Connecting-IP") ||
          request.headers.get("X-Forwarded-For") ||
          request.headers.get("X-Real-IP");
        if (clientIp) {
          forwardHeaders.set("X-Real-IP", clientIp.split(",")[0].trim());
          forwardHeaders.set("X-Forwarded-For", clientIp);
        }
        forwardHeaders.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
        forwardHeaders.set("X-Forwarded-Host", url.host);

        const method = request.method.toUpperCase();
        const fetchOptions = {
          method,
          headers: forwardHeaders,
          redirect: "manual",
        };

        if (!["GET", "HEAD"].includes(method)) {
          fetchOptions.body = request.body;
          fetchOptions.duplex = "half";
        }

        const upstreamResponse = await fetch(targetUrl.toString(), fetchOptions);

        const responseHeaders = new Headers();
        for (const [key, value] of upstreamResponse.headers.entries()) {
          const lowerKey = key.toLowerCase();
          if (!hopByHopHeaders.has(lowerKey)) {
            responseHeaders.set(key, value);
          }
        }

        responseHeaders.set(
          "Cache-Control",
          "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
        );
        responseHeaders.set("Pragma", "no-cache");
        responseHeaders.set(
          "Access-Control-Expose-Headers",
          "*, X-Guest-Session-ID, x-guest-session-id, Content-Disposition"
        );

        const isRedirect = [301, 302, 303, 307, 308].includes(upstreamResponse.status);
        const responseBody = isRedirect || method === "HEAD" ? null : upstreamResponse.body;

        return new Response(responseBody, {
          status: upstreamResponse.status,
          statusText: upstreamResponse.statusText,
          headers: responseHeaders,
        });
      } catch (error) {
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

    // Serve static SPA assets from ./dist with SPA fallback
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && request.method === 'GET') {
      const fallbackReq = new Request(new URL('/', request.url), request);
      response = await env.ASSETS.fetch(fallbackReq);
    }
    return response;
  },
};

