# SCDR TV — comptes et clientèles chiffrées

Gestion de clients et d’abonnements en français, sur mobile et ordinateur.
React 19, TypeScript, Vite, fonctions Vercel et Supabase Auth/Postgres.
Production : https://app-tv-alpha.vercel.app
Projet Supabase : `woldrkevualjtdzsbcwn` (App tv, eu-west-1).

## Comptes et autorisations

Deux associés disposent de comptes administrateurs personnels. Chaque administrateur
voit toutes les clientèles et peut ajouter des sous-revendeurs depuis **Revendeurs**.
Le sous-revendeur peut consulter, ajouter, modifier et renouveler ses propres clients.
Les invitations sont liées à une adresse email, utilisables une seule fois et expirent
après sept jours. Le lien se transmet manuellement au destinataire ; aucun envoi
commercial ou automatique n’est intégré.

Les droits sont appliqués dans Postgres avec RLS. Un sous-revendeur ne peut pas
s’attribuer un rôle administrateur, changer le propriétaire d’un coffre, ni accéder
au coffre d’un autre revendeur. Les rôles et l’activation sont vérifiés en base ;
suspendre un sous-revendeur bloque immédiatement ses prochaines requêtes même si
son JWT n’est pas encore expiré. Les données déjà affichées ou exportées ne peuvent
pas être reprises à distance.

Le sélecteur **Clientèle** permet aux administrateurs d’afficher leur clientèle,
celle d’un revendeur ou l’ensemble. Dans la vue globale, un nouveau client est
rattaché à l’administrateur connecté ; sélectionner un revendeur pour créer une
fiche dans sa clientèle. La suspension concerne les comptes de revendeurs ;
les comptes administrateurs sont protégés de cette action.

## Confidentialité

Le contenu de chaque clientèle, y compris les informations de connexion et les
paramètres fournisseur, est chiffré **sur l’appareil avant envoi**. Chaque écriture
utilise une nouvelle clé AES-256-GCM et un nouvel IV. La clé AES est enveloppée
avec RSA-OAEP/SHA-256 pour le propriétaire et chacun des administrateurs actifs.
L’identité et la révision du coffre sont authentifiées avec les données. Le serveur
connaît les comptes, les rôles, l’attribution des coffres, leur taille et les dates
d’enregistrement, mais ne reçoit pas les fiches en clair.

Chaque compte possède une paire RSA de 3072 bits. Sa clé privée est chiffrée avec
PBKDF2/SHA-256 à 600 000 itérations et AES-GCM. Une copie est protégée par une clé
de récupération aléatoire de 256 bits. Le mot de passe saisi reste sur l’appareil ;
un identifiant cryptographique distinct, dérivé du mot de passe et de l’email, est
utilisé auprès de Supabase Auth. Les identifiants, mots de passe clients et serveurs sont visibles dans les fiches
déverrouillées et copiables, conformément au choix validé. Les mots de passe
d’authentification et les clés API restent masqués.

Lors de l’activation, télécharger la clé de récupération et la conserver hors de
l’appareil. La récupération utilise cette clé pour ouvrir l’identité d’origine et
la protéger avec un nouveau mot de passe. Seule une preuve dérivée, et non la clé
elle-même, est transmise au serveur. Sans mot de passe, clé de récupération ou
sauvegarde exploitable, il n’existe pas de récupération magique des données.
Les deux administrateurs doivent terminer l’activation initiale avant les premières
écritures, afin que les coffres puissent être chiffrés pour les deux associés.

Les sessions sont conservées dans un cookie `HttpOnly`, `Secure` en production,
`SameSite=Lax`, sans jetons accessibles au JavaScript du navigateur. Les écritures
vérifient aussi l’origine de la requête. Les routes API sont exclues du service
worker et répondent `Cache-Control: private, no-store`. Les clés privées
utilisées pour le déchiffrement restent non exportables et en mémoire.
Le coffre reste ouvert sans limite au premier plan et se verrouille après cinq
minutes consécutives en arrière-plan. Le retour avant ce délai l’annule. Le temps
écoulé est aussi vérifié au retour si iOS a suspendu les timers. La session de
compte reste distincte du verrouillage des données.

Le chiffrement ne protège pas un appareil compromis, une application servie avec
un script malveillant, une personne utilisant un compte déjà ouvert ou un partage
volontaire. Cette implémentation n’a pas fait l’objet d’un audit indépendant.

## Sauvegarde et ancien coffre

Les enregistrements réussis sont confirmés seulement après réponse du serveur.
Une erreur réseau ou un conflit de révision n’est jamais présenté comme un succès.
Les écritures concurrentes périmées sont refusées et un lot de modifications
échoue atomiquement si un coffre a changé.

Une connexion réseau est nécessaire pour ouvrir le compte et synchroniser. Il n’y
a pas encore de file de modifications hors ligne. En cas d’erreur, garder le
formulaire ouvert et réessayer ; ne pas fermer en supposant qu’il est sauvegardé.

**Paramètres → Importer mon ancien coffre local** permet de déverrouiller l’ancien
coffre de ce navigateur et d’importer ses fiches vers la clientèle affichée. La
copie locale reste conservée. Les autres adresses, Safari et les PWA peuvent avoir
des espaces locaux différents ; depuis un autre espace, utiliser un export chiffré
et sa restauration. L’application ne peut pas lire le stockage d’une autre origine.
Les doublons sont prévisualisés ou conservés sans remplacement selon le parcours.

Les exports sont chiffrés avec un mot de passe de sauvegarde indépendant.
Conserver également des exports hors de l’appareil. Ne pas considérer le stockage
Safari, une date d’export ou une unique copie serveur comme une sauvegarde externe.
Les requêtes API sont limitées à environ 3,5 Mo par lot dans cette version.

## Apparence et iPhone

L’application utilise le mode sombre permanent. Les réglages sont regroupés
derrière la roue crantée, accessible depuis tous les onglets. Le bandeau de
clientèle apparaît sur Accueil et Clients uniquement.
Dans Safari, ouvrir l’adresse de production puis Partager → Sur l’écran d’accueil.
L’installation, le partage natif et les comportements de stockage réels restent à
vérifier sur un iPhone physique.

## Strong 8K

Le test de connexion GOLD PANEL 1.81 consulte `action=reseller` via une fonction
Vercel authentifiée, à l’adresse HTTPS fixe `https://8k.online-cms.ru/api/api.php`.
Il affiche uniquement le compte, ses crédits et son état. La clé est envoyée dans
le corps POST côté navigateur, transite en mémoire par le serveur puis est passée
en query string au fournisseur comme requis par sa documentation. Elle n’est pas
journalisée par l’application ; le fournisseur peut journaliser ses propres URL.
Les redirections sont refusées et les réponses ont un délai et une taille limités.
L’enregistrement facultatif conserve la clé dans le coffre chiffré existant.
Deux panels Strong 8K sont configurables avec des noms, clés et résultats de test
séparés. Une ancienne clé unique reste dans le premier panel. Chaque abonnement
peut référencer un panel par identifiant stable, sans attribution automatique.
Les panels restent attachés à la clientèle de leur propriétaire. Un import dont
le panel n’existe pas est indiqué « à réassocier » plutôt que réattribué.
Cette documentation ne propose aucun endpoint pour lister tous les clients.
Le champ accepte une clé seule ou un lien complet de cette même API : seule la
clé est extraite ; l’action du lien collé n’est jamais exécutée. Les réponses
compte sont acceptées comme objet ou tableau singleton. Une réponse inconnue est
signalée comme problème de format, sans accuser la clé. Les refus explicites
clé/API/IP sont classés avec des messages fixes. Le diagnostic serveur journalise
uniquement un code applicatif, sans clé, URL amont, corps ou message brut.
Une réussite explicitement indiquée par le panel reste une connexion réussie
même si le nom, le solde ou l’état facultatifs manquent. Ces valeurs sont `null`
et affichées « Non communiqué », jamais remplacées par zéro ou un état actif.
Les mêmes champs peuvent être lus dans un objet ou tableau singleton `data`.
Le diagnostic des informations partielles ne journalise que leur présence et
la forme des champs connus, aucune valeur fournisseur.
Les actions distantes GOLD PANEL 1.81 sont disponibles : consultation d’un
abonnement, lecture des bouquets, création M3U/MAG, renouvellement de 1/3/6/12
mois et activation/suspension. Elles passent par une confirmation explicite avec
client, panel, durée et bouquet. Les tarifs en crédits ne sont pas inventés.
Un abonnement sans panel conserve le renouvellement de suivi uniquement, indiqué
comme tel. Les dates reçues du panel sont utilisées ; une date non communiquée
doit être renseignée après vérification, sans extrapolation automatique.

`app_tv_provider_operations` contient les reçus et contextes chiffrés par
destinataire (propriétaire et administrateurs), sans clé API ni identifiants en
clair. La réservation atomique et l’identifiant d’opération empêchent un nouvel
envoi du même achat. Un résultat incertain bloque la ressource jusqu’à vérification
manuelle. Les résultats réussis peuvent être enregistrés dans la fiche après
reconnexion depuis Paramètres → Opérations fournisseur à reprendre. Une erreur de
sauvegarde de la fiche ne réexécute jamais la mutation. Les reçus restent
chiffrés après clôture et les règles RLS isolent les revendeurs. Le fournisseur
ne propose pas de clé d’idempotence : une coupure au mauvais instant impose une
vérification dans son panel, surtout pour une création M3U sans identifiants reçus.

## Développement

Node 24 et npm. `npm ci`, `npm test`, `npm run build`.
Les API sont des fonctions Vercel dans `api/`, avec les variables serveur
`SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY`. La clé publiable est utilisée sous
la session de l’utilisateur ; la clé `service_role` n’est jamais fournie à Vercel
ni au navigateur. Elle reste dans la fonction Supabase `app-tv-account`, qui
vérifie elle-même les sessions pour les opérations d’administration et les
invitations/preuves de récupération pour les opérations publiques.

`supabase/schema.sql` conserve le schéma final ; les évolutions appliquées au
projet sont suivies dans son historique de migrations. Toujours inspecter le
schéma et les comptes existants avant d’appliquer des évolutions.
Les deux invitations administrateurs initiales sont créées via l’accès de gestion
sur les deux emails expressément choisis par les associés. Ne jamais promouvoir
le premier inscrit automatiquement et ne jamais partager les liens dans un dépôt.

## Vérifications

- `npm test` : règles métier, chiffrement local, chiffrement multi-destinataires,
  mauvais mots de passe, récupération, intégrité, séparation des identifiants de
  connexion et de chiffrement, frontière serveur et protection des cookies.
- `tests/sql/access.sql` : tests RLS exécutés sur Postgres dans une transaction
  intégralement annulée, avec deux administrateurs et deux revendeurs fictifs.
- `tests/accounts-browser.mjs` : parcours complet de comptes et synchronisation
  sur l’adresse de test configurée par `APP_TV_TEST_URL`. Exige des invitations de
  test préparées, à usage unique ; ne pas le lancer sur des comptes réels.
- `tests/browser.mjs` : régression de l’ancien coffre local. Construire avec
  `VITE_LEGACY_MODE=enabled npm run build` avant de le servir sur le port 4173.
  Reconstruire normalement ensuite pour la version avec comptes.

Les captures et secrets des comptes fictifs restent dans `/tmp` et `work/` de
l’environnement. Les identités et coffres temporaires doivent être supprimés après
les tests. Aucun test ne doit utiliser ni modifier le projet La Crème Rose.

## Livraison des sources

Voir `CAHIER_DES_CHARGES.md` pour la version et ses limites. Toute livraison
doit être enregistrée sur une branche GitHub avec une Pull Request vers `main`.
La fusion reste à l’utilisateur, conformément à `AGENTS.md`. Vérifier le commit
distant et la correspondance avec Vercel ; un déploiement seul ne synchronise pas
le dépôt. Aucun secret, contenu de clientèle ou capture de compte réel ne doit
être versionné.
