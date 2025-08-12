// Configuration pour l'environnement de recette
export const environment = {
  production: false,
  name: 'staging',
  apiUrl: 'https://api-staging.myjourney.com',
  azure: {
    clientId: '634d3680-46b5-48e4-bdae-b7c6ed6b218a',
    tenantId: 'e1029da6-a2e7-449b-b816-9dd31f7c2d83',
    redirectUri: 'https://staging.myjourney.com',
    postLogoutRedirectUri: 'https://staging.myjourney.com'
  },
  features: {
    enableLogging: true,
    enableDebugMode: false,
    enableMockData: false,
    skipAuthentication: false
  }
};