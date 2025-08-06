import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Récupère automatiquement un certificat CPAM depuis LDAP si nécessaire
 * @param {string} organismeCode - Code organisme complet (ex: "511" ou "01511" ou "91123")
 */
export async function ensureCertificate(organismeCode) {
  // Si le code n'a pas de préfixe de régime (3 chiffres), ajouter 01 par défaut
  let fullCode = organismeCode;
  let regime = '01';
  let codeSeul = organismeCode;
  
  if (organismeCode.length > 3) {
    // Le code contient déjà le régime (ex: "01511" ou "91123")
    regime = organismeCode.substring(0, 2);
    codeSeul = organismeCode.substring(2);
    fullCode = organismeCode;
  } else {
    // Juste le code organisme (ex: "511"), on ajoute le régime 01
    fullCode = `01${organismeCode}`;
  }
  
  const certFileName = `${fullCode}.pem`;
  const certPath = path.join(__dirname, certFileName);
  
  // Vérifier si le certificat existe déjà
  if (fs.existsSync(certPath)) {
    console.log(`✅ Certificat ${certFileName} déjà présent`);
    return fs.readFileSync(certPath, 'utf8');
  }
  
  console.log(`📥 Certificat ${certFileName} manquant, récupération depuis LDAP...`);
  
  try {
    // Construire l'email CPAM selon le format : regime+code@code.regime.rss.fr
    const email = `${fullCode}@${codeSeul}.${regime}.rss.fr`;
    
    // Construire la commande ldapsearch
    const ldapUrl = 'ldap://annuaire.sesam-vitale.fr:389';
    const baseDn = 'ou=AC-SESAM-VITALE-2034,o=sesam-vitale,c=fr';
    const filter = `(cn=${email})`;
    const attribute = 'userCertificate;binary';
    
    const command = `ldapsearch -s sub -x -H '${ldapUrl}' -b '${baseDn}' '${filter}' '${attribute}'`;
    
    console.log('📡 Requête LDAP en cours...');
    
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr && !stderr.includes('SASL')) {
      console.error('⚠️  Avertissement LDAP :', stderr);
    }
    
    // Parser la sortie LDAP
    const lines = stdout.split('\n');
    let inCert = false;
    let certBase64 = '';
    
    for (const line of lines) {
      if (line.startsWith('userCertificate;binary::')) {
        inCert = true;
        certBase64 = line.substring('userCertificate;binary::'.length).trim();
      } else if (inCert && line.startsWith(' ')) {
        // Continuation de la ligne
        certBase64 += line.trim();
      } else if (inCert && line.trim() === '') {
        // Fin du certificat
        break;
      }
    }
    
    if (!certBase64) {
      throw new Error('Aucun certificat trouvé dans la réponse LDAP');
    }
    
    // Décoder le base64
    const certDer = Buffer.from(certBase64, 'base64');
    
    // Convertir DER en PEM
    const certPem = [
      '-----BEGIN CERTIFICATE-----',
      certDer.toString('base64').match(/.{1,64}/g).join('\n'),
      '-----END CERTIFICATE-----'
    ].join('\n');
    
    // Sauvegarder le certificat
    fs.writeFileSync(certPath, certPem);
    console.log(`✅ Certificat ${certFileName} récupéré et sauvegardé`);
    
    // Analyser le certificat
    try {
      const { stdout: certInfo } = await execAsync(`openssl x509 -in ${certPath} -noout -subject -dates`);
      console.log('📋 Info certificat :');
      certInfo.split('\n').forEach(line => {
        if (line.trim()) console.log(`   ${line.trim()}`);
      });
    } catch (e) {
      // Ignorer les erreurs d'analyse
    }
    
    return certPem;
    
  } catch (error) {
    console.error(`❌ Impossible de récupérer le certificat pour l'organisme ${organismeCode}`);
    console.error('   Erreur :', error.message);
    
    // Suggérer l'installation de ldapsearch si nécessaire
    if (error.message.includes('command not found') || error.message.includes('ldapsearch')) {
      console.log('\n💡 ldapsearch n\'est pas installé :');
      console.log('   macOS : brew install openldap');
      console.log('   Ubuntu : sudo apt-get install ldap-utils');
      console.log('   Windows : Utiliser WSL ou un client LDAP graphique');
    }
    
    throw error;
  }
}

// Si exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  const organismeCode = process.argv[2];
  
  if (!organismeCode) {
    console.error('Usage: node auto-fetch-certificate.js <code_organisme>');
    console.error('Exemple: node auto-fetch-certificate.js 751');
    process.exit(1);
  }
  
  ensureCertificate(organismeCode)
    .then(() => {
      console.log('\n✅ Terminé');
    })
    .catch(error => {
      console.error('\n❌ Échec :', error.message);
      process.exit(1);
    });
}