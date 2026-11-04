# Clients, ventes et publicités

Les fiches et historiques financiers restent dans les coffres chiffrés. Un
abonnement démarre non réglé : l’icône à côté du pseudo permet de le régler,
et disparaît ensuite. La fiche permet d’annuler un règlement. Chaque création
et renouvellement conserve ses prix, son panel, sa durée et son règlement.
Le coût annuel configuré par panel préremplit les nouvelles ventes au prorata ;
les anciens coûts sont conservés. Le bénéfice affiche les encaissements moins
les achats ; l’équivalent mensuel divise les bénéfices annuels par douze.
Les prix manquants restent signalés et ne deviennent pas une fausse marge exacte.

## Notifications

Appliquer `supabase/notifications.sql` une seule fois. Configurer une paire VAPID
persistante dans `WEB_PUSH_PUBLIC_KEY` et `WEB_PUSH_PRIVATE_KEY` côté serveur.
La clé privée ne quitte pas Vercel. Ne pas régénérer la paire à chaque déploiement.
L’utilisateur active les notifications puis les teste dans Paramètres. Sur iOS,
les notifications Web Push nécessitent l’app ajoutée à l’écran d’accueil sur
une version compatible (iOS 16.4 ou plus). La permission vient du système.

Le coffre chiffré et les métadonnées des rappels se sauvegardent dans la même
transaction. Le serveur conserve uniquement les identifiants, le type et les
échéances nécessaires au rappel ; les noms, mots de passe, contacts et prix ne
figurent ni dans ces métadonnées ni dans les notifications. Les métadonnées de
planification ne sont donc pas chiffrées de bout en bout. Les endpoints Web Push
et leurs clés techniques restent accessibles uniquement à leur utilisateur et
au worker privé d’envoi, même entre administrateurs.

Cron vérifie chaque minute les rappels dus. Un ticket aléatoire de 256 bits,
valable cinq minutes et utilisable une seule fois, autorise le worker Vercel
à traiter au plus vingt envois. Aucun rôle privilégié Supabase n’est exposé.
Les destinataires actifs sont le propriétaire et les associés administrateurs.
Le journal déduplique les envois par rappel/appareil, réessaie les erreurs
transitoires et désactive les endpoints expirés. Un même tag évite de multiplier
les notifications visibles en cas de nouvelle tentative. La réception effective
dépend du système, du réseau et des autorisations ; le test indique l’acceptation
par le service de push, pas une preuve de lecture ou de livraison à l’iPhone.

## Médias

Appliquer `supabase/media.sql`. Les images sont redimensionnées (1600 px maximum, avec réduction supplémentaire
si nécessaire), converties en JPEG et compressées à moins de 1,2 Mo puis chiffrées pour le propriétaire et les deux
associés. Les miniatures se déchiffrent seulement à l’approche de l’écran ; la
bibliothèque est chargée séparément du bundle principal. Le partage utilise
`navigator.share({files})` directement depuis le geste de l’utilisateur et
propose le téléchargement si le partage de fichiers n’est pas disponible.
Les applications installées déterminent les destinations proposées ; le site
ne peut pas imposer une publication automatique en story Snapchat/Instagram.
Le bouton Panel reste dans l’en-tête de chaque onglet. Son lien unique se
configure dans Paramètres → Site du panel et ouvre un nouvel onglet. La galerie
accepte plusieurs images, traitées successivement pour limiter la mémoire.

Tests spécifiques : `src/commerce.test.ts`, `tests/push.test.js`,
`tests/sql/business.sql` (transaction annulée, aucun push envoyé),
`tests/push-worker-events.mjs` (après build), et les scénarios clients/médias/push
de `tests/premium-design-browser.mjs`. Le navigateur simule les autorisations et
la feuille de partage ; vérifier la notification réelle sur l’iPhone depuis
Paramètres → Activer les notifications → Tester une notification.

## Galerie et ouverture rapide (30 octobre)

Après le schéma média initial, appliquer `supabase/media_gallery.sql` :
catégorie ads/tutorials et vignette chiffrée. Aucun contenu existant n’est
supprimé. Les premières listes lisent les petites vignettes ; un ancien fichier
sans vignette est déchiffré une fois sur l’appareil pour produire sa vignette.
Le serveur ne déchiffre jamais les photos. Une photo se consulte dans une
visionneuse à balayage horizontal, avec préchargement des deux voisines,
partage natif, téléchargement, changement de catégorie et suppression.
Le cache IndexedDB séparé contient au maximum douze enveloppes de photo
chiffrées, chacune plafonnée à 2,6 Mo ; les autorisations restent contrôlées
par les métadonnées serveur et la clé privée. Aucune vignette/photo en clair
n’est conservée dans ce cache. Un cache altéré est remplacé par une lecture
serveur authentifiée. Les caches Face ID et des coffres restent intacts.

La première vente utilise la date de début du client, même lorsque la vente
a été saisie après coup. Les renouvellements conservent leurs propres dates.

La connexion Face ID peut demander le coffre dans sa réponse de connexion,
sans les sondages de compte/coffre supplémentaires. Le SDK auth-js épinglé
vérifie le token lors de setSession (requête Auth ou rafraîchissement) ; le
serveur ne refait pas immédiatement une seconde requête identique getUser.
Le profil actif est toujours contrôlé en base, avec RLS sur chaque lecture.
`tests/auth-performance.test.js` exerce ces chemins avec le SDK réel et des
réponses Auth simulées. Le test navigateur Face ID vérifie le déverrouillage
natif et compte les appels supprimés ; aucun chiffre de latence sur un vrai
iPhone n’est déduit de ces simulations.

Sur iPhone installé (iOS 17+), le lien Panel utilise le schéma Safari. Une
adresse HTTP passe par une page HTTPS intermédiaire statique puis reste en
HTTP, sans changement silencieux du protocole du panel. L’adresse cible
est transmise dans le fragment, pas dans la requête serveur. Les autres
plateformes gardent l’ouverture standard du navigateur. Le comportement
physique du changement d’application dépend d’iOS et nécessite un iPhone.
Référence primaire : https://christiantietze.de/posts/2023/05/safari-for-mac-url-scheme/

GOLD PANEL 1.81 : la doc envoyée par l’utilisateur n’indique aucun paramètre
24 h. Le code restreint donc les mutations aux durées documentées 1/3/6/12 ;
un test local 24 h peut être enregistré manuellement après création dans le
panel. La consultation publique du fournisseur n’a pas permis d’obtenir une
documentation plus récente. Aucun appel créateur non documenté n’a été tenté.

## Recherche, bilan et connexions fournisseur

La barre basse est masquée pendant le clavier logiciel et retrouve son bord
initial après sa fermeture. Le filtre de clientèle est limité à Accueil et
Clients. Le bilan utilise deux rectangles verticaux sans sous-titre générique.
La carte Clients ouvre Clients. Les taux d’abonnements en cours ne sont pas
des mesures de clients actuellement connectés.

Le suivi live lit uniquement l’action GOLD PANEL documentée `device_info`.
Il reconnaît les champs de présence explicites online/is_online/connected et
active_cons/active_connections lorsqu’ils sont effectivement renvoyés.
Ni enabled, ni status=true, ni une date d’expiration ne sont des preuves de
connexion. La documentation 1.81 fournie ne garantit aucun de ces champs live
ni de chaîne courante : une réponse limitée aux champs documentés donne
un statut inconnu et aucun faux pourcentage. La présence et les titres vus
restent en mémoire de la session, sans stockage ni journaux de programmes.

Le fournisseur est interrogé d’abord pour un seul abonnement de chaque panel,
puis pour les autres s’il fournit la présence. La liste peut demander une
vérification complète ; au maximum six abonnements par lot et deux lectures
fournisseur simultanées. Les panels ayant fourni la présence peuvent être
actualisés toutes les minutes, seulement au premier plan sur Accueil. Les
chaînes ne sont affichées que si un champ de titre accompagne une connexion
explicitement en ligne. Un catalogue n’est jamais utilisé comme programme
regardé. La question concernant la source où l’utilisateur a vu les connexions
a été posée pour confirmer une éventuelle API fournisseur plus complète.
