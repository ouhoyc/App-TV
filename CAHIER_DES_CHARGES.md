# SCDR TV — cahier des charges et versions

## Version 1.1.0 — nouveau design « Liquid Glass »

Choisi le 4 novembre parmi trois maquettes (A Liquid Glass, B Bento,
C Priorités). Mêmes écrans, mêmes couleurs, même logo : seule l’apparence
change, plus la nouvelle liste Clients.

### Ce qui a changé et pourquoi

- Matière « verre » sur l’en-tête (Panel, roue crantée), le sélecteur de
  clientèle, les cartes et la barre d’onglets, sans flou d’arrière-plan sur
  l’en-tête et la navigation (règle de performance iPhone conservée).
- Grands titres, boutons en pilule, textes plus lisibles.
- Accueil : le nombre de clients est entouré d’un anneau de progression.
- Clients : le tableau devient une liste de cartes. Priorité au pseudo, au
  mot de passe et à la date, puis le lien et l’application. Bouton
  « Copier les accès » (pseudo, mot de passe, lien ; sans l’application).
  Vues Accès / Échéances / Archives et filtres Tous / Diogo / Poyeland.
  Plus d’initiale ronde : la couleur repère le panel (Diogo jaune,
  Poyeland bleu). Les statuts d’échéance ne sont plus colorés.
- Accueil et Expirations : barre de couleur du panel sur chaque ligne.
- Bilan : deux rectangles empilés conservés ; les ventes deviennent une liste
  lisible sur iPhone au lieu d’un tableau coupé à droite.
- Médias, Revendeurs, fiche client : mêmes contenus, nouveau style.

### Pistes pour plus tard

- Feuille qui monte du bas pour la fiche client (non faite : contrôle de la
  zone visible du bas d’écran à préserver).
- Grouper les Expirations par « En retard » / « Cette semaine ».

## Version 1.0.0 — synchronisation des sources GitHub

Cette version rassemble les évolutions réalisées depuis le premier prototype.
Les consignes initiales du dépôt sont conservées et complétées. Les sources,
fonctions serveur, schéma SQL, tests et documentation accompagnent l’application.
Aucun secret ni donnée de clientèle réelle ne doit être publié.

### Fonctionnement validé

- Application sombre SCDR TV, logo TV et animation légère à la connexion.
- Deux associés partagent la même clientèle ; chaque sous-revendeur accède
  uniquement à la sienne. Comptes fermés, rôles contrôlés en base.
- Coffres, médias et reçus fournisseur chiffrés pour leurs destinataires.
  Les accès Face ID et les clés existantes sont conservés.
- Aucun verrouillage au premier plan ; cinq minutes consécutives en arrière-plan.
- Six onglets : Accueil, Clients, Revendeurs, Expirations, Bilan et Médias.
  Paramètres, compte et déconnexion accessibles par la roue crantée.
- Pseudo, mot de passe client et serveur visibles dans la fiche déverrouillée.
  Un champ Notes, coûts historiques conservés, pièces rouges pour les impayés.
- Galerie Publicités/Tutos à petites vignettes chiffrées, défilement plein écran,
  partage natif quand disponible et cache local chiffré des grandes images.
- Deux panels fournisseur configurables. Confirmation avant chaque opération
  payante, journal de reprise et absence de réessai automatique en cas de doute.
- Rappels d’expiration sans données confidentielles dans les notifications.

### Derniers ajustements

- Le clavier de recherche masque la barre basse et la fermeture la restaure ;
  Entrée termine la recherche. Le bandeau clientèle reste sur Accueil/Clients.
- La carte Clients de l’accueil ouvre la liste. Le bilan utilise deux rectangles
  empilés, sans phrase explicative de l’équivalent mensuel.
- Le bloc En ligne distingue une connexion actuelle d’un abonnement valide.
  Il lit uniquement les champs live explicites du fournisseur et garde les
  statuts inconnus si absents. Les titres éventuellement reçus restent éphémères.
- Le numéro de version apparaît dans Paramètres et le nom du cache du service
  worker. Une livraison doit aussi être enregistrée sur GitHub, pas seulement Vercel.

### Limites vérifiées et pistes pour plus tard

- GOLD PANEL 1.81 ne documente pas la présence en ligne, les chaînes regardées
  ni la création d’un test de 24 h. Le support réel des champs live reste à
  confirmer auprès du fournisseur ; aucun résultat ne doit être inventé.
- Aucun test fournisseur payant n’est lancé pour valider le code.
- Le comportement du clavier, de Safari, Face ID, des notifications et du partage
  sur un iPhone physique ne peut pas être certifié par les tests Chromium.
- La synchronisation exige le réseau ; aucune file d’écriture hors ligne n’est
  promise. La révocation ne retire pas les données déjà lues ou exportées.
- Les fonctions déjà autorisées utilisent Supabase et Vercel. Le contenu de
  clientèle est chiffré, mais les comptes et métadonnées d’accès restent connus
  du serveur ; les appels fournisseur traversent la fonction serveur en mémoire.

## Circuit de livraison

1. Construire, exécuter les tests et examiner les captures utiles.
2. Créer un commit sur une branche de travail ; vérifier son SHA sur GitHub.
3. Ouvrir une Pull Request vers `main` et laisser l’utilisateur la fusionner.
4. Vérifier le bon projet Vercel et la version réellement servie avant d’annoncer
   une mise en ligne. Ne jamais confondre dépôt synchronisé et application publiée.
