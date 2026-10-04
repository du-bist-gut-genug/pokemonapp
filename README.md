# Holo

Scanne tes cartes Pokémon, vois leur cote Cardmarket et TCGplayer, et suis la valeur de ta collection jour après jour.

Application personnelle, 100 % dans le navigateur : pas de serveur, pas de compte. Ta collection reste sur ton téléphone.

## Mettre en ligne sur GitHub Pages

1. Sur github.com, crée un dépôt, par exemple `holo`. Il doit être **public** pour utiliser GitHub Pages gratuitement. Seul le code est visible : ta collection et ta clé restent sur ton téléphone.
2. Dans le dépôt, clique sur **Add file → Upload files** et dépose **le contenu** du dossier : `index.html` doit être à la racine du dépôt, pas dans un sous-dossier. Valide avec **Commit changes**.
3. Va dans **Settings → Pages**. Dans **Build and deployment**, choisis **Deploy from a branch**, puis la branche `main` et le dossier `/ (root)`. Clique sur **Save**.
4. Attends une à deux minutes. L'adresse s'affiche en haut de la page : `https://ton-pseudo.github.io/holo/`.

## Installer avec Chrome

- **Android** : ouvre l'adresse dans Chrome, touche le bouton **Installer** en haut de l'app, ou le menu ⋮ puis **Installer l'application**.
- **Ordinateur** : clique sur l'icône d'installation à droite de la barre d'adresse.
- **iPhone** : bouton Partager, puis **Sur l'écran d'accueil**.

Holo s'ouvre ensuite en plein écran comme une vraie application, et fonctionne hors ligne pour consulter ta collection.

## Activer le scan

Le scan utilise Gemini, l'IA de Google.

1. Va sur [aistudio.google.com](https://aistudio.google.com), connecte-toi et crée une clé API (**Get API key**).
2. Dans Holo, ouvre les réglages (icône en haut à droite), colle la clé et touche **Tester**.

Reste sur l'offre gratuite ou fixe un plafond de dépense à 0 €. **Ne mets jamais ta clé dans le dépôt GitHub** : elle se saisit uniquement dans l'app.

Sans clé, la recherche à la main fonctionne quand même (nom + numéro de la carte).

Si Google renomme ses modèles et que le test échoue avec « modèle introuvable », change le modèle dans les réglages (par exemple `gemini-flash-latest`).

## Mettre à jour l'app

Remplace les fichiers dans le dépôt (Upload files à nouveau). Holo charge la nouvelle version à la prochaine ouverture. Ta collection n'est pas touchée.

## Sauvegarder ta collection

Tout est stocké dans Chrome. Si tu effaces les données du navigateur ou changes de téléphone, la collection est perdue. Dans les réglages, **Exporter une sauvegarde** crée un fichier que **Restaurer** recharge. **Exporter en tableur** sort un CSV qui s'ouvre dans Excel.

## Ce que les cotes ne disent pas

- **Langue** : Cardmarket publie une seule cote pour les cartes européennes, toutes langues confondues. Pour une version qui vaut nettement plus, saisis ta cote (champ « Ma cote ») ou vérifie les ventes eBay depuis la fiche.
- **Japonais, coréen, chinois** : souvent sans cote dans la base. Saisis la tienne.
- **Gradées** : aucune source gratuite fiable. La fiche montre la cote brute et tu saisis la tienne.
- **Historique** : Cardmarket fournit les moyennes 1, 7 et 30 jours. La courbe de ta collection se construit à partir du jour où tu commences, une valeur par jour d'ouverture.

## Sources

- Cartes, images et cotes : [TCGdex](https://tcgdex.dev), qui reprend les données Cardmarket (euros, quotidien) et TCGplayer (dollars).
- Taux de change : Banque centrale européenne via frankfurter.app.

Application personnelle sans lien avec The Pokémon Company, Nintendo, Cardmarket ou TCGplayer.
