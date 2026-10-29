import { execFileSync } from "node:child_process";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

let done = false;

export type SystemProxy = { server: string | null; pac: string | null };

/**
 * The proxy Windows itself uses (Settings > Network > Proxy), the one browsers follow.
 * A PAC script (automatic configuration) is reported but can't be followed from here.
 */
export function windowsProxy(): SystemProxy {
  if (process.platform !== "win32") return { server: null, pac: null };
  try {
    const out = execFileSync("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"], { encoding: "utf8", timeout: 3000, windowsHide: true });
    const value = (name: string) => out.match(new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.+)$`, "mi"))?.[1].trim() ?? null;
    const enabled = value("ProxyEnable") === "0x1";
    // "host:port" or "http=host:port;https=host:port"
    const raw = enabled ? value("ProxyServer") : null;
    const server = raw ? (raw.match(/https=([^;]+)/)?.[1] ?? raw.match(/http=([^;]+)/)?.[1] ?? raw.split(";")[0]).replace(/^(?!\w+:\/\/)/, "http://") : null;
    return { server, pac: value("AutoConfigURL") };
  } catch {
    return { server: null, pac: null };
  }
}

/**
 * Node's fetch ignores the proxy settings that browsers use. HTTPS_PROXY in .env wins; without it,
 * the proxy set in Windows is picked up. TMDB, mails and transcription then go out through it.
 */
export function useEnvProxy(): string | null {
  if (done) return null;
  done = true;
  let proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxy) {
    const sys = windowsProxy().server;
    if (sys) process.env.HTTPS_PROXY = proxy = sys;
  }
  if (!proxy) return null;
  if (!process.env.NO_PROXY && !process.env.no_proxy) process.env.NO_PROXY = "localhost,127.0.0.1,::1";
  setGlobalDispatcher(new EnvHttpProxyAgent());
  return proxy.replace(/\/\/[^@/]*@/, "//***@");
}
