# Kura Space — version Supabase complète, sans Flask

Ce dossier est la version statique complète du site. `app.py`, Flask et
SQLite ne sont plus nécessaires. Supabase fournit l’authentification admin,
la base de données et le stockage des images.

## 1. Créer le projet Supabase

1. Crée un projet dans Supabase.
2. Ouvre **SQL Editor**.
3. Exécute tout le fichier `supabase-schema.sql`.
4. Facultatif : exécute ensuite `migrate-existing-data.sql` pour reprendre
   les réglages et créneaux de l’ancien fichier `kura.db`.

## 2. Créer le compte administrateur

1. Ouvre **Authentication → Users**.
2. Crée un utilisateur avec ton courriel et un mot de passe fort.
3. Copie le UUID de cet utilisateur.
4. Dans **SQL Editor**, exécute :

```sql
insert into public.admin_users (user_id)
values ('COLLE-LE-UUID-ICI')
on conflict (user_id) do nothing;
```

## 3. Relier les pages au projet

Dans **Project Settings → API** (ou le panneau Connect), récupère :

- l’URL du projet;
- la clé **publishable** ou **anon**.

Ouvre `supabase-config.js` et remplace les trois valeurs :

```js
window.KURA_SUPABASE = Object.freeze({
  url: "https://TON-PROJET.supabase.co",
  publishableKey: "TA_CLE_PUBLISHABLE_OU_ANON",
  adminEmail: "TON_COURRIEL_ADMIN",
  storageBucket: "project-images"
});
```

Ne mets jamais une clé `service_role`, une clé secrète ou un mot de passe
dans ce fichier.

## 4. Déployer

Déploie tout le contenu de ce dossier sur ton hébergement statique habituel.
Les pages principales sont :

- `admin.html`
- `booking.html`
- `our-work.html`
- `project.html?id=1`

`setup-check.html` permet de vérifier la configuration après le déploiement.

## Ce qui est protégé

- Les visiteurs peuvent lire les projets, images publiques, témoignages actifs,
  réglages publics et créneaux libres.
- Les visiteurs peuvent réserver ou rejoindre la liste d’attente par des
  fonctions SQL contrôlées.
- Les visiteurs ne peuvent pas lire les réservations ou la liste d’attente.
- Seuls les comptes ajoutés dans `admin_users` peuvent gérer le site.
- Les images sont publiques à l’affichage, mais seuls les administrateurs
  autorisés peuvent les téléverser ou les supprimer.

## Fichiers importants

- `supabase-schema.sql` : tables, fonctions, RLS, Storage et données initiales.
- `supabase-config.js` : tes trois valeurs de connexion.
- `supabase-client.js` : client partagé et fonctions utilitaires.
- `admin.js` : administration complète.
- `booking.js` : calendrier, réservation et liste d’attente.
- `portfolio.js` : page publique des projets et témoignages.
- `project.js` : page détaillée d’un projet.
- `kura-supabase.css` : styles ajoutés à ton `styles.css` existant.

## Important

Le site n’a plus besoin d’un serveur Flask que tu dois démarrer. Il utilise
cependant Supabase comme service cloud, donc les fonctions dynamiques exigent
une connexion Internet et un projet Supabase configuré.
