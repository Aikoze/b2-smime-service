import dotenv from 'dotenv';
dotenv.config();

/**
 * Test des différents régimes
 */
async function testMultiRegime() {
  console.log('🧪 TEST MULTI-RÉGIMES\n');
  
  const testCases = [
    { organisme: '511', description: 'Code court (ajout automatique du régime 01)' },
    { organisme: '01511', description: 'Code complet régime général' },
    { organisme: '01751', description: 'Code complet régime général (751)' },
    { organisme: '91123', description: 'Code MGEN (régime 91)' },
    { organisme: '02561', description: 'Code MSA (régime 02)' }
  ];
  
  for (const test of testCases) {
    console.log(`\n📋 Test: ${test.description}`);
    console.log(`   Code organisme: ${test.organisme}`);
    
    try {
      const response = await fetch('http://localhost:3001/encrypt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.API_KEY || 'test-api-key'
        },
        body: JSON.stringify({
          message: 'Test message',
          organisme: test.organisme
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        console.log(`   ✅ Succès: Certificat trouvé pour ${test.organisme}`);
      } else {
        console.log(`   ❌ Échec: ${result.error}`);
        if (result.available_organisms) {
          console.log(`   📜 Certificats disponibles: ${result.available_organisms.join(', ')}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Erreur: ${error.message}`);
    }
  }
  
  console.log('\n✅ Test terminé');
}

// Vérifier que le service est en ligne
async function checkService() {
  try {
    const response = await fetch('http://localhost:3001/health');
    if (!response.ok) throw new Error('Service non disponible');
    console.log('✅ Service en ligne\n');
    return true;
  } catch (error) {
    console.error('❌ Service non disponible. Démarrez-le avec: npm start');
    return false;
  }
}

// Lancer le test
(async () => {
  if (await checkService()) {
    await testMultiRegime();
  }
})();