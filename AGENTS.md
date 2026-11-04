# Consignes pour travailler avec moi

Ce fichier décrit comment je travaille. Il vient de mon expérience avec deux applis :
- **« Dépenses »** : appli web privée pour iPhone, données chiffrées qui ne quittent jamais le téléphone ;
- **« La Crème Rose »** : appli web pour iPhone, données partagées entre deux personnes (ma femme et moi) et synchronisées en direct.

Lis-le en entier avant de commencer, et respecte-le pendant tout le projet.

**Le nouveau projet** : une appli où je partage des **données confidentielles avec un collègue**. La mise en page, c'est toi qui la fais. Ce qui compte pour moi : que ce soit simple, fiable, et que **personne d'autre que nous deux** ne puisse lire les données.

---

## 1. Qui je suis, comment me parler

- Je ne suis pas développeur. Explique tout simplement, **toujours en français**, sans jargon. Ne passe jamais à l'anglais. Si un terme technique est inévitable, explique-le en une phrase.
- Messages courts et clairs : ce que tu as fait, ce que je dois faire (étapes numérotées), ce qu'il reste à décider. Pas de pavé technique.
- Quand tu me poses des questions, numérote-les et propose une réponse recommandée. Je réponds souvent en style télégraphique (« 1A, 2 oui, 3 go »).
- Quand je demande des idées : une liste numérotée courte, regroupée par thème, avec pour chacune ce qu'elle m'apporte concrètement. Termine par ta recommandation (2 ou 3 idées et pourquoi).
- J'écris souvent vite ou en dictée vocale : il peut y avoir des fautes ou des phrases en vrac. Cherche ce que je veux dire. Si c'est ambigu, dis-moi comment tu as compris avant de te lancer.
- J'envoie souvent des captures d'écran de mon iPhone pour montrer un problème.

## 2. Règles de travail (non négociables)

1. **Ne rien coder sans mon feu vert explicite** (« vas-y », « go », « ok »). D'abord tu proposes : ce que je verrai à l'écran, ce qui se passe quand j'appuie, un exemple concret, les choix, les risques et les limites. J'approuve, ensuite tu codes. Quand je dis « ne code rien », je veux seulement une réponse ou des conseils.
2. **Exception** : un petit ajustement clair (un texte, un bouton qui ne marche pas, un bug que je signale) peut être corrigé directement, sans demander.
3. **Changement visible** : montre une maquette (capture d'écran) avant si c'est utile. Si j'hésite, fais plusieurs variantes côte à côte (actuelle / A / B), en mode clair et sombre, et attends mon choix.
4. Si une exigence est **impossible ou risquée** (sur iOS, côté sécurité, côté confidentialité), dis-le clairement. Ne la contourne jamais en douce, ne la remplace pas par autre chose sans me prévenir.
5. Chaque **bibliothèque ou ressource externe** (librairie, police, CDN, service, API) doit être justifiée et validée par moi avant d'être ajoutée. Par défaut : zéro dépendance. Si une librairie est validée, elle est copiée dans le projet (pas chargée depuis Internet).
6. **Vérifie l'état réel avant d'affirmer quelque chose** (GitHub, une PR, un déploiement, un test, une base de données). Ne dis jamais « c'est fait », « c'est fusionné » ou « ça marche » sans l'avoir vérifié. Si tu ne sais pas, dis-le. Quand je te dis que j'ai fait une manip, vérifie de ton côté qu'elle a marché.
7. **Teste avant de me livrer**, dans un vrai navigateur qui simule un iPhone, en mode clair et en mode sombre. Relance aussi les anciens tests pour vérifier que rien n'est cassé. Dis-moi honnêtement ce qui a été testé et ce qui ne l'a pas été (par exemple « à vérifier sur ton vrai iPhone »). Si un test échoue, dis-le.
8. Rappelle-moi de garder la **double authentification (2FA) GitHub** active quand je dois valider quelque chose sur GitHub.
9. **Aucune action irréversible** (suppression de données, de dépôt, réécriture d'historique, publication) sans m'avoir demandé.
10. **Aucune information personnelle** (prénoms, données réelles) dans le code ni dans les tests : le dépôt peut être public. Utilise des données inventées.

### Quand j'ai une manip à faire moi-même
Par exemple régler quelque chose sur un site ou coller du code dans une console :
- donne des **étapes numérotées très précises**, en partant de là où je suis (« Va sur … → ouvre … → menu de gauche → … ») ;
- précise si je suis sur **téléphone ou ordinateur**, car les menus ne sont pas au même endroit ;
- donne le code **en entier dans un seul bloc** à copier, sans aucun secret dedans ;
- dis exactement **ce que je dois voir** si ça a marché, et quoi faire si un message d'erreur apparaît ;
- si tu peux faire la manip toi-même avec tes outils, fais-la plutôt que de me la demander.

## 3. Organisation du code et des versions

- Une branche de travail. Chaque version passe par une **Pull Request vers `main`**. Depuis le 4 novembre, **tu fusionnes toi-même** la PR, uniquement si j'ai validé le changement (« go ») et si tous les tests passent ; tu vérifies ensuite la mise en ligne Vercel. En cas de problème en production, tu reviens à la version précédente et tu me préviens.
- Un **numéro de version** à chaque livraison (1.0.0, 1.1.0…), affiché dans l'appli (Réglages). S'il y a un service worker, le numéro doit être changé aussi dans `sw.js`, sinon le téléphone ne voit pas la mise à jour.
- Un **cahier des charges** (`CAHIER_DES_CHARGES.md`) tenu à jour : chaque version y ajoute une section « ce qui a changé et pourquoi », plus une liste « pistes pour plus tard » (mes idées non décidées).
- Après chaque PR : explique-moi en français ce qui change pour moi et comment installer la mise à jour.

## 4. Mes exigences de sécurité et de confidentialité (style « Dépenses »)

Pour « Dépenses », la règle était : les données ne quittent jamais le téléphone. Concrètement :

- **Zéro ressource chargée depuis Internet** : pas de CDN, pas de Google Fonts (police système), pas d'analytics, pas de pub, pas de tracker.
- **Tout est chiffré**, y compris les dates. Seul un identifiant aléatoire reste en clair.
- **Rien de sensible** dans localStorage, sessionStorage, les cookies ou le cache du service worker.
- **Content Security Policy stricte** : pas de script ni de style inline, pas d'`eval`, pas d'`innerHTML`.
- **Déverrouillage** par passkey / Face ID, plus une phrase de secours de 12 mots notée sur papier. Verrouillage automatique après inactivité.
- **Sauvegardes** exportées chiffrées. Export en clair seulement à ma demande, et en le signalant.
- Les **identifiants techniques** (adresse du site, nom de la base, étiquettes de chiffrement) ne changent jamais une fois en production, sinon les données deviennent illisibles.

## 5. Ce que « La Crème Rose » m'a appris sur le partage à deux

Pour La Crème Rose, les données étaient partagées entre deux téléphones, mais **pas chiffrées de bout en bout** : ce n'était pas nécessaire pour des commandes de gâteaux. Ce qui a bien marché et que j'aime retrouver :

- **Appli web installée sur l'écran d'accueil de l'iPhone** (« Ajouter à l'écran d'accueil » dans Safari) : elle s'ouvre en plein écran sans les barres de Safari, comme une vraie appli. HTML, CSS et JavaScript simples, sans framework.
- **Bandeau « Nouvelle version disponible — Mettre à jour »** : l'appli ne se met jamais à jour toute seule pendant qu'on s'en sert.
- **Comptes fermés** : connexion par e-mail et mot de passe, inscriptions désactivées, et une **liste blanche** des deux personnes autorisées, vérifiée par la base de données elle-même (règles ligne par ligne, « RLS », sur chaque table et sur le stockage de fichiers).
- **Synchronisation en direct** entre les deux téléphones, avec un rechargement de secours au retour sur l'appli.
- **Hors ligne d'abord** : on peut travailler sans réseau, les changements partent tout seuls au retour de la connexion. Seuls les champs modifiés sont envoyés, pour que deux personnes qui changent des choses différentes en même temps ne s'écrasent pas. Un indicateur montre l'état (« Synchronisé », « Hors ligne »).
- **Hébergement** : Supabase pour la base et les comptes, Vercel pour le site et les tâches automatiques, à partir du dépôt GitHub. Les secrets sont dans les variables d'environnement de Vercel, jamais dans le code.
- **Notifications** sur iPhone (Web Push, possible parce que l'appli est installée sur l'écran d'accueil), avec un bouton « Tester la notification ». Elles demandent un serveur, et une tâche programmée chaque matin.
- **Confort sur iPhone** : gros boutons, glisser pour supprimer avec « Annuler », glisser vers la droite pour revenir en arrière comme sur iPhone, curseur placé directement dans la première case, touche « Suivant » sur le clavier, recherche, pastille sur l'icône.
- **Tests** dans un iPhone simulé (Playwright) avec un **faux serveur**, pour ne jamais toucher aux vraies données : parcours complets, deux téléphones en même temps, coupure de réseau, ouverture sans réseau, petit écran, mode sombre.

⚠️ Pour le nouveau projet, ce modèle ne suffit pas tel quel : le serveur pourrait lire les données. Il faut y ajouter le chiffrement de bout en bout (section 6).

## 6. Le nouveau projet : partage chiffré avec un collègue

Ici, les données confidentielles doivent être partagées avec un collègue. Le principe « rien ne quitte le téléphone » ne peut donc pas s'appliquer tel quel. **Avant de coder quoi que ce soit, tu dois m'expliquer simplement les options et leurs risques, et me laisser choisir.** Mes attentes :

- **Chiffrement de bout en bout** : les données sont chiffrées sur nos appareils. Tout serveur ou service qui les transporte ne voit que du contenu illisible. Personne d'autre que mon collègue et moi ne doit pouvoir les lire : ni l'hébergeur, ni toi, ni un tiers.
- **Le moins de services tiers possible.** Pour chaque service proposé (hébergement, synchronisation, base de données), dis-moi qui il est, ce qu'il voit, et ce qui se passe s'il est piraté.
- **Échange des clés** entre mon collègue et moi : propose une méthode simple et sûre (par exemple en personne, avec un QR code). Explique ce qui se passe si l'un de nous perd son appareil ou quitte le projet.
- **Dis-moi clairement ce qui est impossible ou risqué**. Par exemple : synchronisation en temps réel sans serveur, révocation d'un accès déjà donné, récupération si les deux clés sont perdues.
- **Obligations professionnelles** : signale-moi si quelque chose demande l'accord de mon employeur ou pose un problème légal (RGPD, données de clients).
- **Rien de partagé par défaut** : chaque partage doit être volontaire et visible.
- **Même si les données sont chiffrées**, garde les protections de La Crème Rose : comptes fermés, liste blanche, règles d'accès sur chaque table. Aucune table ni aucun fichier public.
- **Notifications** : leur texte s'affiche sur l'écran verrouillé et passe par les serveurs d'Apple. Il ne doit donc contenir **aucune donnée confidentielle** (« Nouvel élément partagé », pas le contenu).
- **Rien de confidentiel** dans les journaux (logs) du serveur ni dans les messages d'erreur.
- **Avant la mise en ligne**, vérifie toi-même et montre-moi :
  - qu'une personne non connectée, ou connectée avec un compte non autorisé, ne voit rien ;
  - que ce qui est stocké sur le serveur est bien illisible.

## 7. Limites iOS déjà rencontrées (si c'est une appli web pour iPhone)

- Face ID demande un geste de l'utilisateur. Un déclenchement automatique affiche une feuille de confirmation iOS (inévitable).
- Safari et l'appli ajoutée à l'écran d'accueil n'ont pas les mêmes données.
- Le nom et l'icône sont figés au moment de l'ajout à l'écran d'accueil.
- Pas de tâche en arrière-plan, pas de notification fiable sans serveur.
- Les notifications ne marchent que depuis l'appli installée sur l'écran d'accueil, après autorisation. Elles ne s'affichent pas si l'appli est ouverte au premier plan : pour tester, il faut verrouiller le téléphone.
- Le clavier ne s'ouvre tout seul que si la case est activée pendant l'appui de l'utilisateur.
- Les mises à jour s'appliquent quand l'appli est fermée : prévoir un bandeau « mise à jour disponible ».

## 8. En résumé

1. Français, mots simples, réponses courtes, questions numérotées avec une réponse recommandée.
2. Tu proposes → je valide → tu codes. Les petits ajustements clairs peuvent être faits directement.
3. Zéro dépendance externe sans mon accord. Rien d'irréversible sans mon accord.
4. Tu testes vraiment, tu vérifies l'état réel, tu dis honnêtement ce qui est testé ou non.
5. PR vers `main` que tu fusionnes toi-même après mon « go » et des tests verts, numéro de version, cahier des charges à jour.
6. Confidentialité : chiffrement de bout en bout, personne d'autre que nous deux, jamais de secret ni de donnée réelle dans le code.


---

# SCDR TV — instructions de travail

## Vérifier chaque livraison

Instruction explicite de l’utilisateur : après chaque modification, vérifier
soi-même que les éléments déjà validés sont toujours présents, visibles et
utilisables. Une correction ne doit pas masquer un autre bouton ou bandeau.
Effectuer ces vérifications avant chaque publication et vérifier ensuite la
version effectivement publiée.

Pour toute modification de l’interface, de la connexion ou du viewport :

- Contrôler les six onglets validés : Accueil, Clients, Revendeurs, Expirations,
  Bilan et Médias.
  La roue crantée doit rester visible et ouvrir les paramètres.
- Vérifier que « Notre clientèle » (administrateurs), « Ma clientèle » (revendeur)
  et le sélecteur sont visibles et accessibles sur Accueil et Clients uniquement,
  sans être recouverts par l’en-tête, après défilement, connexion ou fermeture
  d’une fenêtre. Ils sont absents des autres onglets.
- Vérifier l’écran de connexion : TV en grand, animation des lettres pendant
  la connexion, petite clé visible et utilisable, formulaire de mot de passe
  accessible, annulation de Face ID et retour au mot de passe opérationnels.
- Préserver le verrouillage demandé : aucune limite au premier plan ; cinq
  minutes consécutives en arrière-plan, avec contrôle du temps écoulé au retour.
- Contrôler les paramètres : compte et email, Face ID, verrouillage manuel,
  actualisation et déconnexion. Préserver les droits administrateur/revendeur.
- Vérifier le haut ET le bas de l’écran : pas de contenu masqué, de bande vide,
  de zoom involontaire, de bouton hors de la zone visible ou de débordement.
  Tester portrait, paysage et petit écran, avec des données vides et chargées.
- Tester les deux géométries des installations iPhone : ancienne présentation
  translucide avec inset supérieur et nouvelle présentation opaque sans inset.
  Reproduire aussi un viewport visuel plus court ou décalé après le clavier,
  même si `lvh` conserve une ancienne hauteur. Ne pas supposer que `vh`, `lvh`,
  `innerHeight` et `visualViewport.height` sont identiques.
- Examiner les captures produites par les tests lorsque le rendu est modifié.
  Utiliser les outils et le code disponibles ; éviter de demander à l’utilisateur
  des captures répétées pour remplacer ces vérifications.

Vérifications minimales avant publication d’une modification d’interface :

1. `npm run build` et `git diff --check`.
2. `node tests/mobile-layout-browser.mjs`.
3. `node tests/login-screen-browser.mjs`.
4. `node tests/premium-design-browser.mjs`.
5. `node tests/device-unlock-browser.mjs`.

Adapter et compléter les scénarios quand un nouveau cas réel révèle une lacune.
Vérifier également les tests métier, serveur et chiffrement si leur logique est
touchée, et le parcours de mise à jour si le service worker ou son cache change.
Corriger les régressions avant de publier, plutôt que demander à l’utilisateur
de les détecter après chaque livraison.

## Vérification de production et limites des tests

- Confirmer la bonne équipe, le bon projet et le bon environnement Vercel.
  Attendre l’état READY et vérifier le domaine utilisé par l’utilisateur.
- Vérifier que les fichiers JavaScript/CSS servis correspondent au build testé
  et que les ressources de l’interface se chargent correctement.
- Ne pas annoncer qu’un problème propre à un iPhone réel a été reproduit ou
  résolu sur cet appareil à partir de tests Chromium uniquement. Distinguer
  ce qui a été vérifié dans les outils et ce qui nécessite son retour réel.
- En cas de correctif inefficace, reprendre le diagnostic à partir du symptôme
  et des preuves ; ne pas empiler des changements CSS sans vérifier l’hypothèse.

## Préserver les accès et les données

Ne pas effacer le stockage local, les clés Face ID ou les données de compte pour
résoudre un problème de présentation. Les changements de mode de barre système
iOS peuvent être mémorisés à l’installation : expliquer la nécessité éventuelle
d’un nouvel ajout à l’écran d’accueil et conserver l’ancien accès jusqu’à ce que
le nouveau fonctionne.

Respecter les choix validés : application SCDR TV, logo TV choisi par l’utilisateur,
palette actuelle sombre et paramètres regroupés derrière la roue crantée.
Une nouvelle instruction explicite de l’utilisateur peut faire évoluer ces choix.

Les deux associés ont deux accès administrateurs au même espace : « Notre clientèle »
et les deux panels Strong 8K sont communs. Ne pas recréer de clientèle séparée par
associé. Les sous-revendeurs restent isolés. Le sélecteur utilise un vrai `select`
pour ouvrir le choix natif iPhone, sans cadre bleu au toucher. L’animation du logo
doit rester légère : réutiliser les images existantes et animer seulement des
transforms sur de petites couches HTML, sans repeindre le logo entier par image.

## Opérations fournisseur

Ne jamais lancer une création ou un renouvellement réel pour tester l’app.
Les opérations payantes passent par une confirmation explicite du client,
du panel et de la durée. Préserver le journal chiffré, l’identifiant stable de
chaque demande et le blocage d’une opération dont le résultat reste incertain.
Ne jamais réessayer automatiquement une mutation après un délai dépassé ou une
coupure. Préserver les résultats en cas d’échec de sauvegarde locale/cloud et
le parcours Paramètres → Opérations fournisseur à reprendre.

Après modification de ces parcours, exécuter aussi les tests
`tests/provider-operations.test.js`, `src/providerWorkflow.test.ts` et les
scénarios fournisseur de `tests/premium-design-browser.mjs`. Pour un changement
de journal ou de droits, contrôler `tests/sql/provider-operations.sql` dans une
transaction annulée. Ne jamais écrire de clé API, d’identifiants ou de réponse
fournisseur brute dans les journaux.

## Fiches clients, bilan et médias

Ne pas ajouter de colonne paiement : une icône à côté du pseudo signale
uniquement les abonnements non réglés ; elle disparaît après règlement.
Supprimer les sous-titres génériques qui répètent le nom de l’onglet.
Conserver les prix d’achat et de vente par vente/renouvellement ; modifier
le coût d’un panel ne doit pas réécrire les bénéfices passés. Les tests durent
24 heures exactes. Vérifier les notifications et le partage sans promettre
une réception iPhone ou une publication en story non testée sur appareil réel.
Les publicités sont chiffrées, accessibles à leur propriétaire et aux associés.

Choix validés le 29 octobre : un seul champ Pseudo (identifiant de connexion),
un seul champ Notes, sans sélecteur de type de connexion ni saisie du M3U
complet. Les mots de passe clients et les adresses serveur sont affichés en
clair et copiables ; ne pas transformer le serveur en lien de navigation.
Préserver le masquage des mots de passe d’authentification et des clés API.
Le coût se préremplit depuis le panel choisi ; préserver les coûts historiques.
Les impayés utilisent des pièces rouges. Le bilan présente deux indicateurs
principaux : bénéfice et bénéfice par mois. Trier la liste par expiration
décroissante (y compris plusieurs abonnements pour un client).
Un seul bouton Panel, discret et présent dans l’en-tête de tous les onglets,
ouvre le lien configuré dans Paramètres → Site du panel. Pas de double lien
en tête de Médias. Réduire les photos avant chiffrement/envoi, accepter les
photos de galerie de plus de 12 Mo et contrôler le poids du résultat chiffré.

Choix validés le 30 octobre : galerie de petites vignettes, deux catégories
Publicités/Tutos, visionneuse plein écran avec balayage entre les photos.
Chiffrer également les vignettes et ne charger les grands fichiers que pour
la visionneuse ou la migration initiale des anciennes images. Le cache local
ne contient que des enveloppes chiffrées et ne remplace jamais les règles
d’accès à la liste. Les images existantes restent lisibles et acquièrent
leur vignette au premier affichage. Vérifier les parcours migration/cache.
Les tests 24 h précèdent tous les autres abonnements dans la liste. Ajouter
IBO Player, accepter les URL sans protocole et retirer l’ajout manuel d’un
second abonnement. La première vente du bilan utilise la date de début
d’abonnement, y compris pour les historiques saisis après coup.
Pseudo Diogo en jaune, Poyeland en bleu ; utiliser trois pièces empilées pour
le bilan et les impayés. Le bouton Panel doit demander Safari sur iPhone
installé, sans prétendre à un test physique depuis Chromium.
Pour accélérer Face ID, conserver la vérification réelle côté serveur :
le SDK épinglé setSession vérifie le token via Auth ; ne pas la remplacer
par un simple décodage du JWT. Tester le rejet des jetons refusés et des
comptes suspendus et l’absence de requêtes de connexion redondantes.
La documentation GOLD PANEL 1.81 fournie ne décrit que sub=1,3,6,12 : ne
pas inventer une commande de test 24 h et ne pas lancer une création réelle
pour en deviner le comportement ou prétendre que le fournisseur l’a refusée.

Derniers choix : masquer la navigation basse pendant le clavier logiciel pour
qu’elle ne remonte pas au-dessus du clavier ; la restaurer à sa position exacte
après fermeture. Tester la recherche avec un visualViewport rétréci et son
retour à la hauteur initiale. Entrée termine la recherche et ferme le clavier.
Bilan : deux rectangles pleine largeur empilés ; pas de phrase « Équivalent
mensuel ». La carte Clients de l’accueil doit ouvrir Clients.
Ne jamais confondre abonnement valide, enabled=1 ou status=true avec une
connexion en ligne. Le suivi des connexions ne montre que les champs live
réellement fournis. Garder un statut inconnu, jamais un faux zéro, quand le
fournisseur ne fournit pas ces données ; aucune chaîne ne peut être déduite
d’un catalogue ou d’un ancien programme. Les lectures d’activité restent
éphémères, limitées à l’espace autorisé et sans journaux de contenu visionné.


## Livraison GitHub et Vercel

À chaque livraison, enregistrer les sources et les tests dans GitHub avant de
considérer la synchronisation terminée. Utiliser une branche et une Pull Request
vers `main` ; depuis le 4 novembre, l’agent fusionne lui-même la PR après validation explicite et tests verts, puis vérifie Vercel. Ne jamais remplacer
les consignes existantes ni écraser une branche modifiée par un autre outil.
Ne pas livrer uniquement sur Vercel. Indiquer la branche et le commit exacts,
vérifier la référence distante après le push et rattacher toute publication
Vercel au commit testé. Conserver les secrets dans la configuration serveur,
jamais dans GitHub. Les choix plus récents explicitement validés pour SCDR TV
(mode sombre permanent, verrouillage après cinq minutes en arrière-plan,
comptes et bibliothèques déjà autorisés) priment sur les exemples historiques.
