import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Script d'initialisation des certificats pour Railway
 * Vérifie et prépare le volume persistant au démarrage
 */

const CERT_DIR = process.env.CERT_DIR || '/app/certificates';

console.log('🚀 Initialisation du volume de certificats...');
console.log(`📁 Répertoire cible: ${CERT_DIR}`);

// Créer le répertoire s'il n'existe pas
if (!fs.existsSync(CERT_DIR)) {
  try {
    fs.mkdirSync(CERT_DIR, { recursive: true });
    console.log('✅ Répertoire de certificats créé');
  } catch (error) {
    console.error('❌ Erreur création répertoire:', error.message);
    process.exit(1);
  }
}

// Vérifier les permissions
try {
  fs.accessSync(CERT_DIR, fs.constants.R_OK | fs.constants.W_OK);
  console.log('✅ Permissions lecture/écriture confirmées');
} catch (error) {
  console.error('❌ Erreur permissions sur le répertoire:', error.message);
  console.error('   Vérifiez la configuration du volume Railway');
  process.exit(1);
}

// Copier les certificats existants depuis le répertoire local vers le volume
console.log('📋 Recherche de certificats existants dans le projet...');
let copiedCount = 0;
let existingCount = 0;

try {
  // Chercher tous les fichiers .pem dans le répertoire du projet
  const localFiles = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.pem') && /^\d+\.pem$/.test(file));
  
  console.log(`📄 ${localFiles.length} certificat(s) trouvé(s) dans le projet`);
  
  localFiles.forEach(file => {
    const srcPath = path.join(__dirname, file);
    const destPath = path.join(CERT_DIR, file);
    
    if (!fs.existsSync(destPath)) {
      try {
        fs.copyFileSync(srcPath, destPath);
        console.log(`  ✅ ${file} copié vers le volume`);
        copiedCount++;
      } catch (error) {
        console.error(`  ❌ Erreur copie ${file}:`, error.message);
      }
    } else {
      console.log(`  ℹ️ ${file} existe déjà dans le volume`);
      existingCount++;
    }
  });
} catch (error) {
  console.error('❌ Erreur lecture répertoire local:', error.message);
}

// Lister les certificats présents dans le volume
console.log('\n📊 État du volume de certificats:');
try {
  const volumeFiles = fs.readdirSync(CERT_DIR)
    .filter(file => file.endsWith('.pem'));
  
  console.log(`  Total: ${volumeFiles.length} certificat(s)`);
  if (volumeFiles.length > 0) {
    console.log('  Certificats disponibles:');
    volumeFiles.forEach(file => {
      const filePath = path.join(CERT_DIR, file);
      const stats = fs.statSync(filePath);
      console.log(`    - ${file} (${stats.size} octets, modifié: ${stats.mtime.toISOString()})`);
    });
  }
} catch (error) {
  console.error('❌ Erreur lecture volume:', error.message);
}

// Créer un fichier témoin pour vérifier la persistance
const markerFile = path.join(CERT_DIR, '.initialized');
const now = new Date().toISOString();

try {
  let previousInit = null;
  if (fs.existsSync(markerFile)) {
    previousInit = fs.readFileSync(markerFile, 'utf8');
    console.log(`\n⏰ Dernière initialisation: ${previousInit}`);
  }
  
  fs.writeFileSync(markerFile, now);
  console.log(`⏰ Initialisation actuelle: ${now}`);
} catch (error) {
  console.error('⚠️ Impossible d\'écrire le fichier témoin:', error.message);
}

console.log('\n✨ Initialisation terminée');
console.log(`  - ${copiedCount} certificat(s) copié(s)`);
console.log(`  - ${existingCount} certificat(s) déjà présent(s)`);
console.log('  - Volume prêt pour utilisation\n');

// Ne pas faire process.exit() car le script est appelé avant le démarrage du serveur