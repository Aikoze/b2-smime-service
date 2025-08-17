FROM node:18-alpine

# Installer les dépendances système nécessaires
# Ajouter openldap-clients pour ldapsearch
RUN apk add --no-cache tini openldap-clients

# Créer le répertoire de travail
WORKDIR /app

# Créer le répertoire pour les certificats (sera monté comme volume)
RUN mkdir -p /app/certificates && \
    chmod 755 /app/certificates

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm ci --omit=dev

# Copier le code source
COPY . .

# S'assurer que les scripts sont exécutables
RUN chmod +x init-certificates.js

# Exposer le port
EXPOSE 3001

# Variables d'environnement par défaut
ENV CERT_DIR=/app/certificates \
    NODE_ENV=production \
    USE_LDAPJS=true

# Utiliser tini pour gérer les signaux
ENTRYPOINT ["/sbin/tini", "--"]

# Script de démarrage avec initialisation
CMD ["sh", "-c", "node init-certificates.js && node index.js"]