import { ensureCertificateLdapJS } from './auto-fetch-certificate-ldapjs.js';
import fs from 'fs';

/**
 * Script pour pré-récupérer les certificats les plus courants
 * Évite les appels LDAP en production
 */
async function fetchAllCertificates() {
  console.log('📥 RÉCUPÉRATION DES CERTIFICATS COURANTS\n');
  
  // Liste des organismes courants
  const organismes = [
    // Régime général (01)
    '01511', '01751', '01972', '01971', '01973', '01974', '01975', '01976',
    '01131', '01261', '01371', '01381', '01831', '01911', '01921',
    
    // Régime agricole MSA (02)
    '02131', '02161', '02171', '02561',
    
    // Sections locales mutualistes (06)
    '06200',
    
    // Régimes spéciaux (05)
    '05051',
    
    // MGEN (91)
    '91131', '91561', '91631', '91831',
    
    // Autres mutuelles (10)
    '10980'
  ];
  
  let success = 0;
  let failed = 0;
  
  for (const org of organismes) {
    try {
      console.log(`📡 Récupération ${org}...`);
      await ensureCertificateLdapJS(org);
      success++;
      console.log(`✅ ${org} récupéré\n`);
    } catch (error) {
      console.error(`❌ ${org} échec: ${error.message}\n`);
      failed++;
    }
    
    // Petite pause pour ne pas surcharger le serveur LDAP
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 RÉSUMÉ:');
  console.log(`✅ Réussis: ${success}`);
  console.log(`❌ Échecs: ${failed}`);
  console.log(`📜 Total: ${success + failed}`);
  
  // Lister tous les certificats présents
  const pemFiles = fs.readdirSync('.')
    .filter(f => f.endsWith('.pem'))
    .sort();
  
  console.log('\n📋 Certificats disponibles:');
  pemFiles.forEach(f => console.log(`   - ${f}`));
}

// Exécuter
fetchAllCertificates().catch(console.error);