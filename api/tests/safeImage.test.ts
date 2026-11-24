import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import { EventEmitter } from "node:events";
import { isPublicAddress, safeImageBuffer } from "../src/lib/safeImage.js";
import { localUploadName, presentMedia } from "../src/lib/media.js";

test("PDF images deny private, loopback, metadata, mapped and special-use addresses", async () => {
  for (const ip of ["0.0.0.0", "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "198.18.0.1", "224.0.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::", "3fff::1"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888"]) assert.equal(isPublicAddress(ip), true, ip);
  for (const url of ["http://127.0.0.1/private", "http://2130706433/private", "http://[::ffff:127.0.0.1]/private", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd", "ftp://example.com/image.jpg", "http://user:password@8.8.8.8/image.jpg"]) assert.equal(await safeImageBuffer(url), null, url);
});

test("local images cannot escape the uploads directory or load active content", () => {
  assert.equal(localUploadName("http://localhost:4000/uploads/photo.jpg"), "photo.jpg");
  for (const value of ["http://localhost:4000/uploads/file.html", "http://localhost:4000/uploads/a%2Fb.png", "http://localhost:4000/uploads/%2e%2e%2fsecret.png", "http://127.0.0.1:4000/uploads/photo.png", "http://localhost:4000/uploads/photo.svg"]) assert.equal(localUploadName(value), null, value);
});

test("PDF fetches pin checked addresses and revalidate redirect destinations", async (context) => {
  let requests = 0;
  context.mock.method(http, "get", (_url: URL, options: http.RequestOptions, callback: (response: unknown) => void) => {
    requests++;
    assert.equal(options.family, 4);
    const lookup = options.lookup as Function;
    lookup("8.8.8.8", {}, (error: unknown, address: string) => {
      assert.equal(error, null);
      assert.equal(address, "8.8.8.8");
    });
    const response = Object.assign(new EventEmitter(), { statusCode: 302, headers: { location: "http://127.0.0.1/private" }, destroy() {} });
    queueMicrotask(() => callback(response));
    return new EventEmitter();
  });
  assert.equal(await safeImageBuffer("http://8.8.8.8/image.png"), null);
  assert.equal(requests, 1, "private redirect must never open another connection");
});

test("PDF fetching stops oversized responses before buffering the entire body", async (context) => {
  for (const headers of [{ "content-length": "10000" }, {}]) {
    let destroyed = false;
    const mock = context.mock.method(http, "get", (_url: URL, _options: http.RequestOptions, callback: (response: unknown) => void) => {
      const response = Object.assign(new EventEmitter(), { statusCode: 200, headers, destroy() { destroyed = true; } });
      queueMicrotask(() => {
        callback(response);
        if (!destroyed) response.emit("data", Buffer.alloc(1025));
      });
      return new EventEmitter();
    });
    assert.equal(await safeImageBuffer("http://8.8.8.8/image.png", 1024), null);
    assert.equal(destroyed, true);
    mock.mock.restore();
  }
});

test("historical localhost media URLs rebase without changing dates or external images", () => {
  const oldOrigin = process.env.PUBLIC_API_URL;
  process.env.PUBLIC_API_URL = "https://api.example.com";
  try {
    const date = new Date();
    const data = { nested: { coverUrl: "http://localhost:4000/uploads/photo.jpg", photoUrls: ["https://images.example.com/photo.jpg"] }, date };
    assert.deepEqual(presentMedia(data), { nested: { coverUrl: "https://api.example.com/uploads/photo.jpg", photoUrls: ["https://images.example.com/photo.jpg"] }, date });
    assert.equal(data.nested.coverUrl, "http://localhost:4000/uploads/photo.jpg");
  } finally {
    if (oldOrigin === undefined) delete process.env.PUBLIC_API_URL;
    else process.env.PUBLIC_API_URL = oldOrigin;
  }
});
