FROM node:18-alpine

# Installer les dépendances système nécessaires
# Ajouter openldap-clients pour ldapsearch
RUN apk add --no-cache tini openldap-clients

# Créer le répertoire de travail
WORKDIR /app

# Créer un volume persistant pour les certificats
VOLUME ["/app/certificates"]

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm ci --omit=dev

# Copier le code source
COPY . .

# Exposer le port
EXPOSE 3001

# Utiliser tini pour gérer les signaux
ENTRYPOINT ["/sbin/tini", "--"]

# Démarrer l'application
CMD ["node", "index.js"]