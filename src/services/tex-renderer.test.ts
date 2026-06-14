import { describe, it, expect } from "vitest";
import { joinPath, isAbsolutePath, isUrl, resolveImageSrc } from "./tex-renderer";

describe("joinPath", () => {
  it("joins a relative path against a posix base", () => {
    expect(joinPath("/Users/me/docs", "foo.png")).toBe("/Users/me/docs/foo.png");
  });

  it("resolves .. correctly", () => {
    expect(joinPath("/Users/me/docs/sub", "../foo.png")).toBe("/Users/me/docs/foo.png");
  });

  it("returns rel unchanged when rel is already absolute", () => {
    expect(joinPath("/Users/me/docs", "/etc/foo.png")).toBe("/etc/foo.png");
  });

  it("returns rel unchanged when rel is a URL", () => {
    expect(joinPath("/Users/me/docs", "https://example.com/foo.png")).toBe("https://example.com/foo.png");
  });
});

describe("isAbsolutePath", () => {
  it("recognizes posix absolute", () => {
    expect(isAbsolutePath("/Users/foo")).toBe(true);
  });
  it("recognizes windows absolute", () => {
    expect(isAbsolutePath("C:\\Users\\foo")).toBe(true);
  });
  it("rejects relative", () => {
    expect(isAbsolutePath("foo/bar")).toBe(false);
  });
});

describe("isUrl", () => {
  it("recognizes http/https/data/asset/blob", () => {
    expect(isUrl("https://x.com/a.png")).toBe(true);
    expect(isUrl("data:image/png;base64,xxx")).toBe(true);
    expect(isUrl("asset://abc")).toBe(true);
    expect(isUrl("blob:http://x.com/abc")).toBe(true);
  });
  it("rejects plain paths", () => {
    expect(isUrl("foo.png")).toBe(false);
    expect(isUrl("/abs/foo.png")).toBe(false);
  });
});

describe("resolveImageSrc", () => {
  const convert = (p: string) => `convert://${p}`;

  it("leaves URLs unchanged", () => {
    expect(resolveImageSrc("https://x.com/a.png", "/base", convert)).toBe("https://x.com/a.png");
  });

  it("converts absolute paths via convertPath", () => {
    expect(resolveImageSrc("/abs/a.png", "/base", convert)).toBe("convert:///abs/a.png");
  });

  it("resolves relative against baseDir then converts", () => {
    expect(resolveImageSrc("a.png", "/base/sub", convert)).toBe("convert:///base/sub/a.png");
  });
});
