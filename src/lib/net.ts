import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

let done = false;

/**
 * Node's fetch ignores the proxy settings that browsers use. On a corporate network, set
 * HTTPS_PROXY (and NO_PROXY=localhost,127.0.0.1) in .env so TMDB, mails and transcription go out through it.
 */
export function useEnvProxy(): string | null {
  if (done) return null;
  done = true;
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!proxy) return null;
  if (!process.env.NO_PROXY && !process.env.no_proxy) process.env.NO_PROXY = "localhost,127.0.0.1,::1";
  setGlobalDispatcher(new EnvHttpProxyAgent());
  return proxy.replace(/\/\/[^@/]*@/, "//***@");
}
