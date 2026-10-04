# GabaoFlix

Streaming à la demande. Un membre cherche un titre, le demande avec ses préférences, le staff l'uploade (ou refuse avec une raison), et le membre reçoit un lien privé valable 7 jours.

## Stack

| Couche | Choix |
|---|---|
| App | Next.js 16 (App Router, server actions), React 19, Tailwind 4, Motion |
| Base | PostgreSQL + Drizzle ORM |
| Métadonnées | TMDB (cache local dans `titles`, sert à la recherche et aux analytics) |
| Vidéo | ffmpeg → HLS multi-débit (360p à 4K selon la source), lecteur hls.js |
| Jobs | file durable dans Postgres (`jobs`), traitée par `worker/` |
| Mail | SMTP via nodemailer |
| WhatsApp | WhatsApp Cloud API (Meta), envoi et réception de notes vocales |

## Démarrer

```bash
cp .env.example .env            # remplir DATA_ENC_KEY, HASH_PEPPER (openssl rand -base64 32), TMDB_TOKEN...
npm install
npm run db:migrate
npm run db:seed                 # crée le compte DEV depuis SEED_DEV_*
npm run db:demo                 # optionnel : 80 membres fictifs pour remplir le dashboard
npm run dev                     # app
npm run worker                  # encodage, mails, WhatsApp (autre terminal)
```

`ffmpeg` et `ffprobe` doivent être installés sur la machine du worker. Sans `SMTP_URL`, les mails s'affichent dans la console du worker, adresse masquée.

## Rôles

| | Membre | Uploader | Modo | Dev |
|---|:-:|:-:|:-:|:-:|
| Chercher, demander, regarder | ✓ | ✓ | ✓ | ✓ |
| File des demandes, upload, refus | | ✓ | ✓ | ✓ |
| Voir le backlog d'erreurs | | ✓ | ✓ | ✓ |
| Résoudre les erreurs | | | ✓ | ✓ |
| Insights (dashboard) | | | ✓ | ✓ |
| Gérer les membres (ban, rôle jusqu'à Uploader) | | | ✓ | ✓ |
| Nommer Modo / Dev, purger le backlog | | | | ✓ |

## Anonymat et sécurité

- **Email jamais en clair.** Chiffré en AES-256-GCM (`DATA_ENC_KEY`). La connexion et l'unicité passent par un index aveugle HMAC-SHA256 (`HASH_PEPPER`). Le worker ne déchiffre l'adresse qu'au moment d'envoyer, et la file de jobs ne contient qu'un id utilisateur. Le numéro WhatsApp suit le même schéma.
- **Pas d'IP stockée.** Le pays vient de l'en-tête du CDN ou du reverse proxy (`cf-ipcountry`, `x-vercel-ip-country`, `x-country-code`). L'IP ne sert qu'en mémoire, hashée, pour limiter les abus.
- **Pas d'identité.** Pseudo, tranche d'âge, genre facultatif. Pas de nom ni de date de naissance.
- **Mots de passe** en Argon2id (paramètres OWASP), comparaison à temps constant même quand le compte n'existe pas.
- **Pas d'énumération.** L'inscription répond pareil qu'un email soit déjà pris ou non.
- **Sessions** : cookie httpOnly, SameSite=Lax. En base, seul le SHA-256 du jeton est gardé.
- **Liens privés** : jeton aléatoire de 192 bits, dont seul le hash est en base. Ils sont liés au compte (inutiles sans la session du destinataire), expirent après 7 jours et sont révoqués au bannissement.
- **Stream** : chaque playlist et chaque segment passent par `/api/stream`, qui vérifie la session, le lien, l'expiration et le ban. Liste blanche de chemins, pas de traversée de dossiers, cache `private`.
- **CSP** avec nonce par requête (`src/proxy.ts`), HSTS, `frame-ancestors 'none'`, pas de referrer.
- **Suppression du compte** : effacement en cascade. Les analytics ne gardent que des instantanés anonymes (âge, genre, pays).

En production : mettre l'app derrière Cloudflare (ou nginx + GeoIP2) pour le pays et le TLS, et garder `.env` hors du dépôt.

## Moteur de stream

- Échelle de débits alignée sur une grille de keyframes de 4 s : le changement de qualité tombe toujours sur une frontière de segment, sans saut.
- Pistes audio multiples (VF/VO) en groupe de rendus HLS. Les sous-titres intégrés et ceux uploadés (.srt/.vtt) sont convertis en WebVTT.
- Côté lecteur : ABR hls.js plafonné à la taille de l'écran, buffer de 40 s et retries exponentiels sur les fragments. Récupération des erreurs média (`recoverMediaError`, puis swap codec audio, puis reconstruction complète à la même position). Watchdog anti-blocage après 7 s. HLS natif en repli sur les vieux iOS.
- La qualité demandée sert de plafond par défaut, et la piste audio et les sous-titres demandés sont présélectionnés. Reprise là où on s'était arrêté.
- Mobile : double-tap à gauche ou à droite pour ±10 s, plein écran avec verrouillage paysage, PiP.

## Données récoltées (Insights)

- **Préférences** par tranche d'âge × genre de film, par sexe, et par récence du titre (moins d'un an, 1 à 5 ans, 5 à 15 ans, classiques). Calculées sur les demandes et les lectures, avec un instantané démographique pris à chaque événement.
- **Pays** et appareil de connexion.
- **Concentration** : durée de lecture continue entre deux pauses (`focus_spans`), médiane par âge, pauses par film.
- **Temps sur la plateforme** par session : heartbeats, seul le temps où l'onglet est visible compte, nouvelle session après 30 min d'inactivité.
- **Avis vocaux** : enregistrés à la fin du film, ou reçus par WhatsApp (webhook `/api/whatsapp`, signature vérifiée).

## WhatsApp

1. Créer une app Meta avec le produit WhatsApp, puis renseigner `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET` et `WA_VERIFY_TOKEN`.
2. Webhook : `https://<domaine>/api/whatsapp`, abonnement `messages`.
3. Les messages à l'initiative de l'entreprise exigent un template approuvé : `WA_TEMPLATE_READY` (paramètres titre, lien) et `WA_TEMPLATE_FEEDBACK` (paramètre titre). Sans template, le texte n'est remis que dans la fenêtre de 24 h.
4. Le membre ajoute son numéro dans Moi → Réglages.
