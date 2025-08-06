# B2 S/MIME Service

Service de chiffrement S/MIME pour l'envoi de fichiers B2 aux CPAM.

## Installation

```bash
npm install
```

## Configuration

Variables d'environnement requises :
- `API_KEY` : Clé API pour sécuriser le service
- `SENDGRID_API_KEY` : Clé API SendGrid pour l'envoi d'emails
- `PORT` : Port du service (défaut: 3001)

## Démarrage

```bash
# Mode développement
npm run dev

# Mode production
npm start
```

## Endpoints

### `POST /prepare-and-encrypt`
Prépare et chiffre un message B2 complet avec S/MIME.

Paramètres :
```json
{
  "from": "contact@heroad.io",
  "to": "01511@511.01.rss.fr",
  "subject": "IR/00000012525909/2025080617250910188/00001",
  "fileContent": "base64_encoded_gzipped_b2_content",
  "fileName": "B2_2025080617250910188.gz",
  "organisme": "511"  // ou "01511" ou "91123" etc.
}
```

**Note sur le paramètre `organisme`** :
- Code court (3 chiffres) : "511" → utilisera automatiquement le régime 01 (01511)
- Code complet : "01511", "91123", "02561" → utilisera le régime spécifié
- Régimes courants :
  - 01 : Régime général
  - 02 : Régime agricole (MSA)
  - 91 : MGEN
  - Etc.

### `GET /health`
Vérification de l'état du service.

### `GET /certificates`
Liste les certificats CPAM disponibles.

## Format du sujet

Le sujet doit respecter le format : `IR/{numEmetteur}/{dateCompostage}/{nbFactures}`

- `numEmetteur` : 14 caractères
- `dateCompostage` : 19 caractères (YYYYMMDDHHMMSSxxxxx)
- `nbFactures` : 5 caractères (> 00000)

## Test

```bash
node test-double-content-description.js
```