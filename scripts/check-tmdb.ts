/**
 * npm run check:tmdb
 * Tests the TMDB key and the network path step by step, and says in plain words what is wrong.
 */
import { lookup } from "node:dns/promises";
import { useEnvProxy } from "@/lib/net";

const ok = (m: string) => console.log(`  OK   ${m}`);
const ko = (m: string) => console.log(`  KO   ${m}`);
const info = (m: string) => console.log(`       ${m}`);

const errText = (e: unknown) => {
  const err = e as { message?: string; cause?: { code?: string; message?: string } };
  return [err.cause?.code, err.cause?.message, err.message].filter(Boolean).join(" | ");
};

async function main() {
  console.log("\nDiagnostic TMDB\n");

  const proxy = useEnvProxy();
  if (proxy) ok(`Proxy utilisé : ${proxy}`);
  else info("Aucun proxy configuré (HTTPS_PROXY vide).");

  const raw = process.env.TMDB_TOKEN ?? "";
  const token = raw.trim();
  if (!token) {
    ko("TMDB_TOKEN est vide ou le fichier .env n'est pas lu.");
    info("Vérifie que le fichier s'appelle exactement .env (pas .env.txt) et qu'il est dans le dossier du projet.");
    return;
  }
  if (/\s/.test(token)) {
    ko("La clé contient un espace ou un retour à la ligne au milieu.");
    info("Dans .env, la clé doit tenir sur une seule ligne, sans espace.");
    return;
  }
  const kind = token.startsWith("eyJ") ? "jeton long (Read Access Token)" : /^[0-9a-f]{32}$/i.test(token) ? "clé courte (API key)" : null;
  if (kind) ok(`Clé lue : ${kind}, ${token.length} caractères`);
  else {
    ko(`Format de clé inattendu (${token.length} caractères).`);
    info("Attendu : la clé courte de 32 caractères, ou le long jeton qui commence par eyJ.");
  }

  // Behind a proxy, names are resolved by the proxy itself: a local DNS failure means nothing
  for (const host of proxy ? [] : ["api.themoviedb.org", "image.tmdb.org"]) {
    try {
      const r = await lookup(host);
      ok(`DNS ${host} -> ${r.address}`);
    } catch (e) {
      ko(`DNS ${host} introuvable (${errText(e)})`);
      info("Le réseau ne résout pas TMDB : pas d'internet, ou nom bloqué. Essaie un autre réseau (partage de connexion).");
    }
  }

  const url = new URL("https://api.themoviedb.org/3/trending/all/week?language=fr-FR");
  const headers: Record<string, string> = { accept: "application/json" };
  if (token.startsWith("eyJ")) headers.Authorization = `Bearer ${token}`;
  else url.searchParams.set("api_key", token);

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (res.status === 401) {
      ko("TMDB répond 401 : la clé est refusée.");
      info("Recopie-la depuis themoviedb.org > Paramètres > API, sans espace.");
      return;
    }
    if (!res.ok) {
      ko(`TMDB répond ${res.status}.`);
      info((await res.text()).slice(0, 200));
      return;
    }
    const data = (await res.json()) as { results: { poster_path: string | null }[] };
    const withPoster = data.results.filter((r) => r.poster_path);
    ok(`API TMDB : ${data.results.length} titres tendance, ${withPoster.length} avec affiche`);
    if (withPoster[0]) {
      const img = `https://image.tmdb.org/t/p/w342${withPoster[0].poster_path}`;
      try {
        const r = await fetch(img, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
        if (r.ok) ok("Images TMDB accessibles depuis le serveur");
        else ko(`Images TMDB : réponse ${r.status}`);
      } catch (e) {
        ko(`Images TMDB injoignables depuis le serveur (${errText(e)})`);
      }
      info(`Teste aussi dans ton navigateur : ${img}`);
      info("Si l'image ne s'affiche pas dans le navigateur, c'est ce réseau qui bloque image.tmdb.org.");
    }
    console.log("\nTout est bon côté serveur. Relance npm run dev pour que le site reprenne la clé.\n");
  } catch (e) {
    const t = errText(e);
    ko(`Impossible de joindre api.themoviedb.org (${t})`);
    if (/Proxy response|cancelled|407|403/i.test(t) && proxy) {
      info("Le proxy refuse la connexion vers TMDB (bloqué par la politique du réseau, ou identifiants du proxy manquants).");
      info("Essaie depuis un autre réseau, ou demande à l'informatique d'autoriser api.themoviedb.org et image.tmdb.org.");
    } else if (/CERT|certificate|self.signed/i.test(t)) {
      info("Le réseau intercepte le HTTPS (proxy d'entreprise avec son propre certificat).");
      info("Ajoute dans .env : NODE_EXTRA_CA_CERTS=C:\\chemin\\vers\\certificat-entreprise.pem");
    } else if (/ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|TimeoutError|ECONNREFUSED|ENETUNREACH|ECONNRESET/i.test(t)) {
      info("La connexion directe est bloquée : ce réseau passe sans doute par un proxy.");
      info("Trouve son adresse avec : netsh winhttp show proxy  (ou Paramètres > Réseau > Proxy)");
      info("Puis ajoute dans .env : HTTPS_PROXY=http://adresse-du-proxy:port");
    } else if (/ENOTFOUND|EAI_AGAIN/i.test(t)) {
      info("Le nom n'est pas résolu : pas d'internet ou DNS bloqué. Essaie un autre réseau.");
    } else {
      info("Envoie-moi cette ligne telle quelle.");
    }
  }
}

main().then(() => process.exit(0));
